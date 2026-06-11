// THE UNTUNED MINE — authored dungeon zone in the unused SW ocean corner.
// Run: npx tsx scripts/author-dungeon.ts
//
// A solo, instanced early-game dungeon (levels ~10-30). The zone is sealed by
// ocean on every side — it is NOT walk-reachable from the overworld; entry is
// only by the untuned_mine_door teleport (src/packs/untuned_mine.ts +
// POST /api/dungeon/enter).
//
// Three floors, three sealed hall clusters (the gaps between them stay ocean,
// so even the minimap reads as three strata):
//
//   F1 "the Ringing Galleries"  y240-250  tutorial pace, motes + golems, veins
//   F2 "the Skipped Seam"       y259-277  hazard floor: collapsing-rubble
//                               corridor, denser packs, Foreman Echo gate
//   F3 "the Resonant Vault"     y281-293  boss arena (the Crystal Heart) +
//                               the Resonance Gallery quest wing (Ch4)
//
// Layout (all coords inclusive; CAVE floor, auto-wrapped WALL ring):
//   F1: A entry hall x10-16 y242-248 (arrive 12,245; exit portal 11,243)
//       corr1 y245 x17-20 | B First Gallery x21-29 y241-249
//       corr2 y245 x30-32 | C Choir Stope x33-45 y240-250 (ladder down 44,249)
//   F2: D ladder room x39-45 y260-266 (ladder up 44,262; arrive 43,263)
//       the Crawl (rubble hazard) x30-38 y261-265
//       E the Skipped Seam x18-29 y259-269
//       corr3 x20 y270-271 | F Foreman's Shift x14-27 y272-277 (rope down 25,276)
//   F3: G ledge x22-28 y281-283 (rope up 26,282; arrive 25,283)
//       gate x24-26 y284 | H the Resonant Vault x14-34 y285-293 (boss 24,289)
//       corr5 y289 x35-36 | I the Resonance Gallery x37-45 y286-292
//       (resonance_stand 41,288; conductors_lectern 42,288 — Ch4 quest wing)
//
// GUARANTEES: only touches tiles inside x6-50 y238-295, and only if they are
// currently WATER (or exits cleanly if the dungeon is already carved).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.resolve(__dirname, '../data/map.json');

const T = { WATER: 1, WALL: 4, CAVE: 11 } as const;

// dungeon bounding box (must match DUNGEON_RECT in server/dungeon.ts and
// the bounds in src/packs/untuned_mine.ts)
const ZONE = { x0: 6, y0: 238, x1: 50, y1: 295 };

interface MapObj { type: string; x: number; y: number }
const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) as {
  width: number; height: number; terrain: string; objects: MapObj[];
};
const W = map.width;
const terr = Buffer.from(map.terrain, 'base64');
const at = (x: number, y: number) => terr[y * W + x];
const set = (x: number, y: number, t: number) => { terr[y * W + x] = t; };

// idempotence guard: entry hall already carved -> nothing to do
if (at(12, 245) === T.CAVE) {
  console.log('[dungeon] already carved — nothing to do');
  process.exit(0);
}

// safety: the whole zone must be virgin ocean
for (let y = ZONE.y0; y <= ZONE.y1; y++) {
  for (let x = ZONE.x0; x <= ZONE.x1; x++) {
    if (at(x, y) !== T.WATER) {
      console.error(`[dungeon] tile (${x},${y}) is not water (t=${at(x, y)}) — refusing to carve`);
      process.exit(1);
    }
  }
}
for (const o of map.objects) {
  if (o.x >= ZONE.x0 && o.x <= ZONE.x1 && o.y >= ZONE.y0 && o.y <= ZONE.y1) {
    console.error(`[dungeon] object ${o.type} at (${o.x},${o.y}) inside zone — refusing to carve`);
    process.exit(1);
  }
}

// ---- carve rooms + corridors (x0,y0,x1,y1 inclusive) ----
const ROOMS: [string, number, number, number, number][] = [
  // F1 — the Ringing Galleries
  ['A entry hall', 10, 242, 16, 248],
  ['corr1', 17, 245, 20, 245],
  ['B First Gallery', 21, 241, 29, 249],
  ['corr2', 30, 245, 32, 245],
  ['C Choir Stope', 33, 240, 45, 250],
  // F2 — the Skipped Seam
  ['D ladder room', 39, 260, 45, 266],
  ['the Crawl', 30, 261, 38, 265],
  ['E Skipped Seam', 18, 259, 29, 269],
  ['corr3', 20, 270, 20, 271],
  ["F Foreman's Shift", 14, 272, 27, 277],
  // F3 — the Resonant Vault
  ['G ledge', 22, 281, 28, 283],
  ['gate', 24, 284, 26, 284],
  ['H Resonant Vault', 14, 285, 34, 293],
  ['corr5', 35, 289, 36, 289],
  ['I Resonance Gallery', 37, 286, 45, 292],
];
for (const [, x0, y0, x1, y1] of ROOMS) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, T.CAVE);
}

