// expand-west.ts — Expand the world 120 columns to the WEST.
//
// 300x300 -> 420x300. All existing content shifts +120 on X (Y unchanged).
// New land occupies columns 0..119 (left of the seam at x=120). This script
// performs ONLY the pure lockstep shift; landscaping the new west is done by
// scripts/landscape-west.ts afterwards. Run: npx tsx scripts/expand-west.ts
//
// Re-encodes terrain base64 and rewrites data/map.json + data/spawns.json with
// the same 2-space JSON formatting the originals use.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SHIFT = 120;
const OLD_W = 300;
const NEW_W = 420;
const H = 300;

interface MapJson {
  width: number;
  height: number;
  terrain: string;
  objects: { type: string; x: number; y: number }[];
}

// ---- map.json ----
const mapPath = path.join(root, 'data/map.json');
const map: MapJson = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

if (map.width !== OLD_W || map.height !== H) {
  throw new Error(`expected ${OLD_W}x${H}, got ${map.width}x${map.height} (already expanded?)`);
}

const oldBin = Buffer.from(map.terrain, 'base64');
if (oldBin.length !== OLD_W * H) {
  throw new Error(`terrain length ${oldBin.length} != ${OLD_W * H}`);
}

// New terrain buffer: columns 0..119 = GRASS(0) placeholder, columns 120..419 =
// the old row's 300 tiles.
const newBin = Buffer.alloc(NEW_W * H, 0); // 0 = GRASS
for (let y = 0; y < H; y++) {
  for (let x = 0; x < OLD_W; x++) {
    newBin[y * NEW_W + (x + SHIFT)] = oldBin[y * OLD_W + x];
  }
}

map.width = NEW_W;
map.terrain = newBin.toString('base64');
for (const o of map.objects) o.x += SHIFT;

// Originals use CRLF line endings; preserve that to minimise the diff.
const toCRLF = (s: string) => s.replace(/\n/g, '\r\n');
fs.writeFileSync(mapPath, toCRLF(JSON.stringify(map, null, 2) + '\n'));
console.log(`[expand-west] map.json: ${OLD_W}x${H} -> ${NEW_W}x${H}, shifted ${map.objects.length} objects +${SHIFT}`);

// ---- spawns.json ----
const spawnsPath = path.join(root, 'data/spawns.json');
const spawns = JSON.parse(fs.readFileSync(spawnsPath, 'utf8')) as {
  npcSpawns: { id: string; x: number; y: number }[];
  groundSpawns: { item: string; x: number; y: number; respawnTicks?: number }[];
};
for (const s of spawns.npcSpawns) s.x += SHIFT;
for (const g of spawns.groundSpawns) g.x += SHIFT;
fs.writeFileSync(spawnsPath, toCRLF(JSON.stringify(spawns, null, 2) + '\n'));
console.log(`[expand-west] spawns.json: shifted ${spawns.npcSpawns.length} npcSpawns + ${spawns.groundSpawns.length} groundSpawns +${SHIFT}`);
