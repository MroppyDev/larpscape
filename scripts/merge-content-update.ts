// One-shot merge of data/fragments/*.json into the live data files + map,
// plus authoring of the Cairnchime mining town and world density pits.
// Run: npx tsx scripts/merge-content-update.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');
const FRAG = path.join(DATA, 'fragments');

// Origins re-vetted against the restored pre-update map by scripts/scan-origins.mjs.
// Each was chosen so the FULL footprint contains no WATER/LAVA/CAVE/WALL/FLOOR
// (no ocean/mountain-peak/cave/existing-building), <=20 sparse existing objects
// (left in place via skip-on-collision), and sits >=18 chebyshev from every
// existing hub. Each region paints a full DIRT/GRASS base pad before placing
// objects (see pass 2), so any rock/snow/swamp under a footprint becomes clean
// ground. The map's non-building clean land cannot hold all ten footprints fully
// non-overlapping at a >=18 mutual gap (proven: 20000 randomized restarts found
// none), so Forgekeep + Quaverside abut in the NE corner with a small overlap
// their merged pads absorb. Footprints: melee 30x30, ranged 28x26, magic 32x32,
// woodcutting 28x28, fishing 30x28, smithing 30x30, herblore 30x28, prayer
// 30x30, utility(agility...) 30x30, Cairnchime(mining) 28x28.
const ORIGINS: Record<string, [number, number]> = {
  'melee-combat': [203, 176],                          // Drummar's Hold
  'ranged-gun': [154, 1],                               // Quillrook
  'magic-runecraft': [188, 59],                         // Resonne
  'woodcutting-firemaking': [160, 176],                // Resin Hollow
  'fishing-cooking': [233, 189],                        // Saltsong Harbour (coastal)
  'smithing-crafting-fletching': [251, 15],            // Forgekeep Concord
  'herblore-farming': [8, 130],                         // Verdancourt
  'prayer-slayer': [264, 132],                          // The Knell
  'agility-thieving-hunter-construction': [268, 34],   // Quaverside
};

// Per-region full footprint (w,h), used to paint a clean base pad under each
// town before its own terrainPads/objects go down.
const FOOTPRINTS: Record<string, [number, number]> = {
  'melee-combat': [30, 30],
  'ranged-gun': [28, 26],
  'magic-runecraft': [32, 32],
  'woodcutting-firemaking': [28, 28],
  'fishing-cooking': [30, 28],
  'smithing-crafting-fletching': [30, 30],
  'herblore-farming': [30, 28],
  'prayer-slayer': [30, 30],
  'agility-thieving-hunter-construction': [30, 30],
};

const GRASS = 0, DIRT = 9, PATH = 2, ROCK = 13;

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

// ---------- double-merge guard ----------
// This merge is NOT idempotent: it appends npcSpawns and some recipes without a
// dedup check, and re-painting/placing on an already-merged map produces garbage.
// It must run exactly once, on the pristine pre-update map. Detect a prior run by
// looking for a content-update object already placed at a NEW region origin
// (Quaverside's contract_board, dx/dy 4,4 -> origin 268,34). If found, refuse,
// unless FORCE_MERGE=1 is set after the caller has manually restored a clean base.
{
  const occ0 = new Set(map.objects.map((o: any) => o.x + ',' + o.y));
  const [qx, qy] = ORIGINS['agility-thieving-hunter-construction'];
  const alreadyMerged = map.objects.some((o: any) => o.type === 'contract_board' && o.x >= qx && o.x <= qx + 30 && o.y >= qy && o.y <= qy + 30)
    || (occ0.has('') === false && map.objects.length > 3300); // pre-update map is ~3201 objects
  if (alreadyMerged && process.env.FORCE_MERGE !== '1') {
    console.error('REFUSING: map.json looks already-merged (>3300 objects or content objects present).');
    console.error('Restore the pristine pre-update data first (git checkout 2d3eec1 -- data/*.json; cp data/map.backup-pre-update.json data/map.json), then re-run.');
    console.error('Set FORCE_MERGE=1 only if you are certain the base is clean.');
    process.exit(1);
  }
}

