// One-time content extraction: serializes the compiled-in catalogs from
// src/defs.ts and the built world from src/world.ts into data/*.json,
// which become the editable source of truth for the admin app.
// Run: npx tsx scripts/extract-content.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
  ITEMS, NPCS, OBJS, SKILL_OBJS, COOKABLES, SMELTABLES, SMITHABLES,
  FLETCHABLES, CRAFTABLES, GEM_CUTS, HERBS, POTIONS, SPELLS, PRAYERS,
  SEEDS, SHOPS, SLAYER_TARGETS, CONSTRUCTION_BUILDS,
} from '../src/defs';
import { buildWorld, terrain, objects, groundSpawns, MAP_W, MAP_H } from '../src/world';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function write(name: string, value: unknown) {
  const file = path.join(DATA_DIR, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  console.log(`wrote ${name}`);
}

// --- catalogs ---------------------------------------------------------------
write('items.json', ITEMS);
write('npcs.json', NPCS);
write('objects.json', { objs: OBJS, skillObjs: SKILL_OBJS });
write('recipes.json', {
  cookables: COOKABLES,
  smeltables: SMELTABLES,
  smithables: SMITHABLES,
  fletchables: FLETCHABLES,
  craftables: CRAFTABLES,
  gemCuts: GEM_CUTS,
  herbs: HERBS,
  potions: POTIONS,
  seeds: SEEDS,
  constructionBuilds: CONSTRUCTION_BUILDS,
});
write('shops.json', SHOPS);
write('magic.json', { spells: SPELLS, prayers: PRAYERS, slayerTargets: SLAYER_TARGETS });

// --- world ------------------------------------------------------------------
buildWorld();
const terrainB64 = Buffer.from(terrain).toString('base64');
const mapObjects = objects.map((o) => ({ type: o.type, x: o.x, y: o.y }));
write('map.json', {
  width: MAP_W,
  height: MAP_H,
  terrain: terrainB64,
  objects: mapObjects,
});

// --- spawns -----------------------------------------------------------------
// Base NPC spawns currently hard-coded in game.ts spawnNpcs(). Pack-registered
// spawns (registerNpcSpawn) stay in TS behavior packs.
const npcSpawns: { id: string; x: number; y: number }[] = [];
const add = (id: string, x: number, y: number) => npcSpawns.push({ id, x, y });
for (const [x, y] of [[56, 30], [60, 34], [64, 28], [58, 44], [63, 42], [68, 36], [55, 38]]) add('goblin', x, y);
for (const [x, y] of [[57, 10], [61, 13], [65, 9], [67, 16], [59, 17]]) add('cow', x, y);
for (const [x, y] of [[30, 10], [33, 12], [36, 10], [31, 14], [35, 14]]) add('chicken', x, y);
add('man', 32, 36); add('man', 25, 34); add('man', 38, 42);
add('giant_rat', 18, 62); add('giant_rat', 26, 72); add('giant_rat', 22, 67);
add('shopkeeper', 35, 49);
add('banker', 17, 31);
for (const [x, y] of [[17, 12], [20, 15], [23, 11], [18, 17], [22, 14]]) add('sheep', x, y);
add('tanner', 37, 56);
add('slayer_master', 30, 35);
add('magic_tutor', 42, 30);
add('gardener', 36, 23);
add('cook', 17, 43);
add('carpenter', 23, 53);

write('spawns.json', { npcSpawns, groundSpawns });

// --- verification fingerprint -------------------------------------------------
const hash = crypto.createHash('sha256');
hash.update(terrain);
hash.update(JSON.stringify(mapObjects));
console.log('world fingerprint:', hash.digest('hex'));
console.log(`terrain ${MAP_W}x${MAP_H}, ${mapObjects.length} objects, ${npcSpawns.length} npc spawns, ${groundSpawns.length} ground spawns`);
