// Terrain palette + helpers shared by the map editor and live view.

export const TERRAIN = [
  { code: 0, id: 'GRASS', name: 'Grass', color: '#4a7c3a' },
  { code: 1, id: 'WATER', name: 'Water', color: '#3a5f8f' },
  { code: 2, id: 'PATH', name: 'Path', color: '#9a8a64' },
  { code: 3, id: 'FLOOR', name: 'Floor', color: '#8a7a62' },
  { code: 4, id: 'WALL', name: 'Wall', color: '#55504a' },
  { code: 5, id: 'BRIDGE', name: 'Bridge', color: '#7a5f3c' },
  { code: 6, id: 'SWAMP', name: 'Swamp', color: '#4a5a32' },
  { code: 7, id: 'FENCE', name: 'Fence', color: '#6a5a3a' },
  { code: 8, id: 'SAND', name: 'Sand', color: '#c2ad7a' },
  { code: 9, id: 'DIRT', name: 'Dirt', color: '#6e553a' },
  { code: 10, id: 'FLOWERS', name: 'Flowers', color: '#5d8a4a' },
  { code: 11, id: 'CAVE', name: 'Cave', color: '#3a3632' },
  { code: 12, id: 'LAVA', name: 'Lava', color: '#b3401e' },
  { code: 13, id: 'ROCK', name: 'Rock', color: '#6a6a68' },
  { code: 14, id: 'SNOW', name: 'Snow', color: '#cfd8de' },
  { code: 15, id: 'ICE', name: 'Ice', color: '#9ec4d4' },
  { code: 16, id: 'DSAND', name: 'Desert sand', color: '#cbb068' },
] as const;

// Terrain codes that block walking (matches src/world.ts blocked()).
export const BLOCKING_TERRAIN = new Set([1, 4, 7, 12]);

export function decodeTerrain(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function encodeTerrain(arr: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) {
    bin += String.fromCharCode(...arr.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const colorCache = new Map<number, [number, number, number]>();
function rgb(code: number): [number, number, number] {
  let c = colorCache.get(code);
  if (!c) {
    const hex = (TERRAIN[code]?.color ?? '#ff00ff').slice(1);
    c = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    colorCache.set(code, c);
  }
  return c;
}

// Renders the terrain grid into an ImageData (1px per tile).
export function terrainImage(terrain: Uint8Array, w: number, h: number): ImageData {
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b] = rgb(terrain[i]);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  return img;
}

// Object types that never block movement (mirror of src/world.ts NON_BLOCKING).
export const NON_BLOCKING_OBJECTS = new Set([
  'fire', 'fishing_spot', 'rod_fishing_spot', 'flax_plant', 'farming_patch',
  'snare_set', 'agility_log', 'agility_rope', 'agility_wall', 'agility_ledge',
  'ice_ledge', 'rope_bridge', 'rock_climb', 'snow_slope', 'fire_altar',
  'lobster_spot', 'harpoon_spot',
  'bush', 'fern', 'boulder_small', 'mushroom_patch', 'reeds', 'lilypad', 'driftwood',
]);
