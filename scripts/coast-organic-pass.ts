// Follow-up organic pass for the artifacts the completeness audit flagged:
// dead-straight ocean shorelines, ruler-straight river banks, and rectangular
// lava pools. Safety model: water->land and lava->cave only ever ADD walkable
// space; land->water is attempted conservatively and the whole land->water set
// is reverted if spawn reachability to any functional object regresses.
// Deterministic (seeded RNG). Run: npx tsx scripts/coast-organic-pass.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP = path.join(__dirname, '../data/map.json');

const T = { GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5, SWAMP: 6, FENCE: 7, SAND: 8, DIRT: 9, FLOWERS: 10, CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16 };
const LAND_COSMETIC = new Set<number>([T.GRASS, T.SWAMP, T.SAND, T.DIRT, T.FLOWERS, T.SNOW, T.DSAND]);

let seed = 0xc0a57a55 >>> 0;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
const W = map.width as number, H = map.height as number;
const terr = Uint8Array.from(atob(map.terrain), (c) => c.charCodeAt(0));
const k = (x: number, y: number) => y * W + x;
const objAt = new Set<number>(map.objects.map((o: any) => k(o.x, o.y)));

const blockedT = (t: number) => t === T.WATER || t === T.WALL || t === T.FENCE || t === T.LAVA;
const blocked = (g: Uint8Array, x: number, y: number) =>
  x < 2 || y < 2 || x >= W - 2 || y >= H - 2 || blockedT(g[k(x, y)]) || objAt.has(k(x, y));

function reachableSet(g: Uint8Array, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(W * H);
  const q = [k(sx, sy)];
  seen[q[0]] = 1;
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = k(nx, ny);
      if (seen[nk] || blocked(g, nx, ny)) continue;
      seen[nk] = 1;
      q.push(nk);
    }
  }
  return seen;
}

// functional objects whose adjacency must stay reachable from spawn
const FUNCTIONAL = new Set(['bank_booth', 'furnace', 'anvil', 'range', 'altar', 'air_altar', 'fire_altar', 'ge_booth', 'spinning_wheel', 'workbench']);
function functionalOk(g: Uint8Array): boolean {
  const seen = reachableSet(g, 22, 38);
  for (const o of map.objects) {
    if (!FUNCTIONAL.has(o.type)) continue;
    let ok = false;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = o.x + dx, ny = o.y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && seen[k(nx, ny)]) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

const nearType = (g: Uint8Array, x: number, y: number, t: number, r: number) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && g[k(nx, ny)] === t) return true;
  }
  return false;
};

const baselineOk = functionalOk(terr);
if (!baselineOk) { console.error('baseline reachability already broken — aborting'); process.exit(1); }
const before = terr.slice();

let waterToLand = 0, landToWater = 0, lavaShrunk = 0;

for (let iter = 0; iter < 2; iter++) {
  const snap = terr.slice();
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const t = snap[k(x, y)];
      const n4: number[] = [snap[k(x, y - 1)], snap[k(x, y + 1)], snap[k(x - 1, y)], snap[k(x + 1, y)]];
      if (t === T.WATER) {
        // grow shore: water beside cosmetic land becomes that land type
        const land = n4.filter((n) => LAND_COSMETIC.has(n));
        if (land.length >= 1 && land.length <= 3 && rnd() < 0.35 && !nearType(snap, x, y, T.BRIDGE, 2) && !objAt.has(k(x, y))) {
          terr[k(x, y)] = land[(rnd() * land.length) | 0];
          waterToLand++;
        }
      } else if (t === T.LAVA) {
        // shrink rectangular lava pools: edge lava becomes cave floor
        const cave = n4.filter((n) => n === T.CAVE).length;
        if (cave >= 1 && cave <= 3 && rnd() < 0.4) { terr[k(x, y)] = T.CAVE; lavaShrunk++; }
      }
    }
  }
}

// conservative land->water nibble for meander (single pass, then global gate)
const landSwaps: Array<[number, number]> = [];
{
  const snap = terr.slice();
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const t = snap[k(x, y)];
      if (!LAND_COSMETIC.has(t) || objAt.has(k(x, y))) continue;
      const n4 = [snap[k(x, y - 1)], snap[k(x, y + 1)], snap[k(x - 1, y)], snap[k(x + 1, y)]];
      const water = n4.filter((n) => n === T.WATER).length;
      if (water >= 2 && water <= 3 && rnd() < 0.22 &&
          !nearType(snap, x, y, T.PATH, 2) && !nearType(snap, x, y, T.BRIDGE, 2) &&
          !nearType(snap, x, y, T.WALL, 3) && !nearType(snap, x, y, T.FLOOR, 3)) {
        landSwaps.push([k(x, y), t]);
        terr[k(x, y)] = T.WATER;
      }
    }
  }
}
landToWater = landSwaps.length;
if (!functionalOk(terr)) {
  for (const [kk, t] of landSwaps) terr[kk] = t;
  landToWater = 0;
  console.log('land->water set reverted (reachability gate)');
  if (!functionalOk(terr)) { console.error('still broken after revert — aborting without write'); process.exit(1); }
}

let changed = 0;
for (let i = 0; i < terr.length; i++) if (terr[i] !== before[i]) changed++;
map.terrain = Buffer.from(terr).toString('base64');
fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
console.log(`coast pass: water->land ${waterToLand}, land->water ${landToWater}, lava->cave ${lavaShrunk}, total tiles changed ${changed}`);
