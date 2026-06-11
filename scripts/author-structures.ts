// World-fill structures pass — deliberate, lore-grounded buildings in the
// empty bands left after the Phase 5 expansion. Run: npx tsx scripts/author-structures.ts
//
// This is an AUTHORED pass, same philosophy as scripts/author-expansion.ts:
// every wall, hedge, brazier and shrine below is placed on purpose. No noise
// fields. Structures (all coords inclusive):
//
//   RAVENMOOR MANOR   walled grounds x228-248 y144-166 on the moor between the
//                     danger corridor and Stonewatch. Multi-room manor house
//                     (hall, library, kitchen, two bedrooms), hedge garden,
//                     fountain, and a sealed cellar annex behind a locked door
//                     (quest content later). Lady Eseld Ravenmoor +
//                     Groundskeeper Mortlock.
//   IMBER SPIRE       scorched 5x5 spire in the eastern snow skirts at
//                     x268-272 y10-14, ringed by melted ground and braziers.
//                     Calder Brightverse (fire-leaning songcaster).
//   QUIESS TOWER      pale 5x5 tower at x286-290 y84-88 beside the mere's
//                     outflow stream. Vesper Hollowell (air/death-leaning).
//   WINDMILL          x227-231 y59-63 on the farm belt, south of the wheat field.
//   LIGHTHOUSE        Gullswreck Light, x101-105 y244-248 at the causeway
//                     landing on the cove's north headland.
//   RUINED CHAPEL     broken walls + altar + bones in the danger corridor,
//                     x275-281 y107-114. Roofless on purpose (no FLOOR).
//   HUNTERS' LODGE    x250-255 y134-138 at the bear wood's north edge.
//   3 WAYSTONES       roadside shrines on the Aldgate east road, the corridor
//                     road, and the Stonewatch south road.
//   LIFE              wandering man/wayfarer spawns on the roads, sheep on the
//                     south plains, a rat in the chapel, ice wolves by the spire.
//
// GUARANTEES (verified at the end, exits 1 on failure):
//   - legacy 224x224 terrain is never touched (all work is in expansion land)
//   - structures are only stamped on genuinely empty plain tiles; the only
//     things evicted are cosmetic scatter (trees/bushes/pines/etc), counted
//   - every tile walkable BEFORE this pass is still walkable-reachable AFTER
//   - every NEW walkable tile is BFS-reachable from spawn (22,38), except the
//     intentionally sealed Ravenmoor cellar interior (whitelisted)
//   - every new spawn sits on an unblocked, reachable tile
//
// Guard-idempotent: if the manor wall already exists the script exits cleanly.

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
const SPAWN = { x: 22, y: 38 };

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

// cosmetic scatter this pass is allowed to evict inside its footprints
const EVICTABLE = new Set([
  'tree', 'oak', 'snow_pine', 'dead_tree_deco', 'bush', 'fern',
  'mushroom_patch', 'boulder_small', 'driftwood', 'reeds',
]);
// terrain considered "genuinely empty" and buildable
const PLAIN = new Set<number>([T.GRASS, T.SAND, T.DIRT, T.FLOWERS, T.SNOW]);

interface MapObj { type: string; x: number; y: number; [k: string]: any }
interface NpcSpawn { id: string; x: number; y: number }
interface GroundSpawn { item: string; x: number; y: number; respawnTicks: number }

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) as {
  width: number; height: number; terrain: string; objects: MapObj[];
};
const spawns = JSON.parse(fs.readFileSync(SPAWNS_PATH, 'utf8')) as {
  npcSpawns: NpcSpawn[]; groundSpawns: GroundSpawn[];
};
const W = map.width, H = map.height;
if (W !== 300 || H !== 300) throw new Error(`expected 300x300 map, got ${W}x${H}`);

const terr = new Uint8Array(Buffer.from(map.terrain, 'base64'));
const key = (x: number, y: number) => y * W + x;
const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
const inLegacy = (x: number, y: number) => x < LEGACY && y < LEGACY;
const get = (x: number, y: number) => (inB(x, y) ? terr[key(x, y)] : T.WATER);
const D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const D8 = [...D4, [-1, -1], [1, -1], [-1, 1], [1, 1]];

