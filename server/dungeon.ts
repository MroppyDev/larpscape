// THE UNTUNED MINE — per-player instanced dungeon runs.
//
// A run is created by POST /api/dungeon/enter (wired in index.ts) once the
// server has verified the player's save has gd3_sealed_wing >= 6. The run
// spawns a private NPC set tagged with ownerUserId; sim.ts filters those NPCs
// (and their drops/fx/hitsplats) out of everyone else's snapshots and deltas,
// and they only ever aggro/target their owner.
//
// A run ends when the owner: exits through the breach light (POST exit),
// dies/teleports out (their reported position leaves the dungeon rect for
// EXIT_GRACE_TICKS), disconnects, or after RUN_TIMEOUT_MS. Ending a run
// despawns its NPCs and resyncs the owner with a fresh fullSnapshot (deltas
// cannot express NPC removal).
//
// Boss mechanics (all per DESIGN-REFERENCE rule 12 — every hit that can take
// >1/3 of an at-level HP pool is telegraphed >=2 ticks ahead and dodged by
// moving 1-2 tiles; dodges are resolved SERVER-side by comparing the owner's
// position at telegraph time vs. at resolution):
//
//   FOREMAN ECHO (F2 gate): every SKIP_INTERVAL ticks it telegraphs a landing
//   tile ('echo_skip_telegraph', tile in the fx payload), then two ticks later
//   skips (teleports) there on the beat and slams anyone still adjacent.
//
//   THE CRYSTAL HEART (F3): stationary. Phase 1 — it rings: an expanding
//   radial shockwave telegraphed 2 ticks ahead ('heart_ring_telegraph'),
//   hits everything within RING_RANGE unless the owner moved >=2 tiles; it
//   also hums up to MAX_MOTES discord-mote adds. Phase 2 below 40% hp — it
//   cracks ('heart_crack') and the wrong note solos: 4 floor tiles light up
//   ('heart_solo_telegraph', tiles in the payload); standing on or beside a
//   lit tile at the downbeat takes the heavy slam.
//
//   THE CRAWL (F2 rubble corridor): while the owner stands in the hazard
//   rect, rubble telegraphs over their head every few ticks and falls two
//   ticks later onto the telegraphed tile.

import type { Database } from 'better-sqlite3';
import {
  sim, spawnNpc, despawnNpc, sendFx, damagePlayer, fullSnapshot,
  simTickHooks, npcDeathHooks, setGroundOwnerFor,
  type SNpc, type PlayerView,
} from './sim';
import { blocked } from './world';

// ---------------------------------------------------------------------------
// Geometry (must match scripts/author-dungeon.ts + src/packs/untuned_mine.ts)
// ---------------------------------------------------------------------------

export const DUNGEON_RECT = { x0: 6, y0: 238, x1: 50, y1: 295 };
export const ENTRY = { x: 12, y: 245 };           // arrival tile in the entry hall
export const OVERWORLD_EXIT = { x: 23, y: 76 };   // breach-side tile at the Swamp Mine door
const RUBBLE_RECT = { x0: 30, y0: 261, x1: 38, y1: 265 }; // 'the Crawl' on F2

export function inDungeon(x: number, y: number): boolean {
  return x >= DUNGEON_RECT.x0 && x <= DUNGEON_RECT.x1 && y >= DUNGEON_RECT.y0 && y <= DUNGEON_RECT.y1;
}

