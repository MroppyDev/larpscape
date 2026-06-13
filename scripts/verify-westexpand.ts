// verify-westexpand.ts — INTEGRITY PROOF for the west expansion.
//
// Confirms the +120 X shift is uniform by checking 5 known landmarks against
// data/map.backup-pre-westexpand.json: each must now sit exactly +120 from its
// old X (Y unchanged) AND on the same terrain code + same baked object it had
// before. Also re-asserts that the entire eastern half (x>=120) is byte-for-
// byte identical to the pre-shift map. Run: npx tsx scripts/verify-westexpand.ts

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const SHIFT = 120;

interface MapJson { width: number; height: number; terrain: string; objects: { type: string; x: number; y: number }[]; }
const cur: MapJson = JSON.parse(fs.readFileSync(path.join(root, 'data/map.json'), 'utf8'));
const old: MapJson = JSON.parse(fs.readFileSync(path.join(root, 'data/map.backup-pre-westexpand.json'), 'utf8'));

const OW = old.width, NW = cur.width, H = old.height;
const ob = Buffer.from(old.terrain, 'base64');
const nb = Buffer.from(cur.terrain, 'base64');
const oTerr = (x: number, y: number) => ob[y * OW + x];
const nTerr = (x: number, y: number) => nb[y * NW + x];
const objAt = (m: MapJson, w: number, x: number, y: number) =>
  m.objects.find((o) => o.x === x && o.y === y)?.type ?? null;

let pass = true;
const fail = (m: string) => { pass = false; console.log('  FAIL:', m); };

// 5 known landmarks — original (pre-shift) X/Y.
const LANDMARKS: { name: string; ox: number; oy: number }[] = [
  { name: 'Aldgate POI',        ox: 103, oy: 30 },   // src/world.ts POIS aldgate
  { name: 'The Castle POI',     ox: 21,  oy: 37 },   // src/world.ts POIS castle
  { name: 'Dungeon ENTRY',      ox: 12,  oy: 245 },  // server/dungeon.ts ENTRY
  { name: 'gd2 waystone (Aldgate east road)', ox: 236, oy: 38 }, // a quest stone (waystone object)
  { name: 'Imber Spire brazier', ox: 268, oy: 16 },  // cold_comfort west brazier object
];

console.log('=== Landmark shift proof (+%d on X, same terrain & object) ===', SHIFT);
for (const lm of LANDMARKS) {
  const nx = lm.ox + SHIFT, ny = lm.oy;
  const ot = oTerr(lm.ox, lm.oy), nt = nTerr(nx, ny);
  const oo = objAt(old, OW, lm.ox, lm.oy), no = objAt(cur, NW, nx, ny);
  const terrOk = ot === nt;
  const objOk = oo === no;
  const line = `  ${lm.name.padEnd(38)} (${lm.ox},${lm.oy}) -> (${nx},${ny})  terrain ${ot}->${nt} ${terrOk ? 'OK' : 'MISMATCH'}  object ${oo}->${no} ${objOk ? 'OK' : 'MISMATCH'}`;
  console.log(line);
  if (!terrOk) fail(`${lm.name}: terrain changed`);
  if (!objOk) fail(`${lm.name}: object changed`);
}

// Whole-east byte-identity (terrain).
console.log('=== East-half terrain byte-identity (x>=%d) ===', SHIFT);
let identical = true; let firstBad: string | null = null;
for (let y = 0; y < H && identical; y++) {
  for (let x = 0; x < OW; x++) {
    if (nTerr(x + SHIFT, y) !== oTerr(x, y)) { identical = false; firstBad = `(${x + SHIFT},${y})`; break; }
  }
}
console.log(`  east terrain identical to pre-shift: ${identical}${firstBad ? ' first diff ' + firstBad : ''}`);
if (!identical) fail('east terrain not identical');

// Whole-east object preservation.
const oldShifted = new Set(old.objects.map((o) => `${o.type}@${o.x + SHIFT},${o.y}`));
const eastNow = cur.objects.filter((o) => o.x >= SHIFT).map((o) => `${o.type}@${o.x},${o.y}`);
const missing = [...oldShifted].filter((s) => !new Set(eastNow).has(s));
const westCount = cur.objects.filter((o) => o.x < SHIFT).length;
console.log('=== East-half object preservation ===');
console.log(`  old objects ${old.objects.length}, east objects now ${eastNow.length}, missing ${missing.length}, new west objects ${westCount}`);
if (missing.length) fail(`${missing.length} east objects missing after shift`);
if (eastNow.length !== old.objects.length) fail('east object count != old count');

// Dimensions.
console.log('=== Dimensions ===');
console.log(`  ${OW}x${H} -> ${NW}x${H} (terrain bytes ${nb.length}, expected ${NW * H})`);
if (NW !== OW + SHIFT) fail(`width ${NW} != ${OW}+${SHIFT}`);
if (nb.length !== NW * H) fail('terrain byte length wrong');

console.log('\n' + (pass ? 'INTEGRITY PROOF: PASS — shift is uniform +120 and the old world is intact.'
                          : 'INTEGRITY PROOF: FAIL'));
process.exit(pass ? 0 : 1);
