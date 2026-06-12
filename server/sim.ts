// Server-authoritative world simulation: NPCs, combat resolution, drops and
// ground items. Ported from the former client sim in src/game.ts (tickNpcs,
// tickPlayerCombat, applyDamageToNpc) and generalised to many players.
//
// Authority split: the server owns NPC state, hit resolution, drops and ground
// items. Player stats arrive as client-reported snapshots (same trust model as
// the GE escrow); the server clamps them and enforces range + cooldowns.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { blocked } from './world';
import { tickBosses } from './bosses';
import { tickPlayerHazards, tickPlayerDots, applyPlayerPoison, clearPlayerDots } from './hazards';
import { ECONOMY_FROZEN } from './econ-freeze';
import {
  EffectDef, SpecDef, ActiveDot, HitsplatKind,
  familyMods, applyDotStack, isSpecKind, clampNum,
} from '../shared/effects';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Content data
// ---------------------------------------------------------------------------

export interface NpcDef {
  id: string;
  name: string;
  family?: string; // family tag for family_bane effects (see docs/EFFECTS.md)
  combatLevel: number;
  hitpoints: number;
  attack: number; strength: number; defence: number;
  attackSpeed: number;
  aggressive?: boolean;
  boss?: boolean;
  stationary?: boolean; // never moves (e.g. the Crystal Heart)
  respawnTicks: number;
  drops: { item: string; qty: [number, number]; chance: number }[];
  attackable: boolean;
}

const NPCS: Record<string, NpcDef> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/npcs.json'), 'utf8'),
);
// Item defs: the server only cares about combat effects + specs (it never
// trusts the client for those — gear ids in the swing intent are looked up here).
interface SItemDef { id: string; name?: string; equipSlot?: string; effects?: EffectDef[]; spec?: SpecDef; }
const ITEMS: Record<string, SItemDef> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/items.json'), 'utf8'),
);
const SPAWNS: {
  npcSpawns: { id: string; x: number; y: number }[];
  groundSpawns: { item: string; x: number; y: number; respawnTicks: number }[];
} = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/spawns.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// What the connection layer (index.ts) knows about each connected player.
//
// Combat authority (docs/ECONOMY-AUTHORITY.md §3): cb/effDef/defBonus/maxHp are
// now SERVER-DERIVED from the player's CombatProfile (built in index.ts from
// server-owned xp + equipment) — the client no longer reports them. `hp` is the
// AUTHORITATIVE live HP held in RAM here and flushed to the save lazily; the
// client renders it from `npcHitYou`/`hpSync` pushes, it does not own it.
export interface PlayerView {
  userId: number;
  name: string;
  x: number; y: number;
  dead: boolean;
  // server-derived combat values (set from the cached CombatProfile, NOT the wire)
  cb: number;       // combat level (aggro checks)
  effDef: number;   // effective defence level incl. style
  defBonus: number; // equipment defence bonus
  hp: number;       // AUTHORITATIVE live HP (RAM; flushed to save lazily)
  maxHp: number;    // from Hitpoints level
  send: (msg: unknown) => void;
}

export interface SNpc {
  id: number;
  def: NpcDef;
  x: number; y: number;
  spawnX: number; spawnY: number;
  hp: number;
  dead: boolean;
  respawnAt: number;
  target: number | null; // userId
  attackCooldown: number;
  wanderCooldown: number;
  shearedUntil: number;
  // combat-effect state (see docs/EFFECTS.md)
  dots: ActiveDot[];     // active damage-over-time stacks
  heldUntil: number;     // tick until which the NPC cannot move (freeze)
  stunnedUntil: number;  // tick until which the NPC cannot move OR attack (stun spec)
  defDrain: number;      // flat defence levels removed (drain_def spec; resets on respawn)
  atkDebuffMult: number; // attack-level multiplier while atkDebuffUntil > tick (warcry)
  atkDebuffUntil: number;
  meta: Record<string, any>; // boss mechanic state
  dirty: boolean;
  // Instanced (dungeon) NPC: visible to, and aggressive toward, this user only.
  // null = normal shared-world NPC.
  ownerUserId: number | null;
}

