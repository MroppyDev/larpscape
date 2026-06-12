// One-shot merge of data/fragments/*.json into the live data files + map,
// plus authoring of the Cairnchime mining town and world density pits.
// Run: npx tsx scripts/merge-content-update.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const FRAG = path.join(DATA, 'fragments');

const ORIGINS: Record<string, [number, number]> = {
  'melee-combat': [150, 95],
  'ranged-gun': [210, 35],
  'magic-runecraft': [40, 150],
  'woodcutting-firemaking': [60, 105],
  'fishing-cooking': [135, 235],
  'smithing-crafting-fletching': [185, 150],
  'herblore-farming': [150, 200],
  'prayer-slayer': [245, 230],
  'agility-thieving-hunter-construction': [70, 160],
};

const DIRT = 9, PATH = 2, ROCK = 13;

// ---------- io helpers (preserve CRLF + trailing newline style) ----------
const rawCache: Record<string, string> = {};
function readJson(file: string): any {
  const raw = fs.readFileSync(path.join(DATA, file), 'utf8');
  rawCache[file] = raw;
  return JSON.parse(raw);
}
function writeJson(file: string, obj: any) {
  const orig = rawCache[file] ?? '';
  let out = JSON.stringify(obj, null, 2);
  if (orig.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  if (orig.endsWith('\n')) out += orig.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(path.join(DATA, file), out);
}

// ---------- load targets ----------
const items = readJson('items.json');
const objects = readJson('objects.json'); // { objs, skillObjs }
const recipes = readJson('recipes.json'); // arrays per class
const npcs = readJson('npcs.json');
const shops = readJson('shops.json');
const magic = readJson('magic.json'); // { spells[], prayers[], slayerTargets }
const spawns = readJson('spawns.json'); // { npcSpawns[], groundSpawns[] }
const map = readJson('map.json'); // { width, height, terrain(b64), objects[] }

// backup map BEFORE any change
fs.copyFileSync(path.join(DATA, 'map.json'), path.join(DATA, 'map.backup-pre-update.json'));
console.log('Backed up map.json -> map.backup-pre-update.json');

const terrain = Buffer.from(map.terrain, 'base64'); // Uint8Array w*h
const W = map.width, H = map.height;

const occupied = new Set<string>();
for (const o of map.objects) occupied.add(o.x + ',' + o.y);

const counts: Record<string, number> = {};
const skips: string[] = [];
function bump(k: string) { counts[k] = (counts[k] || 0) + 1; }
function skip(msg: string) { skips.push(msg); console.warn('SKIP: ' + msg); }

// Fragments are inconsistent: some use {id: def} maps, some use [def,...] arrays
// with an `id` field. Normalize to a keyed map. `stripId` matches target files
// whose values do not carry an id field (skillObjs, shops).
function normalize(src: any, stripId: boolean, label: string): Record<string, any> {
  if (!src) return {};
  let entries: [string, any][];
  if (Array.isArray(src)) {
    entries = src.map((e: any) => {
      if (!e.id) throw new Error(`${label}: array entry missing id: ${JSON.stringify(e).slice(0, 80)}`);
      return [e.id, e];
    });
  } else {
    entries = Object.entries(src);
  }
  const out: Record<string, any> = {};
  for (const [k, v] of entries) {
    const val = { ...v };
    if (stripId) delete val.id;
    else if (val.id == null) val.id = k;
    out[k] = val;
  }
  return out;
}

function mergeMapKeys(src: any, dst: any, label: string) {
  for (const [k, v] of Object.entries(src)) {
    if (k in dst) { skip(`${label}: key '${k}' already exists`); continue; }
    dst[k] = v;
    bump(label);
  }
}

// Semantic key per class where the output id is structurally unique;
// exact-JSON match otherwise (only true duplicates are skipped).
const recipeKeyOf = (cls: string, r: any) => {
  switch (cls) {
    case 'smeltables': return r.bar;
    case 'smithables': return r.output;
    case 'cookables': return r.raw;
    case 'herbs': return r.grimy;
    case 'potions': return r.output;
    case 'seeds': return r.seed;
    case 'gemCuts': return r.uncut;
    default: return JSON.stringify(r); // fletchables, craftables, etc.
  }
};

function mergeRecipes(src: any, label: string) {
  if (!src) return;
  for (const [cls, arr] of Object.entries(src) as [string, any[]][]) {
    if (!Array.isArray(arr)) continue;
    if (!Array.isArray(recipes[cls])) { skip(`${label}: unknown recipe class '${cls}'`); continue; }
    const existing = new Set(recipes[cls].map((r: any) => recipeKeyOf(cls, r)));
    for (const r of arr) {
      const key = recipeKeyOf(cls, r);
      if (existing.has(key)) { skip(`${label} recipes.${cls}: '${key}' already exists`); continue; }
      recipes[cls].push(r);
      existing.add(key);
      bump(`recipes.${cls}`);
    }
  }
}

function paintPad(ox: number, oy: number, p: { dx: number; dy: number; w: number; h: number; code: number }) {
  for (let y = oy + p.dy; y < oy + p.dy + p.h; y++) {
    for (let x = ox + p.dx; x < ox + p.dx + p.w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      terrain[y * W + x] = p.code;
      bump('terrainTiles');
    }
  }
}

const objTypeExists = (t: string) => !!(objects.objs[t] || objects.skillObjs[t]);

function placeObj(type: string, x: number, y: number, label: string) {
  if (x < 0 || y < 0 || x >= W || y >= H) { skip(`${label}: ${type} at (${x},${y}) out of bounds`); return; }
  if (!objTypeExists(type)) { skip(`${label}: object type '${type}' not defined (after merge)`); return; }
  const k = x + ',' + y;
  if (occupied.has(k)) { skip(`${label}: tile (${x},${y}) already has an object (wanted ${type})`); return; }
  map.objects.push({ type, x, y });
  occupied.add(k);
  bump('mapObjects');
}

function addNpcSpawn(id: string, x: number, y: number, label: string) {
  if (!npcs[id]) { skip(`${label}: spawn '${id}' has no npc def`); return; }
  spawns.npcSpawns.push({ id, x, y });
  bump('npcSpawns');
}

// ---------- pass 1: merge all defs from every fragment ----------
const fragFiles = fs.readdirSync(FRAG).filter(f => f.endsWith('.json')).sort();
const frags: Record<string, any> = {};
for (const f of fragFiles) {
  const name = f.replace(/\.json$/, '');
  if (!ORIGINS[name]) { skip(`fragment '${f}' has no region origin; skipping entirely`); continue; }
  frags[name] = JSON.parse(fs.readFileSync(path.join(FRAG, f), 'utf8'));
}

for (const [name, frag] of Object.entries(frags)) {
  mergeMapKeys(normalize(frag.items, false, name + '.items'), items, 'items');
  mergeMapKeys(normalize(frag.objs, false, name + '.objs'), objects.objs, 'objs');
  mergeMapKeys(normalize(frag.skillObjs, true, name + '.skillObjs'), objects.skillObjs, 'skillObjs');
  mergeRecipes(frag.recipes, name);
  mergeMapKeys(normalize(frag.npcs, false, name + '.npcs'), npcs, 'npcs');
  mergeMapKeys(normalize(frag.shops, true, name + '.shops'), shops, 'shops');
  if (frag.magic?.spells) {
    const ids = new Set(magic.spells.map((s: any) => s.id));
    for (const s of frag.magic.spells) {
      if (ids.has(s.id)) { skip(`${name}: spell '${s.id}' already exists`); continue; }
      magic.spells.push(s); ids.add(s.id); bump('spells');
    }
  }
  if (frag.magic?.prayers) {
    const ids = new Set(magic.prayers.map((p: any) => p.id));
    for (const p of frag.magic.prayers) {
      if (ids.has(p.id)) { skip(`${name}: prayer '${p.id}' already exists`); continue; }
      magic.prayers.push(p); ids.add(p.id); bump('prayers');
    }
  }
}

// ---------- pass 2: map edits (terrain pads, map objects, spawns) ----------
for (const [name, frag] of Object.entries(frags)) {
  const [ox, oy] = ORIGINS[name];
  for (const p of frag.terrainPads ?? []) paintPad(ox, oy, p);
  for (const m of frag.mapObjects ?? []) placeObj(m.type, ox + m.dx, oy + m.dy, name);
  for (const s of frag.spawns ?? []) addNpcSpawn(s.id, ox + s.dx, oy + s.dy, name);
}

// ---------- pass 3: Cairnchime mining town (authored here, origin 170,60) ----------
{
  const ox = 170, oy = 60;
  // town pad: dirt 14x10 at dx 0-13, dy 0-9
  paintPad(ox, oy, { dx: 0, dy: 0, w: 14, h: 10, code: DIRT });
  // path lanes through town: one horizontal, one vertical down into the pits
  paintPad(ox, oy, { dx: 0, dy: 5, w: 14, h: 1, code: PATH });
  paintPad(ox, oy, { dx: 6, dy: 0, w: 1, h: 27, code: PATH });
  // rock pit walls framing three terraced pits to the south/east
  // starter pit (dx 2-12, dy 12-18)
  paintPad(ox, oy, { dx: 1, dy: 11, w: 13, h: 1, code: ROCK });
  paintPad(ox, oy, { dx: 1, dy: 19, w: 13, h: 1, code: ROCK });
  paintPad(ox, oy, { dx: 1, dy: 12, w: 1, h: 7, code: ROCK });
  paintPad(ox, oy, { dx: 2, dy: 12, w: 11, h: 7, code: DIRT });
  // iron+silver terrace (dx 14-24, dy 12-18)
  paintPad(ox, oy, { dx: 13, dy: 11, w: 13, h: 1, code: ROCK });
  paintPad(ox, oy, { dx: 13, dy: 19, w: 13, h: 1, code: ROCK });
  paintPad(ox, oy, { dx: 25, dy: 12, w: 1, h: 7, code: ROCK });
  paintPad(ox, oy, { dx: 14, dy: 12, w: 11, h: 7, code: DIRT });
  // deep pit (dx 14-26, dy 20-26)
  paintPad(ox, oy, { dx: 13, dy: 20, w: 1, h: 8, code: ROCK });
  paintPad(ox, oy, { dx: 27, dy: 20, w: 1, h: 8, code: ROCK });
  paintPad(ox, oy, { dx: 14, dy: 27, w: 14, h: 1, code: ROCK });
  paintPad(ox, oy, { dx: 14, dy: 20, w: 13, h: 7, code: DIRT });

  const L = 'cairnchime';
  // town objects
  placeObj('furnace', ox + 3, oy + 3, L);
  placeObj('anvil', ox + 4, oy + 3, L);
  placeObj('anvil', ox + 5, oy + 3, L);
  placeObj('bank_booth', ox + 8, oy + 2, L);
  placeObj('bank_booth', ox + 9, oy + 2, L);
  // starter pit: copper at even dx on dy13, tin at even dx on dy15 (5 each, dx 2..10)
  for (const dx of [2, 4, 6, 8, 10]) placeObj('rocks_copper', ox + dx, oy + 13, L);
  for (const dx of [2, 4, 6, 8, 10]) placeObj('rocks_tin', ox + dx, oy + 15, L);
  placeObj('rocks_essence', ox + 2, oy + 17, L);
  placeObj('rocks_essence', ox + 4, oy + 17, L);
  // iron+silver terrace: 5x iron even dx on dy13 (dx 14..22)
  for (const dx of [14, 16, 18, 20, 22]) placeObj('rocks_iron', ox + dx, oy + 13, L);
  for (const dx of [16, 18, 20]) placeObj('rocks_silver', ox + dx, oy + 15, L);
  for (const dx of [16, 18, 20, 22]) placeObj('rocks_coal', ox + dx, oy + 17, L);
  // deep pit
  for (const dx of [15, 17, 19]) placeObj('rocks_gold', ox + dx, oy + 21, L);
  for (const dx of [21, 23]) placeObj('rocks_mithril', ox + dx, oy + 21, L);
  for (const dx of [15, 17]) placeObj('rocks_adamantite', ox + dx, oy + 24, L);
  placeObj('rocks_runite', ox + 25, oy + 24, L);
  for (const dx of [19, 21]) placeObj('rocks_gem', ox + dx, oy + 24, L);
  for (const dx of [15, 17, 19, 21]) placeObj('rocks_ringing', ox + dx, oy + 26, L);
  // npc spawn: banker (only if defined)
  if (npcs['banker']) addNpcSpawn('banker', ox + 8, oy + 3, L);
  else skip('cairnchime: npc banker not defined; no spawn added');
}

// ---------- pass 4: world density pits ----------
{
  const L = 'density-pits';
  // near spawn
  for (const [x, y] of [[14, 60], [16, 60], [14, 62], [16, 62]]) placeObj('rocks_copper', x, y, L);
  for (const [x, y] of [[18, 60], [18, 62], [20, 60]]) placeObj('rocks_tin', x, y, L);
  for (const [x, y] of [[14, 64], [16, 64]]) placeObj('rocks_iron', x, y, L);
  // near Stonewatch
  for (const [x, y] of [[276, 190], [278, 190]]) placeObj('rocks_iron', x, y, L);
  for (const [x, y] of [[276, 192], [278, 192]]) placeObj('rocks_coal', x, y, L);
  placeObj('rocks_gold', 280, 190, L);
  placeObj('rocks_silver', 280, 192, L);
}

// ---------- schema sanitize (current shared/schema.ts; sharedEdits may relax later) ----------
// craftables.station enum is only ['spinning_wheel'] | null; prayers.boost only defence/strength/attack.
for (const c of recipes.craftables) {
  if (c.station != null && c.station !== 'spinning_wheel') {
    skip(`FIX craftable '${c.output}': station '${c.station}' not in schema enum -> null`);
    c.station = null;
  }
}
for (const p of magic.prayers) {
  if (!['defence', 'strength', 'attack'].includes(p.boost)) {
    skip(`FIX prayer '${p.id}': boost '${p.boost}' not in schema enum -> 'defence' (mult ${p.mult})`);
    p.boost = 'defence';
    if (!(p.mult >= 1)) p.mult = 1;
  }
}

// ---------- write everything ----------
map.terrain = Buffer.from(terrain).toString('base64');
writeJson('items.json', items);
writeJson('objects.json', objects);
writeJson('recipes.json', recipes);
writeJson('npcs.json', npcs);
writeJson('shops.json', shops);
writeJson('magic.json', magic);
writeJson('spawns.json', spawns);
writeJson('map.json', map);

// ---------- summary ----------
console.log('\n=== MERGE SUMMARY ===');
for (const k of Object.keys(counts).sort()) console.log(`  ${k}: ${counts[k]}`);
console.log(`  skipped collisions/warnings: ${skips.length}`);
if (skips.length) for (const s of skips) console.log('    - ' + s);