// guard-idempotency: the manor's NW grounds corner is WALL only after this pass
if (terr[key(228, 144)] === T.WALL) {
  console.log('author-structures: manor already present — nothing to do.');
  process.exit(0);
}

const objAt = new Map<number, MapObj>();
for (const o of map.objects) objAt.set(key(o.x, o.y), o);
const spawnAt = new Set<number>();
for (const s of spawns.npcSpawns) spawnAt.add(key(s.x, s.y));
for (const s of spawns.groundSpawns) spawnAt.add(key(s.x, s.y));

function blockedTile(x: number, y: number): boolean {
  if (!inB(x, y)) return true;
  const t = terr[key(x, y)];
  if (t === T.WATER || t === T.WALL || t === T.FENCE || t === T.LAVA) return true;
  const o = objAt.get(key(x, y));
  if (o) return !NON_BLOCKING.has(o.type);
  return false;
}

// snapshot of pre-pass reachability (for the "nothing newly cut off" audit)
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
const reachBefore = reachableFrom(SPAWN.x, SPAWN.y);
const walkableBefore: number[] = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (reachBefore[key(x, y)]) walkableBefore.push(key(x, y));

// ---- mutation helpers ------------------------------------------------------
let tilesPainted = 0, evicted = 0;
const newObjects: MapObj[] = [];
const removedObjects: MapObj[] = [];

function set(x: number, y: number, t: number) {
  if (!inB(x, y)) throw new Error(`set out of bounds ${x},${y}`);
  if (inLegacy(x, y)) throw new Error(`legacy tile touched at ${x},${y}`);
  if (terr[key(x, y)] !== t) { terr[key(x, y)] = t; tilesPainted++; }
}

// evict cosmetic scatter in a rect (counted); throws on anything substantial
function clearScatter(x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = objAt.get(key(x, y));
    if (!o) continue;
    if (!EVICTABLE.has(o.type)) throw new Error(`footprint ${x0},${y0}-${x1},${y1} hits non-scatter object ${o.type}@${x},${y}`);
    const i = map.objects.indexOf(o);
    map.objects.splice(i, 1);
    objAt.delete(key(x, y));
    removedObjects.push(o);
    evicted++;
  }
}

// assert a rect is genuinely empty (plain terrain, no objects/spawns) — call AFTER clearScatter
function ensureBuildable(x0: number, y0: number, x1: number, y1: number, what: string) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (inLegacy(x, y)) throw new Error(`${what}: legacy tile ${x},${y}`);
    if (!PLAIN.has(get(x, y))) throw new Error(`${what}: non-plain terrain ${get(x, y)} at ${x},${y}`);
    if (objAt.has(key(x, y))) throw new Error(`${what}: object in footprint at ${x},${y}`);
    if (spawnAt.has(key(x, y))) throw new Error(`${what}: spawn in footprint at ${x},${y}`);
  }
}

function addObj(type: string, x: number, y: number) {
  const t = get(x, y);
  if (t === T.WATER || t === T.WALL) throw new Error(`object ${type} on bad terrain ${t} at ${x},${y}`);
  if (objAt.has(key(x, y))) throw new Error(`object collision ${type} at ${x},${y}`);
  const o: MapObj = { type, x, y };
  objAt.set(key(x, y), o);
  map.objects.push(o);
  newObjects.push(o);
}

interface Bld { x: number; y: number; w: number; h: number; doors: [number, number][]; name: string }
function building(b: Bld) {
  clearScatter(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1);
  ensureBuildable(b.x, b.y, b.x + b.w - 1, b.y + b.h - 1, b.name);
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
      set(x, y, edge ? T.WALL : T.FLOOR);
    }
  for (const [dx, dy] of b.doors) set(dx, dy, T.FLOOR);
}

