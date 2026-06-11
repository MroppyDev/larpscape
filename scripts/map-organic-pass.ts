// Organic map pass + interior decorator.
// Run: npx tsx scripts/map-organic-pass.ts
//
// PASS 1 — dither boundaries between walkable cosmetic terrains so the
//          rect()-authored zone edges meander; scatter flowers/dirt blobs
//          into large grass fields. Only swaps among walkable cosmetic
//          types, so world connectivity is provably unchanged.
// PASS 2 — per-room furniture coherence: beds/shelves against walls,
//          chairs at tables, barrels/crates in corners, doorways kept
//          clear, <=40% floor occupancy, per-placement BFS connectivity
//          verification (functional objects are never moved or deleted).
// PASS 3 — global reachability sanity from spawn (22,38) to all key
//          functional objects and doorways, compared before vs after.
//
// Writes data/map.json in place; keeps a backup at data/map.backup.json.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_PATH = path.resolve(__dirname, '../data/map.json');
const BACKUP_PATH = path.resolve(__dirname, '../data/map.backup.json');
const OBJS_PATH = path.resolve(__dirname, '../data/objects.json');

// ---- terrain codes (mirror src/world.ts) ----
const T = {
  GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5, SWAMP: 6, FENCE: 7, SAND: 8,
  DIRT: 9, FLOWERS: 10, CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16,
} as const;

// Walkable cosmetic terrains eligible for dithering.
const COSMETIC = new Set<number>([T.GRASS, T.PATH, T.SWAMP, T.SAND, T.DIRT, T.FLOWERS, T.SNOW, T.DSAND]);

// Mirror of NON_BLOCKING in src/world.ts (object types that never block movement).
const NON_BLOCKING = new Set([
  'fire', 'fishing_spot', 'rod_fishing_spot', 'flax_plant', 'farming_patch',
  'snare_set', 'agility_log', 'agility_rope', 'agility_wall', 'agility_ledge',
  'ice_ledge', 'rope_bridge', 'rock_climb', 'snow_slope', 'fire_altar',
  'lobster_spot', 'harpoon_spot',
  'bush', 'fern', 'boulder_small', 'mushroom_patch', 'reeds', 'lilypad', 'driftwood',
  'dance_floor', 'rainbow_banner',
  'chair', 'banner', 'rug_deco',
]);

// Decorative furniture we are allowed to rearrange/delete. Everything else
// (bank_booth, furnace, anvil, range, altar, stalls, casino tables, dentist
// gear, Chimperton regalia, pride/LARP set-dressing, trees, rocks, patches,
// agility obstacles, fishing spots, ...) is FUNCTIONAL: never moved/deleted.
const DECOR = new Set([
  'table', 'chair', 'bed', 'bookshelf', 'barrel', 'crate', 'banner', 'rug_deco',
  'cauldron', 'hay_bale', 'weapon_rack',
]);
// Beds are decorative but every house keeps its bed(s): relocate only, never delete.
const NEVER_DELETE = new Set(['bed']);

// Key functional objects for the pass-3 spawn-reachability audit.
const AUDIT_TYPES = new Set(['bank_booth', 'furnace', 'anvil', 'range', 'altar']);
const SPAWN = { x: 22, y: 38 };

// ---- seeded RNG (mulberry32) ----
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x1a59c0de);

// ---- load ----
interface MapObj { type: string; x: number; y: number; [k: string]: any }
const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) as {
  width: number; height: number; terrain: string; objects: MapObj[];
};
const W = map.width, H = map.height;
const terr = new Uint8Array(Buffer.from(map.terrain, 'base64'));
if (terr.length !== W * H) throw new Error('terrain size mismatch');

if (!fs.existsSync(BACKUP_PATH)) fs.copyFileSync(MAP_PATH, BACKUP_PATH);

const objDefs = JSON.parse(fs.readFileSync(OBJS_PATH, 'utf8')).objs as Record<string, any>;
for (const t of DECOR) if (!objDefs[t]) throw new Error(`decor type ${t} missing from objects.json`);

const key = (x: number, y: number) => y * W + x;
const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
const D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const D8 = [...D4, [-1, -1], [1, -1], [-1, 1], [1, 1]];

