// Phase 5 — handcrafted world expansion: 224×224 → 300×300.
// Run: npx tsx scripts/author-expansion.ts
//
// This is an AUTHORED level, not a generator. Every building, road waypoint,
// grove, pen and pier below was placed on purpose. Roads are smoothed
// polylines with hand-tuned jitter; terrain edges get the same dither style
// as scripts/map-organic-pass.ts. No noise fields.
//
// New regions (all tied to docs/LORE.md + the hub_* content packs):
//   ELDERMERE       forest village on the mere, east of Frostpeak (x244-272, y62-106)
//   THE TANGLEWOOD  dense dark forest with 1-2 tile winding paths, spiders,
//                   and the yew ring at the dark heart clearing (x224-260, y66-136)
//   FARM BELT       meadow/farmland along the Aldgate east road (x224-252, y30-62)
//   DANGER CORRIDOR ruin wraiths + dire wolves between Eldermere and Stonewatch
//   STONEWATCH      walled hill fort on a rock plateau + mining outcrop (x256-292, y156-200)
//   GULLSWRECK COVE smugglers' island in the southern sea, reached by the
//                   long causeway off Port Brackwater's west pier (x52-132, y230-296)
//
// GUARANTEES (verified at the end of this script, exits 1 on failure):
//   - legacy 224×224 terrain is byte-identical EXCEPT 4 causeway tiles:
//       (99,222) (100,222) (99,223) (100,223)  WATER -> BRIDGE
//   - no legacy object or legacy spawn is touched
//   - every walkable tile in the new land is BFS-reachable from spawn (22,38)
//   - every new NPC/ground spawn sits on an unblocked, reachable tile
//
// Idempotent: if map.json is already 300×300 the script reconstructs the
// legacy 224 map from it (crop + revert the 4 causeway tiles + drop expansion
// objects/spawns) and re-authors the expansion from scratch.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.resolve(__dirname, '../data/map.json');
const SPAWNS_PATH = path.resolve(__dirname, '../data/spawns.json');

const T = {
  GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5, SWAMP: 6, FENCE: 7, SAND: 8,
  DIRT: 9, FLOWERS: 10, CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16,
} as const;

const LEGACY = 224;
const W = 300, H = 300;
const SPAWN = { x: 22, y: 38 };

// the ONLY legacy tiles this script is allowed to change (pier -> causeway)
const BORDER_TILES: [number, number][] = [[99, 222], [100, 222], [99, 223], [100, 223]];

// mirror of NON_BLOCKING in src/world.ts
const NON_BLOCKING = new Set([
  'fire', 'fishing_spot', 'rod_fishing_spot', 'flax_plant', 'farming_patch',
  'snare_set', 'agility_log', 'agility_rope', 'agility_wall', 'agility_ledge',
  'ice_ledge', 'rope_bridge', 'rock_climb', 'snow_slope', 'fire_altar',
  'lobster_spot', 'harpoon_spot',
  'bush', 'fern', 'boulder_small', 'mushroom_patch', 'reeds', 'lilypad', 'driftwood',
  'dance_floor', 'rainbow_banner',
  'chair', 'banner', 'rug_deco',
]);

// ---- seeded RNG: deterministic builds ----
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xe1de7);

// =====================================================================
// Load + (re)derive the legacy 224 map
// =====================================================================
interface MapObj { type: string; x: number; y: number; [k: string]: any }
interface NpcSpawn { id: string; x: number; y: number }
interface GroundSpawn { item: string; x: number; y: number; respawnTicks: number }

const rawMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) as {
  width: number; height: number; terrain: string; objects: MapObj[];
};
const rawSpawns = JSON.parse(fs.readFileSync(SPAWNS_PATH, 'utf8')) as {
  npcSpawns: NpcSpawn[]; groundSpawns: GroundSpawn[];
};

const isExpansion = (x: number, y: number) => x >= LEGACY || y >= LEGACY;

let legacyTerr: Uint8Array;           // 224*224, pristine
let legacyObjects: MapObj[];
let legacyNpcSpawns: NpcSpawn[];
let legacyGroundSpawns: GroundSpawn[];

if (rawMap.width === LEGACY && rawMap.height === LEGACY) {
  legacyTerr = new Uint8Array(Buffer.from(rawMap.terrain, 'base64'));
  legacyObjects = rawMap.objects;
  legacyNpcSpawns = rawSpawns.npcSpawns;
  legacyGroundSpawns = rawSpawns.groundSpawns;
} else if (rawMap.width === W && rawMap.height === H) {
  // re-run: crop the legacy box back out and undo the causeway tiles
  const big = new Uint8Array(Buffer.from(rawMap.terrain, 'base64'));
  legacyTerr = new Uint8Array(LEGACY * LEGACY);
  for (let y = 0; y < LEGACY; y++)
    for (let x = 0; x < LEGACY; x++) legacyTerr[y * LEGACY + x] = big[y * W + x];
  for (const [x, y] of BORDER_TILES) legacyTerr[y * LEGACY + x] = T.WATER;
  legacyObjects = rawMap.objects.filter(o => !isExpansion(o.x, o.y));
  legacyNpcSpawns = rawSpawns.npcSpawns.filter(s => !isExpansion(s.x, s.y));
  legacyGroundSpawns = rawSpawns.groundSpawns.filter(s => !isExpansion(s.x, s.y));
} else {
  throw new Error(`unexpected map size ${rawMap.width}x${rawMap.height}`);
}
const legacySnapshot = legacyTerr.slice(); // for the byte-identical audit

