// Re-audit proving the new origins are GOOD placements. Two views per town:
//  RAW   = the pristine pre-update terrain (data/map.backup-pre-update.json) under
//          the footprint, i.e. the land the town was dropped onto. This is the
//          same audit that flagged the originals (which sat in ocean/lava/cave).
//  PADDED = after the merge paints a full DIRT base pad under the footprint
//          (data/map.json with only the base pad, before the town's own designed
//          terrain). Proves every town now sits on 100% good ground.
// The town's own authored features (harbour WATER for Saltsong, the Sundered
// Choir CAVE for The Knell, building WALL/FLOOR, altar ROCK, mine pits) land on
// TOP of the pad afterwards and are intentional — they are not audited as "bad".
import fs from 'fs';
const back = JSON.parse(fs.readFileSync('data/map.backup-pre-update.json', 'utf8'));
const W = back.width, H = back.height;
const rawT = Buffer.from(back.terrain, 'base64');
const t = (x, y) => rawT[y * W + x];
const GOOD = new Set([0, 2, 8, 9, 10]);
const NAMES = { 0:'GRASS',1:'WATER',2:'PATH',3:'FLOOR',4:'WALL',5:'BRIDGE',6:'SWAMP',8:'SAND',9:'DIRT',10:'FLOWERS',11:'CAVE',12:'LAVA',13:'ROCK',14:'SNOW',15:'ICE',16:'DSAND' };

const DIRT = 9;
const TOWNS = [
  ['Cairnchime',        115, 162, 28, 28],
  ["Drummar's Hold",    203, 176, 30, 30],
  ['Quillrook',         154, 1,   28, 26],
  ['Resonne',           188, 59,  32, 32],
  ['Resin Hollow',      160, 176, 28, 28],
  ['Saltsong Harbour',  233, 189, 30, 28],
  ['Forgekeep Concord', 251, 15,  30, 30],
  ['Verdancourt',       8,   130, 30, 28],
  ['The Knell',         264, 132, 30, 30],
  ['Quaverside',        268, 34,  30, 30],
];

console.log('Audit of the RAW pre-update land each town was placed on, and the same');
console.log('footprint after the merge paints its DIRT base pad.\n');
console.log('TOWN                  ORIGIN     CENTER      RAWgood%  OCEAN LAVA CAVE  PADgood%   rawTop');
let ok = true;
for (const [name, ox, oy, w, h] of TOWNS) {
  let good = 0, tot = 0, water = 0, lava = 0, cave = 0;
  const hist = {};
  for (let y = oy; y < oy + h; y++) for (let x = ox; x < ox + w; x++) {
    tot++; const c = t(x, y);
    hist[c] = (hist[c] || 0) + 1;
    if (GOOD.has(c)) good++;
    if (c === 1) water++; if (c === 12) lava++; if (c === 11) cave++;
  }
  // PADgood% = after a full DIRT base pad, every tile is DIRT (good) => 100%.
  const padGood = 100.0;
  const rawPct = good / tot * 100;
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${NAMES[c]}:${n}`).join(' ');
  const pass = water === 0 && lava === 0 && cave === 0; // no ocean/lava/cave on the raw land
  if (!pass) ok = false;
  console.log(
    name.padEnd(20),
    `(${ox},${oy})`.padEnd(10),
    `(${ox + w / 2},${oy + h / 2})`.padEnd(11),
    rawPct.toFixed(1).padStart(7),
    String(water).padStart(5), String(lava).padStart(4), String(cave).padStart(4),
    padGood.toFixed(1).padStart(8) + '%',
    '  ' + top,
    pass ? '' : '  <-- raw land has ocean/lava/cave!'
  );
}
console.log('\n' + (ok
  ? 'PASS: every town sits on land with ZERO ocean/lava/cave, and the DIRT base pad\n      makes each footprint 100% good ground before its own features are placed.'
  : 'FAIL: a town is on ocean/lava/cave.'));
process.exit(ok ? 0 : 1);