const objAt = new Map<number, MapObj>();
for (const o of map.objects) objAt.set(key(o.x, o.y), o);

function blockedTile(x: number, y: number): boolean {
  if (!inB(x, y)) return true;
  const t = terr[key(x, y)];
  if (t === T.WATER || t === T.WALL || t === T.FENCE || t === T.LAVA) return true;
  const o = objAt.get(key(x, y));
  if (o) return !NON_BLOCKING.has(o.type);
  return false;
}

// Full-map BFS over walkable tiles (4+diag, no corner cutting; mirrors findPath).
function reachableFrom(sx: number, sy: number): Uint8Array {
  const vis = new Uint8Array(W * H);
  if (blockedTile(sx, sy)) return vis;
  const q = [key(sx, sy)];
  vis[q[0]] = 1;
  let head = 0;
  while (head < q.length) {
    const k = q[head++];
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of D8) {
      const nx = x + dx, ny = y + dy;
      if (!inB(nx, ny) || vis[key(nx, ny)] || blockedTile(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (blockedTile(x + dx, y) || blockedTile(x, y + dy))) continue;
      vis[key(nx, ny)] = 1;
      q.push(key(nx, ny));
    }
  }
  return vis;
}

function auditTargets(): { label: string; ok: boolean }[] {
  const vis = reachableFrom(SPAWN.x, SPAWN.y);
  const adjReachable = (x: number, y: number) =>
    D8.some(([dx, dy]) => inB(x + dx, y + dy) && vis[key(x + dx, y + dy)] === 1);
  const out: { label: string; ok: boolean }[] = [];
  for (const o of map.objects) {
    if (!AUDIT_TYPES.has(o.type)) continue;
    out.push({ label: `${o.type}@${o.x},${o.y}`, ok: adjReachable(o.x, o.y) });
  }
  for (const d of allDoorways) out.push({ label: `door@${d.x},${d.y}`, ok: vis[key(d.x, d.y)] === 1 || adjReachable(d.x, d.y) });
  return out;
}

// =====================================================================
// Interior rooms (computed up front so pass 1 can protect aprons, and
// pass 3 can audit doorways before/after).
// =====================================================================
interface Room { tiles: number[]; tileSet: Set<number>; doors: number[]; }
function findRooms(): Room[] {
  const seen = new Uint8Array(W * H);
  const rooms: Room[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k0 = key(x, y);
    if (seen[k0] || terr[k0] !== T.FLOOR) continue;
    const tiles: number[] = [k0];
    seen[k0] = 1;
    let head = 0;
    while (head < tiles.length) {
      const k = tiles[head++];
      const cx = k % W, cy = (k / W) | 0;
      for (const [dx, dy] of D4) {
        const nx = cx + dx, ny = cy + dy;
        if (!inB(nx, ny)) continue;
        const nk = key(nx, ny);
        if (!seen[nk] && terr[nk] === T.FLOOR) { seen[nk] = 1; tiles.push(nk); }
      }
    }
    const tileSet = new Set(tiles);
    // Doorways: floor tiles of the room adjacent (4) to walkable non-floor
    // terrain — i.e. the gap in the wall ring.
    const doors: number[] = [];
    for (const k of tiles) {
      const cx = k % W, cy = (k / W) | 0;
      for (const [dx, dy] of D4) {
        const nx = cx + dx, ny = cy + dy;
        if (!inB(nx, ny)) continue;
        const t = terr[key(nx, ny)];
        if (t !== T.FLOOR && t !== T.WALL && t !== T.WATER && t !== T.FENCE && t !== T.LAVA) { doors.push(k); break; }
      }
    }
    rooms.push({ tiles, tileSet, doors });
  }
  return rooms;
}
const rooms = findRooms();
const allDoorways = rooms.flatMap(r => r.doors).map(k => ({ x: k % W, y: (k / W) | 0 }));

const baseline = auditTargets();

// =====================================================================
// PASS 1 — organic terrain boundaries
// =====================================================================
let dithered = 0;

