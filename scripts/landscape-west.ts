// landscape-west.ts — Hand-author the new western region (terrain columns
// 0..119, all y) created by scripts/expand-west.ts.
//
// Biomes painted left-to-right (a western coastline opening onto rolling
// meadow, a forest belt with a lake + stream, and scenic foothills), wired to
// the existing world by a PATH road that crosses the seam at x=120 wherever
// the old edge is land. Natural decor + docile/wild fauna are scattered at the
// ~4% density of the existing wilderness; six large flat grass clearings are
// reserved (kept free of decor/road/spawns) for future towns.
//
// Deterministic (seeded PRNG) so reruns are reproducible. Idempotent-ish: it
// only writes within columns 0..119 and only appends west-region spawns.
// Run AFTER expand-west.ts:  npx tsx scripts/landscape-west.ts

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const T = {
  GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5, SWAMP: 6, FENCE: 7, SAND: 8,
  DIRT: 9, FLOWERS: 10, CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16,
} as const;

const WEST = 120;   // new region spans x 0..119; seam at x=120
const W = 420;
const H = 300;

// ---- deterministic PRNG (mulberry32) ----
let seed = 0x5eed1eaf;
function rng(): number {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1));
const chance = (p: number) => rng() < p;

interface MapJson {
  width: number; height: number; terrain: string;
  objects: { type: string; x: number; y: number }[];
}

const mapPath = path.join(root, 'data/map.json');
const map: MapJson = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
if (map.width !== W || map.height !== H) throw new Error(`expected ${W}x${H}, got ${map.width}x${map.height} — run expand-west.ts first`);

const bin = Buffer.from(map.terrain, 'base64');
const get = (x: number, y: number) => bin[y * W + x];
const set = (x: number, y: number, t: number) => { if (x >= 0 && x < W && y >= 0 && y < H) bin[y * W + x] = t; };

// ===========================================================================
// 1) BASE BIOME PAINT (terrain only, columns 0..119)
// ===========================================================================
// Wavy boundaries so coast/forest/foothill edges don't read as straight walls.
const wave = (y: number, amp: number, period: number, phase = 0) =>
  Math.round(amp * Math.sin((y + phase) * (Math.PI * 2 / period)));

for (let y = 0; y < H; y++) {
  // southern band (y>=216) at the seam is the existing southern sea; let the
  // new west be open ocean there too, with a sand fringe meeting the cove.
  const southSea = y >= 216;

  const beachEdge = 10 + wave(y, 4, 70);          // ocean -> beach boundary
  const beachInner = 18 + wave(y, 3, 90, 30);     // beach -> meadow boundary
  const foothillEdge = 84 + wave(y, 6, 80, 15);   // meadow/forest -> foothills

  for (let x = 0; x < WEST; x++) {
    if (x <= beachEdge) {
      set(x, y, T.WATER);                          // far-west ocean
    } else if (x <= beachInner) {
      set(x, y, southSea ? T.SAND : T.SAND);       // beach (sand all the way down)
    } else if (x <= foothillEdge) {
      set(x, y, southSea ? T.SAND : T.GRASS);      // meadow + forest belt (grass base)
    } else {
      // foothills: grass/dirt with rock — base grass, dirt+rock added below
      set(x, y, southSea ? T.SAND : T.GRASS);
    }
  }
}

// Foothill texture: dabs of DIRT and ROCK outcrops in x 84..118 (not a wall).
for (let y = 0; y < H; y++) {
  if (y >= 216) continue;
  for (let x = 86; x < WEST; x++) {
    if (chance(0.10)) set(x, y, T.DIRT);
    if (chance(0.05)) set(x, y, T.ROCK);
  }
}

// Meadow FLOWERS patches in x 18..55.
function blob(cx: number, cy: number, r: number, t: number, fill: number) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy <= r * r && chance(fill)) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < WEST && y >= 0 && y < H && get(x, y) === T.GRASS) set(x, y, t);
    }
  }
}
for (let i = 0; i < 26; i++) blob(ri(20, 54), ri(6, 210), ri(2, 4), T.FLOWERS, 0.7);

// ===========================================================================
// 2) THE LAKE + STREAM (forest belt)
// ===========================================================================
// Oval lake roughly x60..72, y40..60.
const lake = { cx: 66, cy: 50, rx: 7, ry: 11 };
for (let y = lake.cy - lake.ry; y <= lake.cy + lake.ry; y++) {
  for (let x = lake.cx - lake.rx; x <= lake.cx + lake.rx; x++) {
    const nx = (x - lake.cx) / lake.rx, ny = (y - lake.cy) / lake.ry;
    if (nx * nx + ny * ny <= 1) set(x, y, T.WATER);
  }
}
// a short stream draining the lake south-west toward the ocean
let sx = lake.cx - 6, sy = lake.cy + lake.ry - 1;
while (sx > 14 && sy < H - 1) {
  set(sx, sy, T.WATER); set(sx, sy + 1, T.WATER);
  sx -= 1; if (chance(0.5)) sy += 1;
}