// =====================================================================
// 1. RAVENMOOR MANOR — walled grounds x228-248, y144-166
// =====================================================================
// The Ravenmoors were a High Stave family who kept the moor road in the
// Discord Wars; the line is down to one lady, one groundskeeper, and a
// cellar nobody opens. Brooding by design.
clearScatter(226, 141, 251, 168);
ensureBuildable(228, 144, 248, 166, 'manor grounds');
// perimeter wall + east gate
for (let y = 144; y <= 166; y++) for (let x = 228; x <= 248; x++) {
  if (x === 228 || x === 248 || y === 144 || y === 166) set(x, y, T.WALL);
}
set(248, 155, T.PATH); set(248, 156, T.PATH); // gate

// the manor house x231-245, y146-156: hall flanked by two wings
building({ name: 'ravenmoor_manor', x: 231, y: 146, w: 15, h: 11, doors: [[238, 156]] });
for (let y = 147; y <= 155; y++) { set(235, y, T.WALL); set(241, y, T.WALL); } // wing walls
set(235, 148, T.FLOOR); set(235, 154, T.FLOOR); // west wing doorways
set(241, 148, T.FLOOR); set(241, 154, T.FLOOR); // east wing doorways
for (let x = 232; x <= 234; x++) set(x, 151, T.WALL); // west wing divider
for (let x = 242; x <= 244; x++) set(x, 151, T.WALL); // east wing divider
// NW bedroom (the lady's)
addObj('bed', 232, 147); addObj('bookshelf', 232, 149); addObj('rug_deco', 233, 149);
// SW kitchen
addObj('range', 232, 152); addObj('cauldron', 232, 155); addObj('barrel', 234, 155); addObj('table', 233, 153);
// hall
addObj('banner', 236, 147); addObj('banner', 240, 147);
addObj('table', 238, 150); addObj('chair', 237, 150); addObj('chair', 239, 150);
addObj('rug_deco', 238, 153);
// NE library (with one odd object: bone chimes that should not be indoors)
addObj('bookshelf', 242, 147); addObj('bookshelf', 243, 147); addObj('bookshelf', 244, 147);
addObj('table', 244, 149); addObj('chair', 243, 149); addObj('quiess_chime', 244, 150);
// SE guest bedroom
addObj('bed', 244, 152); addObj('bed', 244, 155); addObj('banner', 242, 155);

// sealed cellar annex x230-234, y159-163 — door gap holds a locked door object
building({ name: 'ravenmoor_cellar', x: 230, y: 159, w: 5, h: 5, doors: [[232, 159]] });
addObj('cellar_door', 232, 159); // blocking: the cellar opens in a later quest
addObj('cauldron', 231, 162); addObj('crate', 233, 160); addObj('barrel', 233, 162);
const CELLAR_INTERIOR: [number, number][] = [];
for (let y = 160; y <= 162; y++) for (let x = 231; x <= 233; x++) CELLAR_INTERIOR.push([x, y]);

// garden: gravel walks, fountain, flower beds, hedge, a willow, lamp posts
for (let x = 238; x <= 247; x++) set(x, 157, T.PATH);
set(247, 155, T.PATH); set(247, 156, T.PATH); set(246, 156, T.PATH);
for (let y = 158; y <= 160; y++) set(242, y, T.PATH);
addObj('fountain', 242, 161);
for (let y = 159; y <= 162; y++) for (let x = 236; x <= 240; x++) set(x, y, T.FLOWERS);
for (let y = 159; y <= 162; y++) for (let x = 244; x <= 246; x++) set(x, y, T.FLOWERS);
for (let x = 230; x <= 246; x += 2) addObj('bush', x, 165); // hedge row
addObj('willow', 246, 163);
addObj('lamp_post', 246, 154); addObj('lamp_post', 246, 158);
// brooding dressing outside the walls
addObj('dead_tree_deco', 226, 142); addObj('dead_tree_deco', 250, 165); addObj('dead_tree_deco', 230, 168);