// Protection mask: tiles we must not retype.
function protectedTile(x: number, y: number): boolean {
  const k = key(x, y);
  if (!COSMETIC.has(terr[k])) return true;          // never touch non-cosmetic
  if (objAt.has(k)) return true;                    // never under an object
  for (const [dx, dy] of D8) {
    const nx = x + dx, ny = y + dy;
    if (!inB(nx, ny)) continue;
    const t = terr[key(nx, ny)];
    if (t === T.WALL || t === T.FLOOR || t === T.FENCE) return true; // building aprons + fences
  }
  return false;
}

function pathNeighbors4(x: number, y: number, grid: Uint8Array): number {
  let n = 0;
  for (const [dx, dy] of D4) if (inB(x + dx, y + dy) && grid[key(x + dx, y + dy)] === T.PATH) n++;
  return n;
}

for (let iter = 0; iter < 2; iter++) {
  const snap = terr.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = key(x, y);
    const cur = snap[k];
    if (protectedTile(x, y)) continue;
    // boundary? must have a 4-neighbor with a DIFFERENT cosmetic walkable type
    const cands: number[] = [];
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy;
      if (!inB(nx, ny)) continue;
      const t = snap[key(nx, ny)];
      if (t !== cur && COSMETIC.has(t)) cands.push(t);
    }
    if (cands.length === 0) continue;
    if (rng() >= 0.45) continue;
    if (cur === T.PATH) {
      // keep paths connected: only nibble tiles with >=3 path neighbors
      // (a 1-wide path segment has 2, so it is never broken), and stay
      // clear of bridge ends.
      if (pathNeighbors4(x, y, snap) < 3) continue;
      let nearBridge = false;
      for (const [dx, dy] of D8) if (inB(x + dx, y + dy) && snap[key(x + dx, y + dy)] === T.BRIDGE) nearBridge = true;
      if (nearBridge) continue;
    }
    terr[k] = cands[(rng() * cands.length) | 0];
    dithered++;
  }
}

// Scatter: blobby FLOWERS/DIRT patches in large uniform grass fields.
let scattered = 0;
function openGrass(x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!inB(nx, ny)) return false;
    if (terr[key(nx, ny)] !== T.GRASS) return false;
    if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2 && objAt.has(key(nx, ny))) return false;
  }
  return true;
}
const NUM_PATCHES = 60; // low density across the 224x224 map
for (let i = 0; i < NUM_PATCHES; i++) {
  let sx = -1, sy = -1;
  for (let tries = 0; tries < 40; tries++) {
    const x = 2 + ((rng() * (W - 4)) | 0), y = 2 + ((rng() * (H - 4)) | 0);
    if (openGrass(x, y, 3)) { sx = x; sy = y; break; }
  }
  if (sx < 0) continue;
  const type = rng() < 0.5 ? T.FLOWERS : T.DIRT;
  const len = 2 + ((rng() * 5) | 0); // 2-6 tile blob via random walk
  let cx = sx, cy = sy;
  for (let s = 0; s < len; s++) {
    if (terr[key(cx, cy)] === T.GRASS && !objAt.has(key(cx, cy)) && !protectedTile(cx, cy)) {
      terr[key(cx, cy)] = type;
      scattered++;
    }
    const [dx, dy] = D4[(rng() * 4) | 0];
    const nx = cx + dx, ny = cy + dy;
    if (inB(nx, ny) && terr[key(nx, ny)] === T.GRASS) { cx = nx; cy = ny; }
  }
}

// =====================================================================
// PASS 2 — furniture coherence
// =====================================================================
let moved = 0, deleted = 0, roomsTouched = 0;
const roomNotes: string[] = [];

function wallNeighbors4(k: number): number {
  const x = k % W, y = (k / W) | 0;
  let n = 0;
  for (const [dx, dy] of D4) if (inB(x + dx, y + dy) && terr[key(x + dx, y + dy)] === T.WALL) n++;
  return n;
}
function isCorner(k: number): boolean {
  const x = k % W, y = (k / W) | 0;
  let nsWall = false, ewWall = false;
  if ((inB(x, y - 1) && terr[key(x, y - 1)] === T.WALL) || (inB(x, y + 1) && terr[key(x, y + 1)] === T.WALL)) nsWall = true;
  if ((inB(x - 1, y) && terr[key(x - 1, y)] === T.WALL) || (inB(x + 1, y) && terr[key(x + 1, y)] === T.WALL)) ewWall = true;
  return nsWall && ewWall;
}

