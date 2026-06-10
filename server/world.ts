// Server-side world geometry: terrain + static object collision from
// data/map.json. Mirrors src/world.ts blocked()/findPath() exactly, minus the
// mutable client-only objects (player fires/snares are all NON_BLOCKING, so
// static collision is authoritative for movement).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface MapJson {
  width: number;
  height: number;
  terrain: string; // base64 Uint8Array
  objects: { type: string; x: number; y: number }[];
}

const mapJson: MapJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/map.json'), 'utf8'),
);

export const MAP_W = mapJson.width;
export const MAP_H = mapJson.height;

// terrain codes (same as src/world.ts)
export const T = {
  GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5, SWAMP: 6, FENCE: 7, SAND: 8,
  DIRT: 9, FLOWERS: 10, CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16,
} as const;

export const terrain = new Uint8Array(MAP_W * MAP_H);
{
  const bin = Buffer.from(mapJson.terrain, 'base64');
  for (let i = 0; i < terrain.length && i < bin.length; i++) terrain[i] = bin[i];
}

export const key = (x: number, y: number) => y * MAP_W + x;

// Object types that never block movement (mirror of src/world.ts).
const NON_BLOCKING = new Set([
  'fire', 'fishing_spot', 'rod_fishing_spot', 'flax_plant', 'farming_patch',
  'snare_set', 'agility_log', 'agility_rope', 'agility_wall', 'agility_ledge',
  'ice_ledge', 'rope_bridge', 'rock_climb', 'snow_slope', 'fire_altar',
  'lobster_spot', 'harpoon_spot',
  'bush', 'fern', 'boulder_small', 'mushroom_patch', 'reeds', 'lilypad', 'driftwood',
]);

// Static blocking-object lookup (baked map objects only).
const blockingObjectAt = new Uint8Array(MAP_W * MAP_H);
for (const o of mapJson.objects) {
  if (!NON_BLOCKING.has(o.type)) blockingObjectAt[key(o.x, o.y)] = 1;
}

export function blocked(x: number, y: number, forNpc = false): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
  const t = terrain[key(x, y)];
  if (t === T.WATER || t === T.WALL || t === T.FENCE || t === T.LAVA) return true;
  if (blockingObjectAt[key(x, y)]) return true;
  if (forNpc && t === T.FLOOR) return true; // keep critters out of buildings
  return false;
}

// BFS pathfinding (4+diagonal). Returns path excluding start, or null.
// Direct port of src/world.ts findPath.
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
      if (blocked(nx, ny)) { visited[nk] = 1; continue; }
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