// lane from the gate east to the corridor road (joins it at ~270,158)
{
  // hand-rastered: straight-ish, 1 wide, only over plain ground
  const lane: [number, number][] = [];
  for (let x = 249; x <= 269; x++) lane.push([x, x < 256 ? 156 : x < 264 ? 157 : 158]);
  for (const [x, y] of lane) {
    if (get(x, y) === T.PATH) continue;
    clearScatter(x, y, x, y);
    if (!PLAIN.has(get(x, y))) throw new Error(`manor lane hits terrain ${get(x, y)} at ${x},${y}`);
    set(x, y, T.PATH);
    // keep the lane 4-connected at the two y-steps
    if (x === 256) { clearScatter(x, 156, x, 156); set(x, 156, T.PATH); }
    if (x === 264) { clearScatter(x, 157, x, 157); set(x, 157, T.PATH); }
  }
}

// =====================================================================
// 2. THE IMBER SPIRE — scorched stone in the snow skirts, x268-272 y10-14
// =====================================================================
clearScatter(264, 6, 277, 19);
// melted ground: a deliberate scorch ring (DIRT) in the snow
for (let y = 7; y <= 17; y++) for (let x = 265; x <= 275; x++)
  if ((x - 270) ** 2 + (y - 12) ** 2 <= 4.6 ** 2) set(x, y, T.DIRT);
building({ name: 'imber_spire', x: 268, y: 10, w: 5, h: 5, doors: [[270, 14]] });
addObj('brazier', 269, 11); addObj('bookshelf', 271, 11); addObj('rug_deco', 270, 12);
addObj('brazier', 268, 16); addObj('brazier', 272, 16); // flanking the door
addObj('boulder_small', 266, 9); addObj('boulder_small', 274, 15);

// =====================================================================
// 3. THE QUIESS TOWER — pale and quiet by the mere's outflow, x286-290 y84-88
// =====================================================================
clearScatter(284, 82, 292, 90);
building({ name: 'quiess_tower', x: 286, y: 84, w: 5, h: 5, doors: [[286, 86]] });
addObj('bookshelf', 287, 85); addObj('altar', 288, 85); addObj('bookshelf', 289, 85);
addObj('quiess_chime', 289, 87);
// a pale flagstone apron at the door, chimes outside, reeds toward the stream
set(285, 86, T.PATH); set(284, 86, T.PATH);
addObj('quiess_chime', 285, 84);
addObj('reeds', 287, 81); addObj('reeds', 291, 82);

// =====================================================================
// 4. WINDMILL on the farm belt, x227-231 y59-63
// =====================================================================
building({ name: 'windmill', x: 227, y: 59, w: 5, h: 5, doors: [[231, 61]] });
addObj('millstone', 228, 60); addObj('crate', 228, 62);
addObj('hay_bale', 233, 61); addObj('hay_bale', 226, 65);
set(232, 61, T.DIRT); set(233, 62, T.DIRT); // worn track at the door

// =====================================================================
// 5. GULLSWRECK LIGHT — lighthouse at the causeway landing, x101-105 y244-248
// =====================================================================
building({ name: 'lighthouse', x: 101, y: 244, w: 5, h: 5, doors: [[103, 248]] });
addObj('beacon_brazier', 103, 245); // the light itself
addObj('crate', 102, 247); addObj('barrel', 104, 247);
addObj('driftwood', 99, 249); addObj('driftwood', 106, 250);
set(103, 249, T.DIRT); set(102, 250, T.DIRT); set(101, 251, T.DIRT); // trail to the island road
set(106, 244, T.WATER); // drown the 1-tile sand spit the east wall would otherwise orphan

