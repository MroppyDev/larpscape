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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Content data
// ---------------------------------------------------------------------------

export interface NpcDef {
  id: string;
  name: string;
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
export function rollHit(attLvl: number, attBonus: number, defLvl: number, defBonus: number): boolean {
  const attRoll = (attLvl + 8) * (attBonus + 64);
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
    attackCooldown: 0, wanderCooldown: 0, shearedUntil: 0, meta: {}, dirty: false,
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
        n.dirty = true;
      }
      continue;
    }
    if (n.attackCooldown > 0) n.attackCooldown--;

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
      if (n.def.stationary) {
        if (dist <= 1 && n.attackCooldown === 0) {
          n.attackCooldown = n.def.attackSpeed;
          const hit = rollHit(n.def.attack, 0, target.effDef, target.defBonus);
          const maxHit = Math.floor(0.5 + (n.def.strength + 8) * 64 / 640) + 1;
          damagePlayer(target, n, hit ? Math.floor(Math.random() * (maxHit + 1)) : 0);
        }
      } else if (dist > 1) {
        const dx = Math.sign(target.x - n.x), dy = Math.sign(target.y - n.y);
        const tryMoves = [[dx, dy], [dx, 0], [0, dy]];
        for (const [mx, my] of tryMoves) {
          const nx = n.x + mx, ny = n.y + my;
          if ((mx || my) && !blocked(nx, ny, true) && !playerAt(nx, ny)) {
            n.x = nx; n.y = ny; n.dirty = true; break;
          }
        }
      } else if (n.attackCooldown === 0) {
        n.attackCooldown = n.def.attackSpeed;
        const hit = rollHit(n.def.attack, 0, target.effDef, target.defBonus);
        const maxHit = Math.floor(0.5 + (n.def.strength + 8) * 64 / 640) + 1;
        const dmg = hit ? Math.floor(Math.random() * (maxHit + 1)) : 0;
        damagePlayer(target, n, dmg);
      }
    } else {
      if (n.target !== null) { n.target = null; n.dirty = true; }
      if (n.wanderCooldown > 0) { n.wanderCooldown--; continue; }
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
function applyDamageToNpc(n: SNpc, dmg: number, by: PlayerView) {
  n.hp -= dmg;
  n.dirty = true;
  const hitMsg = { t: 'hit', npc: n.id, dmg, hp: Math.max(0, n.hp), by: by.name };
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

  const hit = rollHit(eff, bonus, n.def.defence, 0);
  const dmg = hit ? Math.floor(Math.random() * (maxHit + 1)) : 0;

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

  p.send({ t: 'youHit', npc: n.id, def: n.def.id, dmg, mode });
  n.target = p.userId;
  applyDamageToNpc(n, dmg, p);
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