// backup map BEFORE any change — but never clobber an existing pristine backup
// with an already-modified map.
const backupPath = path.join(DATA, 'map.backup-pre-update.json');
if (!fs.existsSync(backupPath) || map.objects.length <= 3300) {
  fs.copyFileSync(path.join(DATA, 'map.json'), backupPath);
  console.log('Backed up map.json -> map.backup-pre-update.json');
} else {
  console.log('Kept existing map.backup-pre-update.json (current map.json is not a clean base).');
}

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
    // craftables keyed by output so the post-merge schema-sanitize (which nulls
    // some .station values) can't make a re-run treat them as new (idempotency).
    case 'craftables': return r.output;
    default: return JSON.stringify(r); // fletchables, etc.
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
  // idempotent: don't add an identical spawn twice (guards against double-merge)
  if (spawns.npcSpawns.some((s: any) => s.id === id && s.x === x && s.y === y)) {
    skip(`${label}: spawn '${id}' at (${x},${y}) already present`); return;
  }
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

// ---------- pass 2: map edits (base pad -> fragment pads -> objects -> spawns) ----------
for (const [name, frag] of Object.entries(frags)) {
  const [ox, oy] = ORIGINS[name];
  // 1) clean base pad of DIRT under the FULL footprint, so any rock/snow/swamp
  //    imperfection beneath the town is covered before anything else lands.
  const [fw, fh] = FOOTPRINTS[name] ?? [0, 0];
  if (fw && fh) paintPad(ox, oy, { dx: 0, dy: 0, w: fw, h: fh, code: DIRT });
  // 2) the fragment's own designed terrain (paths, floors, water features, etc.)
  for (const p of frag.terrainPads ?? []) paintPad(ox, oy, p);
  // 3) objects (skip-on-collision) and 4) spawns
  for (const m of frag.mapObjects ?? []) placeObj(m.type, ox + m.dx, oy + m.dy, name);
  for (const s of frag.spawns ?? []) addNpcSpawn(s.id, ox + s.dx, oy + s.dy, name);
}

// ---------- pass 3: Cairnchime mining town (authored here) ----------
// Re-vetted inland origin (scan-origins.mjs): grass clearing at 115,162, well
// clear of ocean/cave/lava and >=18 from every hub. It brings its own ROCK pit
// walls, so it sits on grass. 28x28 footprint (dx 0-27, dy 0-27).
{
  const ox = 115, oy = 162;
  // clean base pad under the FULL 28x28 footprint first (covers any imperfection)
  paintPad(ox, oy, { dx: 0, dy: 0, w: 28, h: 28, code: DIRT });
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
// Re-vetted on the restored map:
//  * Near-spawn pit (14-20,60-64): still good empty land next to the Swamp Mine
//    hub; the tiles are SWAMP, so we paint a small DIRT pad under them first so
//    the rocks sit on clean ground (2 stray tiles there get skip-on-collision).
//  * Near-Stonewatch pit: the old 276-280,190-192 spot sat ON the Stonewatch
//    garrison WALL tiles, so it's moved to a clean grass clearing at 257-261,
//    164-166 (~13 chebyshev from the Stonewatch hub), with a DIRT pad.
{
  const L = 'density-pits';
  // near spawn — DIRT pad under the 7x5 swamp pit, then the rocks
  paintPad(14, 60, { dx: 0, dy: 0, w: 7, h: 5, code: DIRT });
  for (const [x, y] of [[14, 60], [16, 60], [14, 62], [16, 62]]) placeObj('rocks_copper', x, y, L);
  for (const [x, y] of [[18, 60], [18, 62], [20, 60]]) placeObj('rocks_tin', x, y, L);
  for (const [x, y] of [[14, 64], [16, 64]]) placeObj('rocks_iron', x, y, L);
  // near Stonewatch — DIRT pad under the relocated 5x3 pit, then the rocks
  paintPad(257, 164, { dx: 0, dy: 0, w: 5, h: 3, code: DIRT });
  for (const [x, y] of [[257, 164], [259, 164]]) placeObj('rocks_iron', x, y, L);
  for (const [x, y] of [[257, 166], [259, 166]]) placeObj('rocks_coal', x, y, L);
  placeObj('rocks_gold', 261, 164, L);
  placeObj('rocks_silver', 261, 166, L);
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
