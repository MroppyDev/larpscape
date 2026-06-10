// World map + pathfinding. Geometry lives in data/map.json (edited via the
// admin app's map editor); buildWorld() loads it.

import mapJson from '../data/map.json';

export const MAP_W = mapJson.width;
export const MAP_H = mapJson.height;

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