// Per-run NPC set: [defId, x, y]. Placement rules: the entry hall (A), the
// ladder room (D) and the F3 ledge (G) are mob-free safe pockets; spawns sit
// >=5 tiles from connecting-corridor tiles so the corridors stay no-aggro.
const SPAWN_SET: [string, number, number][] = [
  // F1 — the Ringing Galleries (tutorial pace)
  ['discord_mote', 25, 242], ['discord_mote', 25, 248],
  ['untuned_golem', 25, 245],
  ['discord_mote', 37, 241], ['discord_mote', 43, 243],
  ['untuned_golem', 38, 245], ['untuned_golem', 42, 241],
  // F2 — the Skipped Seam (denser, faster; the Crawl is a hazard zone)
  ['seam_creeper', 37, 263],
  ['seam_creeper', 34, 263],
  ['untuned_golem', 24, 262], ['untuned_golem', 21, 264],
  ['discord_mote', 27, 260], ['discord_mote', 19, 261],
  ['seam_creeper', 25, 267], ['seam_creeper', 28, 261],
  ['foreman_echo', 20, 274],
  // F3 — the Resonant Vault + the Resonance Gallery (Ch4 quest wing)
  ['crystal_heart', 24, 289],
  ['the_dissonant', 41, 290], // def ships in Q4's fragment; skipped if unmerged
];

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const EXIT_GRACE_TICKS = 20; // ~12s outside the rect before the run auto-ends

interface Run {
  userId: number;
  startedAt: number;
  npcs: SNpc[];
  outsideTicks: number;
  graceTicks: number;   // ticks since enter before the bounds check arms
  bossKilled: boolean;
  // crystal heart mechanic state
  phase2: boolean;
  ringAt: number;            // resolution tick of a telegraphed ring (0 = none)
  ringPos: { x: number; y: number } | null;
  soloAt: number;
  soloTiles: { x: number; y: number }[];
  nextMoteAt: number;
  // foreman echo
  skipAt: number;
  skipTo: { x: number; y: number } | null;
  skipFrom: { x: number; y: number } | null;
  // rubble hazard
  rubbleAt: number;
  rubbleTile: { x: number; y: number } | null;
}

const runs = new Map<number, Run>();

