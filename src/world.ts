// World map + pathfinding. Geometry lives in data/map.json (edited via the
// admin app's map editor); buildWorld() loads it.

import mapJson from '../data/map.json';

export const MAP_W = mapJson.width;
export const MAP_H = mapJson.height;
export const LEGACY_SIZE = 224;

export interface Poi { id: string; label: string; x: number; y: number; glyph?: string; }

export const POIS: Poi[] = [
  // legacy region markers (224×224 box)
  { id: 'castle', label: 'The Castle', x: 21, y: 37 },
  { id: 'aldgate', label: 'Aldgate', x: 103, y: 30 },
  { id: 'warlords_fort', label: "Warlord's Fort", x: 146, y: 21 },
  { id: 'swamp_mine', label: 'Swamp Mine', x: 22, y: 68 },
  { id: 'deep_bog', label: 'Deep Bog', x: 24, y: 95 },
  { id: 'underdeep', label: 'The Underdeep', x: 105, y: 135 },
  { id: 'river', label: 'River', x: 62, y: 28 },
  { id: 'hunter_meadow', label: 'Hunter Meadow', x: 64, y: 77 },
  { id: 'frostpeak', label: 'Frostpeak Mountains', x: 196, y: 55 },
  { id: 'sunscorch_legacy', label: 'Sunscorch Desert', x: 35, y: 190 },
  { id: 'port_brackwater', label: 'Port Brackwater', x: 105, y: 196 },
  { id: 'ashen_depths', label: 'Ashen Depths', x: 190, y: 135 },
  // Phase 5 handcrafted expansion (300×300): east + south new land
  { id: 'eldermere', label: 'Eldermere', x: 256, y: 84 },
  { id: 'tanglewood', label: 'The Tanglewood', x: 232, y: 110 },
  { id: 'stonewatch', label: 'Stonewatch', x: 272, y: 178 },
  { id: 'gullswreck', label: 'Gullswreck Cove', x: 94, y: 262 },
  // world-fill structures pass (scripts/author-structures.ts)
  { id: 'ravenmoor', label: 'Ravenmoor Manor', x: 238, y: 155 },
  { id: 'imber_spire', label: 'The Imber Spire', x: 270, y: 12 },
  { id: 'quiess_tower', label: 'The Quiess Tower', x: 288, y: 86 },
  { id: 'gullswreck_light', label: 'Gullswreck Light', x: 103, y: 246 },
  // Content-update skill towns (scripts/merge-content-update.ts) — labels at each
  // town centre (origin + footprint/2).
  { id: 'cairnchime', label: 'Cairnchime', x: 129, y: 176 },
  { id: 'drummars_hold', label: "Drummar's Hold", x: 218, y: 191 },
  { id: 'quillrook', label: 'Quillrook', x: 168, y: 14 },
  { id: 'resonne', label: 'Resonne', x: 204, y: 75 },
  { id: 'resin_hollow', label: 'Resin Hollow', x: 174, y: 190 },
  { id: 'saltsong_harbour', label: 'Saltsong Harbour', x: 248, y: 203 },
  { id: 'forgekeep_concord', label: 'Forgekeep Concord', x: 266, y: 30 },
  { id: 'verdancourt', label: 'Verdancourt', x: 23, y: 144 },
  { id: 'the_knell', label: 'The Knell', x: 279, y: 147 },
  { id: 'quaverside', label: 'Quaverside', x: 283, y: 49 },
];

// terrain codes
export const T = {
  GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5, SWAMP: 6, FENCE: 7, SAND: 8,
  DIRT: 9, FLOWERS: 10, CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16,
} as const;

export interface WorldObject {
  type: string;        // ObjDef id
  x: number; y: number;
  depletedUntil: number;   // tick when it respawns (0 = active)
  depletedAs?: string;     // what to render while depleted ('stump' | 'rocks_empty')
  expiresAt?: number;      // for player-made fires
  meta?: Record<string, any>; // farming patch state, snare timers, etc.
}

// gid = server-assigned id (ground items are server-authoritative)
export interface GroundItem { gid: number; item: string; qty: number; x: number; y: number; expiresAt: number; }

export const terrain = new Uint8Array(MAP_W * MAP_H);
export const objects: WorldObject[] = [];
export const objectAt = new Map<number, WorldObject>();

export const key = (x: number, y: number) => y * MAP_W + x;

export function addObject(type: string, x: number, y: number) {
  const o: WorldObject = { type, x, y, depletedUntil: 0 };
  objects.push(o);
  objectAt.set(key(x, y), o);
  return o;
}
export function removeObject(o: WorldObject) {
  const i = objects.indexOf(o);
  if (i >= 0) objects.splice(i, 1);
  if (objectAt.get(key(o.x, o.y)) === o) objectAt.delete(key(o.x, o.y));
}

