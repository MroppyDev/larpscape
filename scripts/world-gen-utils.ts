// Shared helpers for procedural world generation.

export const LEGACY = 224;
export const NEW_W = 500;
export const NEW_H = 500;

export const T = {
  GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5, SWAMP: 6, FENCE: 7,
  SAND: 8, DIRT: 9, FLOWERS: 10, CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16,
} as const;

export type TerrainGrid = Uint8Array;
export type MapObject = { type: string; x: number; y: number };

export function idx(x: number, y: number, w = NEW_W) { return y * w + x; }

export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise2(x: number, y: number, seed: number): number {
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

export function fbm(x: number, y: number, seed: number, oct = 4): number {
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
  if (x < LEGACY && y < LEGACY) return 'legacy';

  // Fixed POI overrides
  if (x >= 278 && x <= 322 && y >= 238 && y <= 282) return 'village';       // Eldermere
  if (x >= 338 && x <= 425 && y >= 298 && y <= 385) return 'tanglewood';  // Tanglewood
  if (x >= 398 && x <= 442 && y >= 98 && y <= 142) return 'village';      // Stonewatch
  if (x >= 58 && x <= 102 && y >= 358 && y <= 402) return 'coast';         // Gullswreck isle
  if (x >= 418 && x <= 478 && y >= 278 && y <= 338) return 'marsh';        // East marshes
  if (x >= 278 && x <= 418 && y >= 400 && y <= 478) return 'desert';       // Southern savanna
  if (x >= 298 && x <= 358 && y >= 228 && y <= 268) return 'coast';        // Mirrormere lake
  if (x >= 848 && x <= 492 && y >= 848 && y <= 492) return 'lava';         // Cinderholm (fix coords)
  if (x >= 448 && x <= 492 && y >= 448 && y <= 492) return 'lava';         // Cinderholm

  const elev = fbm(x * 0.012, y * 0.012, 42);
  const moist = fbm(x * 0.015 + 100, y * 0.015, 77);
  const temp = fbm(x * 0.01 + 50, y * 0.008, 13);

  // Sea border
  const edgeDist = Math.min(x, y, NEW_W - 1 - x, NEW_H - 1 - y);
  if (edgeDist < 8 && elev < 0.42) return 'sea';
  if (edgeDist < 14 && elev < 0.48) return 'coast';

  // Northern mountains (connect Frostpeak east)
  if (y < 280 && x > 260 && elev > 0.62) return y < 120 ? 'snow' : 'mountain';
  if (y < 200 && x > 300 && elev > 0.58) return 'mountain';

  // Eastern volcanic depths extension
  if (x > 380 && y > 300 && elev > 0.7 && moist < 0.35) return 'lava';
  if (x > 360 && y > 280 && elev > 0.65) return 'cave';

  if (moist > 0.62 && elev < 0.52) return 'marsh';
  if (temp > 0.58 && moist < 0.38) return 'desert';
  if (elev > 0.55) return 'mountain';
  if (moist > 0.48) return 'forest';
  return 'plains';
}

export function terrainForBiome(b: Biome, rng: () => number): number {
  switch (b) {
    case 'sea': return T.WATER;
    case 'coast': return rng() < 0.35 ? T.SAND : T.WATER;
    case 'plains': return rng() < 0.08 ? T.FLOWERS : rng() < 0.12 ? T.DIRT : T.GRASS;
    case 'forest': return rng() < 0.15 ? T.DIRT : T.GRASS;
    case 'marsh': return rng() < 0.55 ? T.SWAMP : T.GRASS;
    case 'desert': return rng() < 0.85 ? T.DSAND : T.SAND;
    case 'mountain': return rng() < 0.7 ? T.ROCK : T.SNOW;
    case 'snow': return rng() < 0.25 ? T.ICE : T.SNOW;
    case 'cave': return T.CAVE;
    case 'lava': return rng() < 0.35 ? T.LAVA : T.ROCK;
    case 'village': return rng() < 0.4 ? T.PATH : T.GRASS;
    case 'tanglewood': return rng() < 0.2 ? T.SWAMP : T.GRASS;
    default: return T.GRASS;
  }
}

export class ObjectPlacer {
  occupied = new Set<number>();
  objects: MapObject[] = [];

  constructor(existing: MapObject[], w = NEW_W) {
    for (const o of existing) {
      this.occupied.add(idx(o.x, o.y, w));
      this.objects.push(o);
    }
  }

  canPlace(x: number, y: number, terrain: TerrainGrid, blockedTypes = new Set([T.WATER, T.WALL, T.LAVA, T.FENCE])): boolean {
    if (x < 0 || y < 0 || x >= NEW_W || y >= NEW_H) return false;
    if (this.occupied.has(idx(x, y))) return false;
    const t = terrain[idx(x, y)];
    if (blockedTypes.has(t)) return false;
    return true;
  }

  place(type: string, x: number, y: number, terrain: TerrainGrid): boolean {
    if (!this.canPlace(x, y, terrain)) return false;
    this.occupied.add(idx(x, y));
    this.objects.push({ type, x, y });
    return true;
  }

  placeOnFloor(type: string, x: number, y: number, terrain: TerrainGrid): boolean {
    if (x < 0 || y < 0 || x >= NEW_W || y >= NEW_H) return false;
    if (this.occupied.has(idx(x, y))) return false;
    if (terrain[idx(x, y)] !== T.FLOOR) return false;
    this.occupied.add(idx(x, y));
    this.objects.push({ type, x, y });
    return true;
  }
}

export function encodeTerrain(grid: TerrainGrid): string {
  return Buffer.from(grid).toString('base64');
}

export function decodeTerrain(b64: string, w: number, h: number): TerrainGrid {
  const buf = Buffer.from(b64, 'base64');
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length && i < buf.length; i++) out[i] = buf[i];
  return out;
}

/** Stamp a rectangular building with walls and floor interior. */
export function stampBuilding(
  terrain: TerrainGrid,
  x0: number, y0: number, w: number, h: number,
  doorSide: 'south' | 'north' | 'east' | 'west' = 'south',
  doorPos = 0.5,
) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= NEW_W || y >= NEW_H) continue;
      const edge = x === x0 || x === x0 + w - 1 || y === y0 || y === y0 + h - 1;
      if (!edge) {
        terrain[idx(x, y)] = T.FLOOR;
        continue;
      }
      let isDoor = false;
      const doorX = x0 + Math.floor(w * doorPos);
      const doorY = y0 + Math.floor(h * doorPos);
      if (doorSide === 'south' && y === y0 + h - 1 && x === doorX) isDoor = true;
      if (doorSide === 'north' && y === y0 && x === doorX) isDoor = true;
      if (doorSide === 'east' && x === x0 + w - 1 && y === doorY) isDoor = true;
      if (doorSide === 'west' && x === x0 && y === doorY) isDoor = true;
      terrain[idx(x, y)] = isDoor ? T.FLOOR : T.WALL;
    }
  }
}

export function carvePath(terrain: TerrainGrid, points: { x: number; y: number }[], width = 1) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      for (let dy = -width; dy <= width; dy++) {
        for (let dx = -width; dx <= width; dx++) {
          const px = x + dx, py = y + dy;
          if (px < 0 || py < 0 || px >= NEW_W || py >= NEW_H) continue;
          const cur = terrain[idx(px, py)];
          if (cur !== T.WATER && cur !== T.WALL && cur !== T.LAVA) terrain[idx(px, py)] = T.PATH;
        }
      }
    }
  }
}
