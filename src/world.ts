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
  // Phase 7 expansion hubs
  { id: 'eldermere', label: 'Eldermere', x: 300, y: 260, glyph: '⌂' },
  { id: 'tanglewood', label: 'Tanglewood', x: 382, y: 342, glyph: '♣' },
  { id: 'stonewatch', label: 'Stonewatch', x: 420, y: 120, glyph: '⚑' },
  { id: 'gullswreck', label: 'Gullswreck Cove', x: 80, y: 380, glyph: '⚓' },
  { id: 'mirrormere', label: 'Mirrormere', x: 328, y: 248, glyph: '≋' },
  { id: 'eastern_marshes', label: 'Eastern Marshes', x: 448, y: 308, glyph: '≈' },
  { id: 'southern_savanna', label: 'Southern Savanna', x: 348, y: 439, glyph: '☀' },
  { id: 'cinderholm', label: 'Cinderholm', x: 470, y: 470, glyph: '♨' },
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
  'dance_floor', 'rainbow_banner',
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

// ---- biome lookup (mirrors scripts/world-gen-utils.ts) ----

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number, oct = 4): number {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise2(x * freq, y * freq, seed + i * 97);
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

export type Biome =
  | 'legacy' | 'sea' | 'coast' | 'plains' | 'forest' | 'marsh' | 'desert'
  | 'mountain' | 'snow' | 'cave' | 'lava' | 'village' | 'tanglewood';

export function biomeAt(x: number, y: number): Biome {
  if (x < LEGACY_SIZE && y < LEGACY_SIZE) return 'legacy';

  if (x >= 278 && x <= 322 && y >= 238 && y <= 282) return 'village';
  if (x >= 338 && x <= 425 && y >= 298 && y <= 385) return 'tanglewood';
  if (x >= 398 && x <= 442 && y >= 98 && y <= 142) return 'village';
  if (x >= 58 && x <= 102 && y >= 358 && y <= 402) return 'coast';
  if (x >= 418 && x <= 478 && y >= 278 && y <= 338) return 'marsh';
  if (x >= 278 && x <= 418 && y >= 400 && y <= 478) return 'desert';
  if (x >= 298 && x <= 358 && y >= 228 && y <= 268) return 'coast';
  if (x >= 448 && x <= 492 && y >= 448 && y <= 492) return 'lava';

  const elev = fbm(x * 0.012, y * 0.012, 42);
  const moist = fbm(x * 0.015 + 100, y * 0.015, 77);
  const temp = fbm(x * 0.01 + 50, y * 0.008, 13);

  const edgeDist = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
  if (edgeDist < 8 && elev < 0.42) return 'sea';
  if (edgeDist < 14 && elev < 0.48) return 'coast';

  if (y < 280 && x > 260 && elev > 0.62) return y < 120 ? 'snow' : 'mountain';
  if (y < 200 && x > 300 && elev > 0.58) return 'mountain';

  if (x > 380 && y > 300 && elev > 0.7 && moist < 0.35) return 'lava';
  if (x > 360 && y > 280 && elev > 0.65) return 'cave';

  if (moist > 0.62 && elev < 0.52) return 'marsh';
  if (temp > 0.58 && moist < 0.38) return 'desert';
  if (elev > 0.55) return 'mountain';
  if (moist > 0.48) return 'forest';
  return 'plains';
}