// ===========================================================================
// 3) ROAD NETWORK (PATH) + seam join
// ===========================================================================
const roadTiles = new Set<number>();
function layPathH(x0: number, x1: number, y: number, w = 1) {
  for (let x = x0; x <= x1; x++) for (let d = 0; d < w; d++) {
    const yy = y + d;
    if (get(x, yy) === T.WATER) set(x, yy, T.BRIDGE); else set(x, yy, T.PATH);
    roadTiles.add(yy * W + x);
  }
}
function layPathV(y0: number, y1: number, x: number, w = 1) {
  for (let y = y0; y <= y1; y++) for (let d = 0; d < w; d++) {
    const xx = x + d;
    if (get(xx, y) === T.WATER) set(xx, y, T.BRIDGE); else set(xx, y, T.PATH);
    roadTiles.add(y * W + xx);
  }
}

// Main east-west road from the beach (x18) to the seam edge (x119), at y=120 —
// the old edge column x=120 is left untouched (it is already walkable GRASS),
// so the road meets the existing world without modifying any east tile.
layPathH(18, 119, 120, 2);
// A northern branch through the meadow/forest up to the foothills clearing.
layPathV(40, 120, 40, 1);
layPathH(40, 90, 40, 1);
// A southern branch toward the lower meadow.
layPathV(120, 196, 60, 1);
layPathH(20, 60, 196, 1);
// foothill spur
layPathH(90, 116, 70, 1);
layPathV(40, 70, 90, 1);

// Seam coherence: the west road ends at x=119 against the old edge (x=120),
// which the integrity gate requires we leave byte-identical. The old edge at
// y=120/121 is GRASS (verified), so the join is already walkable — west PATH at
// x=118/119 abuts old GRASS at x=120 with no gap. We only confirm x119 is road.
for (const yy of [120, 121]) {
  if (get(119, yy) === T.WATER) set(119, yy, T.BRIDGE);
  else set(119, yy, T.PATH);
  roadTiles.add(yy * W + 119);
}

// ===========================================================================
// 4) RESERVED TOWN CLEARINGS (kept flat GRASS, no decor/road/spawn)
// ===========================================================================
// Six ~30x30 grass clearings, road-adjacent, spread across meadow/forest/
// foothills. Flatten any non-grass (except keep them off water/road).
const CLEARINGS: { id: string; x: number; y: number; w: number; h: number }[] = [
  { id: 'meadow-north', x: 24, y: 22, w: 30, h: 30 },
  { id: 'meadow-south', x: 26, y: 150, w: 30, h: 30 },
  { id: 'forest-east',  x: 46, y: 78, w: 30, h: 30 },
  { id: 'forest-south', x: 44, y: 158, w: 30, h: 30 },
  { id: 'foothill-north',x: 86, y: 24, w: 30, h: 30 },
  { id: 'foothill-mid', x: 86, y: 128, w: 30, h: 30 },
];
const clearingTiles = new Set<number>();
for (const c of CLEARINGS) {
  for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
    if (x < 1 || x >= WEST || y < 0 || y >= H) continue;
    // flatten to grass unless it's a road tile (roads may clip a corner — keep)
    if (!roadTiles.has(y * W + x) && get(x, y) !== T.WATER) set(x, y, T.GRASS);
    clearingTiles.add(y * W + x);
  }
}

// ===========================================================================
// 5) DECOR OBJECTS (natural wilderness, ~4% density)
// ===========================================================================
const occupied = new Set<number>(); // x<WEST tiles already holding an object
for (const o of map.objects) if (o.x < WEST) occupied.add(o.y * W + o.x);

function placeable(x: number, y: number, allowOnWater = false): boolean {
  if (x < 1 || x >= WEST || y < 0 || y >= H) return false;
  const k = y * W + x;
  if (occupied.has(k) || roadTiles.has(k) || clearingTiles.has(k)) return false;
  const t = get(x, y);
  if (!allowOnWater && (t === T.WATER || t === T.BRIDGE)) return false;
  return true;
}
function addObj(type: string, x: number, y: number) {
  map.objects.push({ type, x, y });
  occupied.add(y * W + x);
}

const decorCounts: Record<string, number> = {};
function decor(type: string, x: number, y: number) { addObj(type, x, y); decorCounts[type] = (decorCounts[type] || 0) + 1; }

for (let y = 0; y < H; y++) {
  if (y >= 216) continue; // leave the southern sea/cove fringe alone
  for (let x = 1; x < WEST; x++) {
    if (!placeable(x, y)) continue;
    const t = get(x, y);
    const r = rng();
    // MEADOW (x 18..55): sparse trees, bushes, flowers, the odd boulder
    if (x > 18 && x <= 55 && t === T.GRASS) {
      if (r < 0.012) decor('tree', x, y);
      else if (r < 0.024) decor('bush', x, y);
      else if (r < 0.030) decor('fern', x, y);
      else if (r < 0.033) decor('boulder_small', x, y);
    } else if (x > 40 && x <= 84 && t === T.GRASS) {
      // FOREST belt (x 40..84): dense trees + undergrowth
      if (r < 0.055) decor(chance(0.7) ? 'tree' : (chance(0.5) ? 'oak' : 'willow'), x, y);
      else if (r < 0.080) decor('bush', x, y);
      else if (r < 0.095) decor('fern', x, y);
      else if (r < 0.105) decor('mushroom_patch', x, y);
    } else if (x > 84 && t === T.GRASS) {
      // FOOTHILLS (x 84..118): boulders, rock, scrub, sparse trees
      if (r < 0.040) decor('boulder_small', x, y);
      else if (r < 0.055) decor('fern', x, y);
      else if (r < 0.062) decor('bush', x, y);
      else if (r < 0.068) decor('tree', x, y);
    } else if (x > 84 && t === T.DIRT) {
      if (r < 0.05) decor('boulder_small', x, y);
    }
  }
}