// =====================================================================
// Build the 300×300 canvas
// =====================================================================
const terr = new Uint8Array(W * H).fill(T.WATER); // ocean/void by default
for (let y = 0; y < LEGACY; y++)
  for (let x = 0; x < LEGACY; x++) terr[y * W + x] = legacyTerr[y * LEGACY + x];

const key = (x: number, y: number) => y * W + x;
const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
const inLegacy = (x: number, y: number) => x < LEGACY && y < LEGACY;
const D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const D8 = [...D4, [-1, -1], [1, -1], [-1, 1], [1, 1]];

let newTiles = 0;
function set(x: number, y: number, t: number, force = false) {
  if (!inB(x, y)) return;
  if (inLegacy(x, y) && !force) return; // legacy is sacred
  if (terr[key(x, y)] !== t) { terr[key(x, y)] = t; if (!inLegacy(x, y)) newTiles++; }
}
const get = (x: number, y: number) => (inB(x, y) ? terr[key(x, y)] : T.WATER);

// disc stamp
function disc(cx: number, cy: number, r: number, t: number) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, t);
}

// wobbled blob: a circle whose radius varies smoothly per angle —
// hand-tuned jitter on an authored shape, not a noise field.
function blob(cx: number, cy: number, r: number, t: number, wobble = 0.18) {
  const spokes = 14;
  const radii: number[] = [];
  for (let i = 0; i < spokes; i++) radii.push(r * (1 - wobble + rng() * wobble * 2));
  for (let y = Math.floor(cy - r * 1.3); y <= Math.ceil(cy + r * 1.3); y++)
    for (let x = Math.floor(cx - r * 1.3); x <= Math.ceil(cx + r * 1.3); x++) {
      const a = Math.atan2(y - cy, x - cx);
      const f = ((a + Math.PI) / (2 * Math.PI)) * spokes;
      const i0 = Math.floor(f) % spokes, i1 = (i0 + 1) % spokes, u = f - Math.floor(f);
      const rr = radii[i0] * (1 - u) + radii[i1] * u;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rr * rr) set(x, y, t);
    }
}

// Chaikin-smoothed polyline -> 4-connected raster (so 1-wide paths are
// always walkable under the no-corner-cut rule), with width stamps.
function smoothPts(pts: [number, number][], iters = 2): [number, number][] {
  let p = pts;
  for (let it = 0; it < iters; it++) {
    const out: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
      out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
function carve(pts: [number, number][], t: number, width = 2, opts: { bridgeOverWater?: boolean } = {}) {
  const sm = smoothPts(pts);
  let px = Math.round(sm[0][0]), py = Math.round(sm[0][1]);
  const paint = (x: number, y: number) => {
    for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!inB(tx, ty)) continue;
      const cur = get(tx, ty);
      if (opts.bridgeOverWater && cur === T.WATER) set(tx, ty, T.BRIDGE);
      else if (cur !== T.BRIDGE && cur !== T.WALL && cur !== T.FLOOR) set(tx, ty, t);
    }
  };
  paint(px, py);
  for (const [fx, fy] of sm) {
    let tx = Math.round(fx), ty = Math.round(fy);
    while (px !== tx || py !== ty) {
      // step one axis at a time -> 4-connected line
      if (Math.abs(tx - px) >= Math.abs(ty - py)) px += Math.sign(tx - px);
      else py += Math.sign(ty - py);
      paint(px, py);
    }
  }
}

// ---- objects ----
const objAt = new Map<number, MapObj>();
for (const o of legacyObjects) objAt.set(key(o.x, o.y), o);
const newObjects: MapObj[] = [];
function addObj(type: string, x: number, y: number, must = true): boolean {
  if (!inB(x, y) || inLegacy(x, y)) { if (must) throw new Error(`object ${type} out of new land at ${x},${y}`); return false; }
  const t = get(x, y);
  const allowedOnWater = type === 'fishing_spot' || type === 'rod_fishing_spot' || type === 'reeds' || type === 'lilypad';
  if ((t === T.WATER && !allowedOnWater) || t === T.WALL) {
    if (must) throw new Error(`object ${type} on bad terrain ${t} at ${x},${y}`);
    return false;
  }
  if (objAt.has(key(x, y))) {
    if (must) throw new Error(`object collision ${type} at ${x},${y}`);
    return false;
  }
  const o: MapObj = { type, x, y };
  objAt.set(key(x, y), o);
  newObjects.push(o);
  return true;
}

// blocked() mirror for BFS / spawn checks
function blockedTile(x: number, y: number): boolean {
  if (!inB(x, y)) return true;
  const t = terr[key(x, y)];
  if (t === T.WATER || t === T.WALL || t === T.FENCE || t === T.LAVA) return true;
  const o = objAt.get(key(x, y));
  if (o) return !NON_BLOCKING.has(o.type);
  return false;
}