// =====================================================================
// 6. RUINED CHAPEL in the danger corridor, x275-281 y107-114 (roofless)
// =====================================================================
// A High Stave roadside chapel the Discord Wars unroofed. Interior stays
// DIRT (not FLOOR) so the roof system leaves the ruin open to the sky.
clearScatter(274, 106, 283, 116);
ensureBuildable(275, 107, 281, 114, 'chapel');
for (let y = 108; y <= 113; y++) for (let x = 276; x <= 280; x++) set(x, y, T.DIRT);
// broken wall ring — gaps where the war went through
for (const [x, y] of [
  [275, 107], [276, 107], [278, 107], [279, 107], [280, 107], [281, 107],
  [275, 108], [281, 108], [275, 109], [281, 109],
  [275, 111], [275, 112], [281, 112], [275, 113], [281, 113],
  [275, 114], [276, 114], [277, 114], [280, 114], [281, 114],
] as [number, number][]) set(x, y, T.WALL);
addObj('altar', 278, 109);
addObj('boulder_small', 280, 112); addObj('mushroom_patch', 276, 112);
addObj('dead_tree_deco', 273, 110); addObj('dead_tree_deco', 283, 115);

// =====================================================================
// 7. HUNTERS' LODGE at the bear wood's north edge, x250-255 y134-138
// =====================================================================
clearScatter(248, 132, 257, 141);
building({ name: 'hunters_lodge', x: 250, y: 134, w: 6, h: 5, doors: [[252, 138]] });
addObj('bed', 251, 135); addObj('crate', 254, 135);
addObj('table', 254, 136); addObj('chair', 253, 136);
addObj('weapon_rack', 251, 137);
addObj('hay_bale', 257, 137);

// =====================================================================
// 8. WAYSTONE SHRINES — three road-shrines of the Five
// =====================================================================
function waystone(px: number, py: number, label: string) {
  // snap to the nearest plain, object-free tile 4-adjacent to a PATH tile
  for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = px + dx, y = py + dy;
    if (!inB(x, y) || inLegacy(x, y)) continue;
    if (!PLAIN.has(get(x, y)) || objAt.has(key(x, y)) || spawnAt.has(key(x, y))) continue;
    if (!D4.some(([ax, ay]) => get(x + ax, y + ay) === T.PATH)) continue;
    addObj('waystone', x, y);
    console.log(`waystone (${label}) at ${x},${y}`);
    return;
  }
  throw new Error(`no roadside tile for waystone near ${px},${py}`);
}
waystone(236, 39, 'Aldgate east road');
waystone(262, 131, 'corridor road');
waystone(242, 201, 'Stonewatch south road');

// =====================================================================
// 9. LIFE — wanderers on the roads, wildlife where thin
// =====================================================================
const newNpcSpawns: NpcSpawn[] = [
  // structures
  { id: 'lady_ravenmoor', x: 237, y: 152 },      // manor hall
  { id: 'groundskeeper', x: 243, y: 159 },       // manor garden
  { id: 'imber_wizard', x: 270, y: 17 },         // outside the spire
  { id: 'quiess_wizard', x: 284, y: 86 },        // outside the tower
  // wanderers on the main roads
  { id: 'man', x: 240, y: 42 },                  // Aldgate east road / farm belt
  { id: 'wayfarer', x: 258, y: 156 },            // the manor lane
  { id: 'man', x: 249, y: 201 },                 // Stonewatch south road
  // wildlife where the land runs thin
  { id: 'sheep', x: 236, y: 178 }, { id: 'sheep', x: 239, y: 181 }, // south moor strays
  { id: 'giant_rat', x: 279, y: 111 },           // chapel squatter
  { id: 'ice_wolf', x: 278, y: 19 }, { id: 'ice_wolf', x: 282, y: 13 }, // spire snow
];
const newGroundSpawns: GroundSpawn[] = [
  { item: 'bones', x: 277, y: 111, respawnTicks: 120 }, // the chapel's dead
  { item: 'bones', x: 279, y: 113, respawnTicks: 120 },
];
for (const s of [...newNpcSpawns, ...newGroundSpawns.map(g => ({ id: g.item, x: g.x, y: g.y }))]) {
  if (blockedTile(s.x, s.y)) throw new Error(`spawn ${s.id} on blocked tile ${s.x},${s.y} (terrain ${get(s.x, s.y)})`);
  if (objAt.has(key(s.x, s.y))) throw new Error(`spawn ${s.id} collides with object at ${s.x},${s.y}`);
}
spawns.npcSpawns.push(...newNpcSpawns);
spawns.groundSpawns.push(...newGroundSpawns);