// wrap every carved tile with a WALL ring (8-dir) so the halls are sealed
for (let y = ZONE.y0; y <= ZONE.y1; y++) {
  for (let x = ZONE.x0; x <= ZONE.x1; x++) {
    if (at(x, y) !== T.WATER) continue;
    let touchesCave = false;
    for (let dy = -1; dy <= 1 && !touchesCave; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (at(x + dx, y + dy) === T.CAVE) { touchesCave = true; break; }
      }
    }
    if (touchesCave) set(x, y, T.WALL);
  }
}

// ---- objects ----
const newObjects: MapObj[] = [
  // entry hall
  { type: 'mine_exit_portal', x: 11, y: 243 },
  // floor links
  { type: 'mine_ladder', x: 44, y: 249 }, // F1 -> F2 (down)
  { type: 'mine_ladder', x: 44, y: 262 }, // F2 -> F1 (up)
  { type: 'mine_rope', x: 25, y: 276 },   // F2 -> F3 (down; gated on Foreman Echo)
  { type: 'mine_rope', x: 26, y: 282 },   // F3 -> F2 (up)
  // ringing veins — F1 (tutorial cadence)
  { type: 'rocks_ringing', x: 21, y: 242 },
  { type: 'rocks_ringing', x: 29, y: 242 },
  { type: 'rocks_ringing', x: 33, y: 241 },
  { type: 'rocks_ringing', x: 45, y: 241 },
  { type: 'rocks_ringing', x: 39, y: 250 },
  // ringing veins — F2
  { type: 'rocks_ringing', x: 18, y: 260 },
  { type: 'rocks_ringing', x: 28, y: 259 },
  { type: 'rocks_ringing', x: 23, y: 269 },
  { type: 'rocks_ringing', x: 14, y: 272 },
  { type: 'rocks_ringing', x: 27, y: 272 },
  // ringing veins — F3 (post-boss payout)
  { type: 'rocks_ringing', x: 14, y: 286 },
  { type: 'rocks_ringing', x: 14, y: 289 },
  // glowing crystal deco
  { type: 'crystal_node', x: 29, y: 249 },
  { type: 'crystal_node', x: 33, y: 250 },
  { type: 'crystal_node', x: 18, y: 269 },
  { type: 'crystal_node', x: 16, y: 285 },
  { type: 'crystal_node', x: 33, y: 285 },
  { type: 'crystal_node', x: 15, y: 293 },
  { type: 'crystal_node', x: 33, y: 293 },
  { type: 'crystal_node', x: 45, y: 286 },
  // Ch4 quest wing (the Resonance Gallery) — final homes for Q4's objects.
  // NOTE for the integrator: drop the q4 fragment's placeholder mapObjects
  // ((23,77)/(24,77)) in favour of these.
  { type: 'resonance_stand', x: 41, y: 288 },
  { type: 'conductors_lectern', x: 42, y: 288 },
];
map.objects.push(...newObjects);

// ---- sanity: every walkable dungeon tile reachable from the arrival tile ----
const ARRIVE = { x: 12, y: 245 };
// teleport links (ladder/rope hop the gaps between strata)
const LINKS: [number, number, number, number][] = [
  [44, 249, 43, 263], [44, 262, 43, 248], [25, 276, 25, 283], [26, 282, 24, 275],
];
const objBlocked = new Set(newObjects.map((o) => o.x + ',' + o.y));
const seen = new Set<string>([ARRIVE.x + ',' + ARRIVE.y]);
const q = [[ARRIVE.x, ARRIVE.y]];
while (q.length) {
  const [x, y] = q.pop()!;
  const push = (nx: number, ny: number) => {
    const k = nx + ',' + ny;
    if (seen.has(k)) return;
    if (at(nx, ny) !== T.CAVE || objBlocked.has(k)) return;
    seen.add(k); q.push([nx, ny]);
  };
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) push(x + dx, y + dy);
  for (const [lx, ly, tx, ty] of LINKS) {
    if (Math.abs(x - lx) <= 1 && Math.abs(y - ly) <= 1) push(tx, ty);
  }
}
let carved = 0, unreachable = 0;
for (let y = ZONE.y0; y <= ZONE.y1; y++) {
  for (let x = ZONE.x0; x <= ZONE.x1; x++) {
    if (at(x, y) !== T.CAVE) continue;
    carved++;
    if (!objBlocked.has(x + ',' + y) && !seen.has(x + ',' + y)) {
      unreachable++;
      console.error(`[dungeon] unreachable cave tile (${x},${y})`);
    }
  }
}
if (unreachable > 0) process.exit(1);

fs.writeFileSync(MAP_PATH, JSON.stringify({
  width: W, height: map.height, terrain: terr.toString('base64'), objects: map.objects,
}));
console.log(`[dungeon] carved ${carved} cave tiles, placed ${newObjects.length} objects, all reachable. Saved.`);