// =====================================================================
// 1. EASTERN LANDMASS (x 224-299, y 0-216)
// =====================================================================
for (let y = 0; y <= 216; y++)
  for (let x = LEGACY; x < W; x++) {
    let t: number = T.GRASS;
    if (y <= 25) t = T.SNOW;            // Frostpeak's eastern skirts
    else if (y >= 212 && y <= 216) t = T.SAND; // southern beach (matches legacy line)
    else if (y >= 217) t = T.WATER;
    set(x, y, t);
  }
// rocky outcrops in the snow (Maraza's winter leaks east)
blob(236, 8, 3, T.ROCK); blob(258, 14, 4, T.ROCK); blob(282, 6, 3, T.ROCK);

// ---- the mere (Eldermere's lake) + streams ----
blob(276, 70, 6, T.WATER, 0.22);
// stream-in: snowmelt from the north, crossing the Aldgate road (auto-bridge)
carve([[250, 16], [249, 22], [248, 30], [247, 38], [247, 46], [249, 52], [253, 57], [258, 60], [264, 62], [270, 66]], T.WATER, 1);
// stream-out: the mere drains east off the map edge
carve([[281, 72], [286, 75], [291, 79], [296, 82], [299, 84]], T.WATER, 1);

// ---- roads (drawn AFTER water so overlaps become bridges) ----
// R1: the Aldgate east road — joins the legacy path ending at (223, 33-37)
carve([[224, 35], [231, 37], [238, 41], [244, 47], [248, 53], [251, 58], [254, 62], [254, 66]], T.PATH, 2, { bridgeOverWater: true });
// Eldermere main street (spine)
carve([[254, 64], [254, 104]], T.PATH, 2);
// toll-path row west out of the village (joins the Tanglewood toll path)
carve([[244, 90], [254, 90]], T.PATH, 2);
// lane east to the mere shore
carve([[256, 72], [266, 72]], T.PATH, 2);
// R3: village -> Stonewatch (the danger corridor road)
carve([[255, 104], [257, 110], [259, 116], [260, 122], [261, 128], [262, 134], [263, 140], [265, 146], [268, 152], [270, 158], [271, 163]], T.PATH, 2, { bridgeOverWater: true });
// R4: Stonewatch south gate -> legacy southeast exit at (223, 195-198)
carve([[271, 191], [267, 194], [261, 197], [254, 199], [246, 200], [238, 200], [231, 198], [226, 196], [224, 196]], T.PATH, 2, { bridgeOverWater: true });
// Tanglewood toll path: 1-wide, winding, into the dark
carve([[244, 90], [241, 92], [237, 94], [233, 97], [229, 101], [227, 106], [228, 112], [231, 117], [234, 121]], T.PATH, 1);

// =====================================================================
// 2. ELDERMERE VILLAGE — twelve buildings with coherent interiors
// =====================================================================
interface Bld { x: number; y: number; w: number; h: number; doors: [number, number][]; name: string }
function building(b: Bld) {
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
      set(x, y, edge ? T.WALL : T.FLOOR);
    }
  for (const [dx, dy] of b.doors) set(dx, dy, T.FLOOR);
}
const eldermereBlds: Bld[] = [
  { name: 'elder_hall', x: 246, y: 66, w: 7, h: 6, doors: [[252, 68], [252, 69]] },
  { name: 'general_store', x: 257, y: 66, w: 6, h: 6, doors: [[257, 68], [257, 69]] },
  { name: 'cottage_nw', x: 246, y: 74, w: 5, h: 5, doors: [[250, 76]] },
  { name: 'cottage_w', x: 246, y: 81, w: 5, h: 5, doors: [[250, 83]] },
  { name: 'cottage_tiny', x: 246, y: 86, w: 4, h: 4, doors: [[249, 87]] },
  { name: 'cottage_e1', x: 258, y: 75, w: 5, h: 5, doors: [[258, 77]] },
  { name: 'cottage_e2', x: 258, y: 81, w: 5, h: 5, doors: [[258, 83]] },
  { name: 'inn_mere_rest', x: 258, y: 93, w: 8, h: 7, doors: [[258, 96], [258, 97]] },
  { name: 'cottage_sw', x: 245, y: 94, w: 6, h: 5, doors: [[250, 96]] },
  { name: 'barn', x: 246, y: 100, w: 6, h: 5, doors: [[248, 100], [249, 100]] },
  { name: 'cottage_s', x: 258, y: 101, w: 5, h: 4, doors: [[258, 102]] },
  { name: 'fisher_hut', x: 264, y: 76, w: 5, h: 4, doors: [[266, 76]] },
];
for (const b of eldermereBlds) building(b);

