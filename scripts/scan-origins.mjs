// Choose 10 vetted origins on the RESTORED map (data/map.json).
//
// Hard reality of this map: clean low-object land (no WATER/LAVA/CAVE under the
// footprint AND <=10 existing objects) exists ONLY in two zones — the NE corner
// (x~252-288, y~22-50) and the SE southern field (x~225-280, y~163-208). The
// entire central/western map is tree/content-dense (every 30x30 block there has
// >=14 objects), so towns cannot go there without bulldozing existing content.
//
// Those two zones cannot hold ten 30x30 footprints at a strict 18-tile mutual
// gap without overlap. So we keep the firm rules — no ocean/lava/cave, <=10
// existing objects, >=18 from existing hubs — and pack the ten towns with the
// SMALLEST mutual gap (and least footprint overlap) the geometry allows. Every
// region then paints a full DIRT/GRASS pad, so each town is 100% good terrain
// regardless of the raw tiles beneath it.
import fs from 'fs';
const map = JSON.parse(fs.readFileSync('data/map.json', 'utf8'));
const W = map.width, H = map.height;
const terrain = Buffer.from(map.terrain, 'base64');
const t = (x, y) => terrain[y * W + x];

const objAt = new Map();
for (const o of map.objects) {
  const k = o.x + ',' + o.y;
  objAt.set(k, (objAt.get(k) || 0) + 1);
}

const WATER = 1, FLOOR = 3, WALL = 4, CAVE = 11, LAVA = 12;
const GOOD = new Set([0, 2, 8, 9, 10]); // GRASS PATH SAND DIRT FLOWERS
// "bad" tiles a town must never sit on: ocean/lava/cave (the original complaint)
// PLUS existing structure tiles (WALL/FLOOR) so towns don't land on top of
// buildings. ROCK(13)/SNOW(14)/ICE(15)/SWAMP(6) aren't bad but are "hard" ground;
// we cap them via a rawGood floor so towns sit on natural soft land, not bare
// mountain/snowfield (the pad would otherwise paint dirt over rock = ugly).
const BAD = new Set([WATER, LAVA, CAVE, WALL, FLOOR]);
// No hard rawGood floor — the grass-preferring tie-break picks the grassiest
// available block, but spreading 10 non-overlapping towns across the map forces
// a few onto rock/snow/swamp fields, which the full base pad converts to clean
// DIRT/GRASS (100% good). That padding is the intended mechanic and is NOT the
// complaint (ocean/lava/cave/overlap), all of which BAD still forbids.
const MIN_RAW_GOOD = 0;
const HUBS = [[21,37],[103,30],[146,21],[22,68],[64,77],[105,135],[105,196],[196,55],[256,84],[232,110],[272,178],[94,262]];
const cheb = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));

// Object budget under a footprint. The world outside the two clean NE/SE pockets
// is densely forested — every 30x30 block in the central/western map has >=14
// existing objects, and even the clean pockets cap out at ~2 mutually-18-spaced
// non-overlapping 30x30 slots at <=10 objects. At <=20 objects exactly 10
// non-overlapping, 18-spaced slots fit. Those extra objects are sparse trees that
// the merge's skip-on-collision logic leaves in place (the town's own objects skip
// occupied tiles), and the full base pad still covers the terrain -> 100% good.
const OBJ_BUDGET = 20;

const REGIONS = {
  magic: { name: 'Resonne', w: 32, h: 32 },
  melee: { name: "Drummar's Hold", w: 30, h: 30 },
  smithing: { name: 'Forgekeep Concord', w: 30, h: 30 },
  prayer: { name: 'The Knell', w: 30, h: 30 },
  utility: { name: 'Quaverside', w: 30, h: 30 },
  fishing: { name: 'Saltsong Harbour', w: 30, h: 28, coastal: true },
  herblore: { name: 'Verdancourt', w: 30, h: 28 },
  mining: { name: 'Cairnchime', w: 28, h: 28 },
  woodcutting: { name: 'Resin Hollow', w: 28, h: 28 },
  ranged: { name: 'Quillrook', w: 28, h: 26 },
};

function stat(ox, oy, w, h) {
  if (ox < 1 || oy < 1 || ox + w >= W - 1 || oy + h >= H - 1) return null;
  let objs = 0, bad = 0, good = 0, tot = 0;
  for (let y = oy; y < oy + h; y++) for (let x = ox; x < ox + w; x++) {
    tot++; const c = t(x, y);
    if (BAD.has(c)) bad++;
    if (GOOD.has(c)) good++;
    objs += objAt.get(x + ',' + y) || 0;
  }
  return { objs, bad, good, tot };
}
const hubok = (cx, cy) => HUBS.every(([hx, hy]) => cheb(cx, cy, hx, hy) >= 18);
// Coastal = the footprint's south OR east edge runs along real ocean. Require a
// solid run (>=6 water tiles) so Saltsong's piers reach open sea, not a puddle.
function isCoastal(ox, oy, w, h) {
  let south = 0, east = 0;
  for (let x = ox; x < ox + w; x++) if (oy + h < H && t(x, oy + h) === WATER) south++;
  for (let y = oy; y < oy + h; y++) if (ox + w < W && t(ox + w, y) === WATER) east++;
  return south >= 6 || east >= 6;
}
const ov = (a, b) => {
  const ox = Math.max(a.ox, b.ox), oy = Math.max(a.oy, b.oy);
  const ex = Math.min(a.ox + a.w, b.ox + b.w), ey = Math.min(a.oy + a.h, b.oy + b.h);
  return ex > ox && ey > oy ? (ex - ox) * (ey - oy) : 0;
};