// Decodes the base64 terrain grid from data/map.json into the live Uint8Array
// and instantiates the baked object placements.
export function buildWorld() {
  objects.length = 0;
  objectAt.clear();
  const bin = atob(mapJson.terrain);
  for (let i = 0; i < terrain.length && i < bin.length; i++) terrain[i] = bin.charCodeAt(i);
  for (const o of mapJson.objects) addObject(o.type, o.x, o.y);
}

// Object types that never block movement.
const NON_BLOCKING = new Set([
  'fire', 'fishing_spot', 'rod_fishing_spot', 'flax_plant', 'farming_patch',
  'snare_set', 'agility_log', 'agility_rope', 'agility_wall', 'agility_ledge',
  // phase 6: mountain agility course + rune altar + sea fishing spots
  'ice_ledge', 'rope_bridge', 'rock_climb', 'snow_slope', 'fire_altar',
  'lobster_spot', 'harpoon_spot',
  // phase 6: non-blocking ground deco (barrel/crate/cactus/ice_spike/
  // snow_pine/dead_tree_deco/gem_stall stay blocking by default)
  'bush', 'fern', 'boulder_small', 'mushroom_patch', 'reeds', 'lilypad', 'driftwood',
  'chair', 'banner', 'rug_deco',
]);

export function blocked(x: number, y: number, forNpc = false): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
  const t = terrain[key(x, y)];
  if (t === T.WATER || t === T.WALL || t === T.FENCE || t === T.LAVA) return true;
  const o = objectAt.get(key(x, y));
  if (o) {
    if (NON_BLOCKING.has(o.type)) return false;
    return true; // trees, rocks, booths, range, stumps, stalls, furnaces,
                 // fountain, stalagmite, ge_booth, cave_mouth all block
  }
  if (forNpc && t === T.FLOOR) return true; // keep critters out of buildings
  return false;
}

// BFS pathfinding (4+diagonal). Returns path excluding start, or null.
export function findPath(sx: number, sy: number, tx: number, ty: number, acceptAdjacent = false): { x: number; y: number }[] | null {
  if (sx === tx && sy === ty) return [];
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const visited = new Uint8Array(MAP_W * MAP_H);
  const q: number[] = [key(sx, sy)];
  visited[key(sx, sy)] = 1;
  const targetBlocked = blocked(tx, ty);
  const goal = (x: number, y: number) =>
    (x === tx && y === ty) || ((acceptAdjacent || targetBlocked) && Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1);

  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  let found = -1;
  let head = 0;
  while (head < q.length) {
    const k = q[head++];
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    if (goal(x, y)) { found = k; break; }
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const nk = key(nx, ny);
      if (visited[nk]) continue;
      if (blocked(nx, ny) && !(goal(nx, ny) && !blocked(nx, ny))) {
        if (blocked(nx, ny)) { visited[nk] = 1; continue; }
      }
      // no corner cutting through blocked diagonals
      if (dx !== 0 && dy !== 0 && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
      visited[nk] = 1;
      prev[nk] = k;
      q.push(nk);
    }
  }
  if (found < 0) return null;
  const path: { x: number; y: number }[] = [];
  let cur = found;
  while (cur !== key(sx, sy)) {
    path.push({ x: cur % MAP_W, y: Math.floor(cur / MAP_W) });
    cur = prev[cur];
    if (cur < 0) return null;
  }
  path.reverse();
  return path;
}

// ---- biome lookup (Phase 5 handcrafted 300×300 expansion) ----
// Every region below was placed by hand in scripts/author-expansion.ts;
// the boxes here mirror that layout. No noise functions — deliberate design.

export type Biome =
  | 'legacy' | 'sea' | 'coast' | 'plains' | 'forest' | 'marsh' | 'desert'
  | 'mountain' | 'snow' | 'cave' | 'lava' | 'village' | 'tanglewood';

export function biomeAt(x: number, y: number): Biome {
  if (x < LEGACY_SIZE && y < LEGACY_SIZE) return 'legacy';

  // Southern sea (y >= ~217) and Gullswreck Cove island
  if (y >= 217) {
    if (x >= 52 && x <= 132 && y >= 230 && y <= 296) return 'coast'; // Gullswreck
    return 'sea';
  }

  // Eastern landmass (x >= 224, y 0..216)
  if (y <= 26) return 'snow';                                       // Frostpeak's eastern skirts
  if (x >= 244 && x <= 272 && y >= 62 && y <= 106) return 'village'; // Eldermere
  if (x <= 260 && y >= 64 && y <= 136) return 'tanglewood';          // the Tanglewood
  if (y <= 62) return 'plains';                                      // farm belt on the Aldgate road
  if (x >= 256 && x <= 292 && y >= 156 && y <= 200) return 'mountain'; // Stonewatch plateau
  if (y >= 106 && y <= 156) return 'forest';                         // wraith/wolf danger corridor
  if (y >= 208) return 'coast';                                      // southern beach fringe
  return 'plains';
}