// interiors — beds by walls, tables with chairs, doors kept clear
addObj('bed', 247, 67); addObj('bookshelf', 247, 70); addObj('table', 249, 68); addObj('chair', 250, 68); addObj('rug_deco', 250, 70); // elder hall
addObj('crate', 261, 67); addObj('barrel', 261, 70); addObj('table', 259, 70); addObj('crate', 258, 67); // store
addObj('bed', 247, 75); addObj('table', 248, 77); addObj('chair', 249, 77); // cottage nw
addObj('bed', 247, 82); addObj('bookshelf', 247, 84); // cottage w
addObj('bed', 247, 88); // tiny cottage
addObj('bed', 261, 76); addObj('table', 260, 78); addObj('chair', 259, 78); // cottage e1
addObj('bed', 261, 82); addObj('cauldron', 261, 84); // cottage e2
addObj('table', 261, 95); addObj('chair', 260, 95); addObj('chair', 262, 95); addObj('table', 261, 98); addObj('chair', 262, 98);
addObj('bed', 264, 94); addObj('bed', 264, 98); addObj('barrel', 259, 94); // inn
addObj('bed', 246, 95); addObj('table', 248, 97); addObj('chair', 249, 97); // cottage sw
addObj('hay_bale', 247, 102); addObj('hay_bale', 250, 103); addObj('crate', 250, 101); // barn
addObj('bed', 261, 102); // cottage s
addObj('bed', 267, 78); addObj('crate', 265, 78, false); // fisher hut
// village dressing
for (const [lx, ly] of [[253, 70], [256, 78], [253, 86], [256, 91], [253, 100]] as [number, number][]) addObj('lamp_post', lx, ly, false);
// mere bank fishing: snap the two spots to the actual wobbled shoreline
function shoreSpot(px: number, py: number) {
  for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = px + dx, y = py + dy;
    if (get(x, y) === T.WATER || get(x, y) === T.WALL || objAt.has(key(x, y))) continue;
    if (D8.some(([ax, ay]) => get(x + ax, y + ay) === T.WATER)) { addObj('rod_fishing_spot', x, y); return; }
  }
  throw new Error(`no shoreline near ${px},${py} for fishing spot`);
}
shoreSpot(269, 71); shoreSpot(270, 75);
addObj('reeds', 270, 76, false); addObj('lilypad', 274, 64, false); addObj('reeds', 282, 72, false); addObj('driftwood', 270, 78, false);

// =====================================================================
// 3. FARM BELT on the Aldgate road
// =====================================================================
building({ name: 'farmhouse_a', x: 228, y: 42, w: 6, h: 5, doors: [[233, 44]] });
addObj('bed', 229, 43); addObj('table', 231, 45); addObj('chair', 230, 45);
building({ name: 'farmhouse_b', x: 240, y: 52, w: 6, h: 5, doors: [[242, 52]] });
addObj('bed', 244, 53); addObj('table', 242, 55); addObj('chair', 243, 55, false);
// fenced wheat-ish field (FLOWERS reads as crops)
for (let y = 49; y <= 57; y++) for (let x = 225; x <= 239; x++) {
  const edge = x === 225 || x === 239 || y === 49 || y === 57;
  set(x, y, edge ? T.FENCE : T.FLOWERS);
}
set(231, 49, T.GRASS); set(232, 49, T.GRASS); // field gate
addObj('hay_bale', 235, 47, false); addObj('hay_bale', 236, 43, false);
// cow pen
for (let y = 33; y <= 40; y++) for (let x = 239; x <= 247; x++) {
  const edge = x === 239 || x === 247 || y === 33 || y === 40;
  if (edge) set(x, y, T.FENCE); else set(x, y, T.DIRT);
}
set(243, 40, T.DIRT); // pen gate (open)
addObj('hay_bale', 240, 34, false);

// =====================================================================
// 4. THE TANGLEWOOD — dense dark forest with the yew heart
// =====================================================================
const inTanglewood = (x: number, y: number) =>
  (x >= 224 && x <= 246 && y >= 68 && y <= 134) || (x >= 246 && x <= 258 && y >= 108 && y <= 134);
// dark heart clearing: trees grow in a circle and do not discuss why
const HEART = { x: 236, y: 124 };
const nearPath = (x: number, y: number) => get(x, y) === T.PATH || get(x, y) === T.BRIDGE;
let treeCount = 0;
for (let y = 66; y <= 136; y++) for (let x = 224; x <= 258; x++) {
  if (!inTanglewood(x, y)) continue;
  if (get(x, y) !== T.GRASS) continue;
  if (nearPath(x, y)) continue;
  const dHeart = Math.hypot(x - HEART.x, y - HEART.y);
  if (dHeart <= 5.5) continue; // the clearing stays clear
  const roll = rng();
  if (roll < 0.55) { if (addObj(rng() < 0.82 ? 'tree' : 'oak', x, y, false)) treeCount++; }
  else if (roll < 0.62) addObj(rng() < 0.5 ? 'fern' : 'mushroom_patch', x, y, false);
  else if (roll < 0.65) addObj('bush', x, y, false);
}
// yew ring at the heart (gap left where the toll path enters from the north)
const yewRing: [number, number][] = [[240, 124], [239, 127], [236, 128], [233, 127], [232, 124], [233, 121], [239, 121]];
for (const [yx, yy] of yewRing) { set(yx, yy, T.GRASS); if (objAt.has(key(yx, yy))) { /* keep */ } addObj('yew', yx, yy, false); }
for (const [mx, my] of [[234, 126], [238, 122], [238, 126]] as [number, number][]) addObj('mushroom_patch', mx, my, false);
// (the very centre tile stays empty — Maeryn's saucer goes there on Rest Days)