// =====================================================================
// 10. Verification
// =====================================================================
const reachAfter = reachableFrom(SPAWN.x, SPAWN.y);
const cellarTiles = new Set(CELLAR_INTERIOR.map(([x, y]) => key(x, y)));
// (a) nothing previously reachable was cut off (walls under a tile flip it to
//     blocked, which is fine — but a reachable tile that is STILL walkable
//     must still be reachable). The sealed cellar is the one intended exception.
{
  let cut = 0, ex = '';
  for (const k of walkableBefore) {
    const x = k % W, y = (k / W) | 0;
    if (cellarTiles.has(k)) continue;
    if (!blockedTile(x, y) && !reachAfter[k]) { cut++; if (!ex) ex = `${x},${y}`; }
  }
  if (cut > 0) throw new Error(`CUT-OFF FAIL: ${cut} previously reachable tiles now unreachable (first ${ex})`);
  console.log('no previously-reachable tile was cut off ✓');
}
// (b) all new walkable tiles inside our footprints reachable (cellar excepted)
{
  let bad = 0, ex = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = key(x, y);
    if (reachBefore[k] || blockedTile(x, y) || cellarTiles.has(k)) continue;
    if (!reachAfter[k]) {
      // only flag tiles inside our authored footprints
      const ours =
        (x >= 226 && x <= 271 && y >= 141 && y <= 168) || // manor + lane
        (x >= 264 && x <= 277 && y >= 6 && y <= 19) ||    // spire
        (x >= 283 && x <= 292 && y >= 81 && y <= 90) ||   // quiess tower
        (x >= 226 && x <= 234 && y >= 58 && y <= 65) ||   // windmill
        (x >= 99 && x <= 108 && y >= 243 && y <= 251) ||  // lighthouse
        (x >= 273 && x <= 283 && y >= 106 && y <= 116) || // chapel
        (x >= 248 && x <= 257 && y >= 132 && y <= 141);   // lodge
      if (ours) { bad++; if (!ex) ex = `${x},${y}`; }
    }
  }
  if (bad > 0) throw new Error(`BFS FAIL: ${bad} new walkable tiles unreachable (first ${ex})`);
  console.log('all new walkable tiles reachable from spawn (22,38), cellar excepted ✓');
}
// (c) all new spawns reachable
for (const s of newNpcSpawns) if (!reachAfter[key(s.x, s.y)]) throw new Error(`spawn ${s.id} unreachable at ${s.x},${s.y}`);
console.log('all new spawns reachable ✓');
// (d) legacy never touched (set() throws, but audit anyway via a re-read diff)
{
  const orig = new Uint8Array(Buffer.from(map.terrain, 'base64'));
  let diffs = 0;
  for (let y = 0; y < LEGACY; y++) for (let x = 0; x < LEGACY; x++)
    if (terr[key(x, y)] !== orig[key(x, y)]) diffs++;
  if (diffs > 0) throw new Error(`legacy terrain modified: ${diffs} tiles`);
  console.log('legacy 224x224 byte-identical ✓');
}

// =====================================================================
// 11. Write
// =====================================================================
map.objects.sort((a, b) => (a.y - b.y) || (a.x - b.x));
fs.writeFileSync(MAP_PATH, JSON.stringify({
  width: W, height: H, terrain: Buffer.from(terr).toString('base64'), objects: map.objects,
}, null, 2) + '\n');
fs.writeFileSync(SPAWNS_PATH, JSON.stringify(spawns, null, 2) + '\n');

const counts: Record<string, number> = {};
for (const o of newObjects) counts[o.type] = (counts[o.type] ?? 0) + 1;
console.log('--- structures pass stats ---');
console.log(`tiles painted: ${tilesPainted}; scatter evicted: ${evicted}`);
console.log(`new objects: ${newObjects.length}`, counts);
console.log(`new npc spawns: ${newNpcSpawns.length}; new ground spawns: ${newGroundSpawns.length}`);
