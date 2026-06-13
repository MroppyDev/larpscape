/**
 * scripts/integrate-towns.ts
 *
 * FINAL INTEGRATION of the town makeover.
 *
 * Rebuilds data/map.json + data/spawns.json from a CLEAN (no-town) 420x300
 * canvas, then stamps the 10 hand-authored layouts from data/town-layouts/.
 *
 * - West (x<120): current map.json landscape + reserved clearings (kept).
 * - East (x>=120): pristine pre-town world (data/map.backup-pre-update.json,
 *   300-wide) shifted +120. This DROPS the old ugly town placements/pads.
 * - Spawns: current west wildlife (x<120) + pristine east spawns shifted +120.
 * - Then stamp 10 layouts (terrain + objects + spawns).
 *
 * STEP 0 backups are done by the caller via cp; this script asserts they exist.
 * Run:  npx tsx scripts/integrate-towns.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const D = (p: string) => path.join(ROOT, 'data', p);

const W = 420, H = 300;
const PRISTINE_W = 300;
const SPLIT = 120; // west = x<120, east = x>=120

// terrain codes (mirror src/world.ts)
const T = { GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, FENCE: 7, SAND: 8, DIRT: 9, FLOWERS: 10, ROCK: 13 };

type Obj = { type: string; x: number; y: number };
type NpcSpawn = { id: string; x: number; y: number };
type Layout = {
  town: string; origin: [number, number]; w: number; h: number;
  terrain: number[][]; objects: { type: string; dx: number; dy: number }[];
  spawns: { id: string; dx: number; dy: number }[];
};

const readJSON = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

function b64ToTerrain(b64: string, expectLen: number): Uint8Array {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== expectLen) throw new Error(`terrain length ${buf.length} != ${expectLen}`);
  return new Uint8Array(buf);
}
function terrainToB64(t: Uint8Array): string {
  return Buffer.from(t).toString('base64');
}

const log: string[] = [];
const note = (s: string) => { log.push(s); console.log(s); };

// ---------------------------------------------------------------------------
// STEP 0 — assert backups exist
// ---------------------------------------------------------------------------
for (const f of ['map.backup-pre-integrate.json', 'spawns.backup-pre-integrate.json']) {
  if (!fs.existsSync(D(f))) throw new Error(`missing backup ${f} — run STEP 0 cp first`);
}
note('STEP 0: backups present (map.backup-pre-integrate.json, spawns.backup-pre-integrate.json)');

// ---------------------------------------------------------------------------
// STEP 1 — recover pristine pre-town data
// ---------------------------------------------------------------------------
const pristine = readJSON(D('map.backup-pre-update.json'));
if (pristine.width !== PRISTINE_W) throw new Error(`pristine width ${pristine.width} != ${PRISTINE_W}`);
const pristineTerrain = b64ToTerrain(pristine.terrain, pristine.width * pristine.height);
note(`STEP 1: pristine map ${pristine.width}x${pristine.height}, objects=${pristine.objects.length}`);

// pristine spawns from git 685ec99 (the commit just before the content update).
// Materialize it from git if the temp file is absent so the script is self-contained.
const pristineSpawnsPath = D('_tmp_pristine_spawns.json');
if (!fs.existsSync(pristineSpawnsPath)) {
  const out = execSync('git show 685ec99:data/spawns.json', { cwd: ROOT });
  fs.writeFileSync(pristineSpawnsPath, out);
}
const pristineSpawns = readJSON(pristineSpawnsPath);
const pNpc: NpcSpawn[] = pristineSpawns.npcSpawns;
const pGround = pristineSpawns.groundSpawns as any[];
note(`STEP 1: pristine spawns npcSpawns=${pNpc.length}, groundSpawns=${pGround.length}`);
if (pNpc.length < 140 || pNpc.length > 170) throw new Error(`pristine npcSpawns ${pNpc.length} out of expected 150-160ish range`);

// current map + spawns — READ FROM THE PRE-INTEGRATE BACKUP so the script is
// idempotent (re-running must not fold previously-stamped towns back into the
// "west landscape" extraction). The backup is the canonical pre-town source.
const cur = readJSON(D('map.backup-pre-integrate.json'));
if (cur.width !== W || cur.height !== H) throw new Error(`current map ${cur.width}x${cur.height} != ${W}x${H}`);
const curTerrain = b64ToTerrain(cur.terrain, W * H);
const curSpawns = readJSON(D('spawns.backup-pre-integrate.json'));

// ---------------------------------------------------------------------------
// STEP 2 — build CLEAN 420x300 canvas (no towns)
// ---------------------------------------------------------------------------
const canvas = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let code: number;
    if (x < SPLIT) {
      code = curTerrain[y * W + x];          // west landscape (current)
    } else {
      code = pristineTerrain[y * PRISTINE_W + (x - SPLIT)]; // pristine east, shifted
    }
    canvas[y * W + x] = code;
  }
}

// objects: current west (x<120) + pristine shifted +120
const objects: Obj[] = [];
for (const o of cur.objects as Obj[]) if (o.x < SPLIT) objects.push({ type: o.type, x: o.x, y: o.y });
const westObjCount = objects.length;
for (const o of pristine.objects as Obj[]) objects.push({ type: o.type, x: o.x + SPLIT, y: o.y });
note(`STEP 2: clean canvas objects = ${objects.length} (west ${westObjCount} + pristine-east ${pristine.objects.length})`);

// spawns: current west (x<120) + pristine east shifted +120
const npcSpawns: NpcSpawn[] = [];
for (const s of curSpawns.npcSpawns as NpcSpawn[]) if (s.x < SPLIT) npcSpawns.push({ id: s.id, x: s.x, y: s.y });
const westNpcCount = npcSpawns.length;
for (const s of pNpc) npcSpawns.push({ id: s.id, x: s.x + SPLIT, y: s.y });

// ground spawns: current west + pristine east shifted +120
const groundSpawns: any[] = [];
for (const s of curSpawns.groundSpawns as any[]) if (s.x < SPLIT) groundSpawns.push({ ...s });
const westGroundCount = groundSpawns.length;
for (const s of pGround) groundSpawns.push({ ...s, x: s.x + SPLIT });
note(`STEP 2: clean canvas npcSpawns = ${npcSpawns.length} (west ${westNpcCount} + pristine-east ${pNpc.length}); groundSpawns = ${groundSpawns.length} (west ${westGroundCount} + pristine-east ${pGround.length})`);

// ---------------------------------------------------------------------------
// STEP 3 — FIX FORGEKEEP before stamping
// ---------------------------------------------------------------------------
{
  const fp = D(path.join('town-layouts', 'forgekeep.json'));
  const fk: Layout = readJSON(fp);
  const g = fk.terrain;
  let softened = 0;
  // Soften hard outer-border SAND fill: left col (0) and right col (w-1) from
  // row 11 down, and the entire bottom row (h-1) -> GRASS. These are dead filler
  // around the footprint edge, not designed ground.
  for (let dy = 11; dy < fk.h; dy++) {
    if (g[dy][0] === T.SAND) { g[dy][0] = T.GRASS; softened++; }
    if (g[dy][fk.w - 1] === T.SAND) { g[dy][fk.w - 1] = T.GRASS; softened++; }
  }
  // Bottom row entirely sand -> grass
  for (let dx = 0; dx < fk.w; dx++) {
    if (g[fk.h - 1][dx] === T.SAND) { g[fk.h - 1][dx] = T.GRASS; softened++; }
  }
  // Soften the dead bottom-right SAND square (cols 16..28, rows 22..28) that has
  // no buildings -> GRASS so it reads as designed ground.
  for (let dy = 22; dy <= 28; dy++) {
    for (let dx = 16; dx <= 28; dx++) {
      if (g[dy][dx] === T.SAND) { g[dy][dx] = T.GRASS; softened++; }
    }
  }
  // Scatter decor into the previously-dead bottom-right region so it reads as
  // designed ground, not filler. (validated against objects.json below.)
  // Idempotent: only add decor not already present at that cell.
  const decor: { type: string; dx: number; dy: number }[] = [
    { type: 'tree', dx: 25, dy: 24 },
    { type: 'bush', dx: 22, dy: 26 },
    { type: 'fern', dx: 27, dy: 27 },
    { type: 'tree', dx: 20, dy: 28 },
    { type: 'bush', dx: 24, dy: 22 },
  ];
  const have = new Set(fk.objects.map((o) => `${o.type}@${o.dx},${o.dy}`));
  let addedDecor = 0;
  for (const d of decor) {
    const sig = `${d.type}@${d.dx},${d.dy}`;
    if (!have.has(sig)) { fk.objects.push(d); have.add(sig); addedDecor++; }
  }
  // Recompute a histogram for the log
  const hist: Record<string, number> = {};
  g.forEach((r) => r.forEach((c) => { hist[c] = (hist[c] || 0) + 1; }));
  fs.writeFileSync(fp, JSON.stringify(fk, null, 2) + '\n');
  note(`STEP 3: forgekeep softened ${softened} SAND tiles -> GRASS; added ${addedDecor} decor objects; new terrain hist=${JSON.stringify(hist)}`);
}

// ---------------------------------------------------------------------------
// STEP 4 — stamp all 10 layouts
// ---------------------------------------------------------------------------
const objDefs = readJSON(D('objects.json'));
const validObjTypes = new Set<string>([
  ...Object.keys(objDefs.objs || {}),
  ...Object.keys(objDefs.skillObjs || {}),
]);
const npcDefs = readJSON(D('npcs.json'));
const validNpcIds = new Set<string>(Object.keys(npcDefs));

const LAYOUT_KEYS = [
  'cairnchime', 'quillrook', 'resonne', 'resin-hollow', 'drummars-hold',
  'saltsong', 'forgekeep', 'verdancourt', 'the-knell', 'quaverside',
];
const EAST_TOWNS = new Set(['the-knell', 'quaverside']);

// collision check helper for east towns
function checkEastCollision(key: string, lay: Layout): string | null {
  const [ox, oy] = lay.origin;
  // The layout fully overwrites its rect (no transparent holes) and the normal
  // stamp path clears any pre-existing decor object in the footprint, so natural
  // wilderness (grass/dirt/flowers/sand/water + decorative scatter) is fine to
  // build over. Only BUILDINGS (FLOOR/WALL — existing structures or another
  // town) are a true collision worth refusing.
  let structTiles = 0;
  const badCodes: Record<string, number> = {};
  for (let dy = 0; dy < lay.h; dy++) {
    for (let dx = 0; dx < lay.w; dx++) {
      const c = canvas[(oy + dy) * W + (ox + dx)];
      if (c === T.FLOOR || c === T.WALL) { structTiles++; badCodes[c] = (badCodes[c] || 0) + 1; }
    }
  }
  if (structTiles > 0) {
    return `COLLISION ${key} @${ox},${oy} ${lay.w}x${lay.h}: ${structTiles} existing building (FLOOR/WALL) tiles in footprint ${JSON.stringify(badCodes)}`;
  }
  return null;
}

const townSummaries: string[] = [];
const skippedObjs: string[] = [];
const skippedSpawns: string[] = [];
const collisions: string[] = [];

// Pure-decor object types: when two objects stack on one tile (authored layouts
// occasionally stack a banner on a lamp_post, etc.) the validator forbids it, so
// we keep the more-functional one. Lower priority = dropped when it collides.
const DECOR = new Set([
  'banner', 'lamp_post', 'rug_deco', 'bookshelf', 'fern', 'bush', 'mushroom_patch',
  'hay_bale', 'reeds', 'lilypad', 'driftwood', 'dead_tree_deco', 'stump',
  'boulder_small', 'brazier', 'table', 'chair', 'bed', 'barrel', 'crate',
  'cauldron', 'fountain', 'weapon_rack', 'waystone', 'banner',
]);
const priority = (type: string) => (DECOR.has(type) ? 0 : 1);

// Track which tiles are occupied by an already-stamped/landscape object so we
// never emit two objects on one tile. Pre-seed with the clean-canvas objects.
const tileOwner = new Map<number, number>(); // tileKey -> index in objects[]
const tk = (x: number, y: number) => y * W + x;
objects.forEach((o, i) => { tileOwner.set(tk(o.x, o.y), i); });

// Footprints of towns we actually stamp (for clearing pre-existing decor).
const stampedFootprints: { ox: number; oy: number; w: number; h: number }[] = [];

// signature functional station(s) per town — actual object ids in the layouts.
const SIGNATURE: Record<string, string[]> = {
  cairnchime: ['furnace', 'anvil', 'rocks_iron'],           // mining/smithing
  quillrook: ['echo_target_novice', 'echo_target_master'],  // ranged
  resonne: ['air_altar', 'chord_altar', 'rune_mill'],       // magic/runecraft
  'resin-hollow': ['tree', 'oak', 'willow', 'yew'],         // woodcutting
  'drummars-hold': ['metronome_dummy', 'reinforced_dummy', 'cadence_anvil'], // melee
  saltsong: ['shoal_net_spot', 'deepbait_spot', 'reef_cage_spot'], // fishing
  forgekeep: ['anvil', 'furnace'],                          // smithing
  verdancourt: ['farming_patch', 'limpwurt_plant', 'compost_bin'], // herblore/farming
  'the-knell': ['consecrated_altar', 'altar'],              // prayer
  quaverside: ['qv_beam', 'qv_zipline', 'spinning_wheel'],  // agility/crafting
};
// resin-hollow is a woodcutting camp and has no bank by design.
const NO_BANK = new Set(['resin-hollow']);

for (const key of LAYOUT_KEYS) {
  const lay: Layout = readJSON(D(path.join('town-layouts', `${key}.json`)));
  const [ox, oy] = lay.origin;

  // bounds check
  if (ox < 0 || oy < 0 || ox + lay.w > W || oy + lay.h > H) {
    throw new Error(`${key} footprint out of bounds @${ox},${oy} ${lay.w}x${lay.h}`);
  }
  // terrain row/col sanity
  if (lay.terrain.length !== lay.h) throw new Error(`${key} terrain rows ${lay.terrain.length} != h ${lay.h}`);
  for (let dy = 0; dy < lay.h; dy++) {
    if (lay.terrain[dy].length !== lay.w) throw new Error(`${key} row ${dy} len ${lay.terrain[dy].length} != w ${lay.w}`);
  }

  // east town collision check (before stamping)
  if (EAST_TOWNS.has(key)) {
    const c = checkEastCollision(key, lay);
    if (c) { collisions.push(c); note(c); continue; }
    note(`STEP 4: east town ${key} footprint clean (no collision)`);
  }

  // stamp terrain
  for (let dy = 0; dy < lay.h; dy++) {
    for (let dx = 0; dx < lay.w; dx++) {
      canvas[(oy + dy) * W + (ox + dx)] = lay.terrain[dy][dx];
    }
  }
  stampedFootprints.push({ ox, oy, w: lay.w, h: lay.h });

  // Drop any pre-existing (west landscape) object inside this footprint — the
  // town's own terrain/objects replace the reserved clearing's decor.
  let clearedPreexisting = 0;
  for (let dy = 0; dy < lay.h; dy++) {
    for (let dx = 0; dx < lay.w; dx++) {
      const key2 = tk(ox + dx, oy + dy);
      if (tileOwner.has(key2)) {
        objects[tileOwner.get(key2)!] = null as any; // mark for compaction
        tileOwner.delete(key2);
        clearedPreexisting++;
      }
    }
  }

  // stamp objects with per-tile de-dup (prefer functional over decor)
  let stampedObjs = 0;
  for (const o of lay.objects) {
    if (!validObjTypes.has(o.type)) { skippedObjs.push(`${key}:${o.type}@${o.dx},${o.dy}`); continue; }
    const x = ox + o.dx, y = oy + o.dy;
    const key2 = tk(x, y);
    const existingIdx = tileOwner.get(key2);
    if (existingIdx !== undefined) {
      const existing = objects[existingIdx];
      // keep whichever is more functional; on a tie keep the existing.
      if (priority(o.type) > priority(existing.type)) {
        objects[existingIdx] = { type: o.type, x, y };
      }
      continue; // do not add a second object on this tile
    }
    const idx = objects.length;
    objects.push({ type: o.type, x, y });
    tileOwner.set(key2, idx);
    stampedObjs++;
  }
  // stamp spawns
  let stampedSpawns = 0;
  for (const s of lay.spawns) {
    if (!validNpcIds.has(s.id)) { skippedSpawns.push(`${key}:${s.id}@${s.dx},${s.dy}`); continue; }
    npcSpawns.push({ id: s.id, x: ox + s.dx, y: oy + s.dy });
    stampedSpawns++;
  }

  // TOWN CHECK: count WALL+FLOOR in footprint, confirm functional objects
  let wall = 0, floor = 0;
  for (let dy = 0; dy < lay.h; dy++) {
    for (let dx = 0; dx < lay.w; dx++) {
      const c = lay.terrain[dy][dx];
      if (c === T.WALL) wall++; else if (c === T.FLOOR) floor++;
    }
  }
  const footTypes = new Set(lay.objects.map((o) => o.type));
  const hasBankRaw = footTypes.has('bank_booth') || [...footTypes].some((t) => t.startsWith('bank'));
  const bankStatus = NO_BANK.has(key) ? 'n/a(camp)' : (hasBankRaw ? 'OK' : 'MISSING');
  const sig = SIGNATURE[key] || [];
  const sigFound = sig.filter((t) => footTypes.has(t));
  const hasSig = sigFound.length > 0;
  townSummaries.push(
    `  ${key.padEnd(15)} buildings: WALL=${wall} FLOOR=${floor} | bank=${bankStatus} | signature=${hasSig ? 'OK(' + sigFound.join(',') + ')' : 'MISSING[' + sig.join('/') + ']'} | objs=${stampedObjs} spawns=${stampedSpawns}`
  );
}

// compact objects (remove nulls left by pre-existing-decor clearing)
const beforeCompact = objects.length;
for (let i = objects.length - 1; i >= 0; i--) if (objects[i] == null) objects.splice(i, 1);
note(`STEP 4: compacted objects ${beforeCompact} -> ${objects.length} (removed ${beforeCompact - objects.length} cleared/null)`);

if (skippedObjs.length) note(`STEP 4: SKIPPED invalid object types: ${skippedObjs.join(', ')}`);
else note('STEP 4: all stamped object types valid (0 skipped)');
if (skippedSpawns.length) note(`STEP 4: SKIPPED invalid spawn ids: ${skippedSpawns.join(', ')}`);
else note('STEP 4: all stamped spawn ids valid (0 skipped)');
if (collisions.length) note(`STEP 4: ${collisions.length} EAST-TOWN COLLISIONS — those towns NOT stamped (need new origins)`);

// ---------------------------------------------------------------------------
// STEP 5 — write new map.json + spawns.json
// ---------------------------------------------------------------------------
const outMap = {
  width: W,
  height: H,
  terrain: terrainToB64(canvas),
  objects,
};
fs.writeFileSync(D('map.json'), JSON.stringify(outMap, null, 2) + '\n');
note(`STEP 5: wrote data/map.json ${W}x${H}, objects=${objects.length}`);

const outSpawns = { npcSpawns, groundSpawns };
fs.writeFileSync(D('spawns.json'), JSON.stringify(outSpawns, null, 2) + '\n');
note(`STEP 5: wrote data/spawns.json npcSpawns=${npcSpawns.length} groundSpawns=${groundSpawns.length}`);

// ---------------------------------------------------------------------------
// VERIFY — integrity of non-town world (landmarks shifted +120)
// ---------------------------------------------------------------------------
note('\n=== INTEGRITY CHECK (landmarks outside town footprints) ===');
// build object lookup for shifted-pristine expectation, restricted to OUTSIDE town footprints
const townBoxes = LAYOUT_KEYS
  .filter((k) => !collisions.some((c) => c.startsWith('COLLISION ' + k)))
  .map((k) => { const l: Layout = readJSON(D(path.join('town-layouts', `${k}.json`))); const [ox, oy] = l.origin; return { ox, oy, w: l.w, h: l.h }; });
const inAnyTown = (x: number, y: number) => townBoxes.some((b) => x >= b.ox && x < b.ox + b.w && y >= b.oy && y < b.oy + b.h);

function checkLandmark(name: string, x0: number, y0: number, x1: number, y1: number) {
  // x0..x1,y0..y1 are FINAL (shifted) coords. Compare terrain + objects to pristine shifted +120, skipping town tiles.
  let terrMismatch = 0, objMismatch = 0, checkedT = 0;
  const finalObjSet = new Set(objects.filter((o) => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1).map((o) => `${o.type}@${o.x},${o.y}`));
  const pristObjSet = new Set(
    (pristine.objects as Obj[])
      .map((o) => ({ type: o.type, x: o.x + SPLIT, y: o.y }))
      .filter((o) => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1 && !inAnyTown(o.x, o.y))
      .map((o) => `${o.type}@${o.x},${o.y}`)
  );
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < SPLIT || inAnyTown(x, y)) continue;
      checkedT++;
      const got = canvas[y * W + x];
      const exp = pristineTerrain[y * PRISTINE_W + (x - SPLIT)];
      if (got !== exp) terrMismatch++;
    }
  }
  // objects: every pristine (non-town) object should be present in final
  for (const p of pristObjSet) if (!finalObjSet.has(p)) objMismatch++;
  const ok = terrMismatch === 0 && objMismatch === 0;
  note(`  ${ok ? 'OK ' : 'FAIL'} ${name.padEnd(22)} terrain ${checkedT - terrMismatch}/${checkedT} match, pristine objects ${pristObjSet.size - objMismatch}/${pristObjSet.size} present`);
  return ok;
}
checkLandmark('Aldgate ~208,30', 198, 20, 218, 40);
checkLandmark('Castle ~141,37', 131, 27, 151, 47);
checkLandmark('Stonewatch ~392,178', 382, 168, 402, 188);
checkLandmark('Dungeon 126-170,238-295', 126, 238, 170, 295);
checkLandmark('Port Brackwater ~225,196', 215, 186, 235, 206);

// ---------------------------------------------------------------------------
// Report town summaries
// ---------------------------------------------------------------------------
note('\n=== TOWN CHECK (per-town) ===');
townSummaries.forEach((s) => note(s));

note('\n=== FINAL ===');
note(`map: ${W}x${H}, objects=${objects.length}`);
note(`spawns: npcSpawns=${npcSpawns.length}, groundSpawns=${groundSpawns.length}`);
note(`collisions: ${collisions.length}`);

// write a machine log
fs.writeFileSync(D('_integrate-towns-report.txt'), log.join('\n') + '\n');
console.log('\n(report written to data/_integrate-towns-report.txt)');
