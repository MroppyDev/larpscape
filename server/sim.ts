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
}

export interface SGroundItem {
  gid: number;
  item: string;
  qty: number;
  x: number; y: number;
  expiresAt: number; // tick; Infinity for fixed spawns
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
let groundRemovals: number[] = [];

// fixed ground spawn regeneration state
const groundSpawnState: { item: string; x: number; y: number; respawnTicks: number; nextAt: number }[] =
  SPAWNS.groundSpawns.map((s) => ({ ...s, nextAt: 0 }));

const ITEM_RE = /^[a-z][a-z0-9_]{0,47}$/;

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

export function addGroundItem(item: string, qty: number, x: number, y: number, expiresAt: number) {
  const gi: SGroundItem = { gid: nextGid++, item, qty, x, y, expiresAt };
  sim.ground.push(gi);
  groundAdds.push(gi);
  return gi;
}

function removeGroundItem(gi: SGroundItem) {
  const i = sim.ground.indexOf(gi);
  if (i >= 0) sim.ground.splice(i, 1);
  groundRemovals.push(gi.gid);
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

export function sendFx(to: PlayerView | null, npc: SNpc, kind: string) {
  const msg = { t: 'fx', npc: npc.id, def: npc.def.id, kind };
  if (to) to.send(msg); else broadcast(msg);
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

export function initSim(broadcastFn: (msg: unknown) => void) {
  broadcast = broadcastFn;
  let id = 1;
  for (const s of SPAWNS.npcSpawns) {
    const def = NPCS[s.id];
    if (!def) continue;
    const n: SNpc = {
      id: id++, def, x: s.x, y: s.y, spawnX: s.x, spawnY: s.y,
      hp: def.hitpoints, dead: false, respawnAt: 0, target: null,
      attackCooldown: 0, wanderCooldown: 0, shearedUntil: 0, meta: {}, dirty: false,
    };
    sim.npcs.push(n);
    npcById.set(n.id, n);
  }
  console.log(`[sim] spawned ${sim.npcs.length} NPCs`);
}

export function fullSnapshot() {
  return {
    t: 'world',
    tick: sim.tick,
    npcs: sim.npcs.map(serializeNpc),
    ground: sim.ground.map(serializeGround),
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

    // aggression: nearest eligible player within 4 tiles
    if (n.target === null && n.def.aggressive) {
      let best: PlayerView | null = null;
      let bestDist = Infinity;
      for (const p of players.values()) {
        if (p.dead || p.cb > n.def.combatLevel * 2 + 1) continue;
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
      if (dist > 1) {
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
      if (Math.random() < 0.2) {
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

  flushWorldDelta();
}

function flushWorldDelta() {
  const deltas: unknown[] = [];
  for (const n of sim.npcs) {
    if (n.dirty) { deltas.push(serializeNpc(n)); n.dirty = false; }
  }
  if (deltas.length === 0 && groundAdds.length === 0 && groundRemovals.length === 0) return;
  broadcast({
    t: 'w',
    n: deltas,
    ga: groundAdds.map(serializeGround),
    gr: groundRemovals,
  });
  groundAdds = [];
  groundRemovals = [];
}

// ---------------------------------------------------------------------------
// Player intents
// ---------------------------------------------------------------------------

// Player damage to an NPC: hp, hitsplat broadcast, death + drops.
function applyDamageToNpc(n: SNpc, dmg: number, by: PlayerView) {
  n.hp -= dmg;
  n.dirty = true;
  broadcast({ t: 'hit', npc: n.id, dmg, hp: Math.max(0, n.hp), by: by.name });
  if (dmg > 0 && n.target === null) n.target = by.userId; // retaliate
  if (n.hp <= 0) {
    n.dead = true;
    n.hp = 0;
    n.respawnAt = sim.tick + n.def.respawnTicks;
    n.target = null;
    for (const d of n.def.drops) {
      if (Math.random() < d.chance) {
        const qty = d.qty[0] + Math.floor(Math.random() * (d.qty[1] - d.qty[0] + 1));
        addGroundItem(d.item, qty, n.x, n.y, sim.tick + 200);
      }
    }
    by.send({ t: 'youKilled', npc: n.id, def: n.def.id });
  }
}

export function handleSwing(p: PlayerView, msg: any) {
  const n = npcById.get(Number(msg.npc));
  if (!n || n.dead || !n.def.attackable || p.dead) return;

  const mode = msg.mode === 'ranged' || msg.mode === 'magic' ? msg.mode : 'melee';
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

  p.send({ t: 'youHit', npc: n.id, def: n.def.id, dmg, mode });
  n.target = p.userId;
  applyDamageToNpc(n, dmg, p);
}

export function handlePickup(p: PlayerView, msg: any) {
  const gid = Number(msg.gid);
  const gi = sim.ground.find((g) => g.gid === gid);
  if (!gi || p.dead) return;
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
  addGroundItem(item, qty, p.x, p.y, sim.tick + 200);
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
  broadcast({ t: 'w', n: [], ga: groundAdds.map(serializeGround), gr: groundRemovals });
  groundAdds = [];
  groundRemovals = [];
}
