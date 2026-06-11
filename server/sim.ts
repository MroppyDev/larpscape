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
export interface PlayerView {
  userId: number;
  name: string;
  x: number; y: number;
  dead: boolean;
  // client-reported combat snapshot (clamped on receipt)
  cb: number;       // combat level (aggro checks)
  effDef: number;   // effective defence level incl. prayer/style
  defBonus: number; // equipment defence bonus
  hp: number;
  maxHp: number;
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

// Boss/NPC damage to a player. Modifiers the server cannot see (prayer
// halving, movement dodges) are applied client-side based on `fx`.
export function damagePlayer(p: PlayerView, npc: SNpc, dmg: number, fx?: string) {
  p.send({ t: 'npcHitYou', npc: npc.id, def: npc.def.id, dmg, fx });
}

// NPC melee roll vs a player, honouring the warcry attack debuff.
function npcAttackRoll(n: SNpc, target: PlayerView): number {
  const atkMult = n.atkDebuffUntil > sim.tick ? n.atkDebuffMult : 1;
  const atk = Math.max(1, Math.floor(n.def.attack * atkMult));
  const hit = rollHit(atk, 0, target.effDef, target.defBonus);
  const maxHit = Math.floor(0.5 + (n.def.strength + 8) * 64 / 640) + 1;
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
  });

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

  const mode = msg.mode === 'ranged' || msg.mode === 'gun' || msg.mode === 'magic' ? msg.mode : 'melee';
  const reach = mode === 'melee' ? 1 : 6;
  // generous slack: positions are reported on a 600ms cadence
  if (chebyshev(p.x, p.y, n.x, n.y) > reach + 2) return;

  // server-side cooldown (speed in ticks, clamped; 150ms slack for jitter)
  const now = Date.now();
  if (now < (nextSwingAt.get(p.userId) ?? 0)) return;
  const speed = clamp(msg.speed, 2, 8, 4);
  nextSwingAt.set(p.userId, now + speed * 600 - 150);

  const eff = clamp(msg.eff, 1, 200, 1);
  const bonus = clamp(msg.bonus, 0, 200, 0);
  const maxHit = clamp(msg.maxHit, 0, 60, 0);

  // Equipped effect-bearing gear, reported by the client as item ids and
  // validated against the server's own item catalog (effects/specs are never
  // taken from the wire — only the ids are). See docs/EFFECTS.md.
  const gear: SItemDef[] = [];
  if (Array.isArray(msg.gear)) {
    for (const g of msg.gear.slice(0, 12)) {
      if (typeof g === 'string' && ITEM_RE.test(g) && ITEMS[g] && !gear.includes(ITEMS[g])) {
        gear.push(ITEMS[g]);
      }
    }
  }
  const effects: EffectDef[] = gear.flatMap((g) => g.effects ?? []);

  // Special attack: client names the gear piece whose spec it is consuming.
  // The server only honours specs that exist on that item's own def.
  let spec: SpecDef | null = null;
  if (typeof msg.spec === 'string' && ITEM_RE.test(msg.spec)) {
    const sd = ITEMS[msg.spec]?.spec;
    if (sd && isSpecKind(sd.kind) && gear.includes(ITEMS[msg.spec])) spec = sd;
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
  let totalDmg = hits.reduce((s, d) => s + d, 0);

  // ranged: ~20% arrow recovery on the ground
  if (mode === 'ranged' && typeof msg.ammo === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(msg.ammo)
    && msg.ammo.endsWith('_arrow') && Math.random() < 0.2) {
    addGroundItem(msg.ammo, 1, n.x, n.y, sim.tick + 100);
  }
  // gun: ~5% round recovery (spent brass is harder to reclaim)
  if (mode === 'gun' && typeof msg.ammo === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(msg.ammo)
    && msg.ammo.endsWith('_round') && Math.random() < 0.05) {
    addGroundItem(msg.ammo, 1, n.x, n.y, sim.tick + 100);
  }

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

  // ----- lifesteal (on total damage this swing) -----
  let heal = 0;
  for (const e of effects) {
    if (e.type === 'lifesteal') heal += Math.floor(totalDmg * clampNum(e.pct, 0, 1, 0));
  }

  p.send({ t: 'youHit', npc: n.id, def: n.def.id, dmg: totalDmg, mode, ...(heal > 0 ? { heal } : {}), ...(spec ? { spec: true } : {}) });
  n.target = p.userId;
  for (const d of hits) if (!n.dead) applyDamageToNpc(n, d, p, splatKind);
}

export function handlePickup(p: PlayerView, msg: any) {
  const gid = Number(msg.gid);
  const gi = sim.ground.find((g) => g.gid === gid);
  if (!gi || p.dead) return;
  if (gi.ownerUserId !== null && gi.ownerUserId !== p.userId) return; // not your instance
  if (chebyshev(p.x, p.y, gi.x, gi.y) > 2) return; // pos staleness slack
  removeGroundItem(gi);
  p.send({ t: 'got', gid: gi.gid, item: gi.item, qty: gi.qty });
  flushGroundNow();
}

export function handleDrop(p: PlayerView, msg: any) {
  if (p.dead) return;
  const item = String(msg.item ?? '');
  if (!ITEM_RE.test(item)) return;
  const qty = clamp(msg.qty, 1, 2_000_000_000, 1);
  // drops made inside an instance stay private to that instance's owner
  addGroundItem(item, qty, p.x, p.y, sim.tick + 200, groundOwnerFor(p));
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
    n.shearedUntil = sim.tick + 50;
    n.dirty = true;
    p.send({ t: 'shorn', npc: n.id });
  }
}

export function dropPlayer(userId: number) {
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