// =====================================================================
// 5. DANGER CORRIDOR — wraith ruin, dead trees, bear wood
// =====================================================================
for (const [bx, by, br] of [[268, 120, 3], [256, 130, 2.5], [272, 146, 3]] as [number, number, number][]) blob(bx, by, br, T.DIRT);
// broken ruin walls (gaps on purpose — nothing sealed)
for (const [wx, wy] of [[266, 126], [267, 126], [268, 126], [270, 126], [271, 126], [272, 126],
[266, 127], [266, 129], [266, 130], [272, 128], [272, 130], [267, 131], [268, 131], [271, 131]] as [number, number][]) set(wx, wy, T.WALL);
for (const [dx, dy] of [[252, 116], [259, 126], [268, 138], [274, 128], [255, 136], [264, 116], [277, 134], [261, 146]] as [number, number][]) addObj('dead_tree_deco', dx, dy, false);
for (const [bx, by] of [[257, 120], [266, 134], [271, 142], [253, 128], [275, 122]] as [number, number][]) addObj('boulder_small', bx, by, false);
// bear wood: the shaded hollows north of Stonewatch (Hode's bears)
for (let y = 140; y <= 152; y++) for (let x = 250; x <= 262; x++) {
  if (get(x, y) !== T.GRASS) continue;
  if (rng() < 0.28) addObj(rng() < 0.6 ? 'oak' : 'tree', x, y, false);
}

// =====================================================================
// 6. STONEWATCH — hill fort on a rock plateau + mining outcrop
// =====================================================================
blob(272, 177, 16, T.ROCK, 0.14);
// wall ring x263-281, y166-190; gates north + south on the road line
for (let y = 166; y <= 190; y++) for (let x = 263; x <= 281; x++) {
  const edge = x === 263 || x === 281 || y === 166 || y === 190;
  if (edge) set(x, y, T.WALL);
}
set(271, 166, T.PATH); set(272, 166, T.PATH); // north gate
set(271, 190, T.PATH); set(272, 190, T.PATH); // south gate
carve([[271, 167], [271, 189]], T.PATH, 2);   // inner street
carve([[266, 178], [278, 178]], T.PATH, 1);   // cross lane
building({ name: 'barracks', x: 264, y: 168, w: 6, h: 6, doors: [[269, 170], [269, 171]] });
addObj('bed', 265, 169); addObj('bed', 265, 172); addObj('bed', 267, 172, false); addObj('weapon_rack', 268, 169);
building({ name: 'keep', x: 274, y: 168, w: 7, h: 6, doors: [[274, 170], [274, 171]] });
addObj('table', 277, 170); addObj('chair', 278, 170); addObj('bookshelf', 279, 169); addObj('banner', 279, 172); addObj('bed', 276, 172);
// Trapper Hode's corner — pelts, kit, a pot on the fire
addObj('hay_bale', 279, 184, false); addObj('crate', 280, 186, false); addObj('barrel', 279, 187, false); addObj('cauldron', 277, 185, false);
addObj('banner', 270, 167, false); addObj('banner', 273, 167, false);
// mining outcrop SE of the south gate (iron/coal + ONE gold rock)
blob(279, 195, 4, T.DIRT, 0.2);
carve([[272, 191], [276, 193]], T.PATH, 1);
addObj('rocks_iron', 277, 194); addObj('rocks_iron', 280, 196); addObj('rocks_iron', 279, 193);
addObj('rocks_coal', 276, 196); addObj('rocks_coal', 281, 194);
addObj('rocks_gold', 282, 196);
addObj('boulder_small', 275, 193, false); addObj('boulder_small', 283, 193, false);

// sparse wild east strip
for (let y = 90; y <= 205; y++) for (let x = 286; x <= 298; x++) {
  if (get(x, y) !== T.GRASS) continue;
  if (rng() < 0.05) addObj(rng() < 0.5 ? 'tree' : 'dead_tree_deco', x, y, false);
}
// snow pines up north
for (let y = 2; y <= 22; y++) for (let x = 226; x <= 297; x++) {
  if (get(x, y) !== T.SNOW) continue;
  if (rng() < 0.05) addObj('snow_pine', x, y, false);
}