// Lake/stream edging: reeds + lilypads on grass tiles adjacent to water.
for (let y = 30; y < 80; y++) {
  for (let x = 12; x < 86; x++) {
    if (get(x, y) !== T.WATER) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (get(nx, ny) === T.GRASS && placeable(nx, ny) && chance(0.18)) decor('reeds', nx, ny);
    }
    if (placeable(x, y, true) && get(x, y) === T.WATER && chance(0.06)) decor('lilypad', x, y);
  }
}
// driftwood on the western beach
for (let y = 0; y < 216; y++) for (let x = 10; x <= 18; x++) {
  if (get(x, y) === T.SAND && placeable(x, y) && chance(0.02)) decor('driftwood', x, y);
}

// ===========================================================================
// 6) WILDLIFE SPAWNS (existing npc ids only)
// ===========================================================================
const spawnsPath = path.join(root, 'data/spawns.json');
const spawns = JSON.parse(fs.readFileSync(spawnsPath, 'utf8')) as {
  npcSpawns: { id: string; x: number; y: number }[];
  groundSpawns: { item: string; x: number; y: number; respawnTicks?: number }[];
};

const spawnCounts: Record<string, number> = {};
function freeForNpc(x: number, y: number): boolean {
  if (x < 1 || x >= WEST || y < 0 || y >= H) return false;
  const t = get(x, y);
  if (t === T.WATER || t === T.BRIDGE || t === T.ROCK || t === T.WALL) return false;
  if (occupied.has(y * W + x)) return false;
  if (clearingTiles.has(y * W + x)) return false; // keep reserved town sites pristine
  return true;
}
function spawn(id: string, x: number, y: number) {
  if (!freeForNpc(x, y)) return false;
  spawns.npcSpawns.push({ id, x, y });
  spawnCounts[id] = (spawnCounts[id] || 0) + 1;
  return true;
}
// scatter a herd/pack of `id` around a centre
function scatter(id: string, cx: number, cy: number, n: number, spread: number) {
  let placed = 0, tries = 0;
  while (placed < n && tries < n * 8) {
    tries++;
    if (spawn(id, cx + ri(-spread, spread), cy + ri(-spread, spread))) placed++;
  }
}

// MEADOW — docile livestock + a few rats near the brush
scatter('cow', 30, 60, 5, 6);
scatter('sheep', 36, 100, 6, 6);
scatter('chicken', 28, 40, 6, 5);
scatter('cow', 40, 175, 4, 6);
scatter('sheep', 30, 135, 5, 6);
scatter('giant_rat', 50, 90, 3, 5);

// FOREST — wolves + bears sparse, forest spiders in the deep wood
scatter('bear', 62, 75, 2, 6);
scatter('dire_wolf', 70, 110, 3, 7);
scatter('forest_spider', 58, 145, 3, 6);
scatter('bear', 68, 168, 2, 5);
scatter('giant_rat', 55, 30, 3, 5);

// FOOTHILLS — scorpions + the odd wolf
scatter('scorpion', 100, 60, 4, 7);
scatter('scorpion', 104, 150, 4, 7);
scatter('dire_wolf', 96, 100, 2, 6);
scatter('scorpion', 108, 30, 3, 6);

// ===========================================================================
// WRITE
// ===========================================================================
map.terrain = bin.toString('base64');
const toCRLF = (s: string) => s.replace(/\n/g, '\r\n');
fs.writeFileSync(mapPath, toCRLF(JSON.stringify(map, null, 2) + '\n'));
fs.writeFileSync(spawnsPath, toCRLF(JSON.stringify(spawns, null, 2) + '\n'));

const totalDecor = Object.values(decorCounts).reduce((a, b) => a + b, 0);
const totalSpawns = Object.values(spawnCounts).reduce((a, b) => a + b, 0);
console.log('[landscape-west] terrain painted (cols 0..119), seam joined at x=120.');
console.log('[landscape-west] decor placed:', totalDecor, decorCounts);
console.log('[landscape-west] wildlife spawns appended:', totalSpawns, spawnCounts);
console.log('[landscape-west] reserved town clearings:');
for (const c of CLEARINGS) console.log(`   ${c.id}: x ${c.x}..${c.x + c.w - 1}, y ${c.y}..${c.y + c.h - 1} (${c.w}x${c.h})`);