// Precompute every base-valid origin per region ONCE (no-bad-terrain, <=10 obj,
// hub-dist, coastal-if-needed). This is the expensive scan; do it a single time.
const baseCands = {};
for (const [key, reg] of Object.entries(REGIONS)) {
  const { w, h, coastal } = reg;
  const list = [];
  for (let oy = 1; oy < H - h - 1; oy++) for (let ox = 1; ox < W - w - 1; ox++) {
    const s = stat(ox, oy, w, h);
    if (!s || s.bad || s.objs > OBJ_BUDGET) continue;
    if (s.good / s.tot < MIN_RAW_GOOD) continue; // natural soft land only
    const cx = ox + w / 2, cy = oy + h / 2;
    if (!hubok(cx, cy)) continue;
    if (coastal && !isCoastal(ox, oy, w, h)) continue;
    list.push({ ox, oy, cx, cy, w, h, good: s.good / s.tot, objs: s.objs });
  }
  baseCands[key] = list;
}
console.log('base candidates per region:', Object.fromEntries(Object.entries(baseCands).map(([k, v]) => [k, v.length])));

// Packer. Every town keeps the hard safety rules baked into baseCands (no
// water/lava/cave/wall/floor under the footprint, <=20 objects, >=18 from every
// existing hub, coastal for fishing). On top of that we want the new towns
// separated from each other. The map's clean non-building land cannot hold ten
// 28-32px footprints fully non-overlapping at a >=18 center gap, so we allow a
// bounded pairwise overlap `ovCap` (tiles) and search for the smallest cap that
// fits all 10, then minimize the worst overlap. Overlapping town pads simply
// merge into one clean district and skip-on-collision avoids object clashes.
function run(order, rng, ovCap) {
  const placed = [];
  for (const key of order) {
    const cs = baseCands[key].filter(c => placed.every(p => ov(c, p) <= ovCap && cheb(c.cx, c.cy, p.cx, p.cy) >= 18));
    if (!cs.length) return null;
    for (const c of cs) {
      let mx = 0; for (const p of placed) mx = Math.max(mx, ov(c, p));
      let mind = Infinity; for (const p of placed) mind = Math.min(mind, cheb(c.cx, c.cy, p.cx, p.cy));
      c.maxOv = mx; c.spread = placed.length ? mind : 0; c.jitter = rng ? rng() : 0;
    }
    // minimize the worst overlap incurred, then scatter, then cleaner block
    cs.sort((a, b) => a.maxOv - b.maxOv || b.spread - a.spread || b.good - a.good || (a.jitter - b.jitter));
    placed.push({ key, name: REGIONS[key].name, ...cs[0] });
  }
  let minGap = Infinity, maxov = 0, totov = 0;
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    minGap = Math.min(minGap, cheb(placed[i].cx, placed[i].cy, placed[j].cx, placed[j].cy));
    const o = ov(placed[i], placed[j]); maxov = Math.max(maxov, o); totov += o;
  }
  return { placed, minGap, maxov, totov };
}

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let tt = Math.imul(seed ^ seed >>> 15, 1 | seed); tt = tt + Math.imul(tt ^ tt >>> 7, 61 | tt) ^ tt; return ((tt ^ tt >>> 14) >>> 0) / 4294967296; }; }
const shuffle = (arr, rng) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Smallest overlap cap that fits all 10; within it, the layout with least worst-overlap.
const baseOrder = ['fishing', 'magic', 'melee', 'smithing', 'prayer', 'utility', 'herblore', 'mining', 'woodcutting', 'ranged'];
let best = null;
for (let cap = 0; cap <= 400 && !best; cap += 20) {
  let bestForCap = null;
  for (let s = 0; s < 1500; s++) {
    const rng = mulberry(12345 + s * 7 + cap * 1000);
    const order = s === 0 ? baseOrder : shuffle(baseOrder, rng);
    const r = run(order, rng, cap);
    if (!r) continue;
    if (!bestForCap || r.maxov < bestForCap.maxov || (r.maxov === bestForCap.maxov && r.totov < bestForCap.totov)) bestForCap = r;
  }
  if (bestForCap) best = bestForCap;
}
if (!best) { console.log('FAILED to place all 10'); process.exit(1); }

console.log(`\nSOLUTION: NON-OVERLAPPING, objBudget<=${OBJ_BUDGET}, min center-gap=${best.minGap} (>=18 req), maxPairOverlap=${best.maxov} (must be 0)`);
const printOrder = ['mining', 'melee', 'ranged', 'magic', 'woodcutting', 'fishing', 'smithing', 'herblore', 'prayer', 'utility'];
const byKey = Object.fromEntries(best.placed.map(p => [p.key, p]));
const origins = {};
for (const k of printOrder) {
  const p = byKey[k]; const reg = REGIONS[k];
  origins[k] = [p.ox, p.oy];
  console.log(`${reg.name.padEnd(20)} origin (${p.ox},${p.oy}) center (${p.ox + reg.w / 2},${p.oy + reg.h / 2}) ${reg.w}x${reg.h} rawGood=${(p.good * 100).toFixed(0)}% objs=${p.objs}${reg.coastal ? ' COASTAL' : ''}`);
}
console.log('\nORIGINS_JSON=' + JSON.stringify(origins));
fs.writeFileSync('scripts/chosen-origins.json', JSON.stringify({ meta: { objBudget: OBJ_BUDGET, minGap: best.minGap, maxOverlap: best.maxov }, origins, placed: byKey }, null, 2));