// =====================================================================
// 7. GULLSWRECK COVE — island, causeway, piers, the wreck
// =====================================================================
blob(78, 264, 20, T.GRASS, 0.16);
blob(98, 256, 14, T.GRASS, 0.16);
blob(94, 277, 13, T.GRASS, 0.16);
blob(110, 267, 9, T.GRASS, 0.16);
blob(120, 261, 7, T.WATER, 0.15); // the sheltered cove notch
blob(116, 275, 6, T.SAND, 0.2);   // wreck sandbar
// beach fringe: island tiles within 2 of the sea become sand
{
  const toSand: number[] = [];
  for (let y = 228; y <= 298; y++) for (let x = 50; x <= 136; x++) {
    if (get(x, y) !== T.GRASS) continue;
    let nearWater = false;
    for (let dy = -2; dy <= 2 && !nearWater; dy++) for (let dx = -2; dx <= 2; dx++)
      if (get(x + dx, y + dy) === T.WATER) { nearWater = true; break; }
    if (nearWater) toSand.push(key(x, y));
  }
  for (const k of toSand) terr[k] = T.SAND;
  newTiles += toSand.length;
}
// THE CAUSEWAY: Port Brackwater's west pier (x99-100, ends y221) marches on
// south across the strait. The 4 tiles at y222-223 are the only legacy edits.
for (const [x, y] of BORDER_TILES) set(x, y, T.BRIDGE, true);
for (let y = LEGACY; y <= 243; y++) { set(99, y, get(99, y) === T.WATER ? T.BRIDGE : get(99, y)); set(100, y, get(100, y) === T.WATER ? T.BRIDGE : get(100, y)); }
// island roads
carve([[99, 243], [97, 248], [94, 252], [91, 256], [90, 260]], T.DIRT, 2);
carve([[92, 262], [97, 263], [102, 263], [106, 263]], T.DIRT, 2);
// village buildings
building({ name: 'tavern_listing_gull', x: 84, y: 255, w: 7, h: 6, doors: [[90, 257], [90, 258]] });
addObj('table', 86, 257); addObj('chair', 87, 257); addObj('chair', 85, 257); addObj('barrel', 85, 259); addObj('barrel', 86, 259, false); addObj('bed', 88, 256, false);
building({ name: 'boatshed', x: 96, y: 257, w: 6, h: 5, doors: [[98, 261]] });
addObj('crate', 97, 258); addObj('crate', 100, 258); addObj('barrel', 100, 260, false);
building({ name: 'shack_a', x: 80, y: 264, w: 5, h: 5, doors: [[82, 264]] });
addObj('bed', 81, 267); addObj('table', 83, 266, false);
building({ name: 'shack_b', x: 86, y: 265, w: 5, h: 5, doors: [[88, 265]] });
addObj('bed', 89, 268); addObj('crate', 87, 268, false);
building({ name: 'smokehouse', x: 92, y: 267, w: 5, h: 5, doors: [[92, 269]] });
addObj('cauldron', 94, 270); addObj('barrel', 95, 268, false);
// the pier into the cove (BRIDGE over water) + rod fishing along it
for (let x = 106; x <= 120; x++) for (let y = 262; y <= 263; y++)
  set(x, y, get(x, y) === T.WATER ? T.BRIDGE : get(x, y));
addObj('rod_fishing_spot', 112, 262); addObj('rod_fishing_spot', 116, 263); addObj('rod_fishing_spot', 119, 262);
addObj('crate', 107, 263, false); addObj('barrel', 110, 263, false);
// THE WRECK — a hull silhouette in fence-rail timbers on the sandbar,
// breached on the west side so the hold is walkable.
const hull: [number, number][] = [
  [113, 272], [114, 272], [115, 272], [116, 272], [117, 272], [118, 272], [119, 272],
  [112, 273], [120, 273],
  [111, 274], [121, 274],
  [112, 275], [120, 275],
  [113, 276], [114, 276], [115, 276], [116, 276], [117, 276], [118, 276], [119, 276],
];
for (const [hx, hy] of hull) if (!(hx === 112 && hy === 273) && !(hx === 113 && hy === 272)) { set(hx, hy, T.SAND); set(hx, hy, T.FENCE); }
addObj('dead_tree_deco', 116, 274, false); // the broken mast
addObj('crate', 114, 274, false); addObj('barrel', 118, 274, false);
// pirate camp ashore
addObj('cauldron', 102, 275, false); addObj('crate', 104, 274, false); addObj('barrel', 100, 276, false);
// shore dressing + a few trees inland
for (const [px, py] of [[76, 258], [74, 266], [80, 270], [70, 262], [86, 250]] as [number, number][]) addObj('tree', px, py, false);
for (const [px, py] of [[66, 256], [64, 270], [92, 246], [108, 256], [88, 282], [98, 284]] as [number, number][]) addObj(rng() < 0.5 ? 'driftwood' : 'reeds', px, py, false);