let db: Database | null = null;
let sendTo: (userId: number, msg: unknown) => void = () => {};

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function initDungeon(database: Database, sendToFn: (userId: number, msg: unknown) => void) {
  db = database;
  sendTo = sendToFn;
  db.exec(`
    CREATE TABLE IF NOT EXISTS dungeon_records (
      user_id INTEGER PRIMARY KEY,
      best_ms INTEGER NOT NULL,
      runs INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
  setGroundOwnerFor((p: PlayerView) => (inDungeon(p.x, p.y) ? p.userId : null));
  simTickHooks.push(tickDungeon);
  npcDeathHooks.push(onNpcDeath);
}

export function startRun(userId: number): { x: number; y: number } {
  endRun(userId, 'restart'); // replace any stale run
  const run: Run = {
    userId, startedAt: Date.now(), npcs: [], outsideTicks: 0, graceTicks: 0,
    bossKilled: false, phase2: false,
    ringAt: 0, ringPos: null, soloAt: 0, soloTiles: [], nextMoteAt: 0,
    skipAt: 0, skipTo: null, skipFrom: null,
    rubbleAt: 0, rubbleTile: null,
  };
  for (const [defId, x, y] of SPAWN_SET) {
    const n = spawnNpc(defId, x, y, userId);
    if (n) run.npcs.push(n);
    else console.warn(`[dungeon] unknown npc def '${defId}' (content not merged yet) — skipped`);
  }
  runs.set(userId, run);
  // private world resync so the instance set appears immediately
  sendTo(userId, fullSnapshot(userId));
  return { ...ENTRY };
}

export function endRun(userId: number, reason: string): boolean {
  const run = runs.get(userId);
  if (!run) return false;
  runs.delete(userId);
  for (const n of run.npcs) despawnNpc(n);
  // resync the (possibly still connected) owner: deltas can't remove NPCs
  sendTo(userId, fullSnapshot(userId));
  console.log(`[dungeon] run for user ${userId} ended (${reason})`);
  return true;
}

export function hasRun(userId: number): boolean { return runs.has(userId); }

export function onDisconnect(userId: number) { endRun(userId, 'disconnect'); }

// ---------------------------------------------------------------------------
// Records (fastest boss kill per user)
// ---------------------------------------------------------------------------

function recordCompletion(userId: number, ms: number) {
  if (!db) return;
  const row = db.prepare('SELECT best_ms FROM dungeon_records WHERE user_id = ?')
    .get(userId) as { best_ms: number } | undefined;
  if (!row) {
    db.prepare('INSERT INTO dungeon_records (user_id, best_ms, runs, updated_at) VALUES (?,?,1,?)')
      .run(userId, ms, Date.now());
  } else {
    db.prepare('UPDATE dungeon_records SET best_ms = MIN(best_ms, ?), runs = runs + 1, updated_at = ? WHERE user_id = ?')
      .run(ms, Date.now(), userId);
  }
}

export function getRecords(userId?: number) {
  if (!db) return { best: [], yours: null };
  const best = db.prepare(
    `SELECT u.username, d.best_ms FROM dungeon_records d JOIN users u ON u.id = d.user_id
      ORDER BY d.best_ms ASC LIMIT 5`
  ).all() as { username: string; best_ms: number }[];
  let yours: number | null = null;
  if (userId !== undefined) {
    const row = db.prepare('SELECT best_ms FROM dungeon_records WHERE user_id = ?')
      .get(userId) as { best_ms: number } | undefined;
    yours = row ? row.best_ms : null;
  }
  return { best: best.map((b) => ({ username: b.username, ms: b.best_ms })), yours };
}

function onNpcDeath(n: SNpc, _by: PlayerView) {
  if (n.ownerUserId === null) return;
  const run = runs.get(n.ownerUserId);
  if (!run) return;
  if (n.def.id === 'crystal_heart' && !run.bossKilled) {
    run.bossKilled = true;
    const ms = Date.now() - run.startedAt;
    recordCompletion(run.userId, ms);
    sendFx(null, n, 'heart_shatter', { ms });
  }
}

// ---------------------------------------------------------------------------
// Per-tick mechanics
// ---------------------------------------------------------------------------

function tickDungeon(players: Map<number, PlayerView>, tick: number) {
  for (const run of [...runs.values()]) {
    const owner = players.get(run.userId);

    // lifecycle: offline, timed out, or walked/teleported/died out of the rect
    if (!owner) { endRun(run.userId, 'owner offline'); continue; }
    if (Date.now() - run.startedAt > RUN_TIMEOUT_MS) { endRun(run.userId, 'timeout'); continue; }
    if (run.graceTicks < EXIT_GRACE_TICKS) run.graceTicks++;
    else if (!inDungeon(owner.x, owner.y) || owner.dead) {
      run.outsideTicks++;
      if (run.outsideTicks >= EXIT_GRACE_TICKS || owner.dead) { endRun(run.userId, owner.dead ? 'death' : 'left bounds'); continue; }
    } else run.outsideTicks = 0;

    tickRubble(run, owner, tick);
    for (const n of run.npcs) {
      if (n.dead) continue;
      if (n.def.id === 'foreman_echo') tickForemanEcho(run, n, owner, tick);
      else if (n.def.id === 'crystal_heart') tickCrystalHeart(run, n, owner, tick);
      else if (n.def.id === 'seam_creeper') tickCreeperLunge(n, owner);
    }
  }
}

// Seam creeper: lunges — takes one extra step per tick while closing in.
function tickCreeperLunge(n: SNpc, owner: PlayerView) {
  if (n.target !== owner.userId || owner.dead) return;
  const dist = chebyshev(owner.x, owner.y, n.x, n.y);
  if (dist < 2 || dist > 5) return;
  const dx = Math.sign(owner.x - n.x), dy = Math.sign(owner.y - n.y);
  for (const [mx, my] of [[dx, dy], [dx, 0], [0, dy]]) {
    const nx = n.x + mx, ny = n.y + my;
    if ((mx || my) && !blocked(nx, ny, true) && !(owner.x === nx && owner.y === ny)) {
      n.x = nx; n.y = ny; n.dirty = true;
      break;
    }
  }
}

// Foreman Echo: skips position 2 tiles on a visible beat.
const SKIP_INTERVAL = 9;
const SKIP_MAX = 11, SKIP_MIN = 6;

function tickForemanEcho(run: Run, n: SNpc, owner: PlayerView, tick: number) {
  if (n.target !== owner.userId) { run.skipAt = 0; run.skipTo = null; return; }

  if (run.skipAt > 0 && tick >= run.skipAt) {
    const to = run.skipTo;
    run.skipAt = 0; run.skipTo = null;
    if (to && !blocked(to.x, to.y, true) && !(owner.x === to.x && owner.y === to.y)) {
      n.x = to.x; n.y = to.y; n.dirty = true;
      sendFx(null, n, 'echo_skip');
      if (!owner.dead && chebyshev(owner.x, owner.y, n.x, n.y) <= 1) {
        damagePlayer(owner, n, randInt(SKIP_MIN, SKIP_MAX), 'echo_slam');
      } else {
        sendFx(null, n, 'echo_whiff');
      }
    }
    return;
  }
  if (run.skipAt === 0 && tick % SKIP_INTERVAL === 0 && !owner.dead) {
    // land 2 tiles from its current spot, stepping toward (or past) the owner
    const dx = Math.sign(owner.x - n.x), dy = Math.sign(owner.y - n.y);
    const cand = [
      { x: n.x + dx * 2, y: n.y + dy * 2 },
      { x: owner.x + dx, y: owner.y + dy }, // skip PAST the player
      { x: n.x + dx * 2, y: n.y },
      { x: n.x, y: n.y + dy * 2 },
    ];
    const to = cand.find((c) => !blocked(c.x, c.y, true) && !(owner.x === c.x && owner.y === c.y));
    if (!to) return;
    run.skipTo = to;
    run.skipAt = tick + 2; // >=2-tick telegraph (rule 12)
    sendFx(null, n, 'echo_skip_telegraph', { tx: to.x, ty: to.y });
  }
}

// The Crystal Heart: P1 radial shockwaves + mote choir, P2 the wrong note solos.
const RING_INTERVAL = 10;
const RING_RANGE = 4;
const RING_MAX = 9, RING_MIN = 4;
const SOLO_INTERVAL = 8;
const SOLO_MAX = 13, SOLO_MIN = 7;
const MOTE_INTERVAL = 16;
const MAX_MOTES = 4;

function tickCrystalHeart(run: Run, n: SNpc, owner: PlayerView, tick: number) {
  // leash: stop the music when the player leaves the arena (e.g. slipping
  // past into the Resonance Gallery quest wing) — it can't chase, so it sulks
  if (n.target !== owner.userId || chebyshev(owner.x, owner.y, n.x, n.y) > 6) {
    run.ringAt = 0; run.soloAt = 0; run.soloTiles = [];
    return;
  }

  // phase flip at 40%
  if (!run.phase2 && n.hp > 0 && n.hp < n.def.hitpoints * 0.4) {
    run.phase2 = true;
    run.ringAt = 0;
    sendFx(null, n, 'heart_crack');
  }

  // mote choir (both phases; slower in P2)
  const moteEvery = run.phase2 ? MOTE_INTERVAL * 2 : MOTE_INTERVAL;
  if (tick >= run.nextMoteAt && !owner.dead) {
    run.nextMoteAt = tick + moteEvery;
    const alive = run.npcs.filter((m) => m.def.id === 'discord_mote' && !m.dead && m.meta.summoned).length;
    if (alive < MAX_MOTES) {
      for (let i = 0; i < 2; i++) {
        const mx = n.x + randInt(-2, 2), my = n.y + randInt(-2, 2);
        if (blocked(mx, my, true)) continue;
        const mote = spawnNpc('discord_mote', mx, my, run.userId);
        if (mote) {
          mote.meta.summoned = true;
          mote.target = run.userId;
          run.npcs.push(mote);
        }
      }
      sendFx(null, n, 'heart_summon');
    }
  }

  if (!run.phase2) {
    // P1 — it rings: radial shockwave, dodged by moving >=2 tiles
    if (run.ringAt > 0 && tick >= run.ringAt) {
      const from = run.ringPos;
      run.ringAt = 0; run.ringPos = null;
      if (!owner.dead && chebyshev(owner.x, owner.y, n.x, n.y) <= RING_RANGE) {
        const moved = from ? chebyshev(owner.x, owner.y, from.x, from.y) : 0;
        if (moved >= 2) sendFx(null, n, 'heart_ring_dodge');
        else damagePlayer(owner, n, randInt(RING_MIN, RING_MAX), 'heart_shockwave');
      }
      return;
    }
    if (run.ringAt === 0 && tick % RING_INTERVAL === 0 && !owner.dead) {
      run.ringAt = tick + 2;
      run.ringPos = { x: owner.x, y: owner.y };
      sendFx(null, n, 'heart_ring_telegraph', { range: RING_RANGE });
    }
  } else {
    // P2 — the wrong note solos: lit floor tiles, heavy slam if caught
    if (run.soloAt > 0 && tick >= run.soloAt) {
      const tiles = run.soloTiles;
      run.soloAt = 0; run.soloTiles = [];
      const caught = !owner.dead && tiles.some((t) => chebyshev(owner.x, owner.y, t.x, t.y) <= 0);
      if (caught) damagePlayer(owner, n, randInt(SOLO_MIN, SOLO_MAX), 'heart_solo');
      else if (!owner.dead) sendFx(null, n, 'heart_solo_dodge');
      return;
    }
    if (run.soloAt === 0 && tick % SOLO_INTERVAL === 0 && !owner.dead) {
      // the player's tile plus a tight cluster around it — step 2 tiles out
      const tiles: { x: number; y: number }[] = [{ x: owner.x, y: owner.y }];
      for (let i = 0; i < 3; i++) {
        tiles.push({ x: owner.x + randInt(-1, 1), y: owner.y + randInt(-1, 1) });
      }
      run.soloTiles = tiles;
      run.soloAt = tick + 2;
      sendFx(null, n, 'heart_solo_telegraph', {
        tiles: tiles.map((t) => [t.x, t.y]),
      });
    }
  }
}

// The Crawl: collapsing rubble over the owner's head while in the hazard rect.
const RUBBLE_INTERVAL = 6;
const RUBBLE_MAX = 8, RUBBLE_MIN = 3;

function tickRubble(run: Run, owner: PlayerView, tick: number) {
  if (run.rubbleAt > 0 && tick >= run.rubbleAt) {
    const t = run.rubbleTile;
    run.rubbleAt = 0; run.rubbleTile = null;
    if (t && !owner.dead && chebyshev(owner.x, owner.y, t.x, t.y) <= 0) {
      // reuse the nearest run npc as the damage attribution source
      const src = run.npcs.find((m) => !m.dead);
      if (src) damagePlayer(owner, src, randInt(RUBBLE_MIN, RUBBLE_MAX), 'rubble_hit');
    }
    return;
  }
  const inRect = owner.x >= RUBBLE_RECT.x0 && owner.x <= RUBBLE_RECT.x1
    && owner.y >= RUBBLE_RECT.y0 && owner.y <= RUBBLE_RECT.y1;
  if (inRect && run.rubbleAt === 0 && tick % RUBBLE_INTERVAL === 0 && !owner.dead) {
    run.rubbleTile = { x: owner.x, y: owner.y };
    run.rubbleAt = tick + 2;
    const src = run.npcs.find((m) => !m.dead);
    if (src) sendFx(null, src, 'rubble_telegraph', { tx: owner.x, ty: owner.y });
  }
}
