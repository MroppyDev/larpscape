// Merge data/_fragments/*.json into the real data files.
//
// Fragment shape (all keys optional):
//   { "items": [...], "npcs": [...], "objects": [...], "shops": [...],
//     "npcSpawns": [...], "groundSpawns": [...],
//     "mapObjects": [{ "type": "...", "x": N, "y": N }] }
//
// Rules:
//   - items/npcs/objects/shops dedupe by id. If two sources define the same id
//     with different bodies, the FIRST wins and a loud WARN is printed.
//   - npcSpawns/groundSpawns append to data/spawns.json (exact duplicates skipped).
//   - mapObjects append to data/map.json objects after a tile check: the target
//     must not be water/wall/fence/lava terrain and must not already hold an
//     object. Occupied/blocked targets are nudged to the nearest free adjacent
//     tile (spiral out to radius 3) and the move is noted.
//
// Run: npx tsx scripts/merge-fragments.ts
// (this script does NOT delete the fragments — the integrator does that after
// reviewing the output)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAG_DIR = path.join(ROOT, 'data', '_fragments');

// Stale placeholders, skipped per docs/QUEST-DESIGN.md:
//   - resonance_stand / conductors_lectern: Q4's fragment carries the surface
//     placeholders at (23,77)/(24,77); the dungeon map already ships the real
//     placements in the Resonance Gallery at (41,288)/(42,288) (Ch4 contract:
//     "the dungeon team relocates it ... pack keys off object type only").
//   - the_dissonant: spawned per-run by server/dungeon.ts at (41,290); a
//     permanent world spawn at the surface placeholder (24,78) would be wrong.
const SKIP_MAP_OBJECTS = new Set(['resonance_stand', 'conductors_lectern']);
const SKIP_NPC_SPAWNS = new Set(['the_dissonant']);

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p: string, v: unknown) =>
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

const warn = (msg: string) => console.warn(`\n!!! WARN: ${msg}\n`);

if (!fs.existsSync(FRAG_DIR)) {
  console.log('No data/_fragments directory — nothing to merge.');
  process.exit(0);
}
const fragFiles = fs.readdirSync(FRAG_DIR).filter((f) => f.endsWith('.json')).sort();
if (fragFiles.length === 0) {
  console.log('No fragment files — nothing to merge.');
  process.exit(0);
}

// ---- load targets ----
const itemsPath = path.join(ROOT, 'data', 'items.json');
const npcsPath = path.join(ROOT, 'data', 'npcs.json');
const objectsPath = path.join(ROOT, 'data', 'objects.json');
const shopsPath = path.join(ROOT, 'data', 'shops.json');
const spawnsPath = path.join(ROOT, 'data', 'spawns.json');
const mapPath = path.join(ROOT, 'data', 'map.json');

const items: Record<string, any> = readJson(itemsPath);
const npcs: Record<string, any> = readJson(npcsPath);
const objectsFile: { objs: Record<string, any> } = readJson(objectsPath);
const shops: Record<string, any> = readJson(shopsPath);
const spawns: { npcSpawns: any[]; groundSpawns: any[] } = readJson(spawnsPath);
const map: { width: number; height: number; terrain: string; objects: { type: string; x: number; y: number }[] } =
  readJson(mapPath);

// terrain + occupancy for the mapObjects tile check
const W = map.width, H = map.height;
const terrain = Buffer.from(map.terrain, 'base64');
const T_BLOCKED = new Set([1, 4, 7, 12]); // WATER, WALL, FENCE, LAVA (world.ts blocked())
const occupied = new Set<number>(map.objects.map((o) => o.y * W + o.x));
const tileFree = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < W && y < H
  && !T_BLOCKED.has(terrain[y * W + x])
  && !occupied.has(y * W + x);

// ---- merge ----
const stats: Record<string, number> = { items: 0, npcs: 0, objects: 0, shops: 0, npcSpawns: 0, groundSpawns: 0, mapObjects: 0 };
let collisions = 0, skippedDupes = 0;