// =====================================================================
// 8. Organic dither pass (NEW LAND ONLY) — same style as map-organic-pass
// =====================================================================
const COSMETIC = new Set<number>([T.GRASS, T.SAND, T.DIRT, T.FLOWERS, T.SNOW]);
let dithered = 0;
function protectedTile(x: number, y: number): boolean {
  if (inLegacy(x, y)) return true;
  const k = key(x, y);
  if (!COSMETIC.has(terr[k])) return true;
  if (objAt.has(k)) return true;
  for (const [dx, dy] of D8) {
    const t = get(x + dx, y + dy);
    if (t === T.WALL || t === T.FLOOR || t === T.FENCE || t === T.BRIDGE) return true;
  }
  return false;
}
for (let iter = 0; iter < 2; iter++) {
  const snap = terr.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inLegacy(x, y)) continue;
    if (protectedTile(x, y)) continue;
    const cur = snap[key(x, y)];
    const cands: number[] = [];
    for (const [dx, dy] of D4) {
      if (!inB(x + dx, y + dy)) continue;
      const t = snap[key(x + dx, y + dy)];
      if (t !== cur && COSMETIC.has(t)) cands.push(t);
    }
    if (cands.length === 0 || rng() >= 0.45) continue;
    terr[key(x, y)] = cands[(rng() * cands.length) | 0];
    dithered++;
  }
}
// meadow scatter: small flower/dirt blobs in the open east grass
for (let i = 0; i < 26; i++) {
  const x = 224 + ((rng() * 74) | 0), y = 28 + ((rng() * 180) | 0);
  if (get(x, y) !== T.GRASS || protectedTile(x, y)) continue;
  const t = rng() < 0.5 ? T.FLOWERS : T.DIRT;
  let cx = x, cy = y;
  for (let s = 0, len = 2 + ((rng() * 5) | 0); s < len; s++) {
    if (get(cx, cy) === T.GRASS && !protectedTile(cx, cy)) set(cx, cy, t);
    const [dx, dy] = D4[(rng() * 4) | 0];
    if (get(cx + dx, cy + dy) === T.GRASS) { cx += dx; cy += dy; }
  }
}

// =====================================================================
// 9. Spawns
// =====================================================================
const newNpcSpawns: NpcSpawn[] = [
  // Eldermere
  { id: 'village_elder', x: 248, y: 68 },
  { id: 'wayfarer', x: 256, y: 90 },
  { id: 'wayfarer', x: 238, y: 43 },
  // farm belt
  { id: 'cow', x: 242, y: 36 }, { id: 'cow', x: 244, y: 38 }, { id: 'cow', x: 241, y: 38 }, { id: 'cow', x: 245, y: 35 },
  { id: 'chicken', x: 240, y: 58 }, { id: 'chicken', x: 241, y: 59 }, { id: 'chicken', x: 243, y: 58 }, { id: 'chicken', x: 244, y: 57 },
  { id: 'sheep', x: 250, y: 44 }, { id: 'sheep', x: 252, y: 46 }, { id: 'sheep', x: 249, y: 47 }, { id: 'sheep', x: 253, y: 43 },
  // Tanglewood spiders (deeper in, along the toll path)
  { id: 'forest_spider', x: 229, y: 101 }, { id: 'forest_spider', x: 227, y: 107 }, { id: 'forest_spider', x: 229, y: 113 },
  { id: 'forest_spider', x: 232, y: 118 }, { id: 'forest_spider', x: 235, y: 122 }, { id: 'forest_spider', x: 238, y: 124 },
  // danger corridor
  { id: 'ruin_wraith', x: 268, y: 129 }, { id: 'ruin_wraith', x: 264, y: 127 }, { id: 'ruin_wraith', x: 259, y: 121 }, { id: 'ruin_wraith', x: 262, y: 137 },
  { id: 'dire_wolf', x: 262, y: 118 }, { id: 'dire_wolf', x: 266, y: 144 }, { id: 'dire_wolf', x: 274, y: 140 }, { id: 'dire_wolf', x: 270, y: 134 },
  { id: 'bear', x: 253, y: 144 }, { id: 'bear', x: 257, y: 148 }, { id: 'bear', x: 251, y: 150 }, { id: 'bear', x: 259, y: 143 },
  // Stonewatch
  { id: 'trapper', x: 277, y: 183 },
  // Gullswreck Cove
  { id: 'boatman', x: 109, y: 262 },
  { id: 'pirate', x: 101, y: 274 }, { id: 'pirate', x: 104, y: 276 }, { id: 'pirate', x: 99, y: 277 },
  { id: 'pirate', x: 103, y: 272 }, { id: 'pirate', x: 106, y: 278 },
];
const newGroundSpawns: GroundSpawn[] = [
  // corridor loot
  { item: 'bones', x: 262, y: 120, respawnTicks: 120 }, { item: 'bones', x: 258, y: 136, respawnTicks: 120 },
  { item: 'grave_dust', x: 268, y: 128, respawnTicks: 200 }, { item: 'grave_dust', x: 270, y: 129, respawnTicks: 200 },
  { item: 'coins', x: 256, y: 128, respawnTicks: 150 }, { item: 'coins', x: 264, y: 144, respawnTicks: 150 },
  // farm belt + cove
  { item: 'egg', x: 240, y: 57, respawnTicks: 50 }, { item: 'egg', x: 243, y: 59, respawnTicks: 50 },
  { item: 'fishing_bait', x: 107, y: 262, respawnTicks: 60 }, { item: 'fishing_bait', x: 108, y: 263, respawnTicks: 60 },
];
// spawn tiles must be clear: evict any scatter object that landed there
for (const s of [...newNpcSpawns, ...newGroundSpawns.map(g => ({ id: g.item, x: g.x, y: g.y }))]) {
  const o = objAt.get(key(s.x, s.y));
  if (o && !NON_BLOCKING.has(o.type)) {
    const i = newObjects.indexOf(o);
    if (i < 0) throw new Error(`spawn ${s.id} collides with legacy object at ${s.x},${s.y}`);
    newObjects.splice(i, 1);
    objAt.delete(key(s.x, s.y));
  }
  if (blockedTile(s.x, s.y)) throw new Error(`spawn ${s.id} on blocked tile ${s.x},${s.y} (terrain ${get(s.x, s.y)})`);
}