export interface SGroundItem {
  gid: number;
  item: string;
  qty: number;
  x: number; y: number;
  expiresAt: number; // tick; Infinity for fixed spawns
  ownerUserId: number | null; // instanced drop: visible/takable by this user only
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function getSimTick(): number { return sim.tick; }

export const sim = {
  tick: 0,
  npcs: [] as SNpc[],
  ground: [] as SGroundItem[],
};

let broadcast: (msg: unknown) => void = () => {};
let players = new Map<number, PlayerView>();

const npcById = new Map<number, SNpc>();
let nextGid = 1;

// per-player server-side swing cooldown (ms timestamps)
const nextSwingAt = new Map<number, number>();

// rare-drop news rate limit: at most one world broadcast per user per window
// (farming a ~1/50 drop with AoE otherwise floods every client's chat)
const lastRareNewsAt = new Map<number, number>();
const RARE_NEWS_INTERVAL_MS = 10_000;

// pending ground deltas, flushed with the per-tick world delta
let groundAdds: SGroundItem[] = [];
let groundRemovals: { gid: number; owner: number | null }[] = [];

// Extra per-tick simulation hooks (the dungeon instance manager registers one).
export const simTickHooks: ((players: Map<number, PlayerView>, tick: number) => void)[] = [];
// NPC death listeners (dungeon completion tracking etc.).
export const npcDeathHooks: ((n: SNpc, by: PlayerView) => void)[] = [];
// Injected by the dungeon module: which instance owner (if any) a player's
// dropped items should be scoped to, based on where they stand.
export let groundOwnerFor: (p: PlayerView) => number | null = () => null;
export function setGroundOwnerFor(fn: (p: PlayerView) => number | null) { groundOwnerFor = fn; }

// Combat authority hooks, injected by index.ts (§3.2/§3.3). The sim owns live
// HP in PlayerView.hp; these let it persist HP and resolve death against the
// authoritative state store without importing the DB layer.
//   onHpChanged   — called after server HP changes so index can sync the client
//                   and flush to the save lazily.
//   resolvePlayerDeath — called once when hp reaches 0; index applies the
//                   softcore xp loss, repositions to respawn, restores hp=maxHp
//                   on the authoritative state, and returns the respawn point.
let onHpChanged: (p: PlayerView, reason: 'damage' | 'heal' | 'respawn') => void = () => {};
export function setOnHpChanged(fn: (p: PlayerView, reason: 'damage' | 'heal' | 'respawn') => void) { onHpChanged = fn; }
let resolvePlayerDeath: (p: PlayerView, killerNpc: SNpc | null) => { x: number; y: number } | null = () => null;
export function setResolvePlayerDeath(fn: (p: PlayerView, killerNpc: SNpc | null) => { x: number; y: number } | null) {
  resolvePlayerDeath = fn;
}

// Server-derived combat profile lookup (built + cached per connection in
// index.ts from server-owned xp + equipment). handleSwing reads the player's
// offensive numbers from HERE — it NEVER trusts msg.eff/bonus/maxHit/speed/
// gear/spec (closes G1/M4). Returns null if no profile (then the swing is
// dropped — a connected player always has one).
let combatProfileFor: (userId: number) => SwingProfile | null = () => null;
export function setCombatProfileFor(fn: (userId: number) => SwingProfile | null) { combatProfileFor = fn; }

// Swing owned-state hooks (combat XP, rune/ammo debits), injected by index.ts.
export interface SwingEchoExtras {
  xp?: { skill: string; amount: number }[];
  removed?: { id: string; qty: number }[];
  equip?: Record<string, { id: string; qty: number } | null>;
}
let prepareSwing: (userId: number, mode: string) => { ok: boolean } & SwingEchoExtras = () => ({ ok: true });
let grantHitXp: (userId: number, dmg: number, mode: string) => { skill: string; amount: number }[] = () => [];
let swingEchoMeta: (userId: number) => { spec?: number } = () => ({});
export function setSwingStateHooks(
  prepare: typeof prepareSwing,
  grantXp: typeof grantHitXp,
  echoMeta?: typeof swingEchoMeta,
) {
  prepareSwing = prepare;
  grantHitXp = grantXp;
  if (echoMeta) swingEchoMeta = echoMeta;
}

// Authoritative owned-inventory hooks, injected by index.ts (Phase 2,
// docs/ECONOMY-AUTHORITY.md §2.1/§4.4). Pickup and the drop debit go through
// these (state.ts withState) so item gain/loss is server-owned instead of
// client-hinted. Each returns true when the owned-state mutation actually
// landed. Default no-ops keep sim self-contained / testable.
//   grantItem(userId,id,qty) -> true if it fit in the player's inventory
//   debitItem(userId,id,qty) -> true if the debit succeeded (drop authority)
let grantItem: (userId: number, id: string, qty: number) => boolean = () => false;
let debitItem: (userId: number, id: string, qty: number, invSlot?: number) => boolean = () => false;
export function setInventoryHooks(
  grant: (userId: number, id: string, qty: number) => boolean,
  debit: (userId: number, id: string, qty: number, invSlot?: number) => boolean,
) { grantItem = grant; debitItem = debit; }

// The subset of CombatProfile handleSwing consumes (kept structural to avoid a
// circular import with server/combat.ts).
export interface SwingProfile {
  attackSpeed: number;
  weaponMode: 'melee' | 'ranged' | 'gun' | 'magic';
  melee: { eff: number; bonus: number; maxHit: number };
  ranged: { eff: number; bonus: number; maxHit: number };
  gun: { eff: number; bonus: number; maxHit: number };
  magicLvl: number;     // magic accuracy eff level (bonus is 0 for magic)
  magicMaxHit: number;
  effectGear: string[];
  specItemId: string | null;
  // server-owned spec energy: a spec may only fire if the player can pay for it.
  // index.ts flushes this from the live profile; handleSwing calls trySpendSpec.
  trySpendSpec: (itemId: string) => boolean;
}

// fixed ground spawn regeneration state
const groundSpawnState: { item: string; x: number; y: number; respawnTicks: number; nextAt: number }[] =
  SPAWNS.groundSpawns.map((s) => ({ ...s, nextAt: 0 }));

const ITEM_RE = /^[a-z][a-z0-9_]{0,47}$/;

// PvP is disabled game-wide: player-vs-player swing intents are dropped.
// The resolution code below stays dormant behind this single switch.
const ENABLE_PVP = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

const clamp = (n: unknown, lo: number, hi: number, dflt: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;

// Classic accuracy roll (same formula as the old client sim).
// attMult: accuracy multiplier from family_bane / spec params (default 1).
export function rollHit(attLvl: number, attBonus: number, defLvl: number, defBonus: number, attMult = 1): boolean {
  const attRoll = (attLvl + 8) * (attBonus + 64) * attMult;
  const defRoll = (defLvl + 8) * (defBonus + 64);
  const chance = attRoll > defRoll ? 1 - (defRoll + 2) / (2 * (attRoll + 1)) : attRoll / (2 * (defRoll + 1));
  return Math.random() < chance;
}

export function addGroundItem(item: string, qty: number, x: number, y: number, expiresAt: number, ownerUserId: number | null = null) {
  const gi: SGroundItem = { gid: nextGid++, item, qty, x, y, expiresAt, ownerUserId };
  sim.ground.push(gi);
  groundAdds.push(gi);
  return gi;
}

function removeGroundItem(gi: SGroundItem) {
  const i = sim.ground.indexOf(gi);
  if (i >= 0) sim.ground.splice(i, 1);
  groundRemovals.push({ gid: gi.gid, owner: gi.ownerUserId });
}

function serializeNpc(n: SNpc) {
  const t = n.target !== null ? players.get(n.target)?.name ?? null : null;
  return {
    i: n.id, d: n.def.id, x: n.x, y: n.y, hp: n.hp,
    dead: n.dead, sh: n.shearedUntil > sim.tick, t,
  };
}

const serializeGround = (g: SGroundItem) =>
  ({ g: g.gid, item: g.item, qty: g.qty, x: g.x, y: g.y });

// Occupied tiles by living players (NPCs won't step onto them).
function playerAt(x: number, y: number): boolean {
  for (const p of players.values()) if (!p.dead && p.x === x && p.y === y) return true;
  return false;
}

export function sendFx(to: PlayerView | null, npc: SNpc, kind: string, extra?: Record<string, unknown>) {
  const msg = { t: 'fx', npc: npc.id, def: npc.def.id, kind, ...(extra ?? {}) };
  // owned (instanced) NPCs never broadcast their fx to the whole world
  if (to) to.send(msg);
  else if (npc.ownerUserId !== null) players.get(npc.ownerUserId)?.send(msg);
  else broadcast(msg);
}

// Boss/NPC damage to a player. AUTHORITATIVE (§3.2): the server decrements the
// player's live HP and resolves death — the client no longer owns HP, it renders
// the authoritative `hp`/`maxHp` carried on this push. The `fx` rider still lets
// the client animate the splat (and dodge/halving visuals); but the HP that
// matters is the server's. Prayer halving is NOT applied server-side (prayers are
// not yet server-owned — see server/combat.ts header); the raw NPC roll lands.
export function damagePlayer(p: PlayerView, npc: SNpc | null, dmg: number, fx?: string) {
  if (p.dead) return;
  const d = Math.max(0, Math.floor(dmg));
  p.hp = Math.max(0, p.hp - d);
  p.send({
    t: 'npcHitYou',
    npc: npc?.id ?? -1,
    def: npc?.def.id ?? 'environment',
    dmg: d,
    fx,
    hp: p.hp,
    maxHp: p.maxHp,
  });
  if (d > 0) onHpChanged(p, 'damage');
  if (p.hp <= 0) killPlayer(p, npc);
}

function hazardDamage(p: PlayerView, dmg: number, fx: string) {
  damagePlayer(p, null, dmg, fx);
}

// Resolve a server-side player death exactly once. Delegates the authoritative
// side-effects (softcore xp loss, item handling, hp restore) to the injected
// index handler, which runs them inside withState; then repositions + tells the
// client. Falls back to a safe respawn even if the handler is absent.
function killPlayer(p: PlayerView, killerNpc: SNpc | null) {
  if (p.dead) return;
  p.dead = true;
  p.hp = 0;
  // clear any NPC aggro on the corpse
  for (const n of sim.npcs) if (n.target === p.userId) { n.target = null; n.dirty = true; }
  const respawn = resolvePlayerDeath(p, killerNpc);
  if (respawn) { p.x = respawn.x; p.y = respawn.y; }
  p.hp = p.maxHp;
  p.dead = false;
  p.send({ t: 'death', hp: p.hp, maxHp: p.maxHp, x: p.x, y: p.y });
}

// NPC melee roll vs a player, honouring the warcry attack debuff.
function npcAttackRoll(n: SNpc, target: PlayerView): number {
  const atkMult = n.atkDebuffUntil > sim.tick ? n.atkDebuffMult : 1;
  const atk = Math.max(1, Math.floor(n.def.attack * atkMult));
  const hit = rollHit(atk, 0, target.effDef, target.defBonus);
  const maxHit = Math.floor(0.5 + (n.def.strength + 8) * 64 / 640);
  return hit ? Math.floor(Math.random() * (maxHit + 1)) : 0;
}

// Tick active DoT stacks on one NPC. Damage rides the normal authoritative
// path (hitsplat broadcast with a colored kind, death, drops, kill credit).
function tickNpcDots(n: SNpc) {
  for (let i = n.dots.length - 1; i >= 0; i--) {
    const d = n.dots[i];
    if (sim.tick < d.nextAt) continue;
    const by = players.get(d.byUserId);
    if (!by) { n.dots.splice(i, 1); continue; } // applier logged off: stack fades
    d.hitsLeft--;
    d.nextAt = sim.tick + d.every;
    if (d.hitsLeft <= 0) n.dots.splice(i, 1);
    applyDamageToNpc(n, d.dmg, by, d.type);
    if (n.dead) { n.dots = []; return; }
  }
}

export function getTargetPlayer(n: SNpc): PlayerView | null {
  if (n.target === null) return null;
  const p = players.get(n.target);
  return p && !p.dead ? p : null;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let nextNpcId = 1;

// Spawn an NPC at runtime (instanced dungeon mobs, boss adds). ownerUserId
// scopes visibility + aggression to one user. Returns null for unknown defs
// (content fragment not merged yet) so callers can degrade gracefully.
export function spawnNpc(defId: string, x: number, y: number, ownerUserId: number | null = null): SNpc | null {
  const def = NPCS[defId];
  if (!def) return null;
  const n: SNpc = {
    id: nextNpcId++, def, x, y, spawnX: x, spawnY: y,
    hp: def.hitpoints, dead: false, respawnAt: 0, target: null,
    attackCooldown: 0, wanderCooldown: 0, shearedUntil: 0,
    dots: [], heldUntil: 0, stunnedUntil: 0, defDrain: 0, atkDebuffMult: 1, atkDebuffUntil: 0,
    meta: {}, dirty: false,
    ownerUserId,
  };
  sim.npcs.push(n);
  npcById.set(n.id, n);
  return n;
}

// Remove a runtime NPC entirely (no respawn). The owner's client is resynced
// with a fresh fullSnapshot by the caller (deltas cannot express removal).
export function despawnNpc(n: SNpc) {
  const i = sim.npcs.indexOf(n);
  if (i >= 0) sim.npcs.splice(i, 1);
  npcById.delete(n.id);
}

export function initSim(broadcastFn: (msg: unknown) => void) {
  broadcast = broadcastFn;
  for (const s of SPAWNS.npcSpawns) {
    if (!NPCS[s.id]) continue;
    spawnNpc(s.id, s.x, s.y, null);
  }
  console.log(`[sim] spawned ${sim.npcs.length} NPCs`);
}

// Full world snapshot, filtered to what `forUserId` may see: all shared NPCs
// and ground items, plus only their own instanced ones.
export function fullSnapshot(forUserId?: number) {
  return {
    t: 'world',
    tick: sim.tick,
    npcs: sim.npcs
      .filter((n) => n.ownerUserId === null || n.ownerUserId === forUserId)
      .map(serializeNpc),
    ground: sim.ground
      .filter((g) => g.ownerUserId === null || g.ownerUserId === forUserId)
      .map(serializeGround),
  };
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export function tickSim(playersNow: Map<number, PlayerView>) {
  players = playersNow;
  sim.tick++;

  // ground item expiry
  for (let i = sim.ground.length - 1; i >= 0; i--) {
    if (sim.tick >= sim.ground[i].expiresAt) removeGroundItem(sim.ground[i]);
  }
  // fixed ground spawns regenerate
  for (const s of groundSpawnState) {
    const present = sim.ground.some((g) => g.x === s.x && g.y === s.y && g.item === s.item);
    if (present) continue;
    if (s.nextAt === 0) { s.nextAt = sim.tick + s.respawnTicks; continue; }
    if (sim.tick >= s.nextAt) {
      addGroundItem(s.item, 1, s.x, s.y, Infinity);
      s.nextAt = 0;
    }
  }

  for (const n of sim.npcs) {
    if (n.dead) {
      // instanced mobs stay down for the rest of the run (the run manager
      // despawns them); shared mobs respawn normally
      if (n.ownerUserId !== null) continue;
      if (sim.tick >= n.respawnAt) {
        n.dead = false; n.hp = n.def.hitpoints;
        n.x = n.spawnX; n.y = n.spawnY;
        n.target = null; n.meta = {}; n.shearedUntil = 0;
        n.dots = []; n.heldUntil = 0; n.stunnedUntil = 0;
        n.defDrain = 0; n.atkDebuffMult = 1; n.atkDebuffUntil = 0;
        n.dirty = true;
      }
      continue;
    }
    if (n.attackCooldown > 0) n.attackCooldown--;

    // damage-over-time stacks (poison/burn/bleed) — see docs/EFFECTS.md
    if (n.dots.length) tickNpcDots(n);
    if (n.dead) continue; // a DoT tick may have killed it

    // sheared flag expiry needs a delta so clients regrow the wool
    if (n.shearedUntil > 0 && n.shearedUntil === sim.tick) n.dirty = true;

    // aggression: nearest eligible player within 4 tiles.
    // Instanced NPCs only ever consider (or keep) their owner as a target,
    // and ignore the combat-level aggro exemption (it's their dungeon run).
    if (n.ownerUserId !== null && n.target !== null && n.target !== n.ownerUserId) {
      n.target = null; n.dirty = true;
    }
    if (n.target === null && n.def.aggressive) {
      let best: PlayerView | null = null;
      let bestDist = Infinity;
      for (const p of players.values()) {
        if (p.dead) continue;
        if (n.ownerUserId !== null) {
          if (p.userId !== n.ownerUserId) continue;
        } else if (p.cb > n.def.combatLevel * 2 + 1) continue;
        const dist = chebyshev(p.x, p.y, n.x, n.y);
        if (dist <= 4 && dist < bestDist) { bestDist = dist; best = p; }
      }
      if (best) { n.target = best.userId; n.dirty = true; }
    }

    const target = n.target !== null ? players.get(n.target) : undefined;
    if (target && !target.dead) {
      const dist = chebyshev(target.x, target.y, n.x, n.y);
      const distFromSpawn = chebyshev(n.spawnX, n.spawnY, n.x, n.y);
      if (dist > 12 || distFromSpawn > 16) { n.target = null; n.dirty = true; continue; }
      // freeze holds movement only; stun holds movement AND attacks
      const held = n.heldUntil > sim.tick || n.stunnedUntil > sim.tick;
      const stunned = n.stunnedUntil > sim.tick;
      if (n.def.stationary) {
        if (dist <= 1 && n.attackCooldown === 0 && !stunned) {
          n.attackCooldown = n.def.attackSpeed;
          const dmg = npcAttackRoll(n, target);
          damagePlayer(target, n, dmg);
        }
      } else if (dist > 1) {
        if (!held) {
          const dx = Math.sign(target.x - n.x), dy = Math.sign(target.y - n.y);
          const tryMoves = [[dx, dy], [dx, 0], [0, dy]];
          for (const [mx, my] of tryMoves) {
            const nx = n.x + mx, ny = n.y + my;
            if ((mx || my) && !blocked(nx, ny, true) && !playerAt(nx, ny)) {
              n.x = nx; n.y = ny; n.dirty = true; break;
            }
          }
        }
      } else if (n.attackCooldown === 0 && !stunned) {
        n.attackCooldown = n.def.attackSpeed;
        const dmg = npcAttackRoll(n, target);
        damagePlayer(target, n, dmg);
      }
    } else {
      if (n.target !== null) { n.target = null; n.dirty = true; }
      if (n.wanderCooldown > 0) { n.wanderCooldown--; continue; }
      if (n.heldUntil > sim.tick || n.stunnedUntil > sim.tick) continue;
      if (Math.random() < 0.2 && !n.def.stationary) {
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        const nx = n.x + dx, ny = n.y + dy;
        if (Math.abs(nx - n.spawnX) <= 5 && Math.abs(ny - n.spawnY) <= 5
          && !blocked(nx, ny, true) && !playerAt(nx, ny)) {
          n.x = nx; n.y = ny; n.dirty = true;
        }
        n.wanderCooldown = 2 + Math.floor(Math.random() * 4);
      }
    }
  }

  // boss mechanics (warlord, bog horror, drake, ice queen, bandit king, magma fiend)
  tickBosses({
    tick: sim.tick,
    npcs: sim.npcs,
    players,
    getTargetPlayer,
    damagePlayer,
    sendFx,
    markDirty: (n: SNpc) => { n.dirty = true; },
    applyPlayerPoison,
  });

  tickPlayerHazards(sim.tick, players, hazardDamage);
  tickPlayerDots(sim.tick, players, hazardDamage);

  // extra sims (dungeon instances)
  for (const fn of simTickHooks) fn(players, sim.tick);

  flushWorldDelta();
}

// Split pending deltas into the public stream (broadcast) and per-owner
// streams (sent only to the instance owner's socket).
function flushWorldDelta() {
  const pubN: unknown[] = [];
  const pubGa: unknown[] = [];
  const pubGr: number[] = [];
  const owned = new Map<number, { n: unknown[]; ga: unknown[]; gr: number[] }>();
  const bucket = (owner: number) => {
    let b = owned.get(owner);
    if (!b) { b = { n: [], ga: [], gr: [] }; owned.set(owner, b); }
    return b;
  };

  for (const n of sim.npcs) {
    if (!n.dirty) continue;
    n.dirty = false;
    if (n.ownerUserId === null) pubN.push(serializeNpc(n));
    else bucket(n.ownerUserId).n.push(serializeNpc(n));
  }
  for (const g of groundAdds) {
    if (g.ownerUserId === null) pubGa.push(serializeGround(g));
    else bucket(g.ownerUserId).ga.push(serializeGround(g));
  }
  for (const r of groundRemovals) {
    if (r.owner === null) pubGr.push(r.gid);
    else bucket(r.owner).gr.push(r.gid);
  }
  groundAdds = [];
  groundRemovals = [];

  if (pubN.length || pubGa.length || pubGr.length) {
    broadcast({ t: 'w', n: pubN, ga: pubGa, gr: pubGr });
  }
  for (const [owner, b] of owned) {
    players.get(owner)?.send({ t: 'w', n: b.n, ga: b.ga, gr: b.gr });
  }
}

// ---------------------------------------------------------------------------
// Player intents
// ---------------------------------------------------------------------------

// Player damage to an NPC: hp, hitsplat broadcast, death + drops.
// `kind` colors the hitsplat client-side ('hit' default, 'poison', 'burn',
// 'bleed', 'spec' — see docs/EFFECTS.md).
function applyDamageToNpc(n: SNpc, dmg: number, by: PlayerView, kind: HitsplatKind = 'hit') {
  n.hp -= dmg;
  n.dirty = true;
  const hitMsg = { t: 'hit', npc: n.id, dmg, hp: Math.max(0, n.hp), by: by.name, kind };
  if (n.ownerUserId !== null) players.get(n.ownerUserId)?.send(hitMsg);
  else broadcast(hitMsg);
  if (dmg > 0 && n.target === null) n.target = by.userId; // retaliate
  if (n.hp <= 0) {
    n.dead = true;
    n.hp = 0;
    n.respawnAt = sim.tick + n.def.respawnTicks;
    n.target = null;
    for (const d of n.def.drops) {
      if (Math.random() < d.chance) {
        const qty = d.qty[0] + Math.floor(Math.random() * (d.qty[1] - d.qty[0] + 1));
        // instanced kills drop owner-scoped loot via the same authoritative path
        addGroundItem(d.item, qty, n.x, n.y, sim.tick + 200, n.ownerUserId);
        // rare drop news: world-wide broadcast, including owner-scoped
        // (dungeon) loot — only the item itself stays private to the run
        if (d.chance <= 0.02) {
          const now = Date.now();
          if (now - (lastRareNewsAt.get(by.userId) ?? 0) >= RARE_NEWS_INTERVAL_MS) {
            lastRareNewsAt.set(by.userId, now);
            const itemName = ITEMS[d.item]?.name ?? d.item;
            broadcast({ t: 'system', text: `News: ${by.name} received a rare drop: ${itemName}!` });
          }
        }
      }
    }
    by.send({ t: 'youKilled', npc: n.id, def: n.def.id });
    for (const fn of npcDeathHooks) fn(n, by);
  }
}

function findPlayerByName(name: string, exceptId?: number): PlayerView | null {
  const want = name.toLowerCase();
  for (const pl of players.values()) {
    if (exceptId !== undefined && pl.userId === exceptId) continue;
    if (pl.name.toLowerCase() === want) return pl;
  }
  return null;
}

function handleSwingPvp(p: PlayerView, msg: any) {
  if (p.dead) return;
  const targetName = typeof msg.target === 'string' ? msg.target.slice(0, 12).trim() : '';
  if (!targetName) return;
  const target = findPlayerByName(targetName, p.userId);
  if (!target || target.dead) return;

  const mode = msg.mode === 'ranged' || msg.mode === 'gun' || msg.mode === 'magic' ? msg.mode : 'melee';
  const reach = mode === 'melee' ? 1 : 6;
  if (chebyshev(p.x, p.y, target.x, target.y) > reach + 2) return;
  if (mode !== 'melee' && chebyshev(p.x, p.y, target.x, target.y) === 0) return;

  const now = Date.now();
  if (now < (nextSwingAt.get(p.userId) ?? 0)) return;
  const speed = clamp(msg.speed, 2, 8, 4);
  nextSwingAt.set(p.userId, now + speed * 600 - 150);

  const eff = clamp(msg.eff, 1, 200, 1);
  const bonus = clamp(msg.bonus, 0, 200, 0);
  const maxHit = clamp(msg.maxHit, 0, 60, 0);

  const hit = rollHit(eff, bonus, target.effDef, target.defBonus);
  const dmg = hit ? Math.floor(Math.random() * (maxHit + 1)) : 0;

  target.hp = Math.max(0, target.hp - dmg);
  const hpPayload = { hp: target.hp, maxHp: target.maxHp };

  target.send({ t: 'pvpHitYou', from: p.name, dmg, ...hpPayload });
  p.send({ t: 'pvpYouHit', target: target.name, dmg, mode, ...hpPayload });
  broadcast({ t: 'pvpHit', from: p.name, target: target.name, dmg, ...hpPayload });

  if (target.hp <= 0) {
    target.dead = true;
    target.hp = 0;
    target.send({ t: 'pvpDeath', by: p.name });
    p.send({ t: 'pvpKill', target: target.name });
    broadcast({ t: 'pvpDeath', who: target.name, by: p.name });
  }
}

export function handleSwing(p: PlayerView, msg: any) {
  if (typeof msg.target === 'string' && msg.target.trim()) {
    if (ENABLE_PVP) handleSwingPvp(p, msg); // PvP disabled: intent dropped
    return;
  }
  const n = npcById.get(Number(msg.npc));
  if (!n || n.dead || !n.def.attackable || p.dead) return;
  if (n.ownerUserId !== null && n.ownerUserId !== p.userId) return; // not your instance

  // SERVER-DERIVED combat profile (§3.1): every offensive number comes from the
  // player's server-owned xp + equipment, NOT from the wire. msg.eff/bonus/
  // maxHit/speed/gear/spec are ignored entirely (closes G1/M4 godmode).
  const prof = combatProfileFor(p.userId);
  if (!prof) return; // no authoritative profile → drop the swing

  // The mode is the player's request but is VALIDATED against the equipped
  // weapon class: a sword cannot fire mode:'gun'. An invalid request falls back
  // to the weapon's real mode rather than honouring the forged one.
  const requested = msg.mode === 'ranged' || msg.mode === 'gun' || msg.mode === 'magic' ? msg.mode : 'melee';
  const mode = requested === prof.weaponMode ? requested : prof.weaponMode;
  const reach = mode === 'melee' ? 1 : 6;
  // generous slack: positions are reported on a 600ms cadence
  if (chebyshev(p.x, p.y, n.x, n.y) > reach + 2) return;

  // server-side cooldown — speed is the WEAPON's attackSpeed (profile), not msg.
  const now = Date.now();
  if (now < (nextSwingAt.get(p.userId) ?? 0)) return;
  const speed = prof.attackSpeed;

  const prep = prepareSwing(p.userId, mode);
  if (!prep.ok) {
    p.send({ t: 'deny', what: 'swing' });
    return;
  }
  // Charge the cooldown only after a successful prepareSwing so a swing that
  // fails on missing ammo/runes does not consume the attack timer.
  nextSwingAt.set(p.userId, now + speed * 600 - 150);

  // eff / bonus / maxHit by mode, all server-derived.
  let eff: number, bonus: number, maxHit: number;
  if (mode === 'ranged') { ({ eff, bonus, maxHit } = prof.ranged); }
  else if (mode === 'gun') { ({ eff, bonus, maxHit } = prof.gun); }
  else if (mode === 'magic') { eff = prof.magicLvl; bonus = 0; maxHit = prof.magicMaxHit; }
  else { ({ eff, bonus, maxHit } = prof.melee); }

  // Equipped effect-bearing gear: ONLY items actually worn server-side
  // (profile.effectGear), resolved to their real defs. The wire `gear[]` is
  // ignored — a client can no longer assert it wears items it does not own.
  const gear: SItemDef[] = [];
  for (const g of prof.effectGear) {
    if (ITEMS[g] && !gear.includes(ITEMS[g])) gear.push(ITEMS[g]);
  }
  const effects: EffectDef[] = gear.flatMap((g) => g.effects ?? []);

  // Special attack: honoured ONLY if the client requests the player's actually-
  // equipped spec item (profile.specItemId) AND the server-owned spec energy
  // covers its cost (trySpendSpec debits it). No unowned best-in-slot specs (M4).
  // Conditional-effect specs (stun / drain_def / guaranteed_dot) only do
  // something when the main hit lands, so their energy debit is deferred until
  // mainLanded is known (below) — otherwise a whiffed spec drains energy for no
  // effect. Unconditional specs (double_hit / aoe_adjacent / warcry_aoe_debuff)
  // debit eagerly since they act regardless of the main roll.
  let spec: SpecDef | null = null;
  let specDebitPending = false; // conditional spec selected but not yet charged
  if (typeof msg.spec === 'string' && msg.spec === prof.specItemId && prof.specItemId) {
    const sd = ITEMS[prof.specItemId]?.spec;
    if (sd && isSpecKind(sd.kind)) {
      const conditional = sd.kind === 'stun' || sd.kind === 'drain_def' || sd.kind === 'guaranteed_dot';
      if (conditional) {
        // Selection is provisional: multipliers apply, but energy is only spent
        // if the main hit lands (and the player still has energy then).
        spec = sd;
        specDebitPending = true;
      } else if (prof.trySpendSpec(prof.specItemId)) {
        spec = sd;
      }
    }
  }
  const sp = spec?.params ?? {};
  const specAcc = clampNum(sp.accMult, 0.25, 3, 1);
  const specDmg = clampNum(sp.dmgMult, 0, 3, 1);

  // family_bane: accuracy/damage multipliers vs this npc's family tag
  const fam = familyMods(effects, n.def.family);
  const defLvl = Math.max(0, n.def.defence - n.defDrain);

  const rollDmg = (accMult: number, dmgMult: number) => {
    const landed = rollHit(eff, bonus, defLvl, 0, fam.accMult * accMult);
    const cap = Math.floor(maxHit * fam.dmgMult * dmgMult);
    return { landed, dmg: landed ? Math.floor(Math.random() * (cap + 1)) : 0 };
  };

  // ----- resolve the swing (one or more hits depending on spec kind) -----
  const splatKind: HitsplatKind = spec ? 'spec' : 'hit';
  const hits: number[] = [];
  let mainLanded = false;
  if (spec?.kind === 'double_hit') {
    const a = rollDmg(specAcc, specDmg), b = rollDmg(specAcc, specDmg);
    mainLanded = a.landed || b.landed;
    hits.push(a.dmg, b.dmg);
  } else {
    const r = rollDmg(spec ? specAcc : 1, spec ? specDmg : 1);
    mainLanded = r.landed;
    hits.push(r.dmg);
  }
  // Main-hit damage (the named target) drives lifesteal and combat XP. Splash
  // damage from aoe_adjacent is added to totalDmg below for the hitsplat/echo,
  // but must NOT feed sustain or XP — those are single-target by design.
  const mainDmg = hits.reduce((s, d) => s + d, 0);
  let totalDmg = mainDmg;

  // Ammo recovery (arrows/rounds on the ground) is DISABLED: the spawn was
  // speculative — it trusted the client-named `msg.ammo` with no proof the
  // player owned or fired it, so a scripted client could spam swings and harvest
  // a free item faucet (audit M5). Re-enable only when ammo consumption is
  // server-owned, tying recovery to a real server-side ammo debit.

  // ----- on-hit gear effects (proc on a damaging main hit) -----
  if (totalDmg > 0) {
    for (const e of effects) {
      if ((e.type === 'poison' || e.type === 'burn' || e.type === 'bleed')
        && Math.random() < clampNum(e.chance, 0, 1, 0)) {
        applyDotStack(n.dots, {
          type: e.type,
          chance: 1,
          dmg: clampNum(e.dmg, 1, 10, 1),
          hits: Math.floor(clampNum(e.hits, 1, 20, 1)),
          every: Math.floor(clampNum(e.every, 1, 20, 2)),
          maxStacks: e.maxStacks,
        }, p.userId, sim.tick);
      } else if (e.type === 'freeze' && Math.random() < clampNum(e.chance, 0, 1, 0)) {
        n.heldUntil = Math.max(n.heldUntil, sim.tick + Math.floor(clampNum(e.holdTicks, 1, 16, 1)));
      }
    }
  }

  // ----- spec side-effects -----
  // Charge the deferred debit for conditional specs now that we know the main
  // hit landed. If energy ran out in the meantime, the effect simply does not
  // apply (and nothing was spent).
  if (spec && specDebitPending && mainLanded) {
    if (!prof.trySpendSpec(prof.specItemId!)) {
      spec = null;
    }
  }
  if (spec && mainLanded) {
    if (spec.kind === 'stun') {
      n.stunnedUntil = Math.max(n.stunnedUntil, sim.tick + Math.floor(clampNum(sp.holdTicks, 1, 8, 3)));
      sendFx(null, n, 'stun');
    } else if (spec.kind === 'drain_def') {
      n.defDrain = Math.min(n.def.defence, n.defDrain + Math.floor(clampNum(sp.amount, 1, 30, 5)));
    } else if (spec.kind === 'guaranteed_dot' && sp.dot) {
      const d = sp.dot;
      if (d.type === 'poison' || d.type === 'burn' || d.type === 'bleed') {
        applyDotStack(n.dots, {
          type: d.type, chance: 1,
          dmg: clampNum(d.dmg, 1, 10, 1),
          hits: Math.floor(clampNum(d.hits, 1, 20, 1)),
          every: Math.floor(clampNum(d.every, 1, 20, 2)),
          maxStacks: d.maxStacks,
        }, p.userId, sim.tick);
      }
    }
  }
  if (spec?.kind === 'aoe_adjacent') {
    const radius = Math.floor(clampNum(sp.radius, 1, 3, 1));
    let extras = 0;
    for (const other of sim.npcs) {
      if (extras >= 3) break;
      if (other === n || other.dead || !other.def.attackable) continue;
      if (other.ownerUserId !== null && other.ownerUserId !== p.userId) continue;
      if (chebyshev(other.x, other.y, n.x, n.y) > radius) continue;
      const r = rollDmg(specAcc, specDmg);
      totalDmg += r.dmg;
      if (other.target === null) other.target = p.userId;
      applyDamageToNpc(other, r.dmg, p, 'spec');
      extras++;
    }
  }
  if (spec?.kind === 'warcry_aoe_debuff') {
    const radius = Math.floor(clampNum(sp.radius, 1, 5, 2));
    const atkMult = clampNum(sp.atkMult, 0.25, 1, 0.7);
    const ticks = Math.floor(clampNum(sp.ticks, 1, 50, 16));
    sendFx(null, n, 'warcry');
    for (const other of sim.npcs) {
      if (other.dead || !other.def.attackable) continue;
      if (other.ownerUserId !== null && other.ownerUserId !== p.userId) continue;
      if (chebyshev(other.x, other.y, p.x, p.y) > radius) continue;
      other.atkDebuffMult = atkMult;
      other.atkDebuffUntil = sim.tick + ticks;
    }
  }

  // ----- lifesteal (on the main-hit damage only — splash does not heal) -----
  let heal = 0;
  for (const e of effects) {
    if (e.type === 'lifesteal') heal += Math.floor(mainDmg * clampNum(e.pct, 0, 1, 0));
  }
  if (heal > 0) {
    p.hp = Math.min(p.maxHp, p.hp + heal);
    onHpChanged(p, 'heal');
  }

  const hitXp = mainDmg > 0 ? grantHitXp(p.userId, mainDmg, mode) : [];
  const xp = [...(prep.xp ?? []), ...hitXp];

  const meta = swingEchoMeta(p.userId);
  p.send({
    t: 'youHit',
    npc: n.id,
    def: n.def.id,
    dmg: totalDmg,
    mode,
    ...(xp.length ? { xp } : {}),
    ...(prep.removed?.length ? { removed: prep.removed } : {}),
    ...(prep.equip ? { equip: prep.equip } : {}),
    ...(heal > 0 ? { heal, hp: p.hp } : {}),
    ...(typeof meta.spec === 'number' ? { spec: meta.spec } : {}),
    ...(spec ? { specUsed: true } : {}),
  });
  n.target = p.userId;
  for (const d of hits) if (!n.dead) applyDamageToNpc(n, d, p, splatKind);
}

export function handlePickup(p: PlayerView, msg: any) {
  const gid = Number(msg.gid);
  const gi = sim.ground.find((g) => g.gid === gid);
  if (!gi || p.dead) return;
  if (gi.ownerUserId !== null && gi.ownerUserId !== p.userId) return; // not your instance
  if (chebyshev(p.x, p.y, gi.x, gi.y) > 2) return; // pos staleness slack
  // AUTHORITATIVE pickup (docs/ECONOMY-AUTHORITY.md §2.1/§4.4, closes the G2
  // "client adds its own loot" gap + the pickup-dupe vector): grant to the
  // SERVER inventory first. Only if it fit do we debit the world item. A second
  // pickup of the same gid finds no ground item (already removed) and no-ops, so
  // the grant happens exactly once.
  if (!grantItem(p.userId, gi.item, gi.qty)) {
    // inventory full (or no authoritative row) — leave the item on the ground.
    p.send({ t: 'pickupFail', reason: 'full' });
    return;
  }
  removeGroundItem(gi);
  // {granted} is the authoritative echo; the client reflects it (no client-trust
  // 'got' that the client adds blindly). Legacy 'got' kept for older clients is
  // intentionally dropped — net.ts handles 'granted'.
  p.send({ t: 'granted', source: 'pickup', items: [{ id: gi.item, qty: gi.qty }] });
  flushGroundNow();
}

export function handleDrop(p: PlayerView, msg: any) {
  if (p.dead) return;
  const item = String(msg.item ?? '');
  if (!ITEM_RE.test(item)) return;
  const qty = clamp(msg.qty, 1, 2_000_000_000, 1);
  const invSlot = typeof msg.invSlot === 'number' && Number.isFinite(msg.invSlot)
    ? Math.floor(msg.invSlot) : -1;
  // AUTHORITATIVE drop (docs/ECONOMY-AUTHORITY.md §4.4, closes G3 item injection):
  // debit the player's SERVER inventory FIRST; only spawn the ground item if the
  // debit succeeds. A dropped id the player does not own spawns nothing. This is
  // safe whether ECONOMY_FROZEN is on or off because the value really left the
  // player's authoritative inventory, so it is not a mint/transfer primitive.
  if (!debitItem(p.userId, item, qty, invSlot >= 0 ? invSlot : undefined)) {
    p.send({ t: 'deny', what: 'drop' });
    return;
  }
  // drops made inside an instance stay private to that instance's owner
  addGroundItem(item, qty, p.x, p.y, sim.tick + 200, groundOwnerFor(p));
  p.send({
    t: 'granted', source: 'drop',
    removed: [{ id: item, qty, ...(invSlot >= 0 ? { slot: invSlot } : {}) }],
  });
  flushGroundNow();
}

export function handleInteract(p: PlayerView, msg: any) {
  const n = npcById.get(Number(msg.npc));
  if (!n || n.dead || p.dead) return;
  if (chebyshev(p.x, p.y, n.x, n.y) > 2) return;
  if (msg.option === 'Shear' && n.def.id === 'sheep') {
    if (n.shearedUntil > sim.tick) {
      p.send({ t: 'deny', what: 'shear', npc: n.id });
      return;
    }
    if (!grantItem(p.userId, 'wool', 1)) {
      p.send({ t: 'deny', what: 'shear' });
      return;
    }
    n.shearedUntil = sim.tick + 50;
    n.dirty = true;
    p.send({ t: 'granted', source: 'shear', items: [{ id: 'wool', qty: 1 }] });
    p.send({ t: 'shorn', npc: n.id });
  }
}

export function dropPlayer(userId: number) {
  clearPlayerDots(userId);
  nextSwingAt.delete(userId);
  lastRareNewsAt.delete(userId);
  for (const n of sim.npcs) {
    if (n.target === userId) { n.target = null; n.dirty = true; }
  }
}

// Ground changes triggered by intents go out immediately so pickups feel
// responsive; NPC deltas still ride the next tick.
function flushGroundNow() {
  if (groundAdds.length === 0 && groundRemovals.length === 0) return;
  const pubGa = groundAdds.filter((g) => g.ownerUserId === null);
  const pubGr = groundRemovals.filter((r) => r.owner === null).map((r) => r.gid);
  const owners = new Set<number>();
  for (const g of groundAdds) if (g.ownerUserId !== null) owners.add(g.ownerUserId);
  for (const r of groundRemovals) if (r.owner !== null) owners.add(r.owner);
  if (pubGa.length || pubGr.length) {
    broadcast({ t: 'w', n: [], ga: pubGa.map(serializeGround), gr: pubGr });
  }
  for (const owner of owners) {
    players.get(owner)?.send({
      t: 'w', n: [],
      ga: groundAdds.filter((g) => g.ownerUserId === owner).map(serializeGround),
      gr: groundRemovals.filter((r) => r.owner === owner).map((r) => r.gid),
    });
  }
  groundAdds = [];
  groundRemovals = [];
}