function mergeDefs(kind: string, target: Record<string, any>, list: any[] | undefined, src: string, transform?: (e: any) => any) {
  for (const entry of list ?? []) {
    const id = entry.id;
    if (!id) { warn(`${src}: ${kind} entry without id: ${JSON.stringify(entry).slice(0, 80)}`); continue; }
    const body = transform ? transform(entry) : entry;
    if (id in target) {
      if (JSON.stringify(target[id]) === JSON.stringify(body)) { skippedDupes++; continue; }
      collisions++;
      warn(`${kind} id COLLISION '${id}' (${src}) differs from the already-merged body — keeping the first, dropping this one.`);
      continue;
    }
    target[id] = body;
    stats[kind]++;
  }
}

for (const f of fragFiles) {
  const src = `_fragments/${f}`;
  const frag = readJson(path.join(FRAG_DIR, f));

  mergeDefs('items', items, frag.items, src);
  mergeDefs('npcs', npcs, frag.npcs, src);
  mergeDefs('objects', objectsFile.objs, frag.objects, src);
  // shops.json values are { name, stock } keyed by id — strip the id field
  mergeDefs('shops', shops, frag.shops, src, ({ id: _id, ...rest }) => rest);

  for (const s of frag.npcSpawns ?? []) {
    if (SKIP_NPC_SPAWNS.has(s.id)) {
      console.log(`  note: skipped npcSpawn '${s.id}' @ (${s.x},${s.y}) from ${src} — server/dungeon.ts owns this spawn (QUEST-DESIGN Ch4).`);
      continue;
    }
    if (spawns.npcSpawns.some((e) => e.id === s.id && e.x === s.x && e.y === s.y)) { skippedDupes++; continue; }
    spawns.npcSpawns.push(s);
    stats.npcSpawns++;
  }
  for (const s of frag.groundSpawns ?? []) {
    if (spawns.groundSpawns.some((e) => e.item === s.item && e.x === s.x && e.y === s.y)) { skippedDupes++; continue; }
    spawns.groundSpawns.push(s);
    stats.groundSpawns++;
  }

  for (const o of frag.mapObjects ?? []) {
    if (SKIP_MAP_OBJECTS.has(o.type)) {
      console.log(`  note: skipped mapObject '${o.type}' @ (${o.x},${o.y}) from ${src} — already placed in the Resonance Gallery (QUEST-DESIGN Ch4).`);
      continue;
    }
    let { x, y } = o;
    if (!tileFree(x, y)) {
      // spiral out to the nearest free tile (radius 1..3, nearest ring first)
      let found = false;
      outer: for (let r = 1; r <= 3 && !found; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (tileFree(o.x + dx, o.y + dy)) { x = o.x + dx; y = o.y + dy; found = true; break outer; }
          }
        }
      }
      if (!found) {
        warn(`mapObject '${o.type}' @ (${o.x},${o.y}) from ${src}: tile blocked and no free tile within radius 3 — DROPPED.`);
        continue;
      }
      console.log(`  note: mapObject '${o.type}' (${src}) nudged (${o.x},${o.y}) -> (${x},${y}) (target tile blocked/occupied).`);
    }
    map.objects.push({ ...o, x, y });
    occupied.add(y * W + x);
    stats.mapObjects++;
  }
}

// ---- write ----
writeJson(itemsPath, items);
writeJson(npcsPath, npcs);
writeJson(objectsPath, objectsFile);
writeJson(shopsPath, shops);
writeJson(spawnsPath, spawns);
writeJson(mapPath, map);

console.log(`\nMerged ${fragFiles.length} fragment file(s):`);
for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: +${v}`);
console.log(`  identical duplicates skipped: ${skippedDupes}`);
console.log(`  collisions (first kept): ${collisions}`);