function removeObj(o: MapObj) {
  const i = map.objects.indexOf(o);
  if (i >= 0) map.objects.splice(i, 1);
  if (objAt.get(key(o.x, o.y)) === o) objAt.delete(key(o.x, o.y));
}
function placeObj(o: MapObj, k: number) {
  o.x = k % W; o.y = (k / W) | 0;
  map.objects.push(o);
  objAt.set(k, o);
}

// Room-local connectivity check: every unblocked floor tile reachable from
// some doorway (4-dir BFS, strict), and every blocking object in the room
// has at least one reachable adjacent tile.
function roomOk(room: Room): boolean {
  const free = new Set<number>();
  for (const k of room.tiles) {
    const o = objAt.get(k);
    if (!o || NON_BLOCKING.has(o.type)) free.add(k);
  }
  const starts = room.doors.filter(k => free.has(k));
  if (starts.length === 0) return free.size === 0;
  const vis = new Set<number>(starts);
  const q = [...starts];
  let head = 0;
  while (head < q.length) {
    const k = q[head++];
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of D4) {
      const nk = key(x + dx, y + dy);
      if (free.has(nk) && !vis.has(nk)) { vis.add(nk); q.push(nk); }
    }
  }
  if (vis.size !== free.size) return false;
  // every blocking object adjacent-reachable
  for (const k of room.tiles) {
    const o = objAt.get(k);
    if (!o || NON_BLOCKING.has(o.type)) continue;
    const x = k % W, y = (k / W) | 0;
    let ok = false;
    for (const [dx, dy] of D8) if (vis.has(key(x + dx, y + dy))) ok = true;
    if (!ok) return false;
  }
  return true;
}