// =====================================================================
// 10. Connectivity repair + verification
// =====================================================================
function reachableFrom(sx: number, sy: number): Uint8Array {
  const vis = new Uint8Array(W * H);
  if (blockedTile(sx, sy)) return vis;
  const q = [key(sx, sy)];
  vis[q[0]] = 1;
  let head = 0;
  while (head < q.length) {
    const k = q[head++];
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
      if (!inB(nx, ny) || vis[key(nx, ny)] || blockedTile(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (blockedTile(x + dx, y) || blockedTile(x, y + dy))) continue;
      vis[key(nx, ny)] = 1;
      q.push(key(nx, ny));
    }
  }
  return vis;
}
// trees may pocket off grass between them — thin them until everything connects
const REMOVABLE = new Set(['tree', 'oak', 'snow_pine', 'dead_tree_deco']);
let thinned = 0;
for (let pass = 0; pass < 50; pass++) {
  const vis = reachableFrom(SPAWN.x, SPAWN.y);
  const unreachable: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isExpansion(x, y)) continue;
    if (!blockedTile(x, y) && !vis[key(x, y)]) unreachable.push(key(x, y));
  }
  if (unreachable.length === 0) break;
  const unset = new Set(unreachable);
  let removedThisPass = 0;
  for (const o of [...newObjects]) {
    if (!REMOVABLE.has(o.type)) continue;
    let touchesReach = false, touchesUnreach = false;
    for (const [dx, dy] of D4) {
      const nx = o.x + dx, ny = o.y + dy;
      if (!inB(nx, ny)) continue;
      if (vis[key(nx, ny)]) touchesReach = true;
      if (unset.has(key(nx, ny))) touchesUnreach = true;
    }
    if (touchesReach && touchesUnreach) {
      const i = newObjects.indexOf(o);
      newObjects.splice(i, 1);
      objAt.delete(key(o.x, o.y));
      thinned++; removedThisPass++;
    }
  }
  if (removedThisPass === 0) {
    // walled pockets can't be fixed by tree removal — surface them loudly
    const k0 = unreachable[0];
    throw new Error(`unreachable walkable pocket at ${k0 % W},${(k0 / W) | 0} (${unreachable.length} tiles) not fixable by thinning`);
  }
}
// final hard check
{
  const vis = reachableFrom(SPAWN.x, SPAWN.y);
  let bad = 0; let badEx: string = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isExpansion(x, y)) continue;
    if (!blockedTile(x, y) && !vis[key(x, y)]) { bad++; if (!badEx) badEx = `${x},${y}`; }
  }
  if (bad > 0) throw new Error(`BFS FAIL: ${bad} unreachable new walkable tiles (first ${badEx})`);
  for (const s of newNpcSpawns) if (!vis[key(s.x, s.y)]) throw new Error(`spawn ${s.id} unreachable at ${s.x},${s.y}`);
  console.log('BFS reachability from spawn (22,38): all new walkable tiles + all new spawns reachable ✓');
}
// legacy byte-identical audit
{
  let diffs: string[] = [];
  for (let y = 0; y < LEGACY; y++) for (let x = 0; x < LEGACY; x++)
    if (terr[key(x, y)] !== legacySnapshot[y * LEGACY + x]) diffs.push(`${x},${y}`);
  const allowed = new Set(BORDER_TILES.map(([x, y]) => `${x},${y}`));
  const illegal = diffs.filter(d => !allowed.has(d));
  if (illegal.length > 0) throw new Error(`legacy terrain modified outside causeway: ${illegal.slice(0, 10).join(' ')}`);
  console.log(`legacy 224×224 byte-identical except causeway tiles: ${diffs.join(' ')} ✓`);
}

// =====================================================================
// 11. Write
// =====================================================================
const allObjects = [...legacyObjects, ...newObjects].sort((a, b) => (a.y - b.y) || (a.x - b.x));
const outMap = { width: W, height: H, terrain: Buffer.from(terr).toString('base64'), objects: allObjects };
fs.writeFileSync(MAP_PATH, JSON.stringify(outMap, null, 2) + '\n');
fs.writeFileSync(SPAWNS_PATH, JSON.stringify({
  npcSpawns: [...legacyNpcSpawns, ...newNpcSpawns],
  groundSpawns: [...legacyGroundSpawns, ...newGroundSpawns],
}, null, 2) + '\n');

// ---- report ----
const counts: Record<string, number> = {};
for (const o of newObjects) counts[o.type] = (counts[o.type] ?? 0) + 1;
console.log('--- expansion stats ---');
console.log(`map: ${W}x${H}; new land tiles painted: ${newTiles}; dithered: ${dithered}; trees thinned for connectivity: ${thinned}`);
console.log(`new objects: ${newObjects.length}`, counts);
console.log(`new npc spawns: ${newNpcSpawns.length}; new ground spawns: ${newGroundSpawns.length}`);
console.log(`tanglewood trees placed: ${treeCount}`);