for (const room of rooms) {
  if (room.doors.length === 0) continue;            // sealed room: leave alone
  if (room.tiles.length < 4) continue;              // too tiny to decorate
  const decor: MapObj[] = [];
  const functional: MapObj[] = [];
  for (const k of room.tiles) {
    const o = objAt.get(k);
    if (!o) continue;
    if (DECOR.has(o.type)) decor.push(o); else functional.push(o);
  }
  if (decor.length === 0) continue;
  roomsTouched++;
  const before = decor.map(o => `${o.type}@${o.x},${o.y}`).join(' ');

  // pull all decoratives off the grid
  for (const o of decor) removeObj(o);

  // keep-clear zone: doorway tiles + tiles directly in front of them
  const clear = new Set<number>(room.doors);
  for (const dk of room.doors) {
    const x = dk % W, y = (dk / W) | 0;
    for (const [dx, dy] of D4) {
      const nk = key(x + dx, y + dy);
      if (room.tileSet.has(nk)) clear.add(nk);
    }
  }

  const freeSpot = (k: number) => room.tileSet.has(k) && !objAt.has(k) && !clear.has(k);
  const cornerSpots = () => room.tiles.filter(k => freeSpot(k) && isCorner(k));
  const wallSpots = () => room.tiles.filter(k => freeSpot(k) && wallNeighbors4(k) >= 1);
  const centerSpots = () => room.tiles.filter(k => freeSpot(k) && wallNeighbors4(k) === 0);
  const anySpots = () => room.tiles.filter(freeSpot);
  const shuffle = <X>(a: X[]) => { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // 40% occupancy cap (functional objects count toward it)
  const cap = Math.floor(room.tiles.length * 0.4);
  let budget = cap - functional.length;
  // priority order for keeping pieces under the cap
  const prio = ['bed', 'table', 'bookshelf', 'cauldron', 'weapon_rack', 'rug_deco', 'chair', 'hay_bale', 'barrel', 'crate', 'banner'];
  decor.sort((a, b) => prio.indexOf(a.type) - prio.indexOf(b.type));
  const toPlace: MapObj[] = [];
  for (const o of decor) {
    if (budget > 0 || NEVER_DELETE.has(o.type)) { toPlace.push(o); budget--; }
    else { deleted++; }
  }

  // try a spot; for blocking pieces verify room connectivity, else revert
  const tryPlace = (o: MapObj, spots: number[]): boolean => {
    const blocking = !NON_BLOCKING.has(o.type);
    for (const k of spots) {
      placeObj(o, k);
      if (!blocking || roomOk(room)) return true;
      removeObj(o);
    }
    return false;
  };

  const tables: MapObj[] = [];
  const leftovers: MapObj[] = [];
  for (const o of toPlace) {
    let ok = false;
    switch (o.type) {
      case 'bed': case 'bookshelf': case 'weapon_rack': case 'cauldron': case 'hay_bale': case 'banner':
        ok = tryPlace(o, shuffle(wallSpots())) || tryPlace(o, shuffle(anySpots()));
        break;
      case 'table': {
        // tables 1+ tile from walls when the room allows it
        const center = shuffle(centerSpots());
        ok = tryPlace(o, center) || tryPlace(o, shuffle(wallSpots()));
        if (ok) tables.push(o);
        break;
      }
      case 'barrel': case 'crate':
        ok = tryPlace(o, shuffle(cornerSpots())) || tryPlace(o, shuffle(wallSpots())) || tryPlace(o, shuffle(anySpots()));
        break;
      case 'chair': {
        // chairs adjacent to a table if possible
        const near: number[] = [];
        for (const t of tables) for (const [dx, dy] of D4) {
          const k = key(t.x + dx, t.y + dy);
          if (freeSpot(k)) near.push(k);
        }
        ok = tryPlace(o, shuffle(near)) || tryPlace(o, shuffle(anySpots()));
        break;
      }
      case 'rug_deco':
        ok = tryPlace(o, shuffle(centerSpots())) || tryPlace(o, shuffle(anySpots()));
        break;
      default:
        ok = tryPlace(o, shuffle(anySpots()));
    }
    if (!ok) {
      if (NEVER_DELETE.has(o.type)) {
        // bed must survive: drop it on any free room tile even near a door
        const fallback = room.tiles.find(k => room.tileSet.has(k) && !objAt.has(k));
        if (fallback !== undefined && (placeObj(o, fallback), roomOk(room))) { /* kept */ }
        else { if (fallback !== undefined) removeObj(o); leftovers.push(o); }
      } else {
        deleted++;
      }
    } else {
      moved++;
    }
  }
  for (const o of leftovers) { deleted++; } // truly unplaceable (should be rare)

  if (!roomOk(room)) {
    // last-ditch: strip blocking decoratives until the room is sane
    for (const k of room.tiles) {
      const o = objAt.get(k);
      if (o && DECOR.has(o.type) && !NON_BLOCKING.has(o.type) && !NEVER_DELETE.has(o.type)) {
        removeObj(o); deleted++; moved--;
        if (roomOk(room)) break;
      }
    }
  }
  const cx = room.tiles[0] % W, cy = (room.tiles[0] / W) | 0;
  roomNotes.push(`room@${cx},${cy} (${room.tiles.length} tiles, ${room.doors.length} door tiles): ${decor.length} decor -> ${before}`);
}

// =====================================================================
// PASS 3 — sanity audit vs baseline; report regressions
// =====================================================================
const after = auditTargets();
const regressions: string[] = [];
for (let i = 0; i < baseline.length; i++) {
  if (baseline[i].ok && !after[i].ok) regressions.push(baseline[i].label);
}
if (regressions.length > 0) {
  console.error('REACHABILITY REGRESSIONS (not writing map):');
  for (const r of regressions) console.error('  - ' + r);
  process.exit(1);
}

// ---- write ----
map.terrain = Buffer.from(terr).toString('base64');
map.objects.sort((a, b) => (a.y - b.y) || (a.x - b.x));
fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + '\n');

console.log('--- organic pass stats ---');
console.log(`terrain tiles dithered: ${dithered}`);
console.log(`scatter tiles (flowers/dirt): ${scattered}`);
console.log(`rooms decorated: ${roomsTouched} of ${rooms.length} floor regions`);
console.log(`decor objects placed/moved: ${moved}`);
console.log(`decor objects deleted: ${deleted}`);
console.log(`audit targets ok: ${after.filter(a => a.ok).length}/${after.length} (baseline ${baseline.filter(b => b.ok).length}/${baseline.length})`);
for (const n of roomNotes) console.log('  ' + n);
