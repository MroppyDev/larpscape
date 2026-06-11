// Viewport renderer — full 3D low-poly rewrite on three.js (Phase 4).
// All art is original, procedural, vertex-colored low-poly. No textures on world
// geometry (canvas-texture sprites are used only for hitsplats/health bars/orbs).
//
// Public API is unchanged from the 2D renderer:
//   TILE, camera, markTick(), render(), renderMinimap(), buildMinimapBase(),
//   screenToTile(sx, sy), minimapClickToTile(ev), entityPixel(e)
//
// Performance strategy:
//   - terrain (ground + walls + fences + bridge decks + flowers) merged into
//     chunk meshes (26x26 tiles), one shared Lambert material with vertexColors
//   - one model template per object type / NPC id, built once, cloned per instance
//   - overlay sprites pooled; canvas textures cached by content key
//   - distance culling tied to the fog falloff

import * as THREE from 'three';
import { state, Npc, level, Projectile, RemotePlayer } from './game';
import { terrain, objects, MAP_W, MAP_H, key, WorldObject, GroundItem } from './world';
import { TICK_MS, ITEMS } from './defs';

export const TILE = 26;

// Terrain codes — binding values from SPEC.
const TC = {
  GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5,
  SWAMP: 6, FENCE: 7, SAND: 8, DIRT: 9, FLOWERS: 10,
  CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16,
} as const;

// ---------------- tick interpolation ----------------
let lastTickAt = performance.now();
export function markTick() { lastTickAt = performance.now(); }
function tickAlpha(): number {
  return Math.min(1, (performance.now() - lastTickAt) / TICK_MS);
}
// Server-driven entities interpolate from their network update clock, not the
// local game tick — otherwise they stutter when the two 600ms loops drift apart.
function moveAlpha(e: { x: number; y: number; prevX: number; prevY: number; updatedAt?: number }, now: number): number {
  if (e.updatedAt === undefined) return tickAlpha();
  if (e.x === e.prevX && e.y === e.prevY) return 1;
  return Math.min(1, (now - e.updatedAt) / TICK_MS);
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export interface Camera { x: number; y: number; } // pixel coords of viewport centre (compat)
export const camera: Camera = { x: 0, y: 0 };

export function entityPixel(e: { x: number; y: number; prevX: number; prevY: number; updatedAt?: number }): { px: number; py: number } {
  const t = moveAlpha(e, performance.now());
  return {
    px: (lerp(e.prevX, e.x, t) + 0.5) * TILE,
    py: (lerp(e.prevY, e.y, t) + 0.5) * TILE,
  };
}

// ---------------- deterministic hashing ----------------
function hash2(x: number, y: number, salt = 0): number {
  let n = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  n = ((n ^ (n >>> 13)) * 1274126177) | 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

const tAt = (x: number, y: number): number =>
  (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) ? TC.GRASS : terrain[key(x, y)];

// ---------------- value noise (2-3 octaves) for organic terrain ----------------
function vnoise(x: number, y: number, salt: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = x - xi, v = y - yi;
  const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash2(xi, yi, salt), b = hash2(xi + 1, yi, salt);
  const c = hash2(xi, yi + 1, salt), d = hash2(xi + 1, yi + 1, salt);
  return lerp(lerp(a, b, su), lerp(c, d, su), sv);
}
// 3-octave fractal noise, normalized roughly to 0..1
function fbm(x: number, y: number, salt: number): number {
  return vnoise(x * 0.09, y * 0.09, salt) * 0.5
    + vnoise(x * 0.23, y * 0.23, salt + 100) * 0.32
    + vnoise(x * 0.57, y * 0.57, salt + 200) * 0.18;
}

// ================= HEIGHT FIELD =================
const WATER_FLOOR = -0.55;
const WATER_LEVEL = -0.18;
const BRIDGE_DECK = 0.12;
const WALL_H = 1.7;

let cornerH: Float32Array | null = null;
let cornerCol: Float32Array | null = null;   // blended per-corner ground colors (r,g,b)
let distLand: Float32Array | null = null;    // per-tile distance (in tiles) to nearest land — water depth tint

function cornerCandidate(t: number, cx: number, cy: number): number {
  switch (t) {
    case TC.WATER: case TC.BRIDGE: return WATER_FLOOR;
    case TC.LAVA: return -0.12;
    case TC.SWAMP: return -0.06 + fbm(cx, cy, 9) * 0.14;
    case TC.GRASS: case TC.FLOWERS: case TC.SAND: case TC.FENCE:
      return fbm(cx, cy, 9) * 0.34;
    case TC.ROCK: return fbm(cx, cy, 9) * 0.52;           // rugged mountain stone
    case TC.SNOW: return fbm(cx, cy, 9) * 0.42;
    case TC.ICE: return 0.02 + fbm(cx, cy, 9) * 0.07;     // glassy, near flat
    case TC.DSAND: return fbm(cx, cy, 19) * 0.3;          // rolling dunes
    default: return 0; // PATH / FLOOR / WALL / DIRT — flat (corners ease via min())
  }
}

// per-tile color contribution at a corner, with terrain-specific detail shading
function tileContrib(t: number, cx: number, cy: number, out: THREE.Color) {
  out.set(GROUND_COL[t] ?? GROUND_COL[TC.GRASS]);
  let f = 1;
  switch (t) {
    case TC.ROCK: f = 0.7 + fbm(cx, cy, 21) * 0.55; break;            // crevice shading
    case TC.DSAND: f = hash2(cx, cy, 22) > 0.86 ? 1.16 : 0.92 + hash2(cx, cy, 23) * 0.12; break; // dune speckle
    case TC.SNOW: f = 0.95 + fbm(cx, cy, 25) * 0.1; break;
    case TC.ICE: f = 1.0 + fbm(cx, cy, 26) * 0.12; break;
    case TC.GRASS: case TC.FLOWERS: case TC.SWAMP: {
      f = 0.86 + fbm(cx, cy, 24) * 0.26;
      if (t !== TC.SWAMP) {
        // low-frequency hue drift (+/-4%) so large fields aren't one uniform green
        const drift = (vnoise(cx * 0.022, cy * 0.022, 71) - 0.5) * 0.08;
        out.r *= 1 + drift * 1.6;
        out.g *= 1 + drift * 0.3;
        out.b *= 1 - drift * 1.2;
      }
      break;
    }
    case TC.SAND: f = 0.94 + fbm(cx, cy, 24) * 0.12; break;
  }
  out.multiplyScalar(f);
}

// corner color blend kernel: the 4 touching tiles at full weight, plus the
// surrounding 4x4 ring (diagonals included) at low weight for wider, softer
// terrain transitions
const BLEND_INNER: [number, number][] = [[-1, -1], [0, -1], [-1, 0], [0, 0]];
const BLEND_OUTER: [number, number][] = [
  [-2, -2], [-1, -2], [0, -2], [1, -2],
  [-2, -1], [1, -1], [-2, 0], [1, 0],
  [-2, 1], [-1, 1], [0, 1], [1, 1],
];
const BLEND_OUTER_W = 0.28;

function buildHeights() {
  cornerH = new Float32Array((MAP_W + 1) * (MAP_H + 1));
  cornerCol = new Float32Array((MAP_W + 1) * (MAP_H + 1) * 3);
  const tc = new THREE.Color();
  for (let cy = 0; cy <= MAP_H; cy++) {
    for (let cx = 0; cx <= MAP_W; cx++) {
      let h = Infinity;
      let r = 0, g = 0, b = 0, wSum = 0;
      for (const [ox, oy] of BLEND_INNER) {
        const t = tAt(cx + ox, cy + oy);
        h = Math.min(h, cornerCandidate(t, cx, cy));
        tileContrib(t, cx, cy, tc);
        r += tc.r; g += tc.g; b += tc.b; wSum += 1;
      }
      for (const [ox, oy] of BLEND_OUTER) {
        const t = tAt(cx + ox, cy + oy);
        if (t === TC.WALL) continue; // keep building edges crisp
        tileContrib(t, cx, cy, tc);
        r += tc.r * BLEND_OUTER_W; g += tc.g * BLEND_OUTER_W; b += tc.b * BLEND_OUTER_W;
        wSum += BLEND_OUTER_W;
      }
      const i = cy * (MAP_W + 1) + cx;
      cornerH[i] = h;
      cornerCol[i * 3] = r / wSum; cornerCol[i * 3 + 1] = g / wSum; cornerCol[i * 3 + 2] = b / wSum;
    }
  }
  // distance-to-land BFS (for water depth tint + shoreline foam)
  distLand = new Float32Array(MAP_W * MAP_H).fill(255);
  const qx: number[] = [], qy: number[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const t = tAt(x, y);
    if (t !== TC.WATER && t !== TC.BRIDGE) { distLand[y * MAP_W + x] = 0; qx.push(x); qy.push(y); }
  }
  for (let head = 0; head < qx.length; head++) {
    const x = qx[head], y = qy[head], d = distLand[y * MAP_W + x] + 1;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      if (distLand[ny * MAP_W + nx] > d) { distLand[ny * MAP_W + nx] = d; qx.push(nx); qy.push(ny); }
    }
  }
}

function cC(cx: number, cy: number, out: THREE.Color) {
  cx = Math.max(0, Math.min(MAP_W, cx)); cy = Math.max(0, Math.min(MAP_H, cy));
  const i = (cy * (MAP_W + 1) + cx) * 3;
  out.setRGB(cornerCol![i], cornerCol![i + 1], cornerCol![i + 2]);
}

// smoothed normal at a corner from the height-field gradient
function cN(cx: number, cy: number): [number, number, number] {
  const hx = cH(cx + 1, cy) - cH(cx - 1, cy);
  const hz = cH(cx, cy + 1) - cH(cx, cy - 1);
  const len = Math.hypot(hx / 2, 1, hz / 2);
  return [-hx / 2 / len, 1 / len, -hz / 2 / len];
}

function cH(cx: number, cy: number): number {
  if (!cornerH) return 0;
  cx = Math.max(0, Math.min(MAP_W, cx)); cy = Math.max(0, Math.min(MAP_H, cy));
  return cornerH[cy * (MAP_W + 1) + cx];
}

// ground height at a fractional world position (x east, z south, in tiles)
function groundH(fx: number, fz: number): number {
  const tx = Math.floor(fx), tz = Math.floor(fz);
  if (tAt(tx, tz) === TC.BRIDGE) return BRIDGE_DECK;
  const u = fx - tx, v = fz - tz;
  const h00 = cH(tx, tz), h10 = cH(tx + 1, tz), h01 = cH(tx, tz + 1), h11 = cH(tx + 1, tz + 1);
  return lerp(lerp(h00, h10, u), lerp(h01, h11, u), v);
}

// ================= COLOURS =================
const GROUND_COL: Record<number, string> = {
  [TC.GRASS]: '#4f7d38',
  [TC.WATER]: '#2c3c52',
  [TC.PATH]: '#9b8b67',
  [TC.FLOOR]: '#8d857a',
  [TC.WALL]: '#76736b',
  [TC.BRIDGE]: '#2c3c52',
  [TC.SWAMP]: '#4a5f31',
  [TC.FENCE]: '#4f7d38',
  [TC.SAND]: '#c2b083',
  [TC.DIRT]: '#6b4a2c',
  [TC.FLOWERS]: '#548140',
  [TC.CAVE]: '#3b3a40',   // dark grey cavern rock, flat + dim
  [TC.LAVA]: '#36180e',   // dark crust under the emissive molten surface
  [TC.ROCK]: '#75716a',   // mountain stone (crevice-shaded per corner)
  [TC.SNOW]: '#dde3e9',
  [TC.ICE]: '#a8cce0',    // glossy pale blue
  [TC.DSAND]: '#cfae6e',  // warm desert sand (dune speckle per corner)
};

function colMul(c: THREE.Color, f: number): [number, number, number] {
  return [Math.min(1, c.r * f), Math.min(1, c.g * f), Math.min(1, c.b * f)];
}

// ================= THREE SCENE STATE =================
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let cam3: THREE.PerspectiveCamera | null = null;
let sunLight: THREE.DirectionalLight | null = null;
let viewScale = 1;

// Called when scaled fixed mode rescales the client: bump the internal render
// resolution so the upscaled canvas stays crisp.
export function setViewportScale(s: number) {
  viewScale = s;
  if (renderer) {
    renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * viewScale, 3));
  }
}
let pickMeshes: THREE.Mesh[] = [];
let waterMesh: THREE.Mesh | null = null;
let waterBase: Float32Array | null = null;
let objectGroup: THREE.Group | null = null;
let entityGroup: THREE.Group | null = null;
let overlayGroup: THREE.Group | null = null;

const litMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
// emissive lava surface — animated by pulsing the material color multiplier (cheap, one uniform)
const lavaMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const rippleMat = new THREE.MeshBasicMaterial({
  color: 0xbfe0ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false,
});

// orbit camera state
let camYaw = 0, camPitch = 0.72, camDist = 11;
let yawT = 0, pitchT = 0.72, distT = 11;
const PITCH_MIN = 0.25, PITCH_MAX = 1.45, DIST_MIN = 4, DIST_MAX = 28;
const keysDown = new Set<string>();
let lastFrameAt = performance.now();
let inputBound = false;

// ================= MERGED GEOMETRY BUILDER =================
class GeoBuilder {
  pos: number[] = [];
  col: number[] = [];
  nrm: number[] = [];
  private seed = 7;
  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  private pushFaceNormal(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
      cx: number, cy: number, cz: number) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    this.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }

  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
      cx: number, cy: number, cz: number, c: THREE.Color, jit = 0) {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.pushFaceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
    const f = 1 + (this.rnd() - 0.5) * 2 * jit;
    const [r, g, b] = colMul(c, f);
    for (let i = 0; i < 3; i++) this.col.push(r, g, b);
  }

  // ground triangle: per-vertex blended colors + smoothed (height-gradient) normals
  groundTri(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
      cx: number, cy: number, cz: number,
      ca: THREE.Color, cb: THREE.Color, cc: THREE.Color,
      na: [number, number, number], nb: [number, number, number], nc: [number, number, number],
      jit = 0) {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.nrm.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    const f = 1 + (this.rnd() - 0.5) * 2 * jit;
    this.col.push(
      Math.min(1, ca.r * f), Math.min(1, ca.g * f), Math.min(1, ca.b * f),
      Math.min(1, cb.r * f), Math.min(1, cb.g * f), Math.min(1, cb.b * f),
      Math.min(1, cc.r * f), Math.min(1, cc.g * f), Math.min(1, cc.b * f),
    );
  }

  // axis-aligned box centred at (x, y+h/2, z)
  box(x: number, y: number, z: number, w: number, h: number, d: number, c: THREE.Color, jit = 0.05) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    const quad = (a: number[], b: number[], cc: number[], dd: number[]) => {
      this.tri(a[0], a[1], a[2], b[0], b[1], b[2], cc[0], cc[1], cc[2], c, jit);
      this.tri(a[0], a[1], a[2], cc[0], cc[1], cc[2], dd[0], dd[1], dd[2], c, jit);
    };
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); // front (+z)
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]); // back
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]); // left
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); // right
    quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); // top
    quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); // bottom
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    return g;
  }
}

// ================= TERRAIN CHUNKS =================
const CHUNK = 26;

function buildChunk(cx0: number, cy0: number, lavaGb: GeoBuilder): THREE.Mesh | null {
  const gb = new GeoBuilder();
  const stone = new THREE.Color('#8a877e');
  const stoneTop = new THREE.Color('#99968c');
  const fenceCol = new THREE.Color('#6b4a28');
  const plankA = new THREE.Color('#8a6a3e');
  const plankB = new THREE.Color('#7a5c34');

  const c00 = new THREE.Color(), c10 = new THREE.Color(), c01 = new THREE.Color(), c11 = new THREE.Color();
  const ragC = new THREE.Color();
  for (let y = cy0; y < Math.min(cy0 + CHUNK, MAP_H); y++) {
    for (let x = cx0; x < Math.min(cx0 + CHUNK, MAP_W); x++) {
      const t = tAt(x, y);
      // corner colors: blended average of the up-to-4 tile types meeting at each corner,
      // with the per-tile jitter kept on top so the grid melts away without going flat
      const f = 0.95 + hash2(x, y, 5) * 0.1;
      cC(x, y, c00); cC(x + 1, y, c10); cC(x, y + 1, c01); cC(x + 1, y + 1, c11);
      c00.multiplyScalar(f); c10.multiplyScalar(f); c01.multiplyScalar(f); c11.multiplyScalar(f);
      if (t === TC.PATH) {
        // ragged path edges: pull each corner toward a neighboring terrain color
        // by a hashed amount so the worn track has an irregular border
        const rag = (cnr: THREE.Color, cx2: number, cy2: number) => {
          for (const [ox, oy] of BLEND_INNER) {
            const nx = cx2 + ox, ny = cy2 + oy;
            if (nx === x && ny === y) continue;
            const nt = tAt(nx, ny);
            if (nt !== TC.PATH && nt !== TC.WALL && nt !== TC.WATER && nt !== TC.BRIDGE) {
              ragC.set(GROUND_COL[nt] ?? GROUND_COL[TC.GRASS]);
              cnr.lerp(ragC, hash2(cx2, cy2, 77) * 0.4);
              return;
            }
          }
        };
        rag(c00, x, y); rag(c10, x + 1, y); rag(c01, x, y + 1); rag(c11, x + 1, y + 1);
      }
      const h00 = cH(x, y), h10 = cH(x + 1, y), h01 = cH(x, y + 1), h11 = cH(x + 1, y + 1);
      const n00 = cN(x, y), n10 = cN(x + 1, y), n01 = cN(x, y + 1), n11 = cN(x + 1, y + 1);
      // two triangles, alternating diagonal for a less regular look
      if (hash2(x, y, 3) < 0.5) {
        gb.groundTri(x, h00, y, x, h01, y + 1, x + 1, h10, y, c00, c01, c10, n00, n01, n10, 0.035);
        gb.groundTri(x + 1, h10, y, x, h01, y + 1, x + 1, h11, y + 1, c10, c01, c11, n10, n01, n11, 0.035);
      } else {
        gb.groundTri(x, h00, y, x, h01, y + 1, x + 1, h11, y + 1, c00, c01, c11, n00, n01, n11, 0.035);
        gb.groundTri(x, h00, y, x + 1, h11, y + 1, x + 1, h10, y, c00, c11, c10, n00, n11, n10, 0.035);
      }

      if (t === TC.LAVA) {
        // molten surface — flat emissive quad floating over the dark crust
        const ly = -0.06;
        const lc = new THREE.Color(hash2(x, y, 70) < 0.5 ? '#ff7a1e' : '#ffae34');
        lavaGb.tri(x, ly, y, x, ly, y + 1, x + 1, ly, y, lc, 0.14);
        lavaGb.tri(x + 1, ly, y, x, ly, y + 1, x + 1, ly, y + 1, lc, 0.14);
      }

      if (t === TC.WALL) {
        const sc = stone.clone().multiplyScalar(0.92 + hash2(x, y, 6) * 0.14);
        // subtle per-tile height variation so long walls don't read as one slab
        const wh = WALL_H + (hash2(x, y, 64) - 0.5) * 0.06;
        gb.box(x + 0.5, 0, y + 0.5, 1, wh, 1, sc, 0.07);
        // lighter stone top cap/trim
        gb.box(x + 0.5, wh, y + 0.5, 1.04, 0.12, 1.04,
          stoneTop.clone().multiplyScalar(0.96 + hash2(x, y, 65) * 0.1), 0.06);
      } else if (t === TC.FENCE) {
        const gh = (h00 + h10 + h01 + h11) / 4;
        gb.box(x + 0.5, gh, y + 0.5, 0.09, 0.62, 0.09, fenceCol, 0.08);
        if (tAt(x + 1, y) === TC.FENCE) {
          gb.box(x + 1, gh + 0.42, y + 0.5, 1, 0.06, 0.05, fenceCol, 0.08);
          gb.box(x + 1, gh + 0.2, y + 0.5, 1, 0.06, 0.05, fenceCol, 0.08);
        }
        if (tAt(x, y + 1) === TC.FENCE) {
          gb.box(x + 0.5, gh + 0.42, y + 1, 0.05, 0.06, 1, fenceCol, 0.08);
          gb.box(x + 0.5, gh + 0.2, y + 1, 0.05, 0.06, 1, fenceCol, 0.08);
        }
      } else if (t === TC.BRIDGE) {
        // plank deck
        for (let i = 0; i < 3; i++) {
          const pc = (i + x + y) % 2 === 0 ? plankA : plankB;
          gb.box(x + 0.5, BRIDGE_DECK - 0.07, y + 1 / 6 + i / 3, 1.0, 0.07, 0.3,
            pc.clone().multiplyScalar(0.94 + hash2(x, y, 30 + i) * 0.12), 0.04);
        }
        // side rails where the bridge meets water
        if (tAt(x, y - 1) === TC.WATER) {
          gb.box(x + 0.2, BRIDGE_DECK, y + 0.06, 0.08, 0.42, 0.08, fenceCol, 0.06);
          gb.box(x + 0.8, BRIDGE_DECK, y + 0.06, 0.08, 0.42, 0.08, fenceCol, 0.06);
          gb.box(x + 0.5, BRIDGE_DECK + 0.34, y + 0.06, 1, 0.06, 0.06, fenceCol, 0.06);
        }
        if (tAt(x, y + 1) === TC.WATER) {
          gb.box(x + 0.2, BRIDGE_DECK, y + 0.94, 0.08, 0.42, 0.08, fenceCol, 0.06);
          gb.box(x + 0.8, BRIDGE_DECK, y + 0.94, 0.08, 0.42, 0.08, fenceCol, 0.06);
          gb.box(x + 0.5, BRIDGE_DECK + 0.34, y + 0.94, 1, 0.06, 0.06, fenceCol, 0.06);
        }
        if (tAt(x - 1, y) === TC.WATER) {
          gb.box(x + 0.06, BRIDGE_DECK, y + 0.2, 0.08, 0.42, 0.08, fenceCol, 0.06);
          gb.box(x + 0.06, BRIDGE_DECK, y + 0.8, 0.08, 0.42, 0.08, fenceCol, 0.06);
          gb.box(x + 0.06, BRIDGE_DECK + 0.34, y + 0.5, 0.06, 0.06, 1, fenceCol, 0.06);
        }
        if (tAt(x + 1, y) === TC.WATER) {
          gb.box(x + 0.94, BRIDGE_DECK, y + 0.2, 0.08, 0.42, 0.08, fenceCol, 0.06);
          gb.box(x + 0.94, BRIDGE_DECK, y + 0.8, 0.08, 0.42, 0.08, fenceCol, 0.06);
          gb.box(x + 0.94, BRIDGE_DECK + 0.34, y + 0.5, 0.06, 0.06, 1, fenceCol, 0.06);
        }
      } else if (t === TC.FLOWERS) {
        // tiny meadow flowers merged into the chunk
        const n = 1 + Math.floor(hash2(x, y, 40) * 3);
        const petal = ['#d878a0', '#e8d860', '#e0e4ea', '#b070d8'];
        for (let i = 0; i < n; i++) {
          const fx = x + 0.15 + hash2(x, y, 41 + i) * 0.7;
          const fz = y + 0.15 + hash2(x, y, 51 + i) * 0.7;
          const gy = groundH(fx, fz);
          gb.box(fx, gy, fz, 0.03, 0.16, 0.03, new THREE.Color('#3f6a2c'), 0.05);
          gb.box(fx, gy + 0.16, fz, 0.09, 0.07, 0.09,
            new THREE.Color(petal[Math.floor(hash2(x, y, 61 + i) * petal.length)]), 0.08);
        }
      }
    }
  }

  if (gb.pos.length === 0) return null;
  const mesh = new THREE.Mesh(gb.build(), litMat);
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = true;    // walls/fences throw shadows
  mesh.receiveShadow = true; // ground catches entity/object shadows
  return mesh;
}

// ================= MODEL TEMPLATES =================
const geoCache = new Map<string, THREE.BufferGeometry>();

function coloredGeo(kind: string, make: () => THREE.BufferGeometry, color: string, facet = 0.06): THREE.BufferGeometry {
  const k = `${kind}|${color}|${facet}`;
  let g = geoCache.get(k);
  if (g) return g;
  const src = make();
  g = src.index ? src.toNonIndexed() : src;
  if (g !== src) src.dispose();
  const p = g.getAttribute('position');
  const base = new THREE.Color(color);
  const cols = new Float32Array(p.count * 3);
  let s = 13 + k.length * 31;
  for (let i = 0; i < p.count; i += 3) {
    s = (s * 16807) % 2147483647;
    const f = 1 + ((s / 2147483647) - 0.5) * 2 * facet;
    const [r, gg, b] = colMul(base, f);
    for (let kk = 0; kk < 3; kk++) {
      cols[(i + kk) * 3] = r; cols[(i + kk) * 3 + 1] = gg; cols[(i + kk) * 3 + 2] = b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  geoCache.set(k, g);
  return g;
}

const boxG = (w: number, h: number, d: number, col: string, facet = 0.06) =>
  coloredGeo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d), col, facet);
const cylG = (rt: number, rb: number, h: number, col: string, seg = 6, facet = 0.06) =>
  coloredGeo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg), col, facet);
const coneG = (r: number, h: number, col: string, seg = 6, facet = 0.06) =>
  coloredGeo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg), col, facet);
const icoG = (r: number, col: string, detail = 0, facet = 0.08) =>
  coloredGeo(`i${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail), col, facet);
const tetraG = (r: number, col: string, facet = 0.08) =>
  coloredGeo(`t${r}`, () => new THREE.TetrahedronGeometry(r), col, facet);
const torusG = (r: number, tube: number, col: string) =>
  coloredGeo(`o${r},${tube}`, () => new THREE.TorusGeometry(r, tube, 5, 10), col, 0.05);
const ringG = (ri: number, ro: number, col: string) =>
  coloredGeo(`r${ri},${ro}`, () => new THREE.RingGeometry(ri, ro, 14), col, 0);
// Rounded low-poly primitives — faceted enough to read as classic low-poly,
// but no more cubes for organic shapes (heads, limbs, torsos).
const sphG = (r: number, col: string, w = 7, h = 5, facet = 0.06) =>
  coloredGeo(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, w, h), col, facet);
const capG = (r: number, len: number, col: string, facet = 0.06) =>
  coloredGeo(`p${r},${len}`, () => new THREE.CapsuleGeometry(r, len, 2, 6), col, facet);
const domeG = (r: number, col: string, facet = 0.06) =>
  coloredGeo(`d${r}`, () => new THREE.SphereGeometry(r, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), col, facet);

function lm(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, litMat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function gm(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, glowMat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
}

const ORE_FACET: Record<string, string> = {
  rocks_copper: '#b56a32', rocks_tin: '#c9c9ce', rocks_iron: '#8a4a38',
  rocks_coal: '#26262c', rocks_essence: '#d9d4ea',
  rocks_mithril: '#5a78c8', rocks_adamantite: '#2e7a4a',
  rocks_gold: '#e0b03a', rocks_runite: '#39c8d0', rocks_gem: '#b070d8',
};

function buildRocks(type: string): THREE.Group {
  const g = new THREE.Group();
  const rock = '#6f6c64';
  g.add(lm(icoG(0.3, rock), 0, 0.18, 0.05));
  g.add(lm(icoG(0.21, rock), -0.28, 0.13, -0.16));
  g.add(lm(icoG(0.17, rock), 0.26, 0.11, -0.22));
  const ore = ORE_FACET[type];
  if (ore) {
    g.add(lm(tetraG(0.1, ore), 0.04, 0.4, 0.08, 0.4, 0.7));
    g.add(lm(tetraG(0.08, ore), -0.26, 0.26, -0.1, 0.9, 0.2));
    g.add(lm(tetraG(0.07, ore), 0.27, 0.22, -0.18, 0.2, 1.6));
    if (type === 'rocks_essence') g.add(gm(tetraG(0.07, '#cfe4ff'), 0, 0.46, 0.06, 0.5, 0.8));
    if (type === 'rocks_mithril') {
      // cool blue glints
      g.add(gm(tetraG(0.06, '#9ab8ff'), -0.04, 0.44, 0.12, 0.3, 1.1));
      g.add(gm(tetraG(0.045, '#7a9cf0'), 0.24, 0.3, -0.12, 1.1, 0.5));
    }
    if (type === 'rocks_adamantite') {
      // deep green glints
      g.add(gm(tetraG(0.06, '#58d890'), 0.05, 0.44, -0.04, 0.8, 0.4));
      g.add(gm(tetraG(0.045, '#38b070'), -0.25, 0.3, 0.1, 0.4, 1.3));
    }
    if (type === 'rocks_gold') {
      // warm gleaming glints
      g.add(gm(tetraG(0.06, '#ffd860'), -0.02, 0.45, 0.1, 0.5, 0.9));
      g.add(gm(tetraG(0.045, '#f0b838'), 0.25, 0.28, -0.14, 1.0, 0.3));
    }
    if (type === 'rocks_runite') {
      // cyan glints
      g.add(gm(tetraG(0.06, '#6ae8f0'), 0.02, 0.45, -0.02, 0.7, 0.5));
      g.add(gm(tetraG(0.045, '#3ac0d0'), -0.26, 0.28, 0.12, 0.3, 1.2));
    }
    if (type === 'rocks_gem') {
      // multicolor sparkle (animated via fx)
      const gems = ['#5a8aff', '#48d878', '#e85060'];
      for (let i = 0; i < 3; i++) {
        const sp = gm(tetraG(0.055, gems[i]), -0.2 + i * 0.2, 0.4 + (i % 2) * 0.08, 0.1 - i * 0.12, i, i * 1.7);
        sp.name = 'fxflame';
        g.add(sp);
      }
    }
  }
  return g;
}

type TreeKind = 'tree' | 'oak' | 'willow' | 'maple' | 'yew' | 'magic_tree';

// generic leafy tree: leaning trunk + 3-5 offset canopy blobs in varied tones
function leafyTree(g: THREE.Group, trunkCol: string, trunkR: number, trunkH: number,
    canopy: string[], blobR: number, lean = 0.08, seed = 1) {
  const lz = (hash2(seed, 1) - 0.5) * 2 * lean;
  const lx = (hash2(seed, 2) - 0.5) * 2 * lean;
  const tr = lm(cylG(trunkR * 0.7, trunkR, trunkH, trunkCol), 0, trunkH / 2, 0, lx, 0, lz);
  g.add(tr);
  const topX = Math.sin(-lz) * trunkH * 0.5, topZ = Math.sin(lx) * trunkH * 0.5;
  const blobs = 3 + Math.floor(hash2(seed, 3) * 3); // 3-5
  g.add(lm(icoG(blobR, canopy[0], 0), topX, trunkH + blobR * 0.5, topZ));
  for (let i = 1; i < blobs; i++) {
    const a = hash2(seed, 4 + i) * Math.PI * 2;
    const rr = blobR * (0.55 + hash2(seed, 14 + i) * 0.25);
    g.add(lm(icoG(rr, canopy[i % canopy.length], 0),
      topX + Math.cos(a) * blobR * 0.62,
      trunkH + blobR * 0.5 + (hash2(seed, 24 + i) - 0.3) * blobR * 0.7,
      topZ + Math.sin(a) * blobR * 0.62));
  }
}

function buildTree(kind: TreeKind): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'tree') {
    leafyTree(g, '#6b4a2c', 0.14, 0.95, ['#2e5a22', '#3a6c2a', '#28511e', '#447434'], 0.4, 0.1, 11);
  } else if (kind === 'oak') {
    leafyTree(g, '#5e4023', 0.22, 1.1, ['#2c5520', '#386528', '#28501d', '#41702f'], 0.55, 0.07, 23);
  } else if (kind === 'maple') {
    // orange-tinged canopy
    leafyTree(g, '#6a4426', 0.17, 1.05, ['#9a6224', '#b0742a', '#7e5520', '#c08434'], 0.48, 0.09, 37);
  } else if (kind === 'yew') {
    // dark, dense, low and wide
    leafyTree(g, '#4a3420', 0.24, 0.85, ['#1c3818', '#234420', '#162e13', '#28501e'], 0.6, 0.05, 41);
    g.add(lm(icoG(0.34, '#1a3416', 0), 0, 0.7, 0.42));
    g.add(lm(icoG(0.3, '#214020', 0), -0.4, 0.66, -0.3));
  } else if (kind === 'magic_tree') {
    leafyTree(g, '#4e4258', 0.16, 1.15, ['#2c5a4e', '#34766a', '#284e58', '#3a8a7a'], 0.46, 0.08, 53);
    // faint sparkling aura
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const sp = gm(tetraG(0.05, i % 2 ? '#9ae8ff' : '#d8a8ff'),
        Math.cos(a) * 0.62, 1.35 + hash2(i, 61) * 0.6, Math.sin(a) * 0.62, i, i * 2);
      sp.name = 'fxflame';
      g.add(sp);
    }
  } else {
    // weeping willow: leaning trunk, canopy, drooping fronds
    g.add(lm(cylG(0.1, 0.16, 1.15, '#5a4a30'), 0.06, 0.56, 0, 0, 0, -0.12));
    g.add(lm(icoG(0.46, '#3f6a35', 0), 0.1, 1.4, 0));
    g.add(lm(icoG(0.3, '#48783c', 0), 0.34, 1.24, 0.18));
    g.add(lm(icoG(0.27, '#38622e', 0), -0.16, 1.3, -0.22));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(lm(coneG(0.09, 0.85, '#46763a'), 0.1 + Math.cos(a) * 0.42, 1.05, Math.sin(a) * 0.42, Math.PI, 0, 0));
    }
  }
  return g;
}

function buildFlameInto(g: THREE.Group, x: number, y: number, z: number, scale = 1) {
  const outer = gm(coneG(0.2 * scale, 0.5 * scale, '#ff8c28', 6, 0.12), x, y + 0.25 * scale, z);
  outer.name = 'fxflame';
  const inner = gm(coneG(0.1 * scale, 0.32 * scale, '#ffd24a', 6, 0.1), x, y + 0.18 * scale, z);
  inner.name = 'fxflame';
  g.add(outer, inner);
}

// drifting smoke puffs rising from fires/furnaces/chimneys; animated in the
// per-object fx loop (rise, swell, fade, loop)
function buildSmokeInto(g: THREE.Group, x: number, y: number, z: number, scale = 1) {
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: '#55504a', transparent: true, opacity: 0.45, depthWrite: false });
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 * scale, 0), mat);
    m.name = `fxsmoke${i}`;
    m.userData.smokeBase = { x, y, z, scale };
    m.position.set(x, y, z);
    g.add(m);
  }
}

function buildRipplesInto(g: THREE.Group, y: number) {
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(ringG(0.16 + i * 0.02, 0.2 + i * 0.02, '#ffffff'), rippleMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y + 0.02 + i * 0.012;
    m.name = `fxripple${i}`;
    g.add(m);
  }
}

function buildFarmingPatch(stage: string): THREE.Group {
  const g = new THREE.Group();
  const soil = '#5d3f24';
  const ridged = stage !== 'bare';
  const rows = ridged ? 4 : 3;
  for (let i = 0; i < rows; i++) {
    const z = -0.36 + (i / (rows - 1)) * 0.72;
    g.add(lm(boxG(0.92, ridged ? 0.09 : 0.05, 0.16, ridged ? '#6b4a2c' : soil), 0, 0.02, z));
  }
  if (stage === 'seedling') {
    for (let i = 0; i < 4; i++) {
      g.add(lm(tetraG(0.06, '#4f8f33'), -0.3 + i * 0.2, 0.14, -0.36 + (i % 4) * 0.24, 0.4, i));
    }
  } else if (stage === 'grown') {
    g.add(lm(icoG(0.2, '#3f7a2e', 0), -0.22, 0.2, -0.18));
    g.add(lm(icoG(0.23, '#458434', 0), 0.2, 0.22, 0.1));
    g.add(lm(icoG(0.18, '#3a7029', 0), -0.05, 0.18, 0.32));
  }
  return g;
}

function buildSnare(caught: boolean): THREE.Group {
  const g = new THREE.Group();
  const stick = '#8a6a40';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const m = lm(cylG(0.015, 0.02, 0.45, stick, 4), Math.cos(a) * 0.13, 0.2, Math.sin(a) * 0.13);
    m.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    g.add(m);
  }
  g.add(lm(torusG(0.16, 0.015, stick), 0, 0.07, 0, -Math.PI / 2));
  if (caught) {
    g.add(lm(icoG(0.1, '#9a7448', 0), 0, 0.12, 0));
    g.add(lm(icoG(0.06, '#8a6840', 0), 0.1, 0.2, 0));
    g.add(lm(tetraG(0.035, '#d8a020'), 0.17, 0.2, 0, 0, 0, -1.2));
  }
  return g;
}

function buildObjectTemplate(rkey: string): THREE.Group {
  const g = new THREE.Group();
  switch (rkey) {
    case 'tree': return buildTree('tree');
    case 'oak': return buildTree('oak');
    case 'willow': return buildTree('willow');
    case 'maple': return buildTree('maple');
    case 'yew': return buildTree('yew');
    case 'magic_tree': return buildTree('magic_tree');
    case 'stump':
      g.add(lm(cylG(0.16, 0.2, 0.26, '#7a5a36'), 0, 0.13, 0));
      g.add(lm(cylG(0.14, 0.14, 0.03, '#a9885c'), 0, 0.27, 0));
      return g;
    case 'rocks_copper': case 'rocks_tin': case 'rocks_iron':
    case 'rocks_coal': case 'rocks_essence': case 'rocks_empty':
    case 'rocks_mithril': case 'rocks_adamantite':
    case 'rocks_gold': case 'rocks_runite': case 'rocks_gem':
      return buildRocks(rkey);
    case 'fishing_spot':
      buildRipplesInto(g, 0); return g;
    case 'rod_fishing_spot':
      buildRipplesInto(g, 0);
      g.add(lm(cylG(0.014, 0.02, 0.7, '#8a6a40', 4), 0.2, 0.3, 0.1, 0, 0, -0.5));
      return g;
    case 'range': {
      g.add(lm(boxG(0.9, 0.62, 0.78, '#5d5a55', 0.07), 0, 0.31, 0));
      g.add(lm(boxG(0.96, 0.1, 0.84, '#2e2c29'), 0, 0.67, 0));
      g.add(lm(boxG(0.5, 0.36, 0.04, '#46403a'), 0, 0.18, 0.38));
      const rGlow = gm(boxG(0.38, 0.24, 0.05, '#ff7a20', 0.1), 0, 0.18, 0.41);
      rGlow.name = 'fxflame';
      g.add(rGlow);
      buildFlameInto(g, 0, 0.7, 0, 0.55);
      buildSmokeInto(g, 0, 1.0, 0, 0.8);
      return g;
    }
    case 'bank_booth':
      g.add(lm(boxG(0.95, 0.72, 0.6, '#6e5232'), 0, 0.36, 0));
      g.add(lm(boxG(1.02, 0.07, 0.68, '#8f6c42'), 0, 0.72, 0));
      g.add(lm(boxG(1.02, 0.05, 0.68, '#d8b84a'), 0, 0.5, 0));
      for (let i = 0; i < 5; i++) g.add(lm(boxG(0.035, 0.6, 0.035, '#b9b9c2'), -0.36 + i * 0.18, 1.06, 0));
      g.add(lm(boxG(1.0, 0.06, 0.06, '#6e5232'), 0, 1.36, 0));
      return g;
    case 'fire':
      g.add(lm(cylG(0.05, 0.06, 0.5, '#5e4023', 5), 0, 0.07, 0, 0, 0, Math.PI / 2));
      g.add(lm(cylG(0.05, 0.06, 0.5, '#54381e', 5), 0, 0.07, 0, Math.PI / 2, 0.6, 0));
      buildFlameInto(g, 0, 0.08, 0, 1);
      buildSmokeInto(g, 0, 0.55, 0, 1);
      return g;
    case 'furnace':
    {
      g.add(lm(boxG(0.92, 1.0, 0.92, '#6c655c', 0.08), 0, 0.5, 0));
      g.add(lm(cylG(0.18, 0.3, 0.55, '#5d574e'), 0, 1.25, 0));
      g.add(lm(boxG(0.46, 0.42, 0.04, '#46403a'), 0, 0.18, 0.45));
      const fGlow = gm(boxG(0.34, 0.3, 0.06, '#ff6a18', 0.12), 0, 0.2, 0.47);
      fGlow.name = 'fxflame';
      g.add(fGlow);
      buildSmokeInto(g, 0, 1.55, 0, 0.9);
      return g;
    }
    case 'anvil':
      g.add(lm(boxG(0.46, 0.22, 0.4, '#4a4a50'), 0, 0.11, 0));
      g.add(lm(boxG(0.24, 0.18, 0.22, '#54545c'), 0, 0.31, 0));
      g.add(lm(boxG(0.62, 0.13, 0.28, '#73737c'), 0.04, 0.46, 0));
      g.add(lm(coneG(0.1, 0.3, '#73737c', 5), 0.44, 0.52, 0, 0, 0, -Math.PI / 2));
      return g;
    case 'spinning_wheel': {
      g.add(lm(boxG(0.7, 0.07, 0.34, '#7a5a36'), 0, 0.26, 0));
      g.add(lm(boxG(0.07, 0.26, 0.07, '#6b4a2c'), -0.25, 0, 0.1));
      g.add(lm(boxG(0.07, 0.26, 0.07, '#6b4a2c'), 0.25, 0, 0.1));
      g.add(lm(boxG(0.07, 0.26, 0.07, '#6b4a2c'), 0, 0, -0.12));
      const wheel = lm(torusG(0.28, 0.035, '#8a6a40'), -0.12, 0.62, 0);
      g.add(wheel);
      g.add(lm(boxG(0.05, 0.34, 0.05, '#6b4a2c'), -0.12, 0.3, 0));
      g.add(lm(boxG(0.5, 0.04, 0.04, '#9a7a4c'), -0.12, 0.62, 0));
      g.add(lm(boxG(0.04, 0.5, 0.04, '#9a7a4c'), -0.12, 0.37, 0));
      g.add(lm(cylG(0.05, 0.06, 0.2, '#d8d0c0', 6), 0.24, 0.4, 0, 0, 0, Math.PI / 2));
      return g;
    }
    case 'altar':
      g.add(lm(boxG(1.05, 0.22, 0.62, '#85827a', 0.06), 0, 0.11, 0));
      g.add(lm(boxG(0.9, 0.34, 0.5, '#8d8a82', 0.06), 0, 0.33, 0));
      g.add(lm(boxG(1.0, 0.1, 0.58, '#9c9890'), 0, 0.67, 0));
      g.add(gm(boxG(0.05, 0.12, 0.05, '#ffd870'), -0.3, 0.77, 0));
      g.add(gm(boxG(0.05, 0.16, 0.05, '#ffd870'), 0.32, 0.77, 0.06));
      return g;
    case 'air_altar': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const m = lm(boxG(0.26, 1.15, 0.2, '#9a96a4', 0.08), Math.cos(a) * 0.85, 0.55, Math.sin(a) * 0.85);
        m.rotation.set((hash2(i, 3) - 0.5) * 0.16, a + Math.PI / 2, (hash2(i, 7) - 0.5) * 0.16);
        g.add(m);
      }
      g.add(lm(cylG(0.4, 0.46, 0.18, '#8e8a98', 7), 0, 0.09, 0));
      const rune = gm(tetraG(0.12, '#cfe4ff'), 0, 0.4, 0, 0.6, 0.4);
      rune.name = 'fxflame';
      g.add(rune);
      return g;
    }
    case 'bake_stall': {
      g.add(lm(boxG(1.0, 0.6, 0.8, '#7a5a36'), 0, 0.3, 0));
      g.add(lm(boxG(1.06, 0.07, 0.86, '#9a7a4c'), 0, 0.6, 0));
      for (const [px, pz] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) {
        g.add(lm(boxG(0.06, 1.25, 0.06, '#6b4a2c'), px, 0.62, pz));
      }
      g.add(lm(boxG(1.2, 0.05, 0.5, '#b0402e'), 0, 1.3, -0.25, -0.22));
      g.add(lm(boxG(1.2, 0.05, 0.5, '#d8d0c0'), 0, 1.19, 0.22, -0.22));
      g.add(lm(boxG(0.22, 0.12, 0.14, '#b8803c'), -0.2, 0.7, 0.1, 0, 0.4));
      g.add(lm(boxG(0.2, 0.11, 0.13, '#c08a42'), 0.18, 0.7, -0.08, 0, -0.3));
      return g;
    }
    case 'workbench':
      g.add(lm(boxG(1.0, 0.08, 0.6, '#8a6a3e'), 0, 0.5, 0));
      for (const [px, pz] of [[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]]) {
        g.add(lm(boxG(0.08, 0.5, 0.08, '#6b4a2c'), px, 0.25, pz));
      }
      g.add(lm(boxG(0.26, 0.14, 0.18, '#5e4023'), 0.22, 0.61, 0.05));
      g.add(lm(boxG(0.3, 0.05, 0.1, '#9a9aa4'), -0.2, 0.57, -0.08, 0, 0.5));
      return g;
    case 'flax_plant':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const px = Math.cos(a) * 0.12, pz = Math.sin(a) * 0.12;
        g.add(lm(cylG(0.012, 0.018, 0.45, '#5d8a3a', 4), px, 0.22, pz, (hash2(i, 11) - 0.5) * 0.3, 0, (hash2(i, 12) - 0.5) * 0.3));
        g.add(lm(tetraG(0.04, '#5a78c8'), px, 0.46, pz, i, i * 2));
      }
      return g;
    case 'farming_patch': return buildFarmingPatch('bare');
    case 'farming_patch:raked': return buildFarmingPatch('raked');
    case 'farming_patch:seedling': return buildFarmingPatch('seedling');
    case 'farming_patch:grown': return buildFarmingPatch('grown');
    case 'agility_log':
      g.add(lm(cylG(0.14, 0.16, 1.5, '#6b4a2c', 6), 0, 0.1, 0, Math.PI / 2, 0, 0));
      g.add(lm(cylG(0.13, 0.13, 0.04, '#a9885c', 6), 0, 0.1, -0.76, Math.PI / 2, 0, 0));
      return g;
    case 'agility_rope':
      g.add(lm(boxG(0.1, 1.9, 0.1, '#6b4a2c'), -0.5, 0.95, 0));
      g.add(lm(boxG(0.1, 1.9, 0.1, '#6b4a2c'), 0.5, 0.95, 0));
      g.add(lm(boxG(1.15, 0.09, 0.09, '#7a5a36'), 0, 1.86, 0));
      g.add(lm(cylG(0.02, 0.02, 1.1, '#bca878', 4), 0, 1.3, 0));
      g.add(lm(icoG(0.05, '#bca878', 0), 0, 0.76, 0));
      return g;
    case 'agility_wall':
      g.add(lm(boxG(1.0, 1.7, 0.2, '#85827a', 0.07), 0, 0.85, 0));
      g.add(lm(boxG(1.06, 0.1, 0.26, '#99968c'), 0, 1.72, 0));
      for (let i = 0; i < 4; i++) {
        g.add(lm(boxG(0.14, 0.06, 0.08, '#a8a49a'), (i % 2 === 0 ? -0.2 : 0.22), 0.3 + i * 0.36, 0.13));
      }
      return g;
    case 'agility_ledge':
      g.add(lm(boxG(0.28, 0.32, 0.5, '#7a766e'), 0, 0.16, -0.55));
      g.add(lm(boxG(0.28, 0.32, 0.5, '#7a766e'), 0, 0.16, 0.55));
      g.add(lm(boxG(0.24, 0.08, 1.5, '#8a6a3e'), 0, 0.36, 0));
      return g;
    case 'snare_set': return buildSnare(false);
    case 'snare_caught': return buildSnare(true);
    case 'slot_machine': {
      g.add(lm(boxG(0.7, 1.1, 0.5, '#6a1a3a'), 0, 0.55, 0));
      g.add(lm(boxG(0.62, 0.42, 0.42, '#1a1410'), 0, 0.92, 0.08));
      for (let i = 0; i < 3; i++) {
        g.add(lm(boxG(0.14, 0.18, 0.04, '#2a2418'), -0.2 + i * 0.2, 0.92, 0.12));
        g.add(lm(boxG(0.1, 0.12, 0.02, '#f5d800'), -0.2 + i * 0.2, 0.96, 0.14));
      }
      g.add(lm(boxG(0.12, 0.08, 0.18, '#c8a020'), 0.28, 0.35, 0.22));
      return g;
    }
    case 'blackjack_table': {
      g.add(lm(cylG(0.55, 0.58, 0.72, '#2a6a2a', 12), 0, 0.36, 0));
      g.add(lm(cylG(0.58, 0.6, 0.06, '#1a4a1a', 12), 0, 0.74, 0));
      g.add(lm(boxG(0.08, 0.7, 0.08, '#6b4a2c'), -0.42, 0.35, 0.42));
      g.add(lm(boxG(0.08, 0.7, 0.08, '#6b4a2c'), 0.42, 0.35, -0.42));
      return g;
    }
    case 'roulette_table': {
      g.add(lm(boxG(1.0, 0.72, 0.7, '#2a6a2a'), 0, 0.36, 0));
      g.add(lm(cylG(0.22, 0.24, 0.08, '#8a2020', 16), 0, 0.78, 0));
      g.add(lm(cylG(0.08, 0.08, 0.14, '#d8b84a', 8), 0, 0.86, 0));
      return g;
    }
    case 'coinflip_pedestal': {
      g.add(lm(cylG(0.28, 0.34, 0.5, '#8a7a5c', 8), 0, 0.25, 0));
      g.add(lm(cylG(0.2, 0.22, 0.06, '#c8a020', 12), 0, 0.53, 0));
      g.add(lm(cylG(0.14, 0.14, 0.03, '#f5d800', 12), 0, 0.58, 0));
      return g;
    }
    case 'hedon_bar': {
      g.add(lm(boxG(1.2, 0.9, 0.6, '#6b4a2c'), 0, 0.45, 0));
      g.add(lm(boxG(1.3, 0.1, 0.7, '#8a2020'), 0, 0.95, 0));
      for (let i = 0; i < 4; i++) g.add(lm(cylG(0.04, 0.04, 0.35, '#e8c040', 6), -0.4 + i * 0.26, 1.12, 0));
      return g;
    }
    case 'dance_floor': {
      g.add(lm(boxG(1.4, 0.06, 1.4, '#2a1a4a', 0.02), 0, 0.03, 0));
      const cols = ['#e04040', '#e8a020', '#f5d800', '#40c040', '#4080e8', '#c040e0'];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(lm(boxG(0.18, 0.08, 0.18, cols[i]), Math.cos(a) * 0.35, 0.08, Math.sin(a) * 0.35));
      }
      return g;
    }
    case 'hot_tub': {
      g.add(lm(cylG(0.55, 0.6, 0.45, '#8a7a5c', 10), 0, 0.22, 0));
      g.add(lm(cylG(0.45, 0.5, 0.08, '#60a8d8', 10), 0, 0.48, 0));
      for (let i = 0; i < 5; i++) {
        const px = -0.2 + hash2(i, 91) * 0.4, pz = -0.2 + hash2(i, 92) * 0.4;
        g.add(lm(icoG(0.03, '#bfe0ff', 0), px, 0.54, pz));
      }
      return g;
    }
    case 'disco_ball': {
      g.add(lm(cylG(0.02, 0.02, 0.5, '#4a4a4a', 4), 0, 1.0, 0));
      const ball = gm(icoG(0.22, '#c0c8d8', 1), 0, 0.75, 0);
      ball.name = 'fxflame';
      g.add(ball);
      return g;
    }
    case 'rainbow_banner': {
      const stripes = ['#e04040', '#e8a020', '#f5d800', '#40c040', '#4080e8', '#c040e0'];
      for (let i = 0; i < stripes.length; i++) {
        g.add(lm(boxG(0.08, 0.7, 0.5, stripes[i]), 0, 0.5 + i * 0.11, 0));
      }
      g.add(lm(boxG(0.12, 0.12, 0.12, '#6b4a2c'), 0, 1.1, 0));
      return g;
    }
    case 'pride_fountain': {
      g.add(lm(cylG(0.5, 0.55, 0.2, '#9c9890', 9), 0, 0.1, 0));
      g.add(lm(cylG(0.4, 0.44, 0.05, '#4080e8', 9), 0, 0.22, 0));
      g.add(lm(cylG(0.1, 0.14, 0.45, '#9c9890', 7), 0, 0.42, 0));
      const jet = gm(coneG(0.06, 0.35, '#e8c8ff', 6, 0.1), 0, 0.72, 0);
      jet.name = 'fxflame';
      g.add(jet);
      buildRipplesInto(g, 0.2);
      return g;
    }
    case 'pride_stage': {
      g.add(lm(boxG(1.3, 0.35, 0.9, '#5a4a3a'), 0, 0.17, 0));
      g.add(lm(boxG(1.2, 0.08, 0.8, '#c040e0'), 0, 0.38, 0));
      g.add(lm(boxG(0.1, 1.2, 0.1, '#4a3a2a'), -0.55, 0.85, 0));
      g.add(lm(boxG(0.1, 1.2, 0.1, '#4a3a2a'), 0.55, 0.85, 0));
      g.add(lm(boxG(1.3, 0.1, 0.15, '#2a2418'), 0, 1.45, 0));
      return g;
    }
    case 'larp_pride_sign': {
      g.add(lm(boxG(0.12, 1.0, 0.12, '#6b4a2c'), 0, 0.5, 0));
      g.add(lm(boxG(0.9, 0.55, 0.06, '#1a1410'), 0, 1.05, 0));
      g.add(lm(boxG(0.7, 0.08, 0.02, '#c040e0'), 0, 1.32, 0));
      return g;
    }
    case 'larp_campfire': {
      g.add(lm(cylG(0.35, 0.4, 0.08, '#4a3a2a', 8), 0, 0.04, 0));
      const fire = gm(coneG(0.2, 0.35, '#e86020', 6, 0.1), 0, 0.28, 0);
      fire.name = 'fxflame';
      g.add(fire);
      for (let i = 0; i < 3; i++) g.add(lm(cylG(0.04, 0.04, 0.25, '#5a4a3a', 5), -0.2 + i * 0.2, 0.12, 0.15));
      return g;
    }
    case 'foam_weapon_rack': {
      g.add(lm(boxG(0.12, 0.9, 0.5, '#6b4a2c'), -0.35, 0.45, 0));
      g.add(lm(boxG(0.12, 0.9, 0.5, '#6b4a2c'), 0.35, 0.45, 0));
      g.add(lm(boxG(0.75, 0.08, 0.35, '#8a7a5c'), 0, 0.92, 0));
      for (let i = 0; i < 4; i++) g.add(lm(boxG(0.06, 0.55, 0.06, '#e040a0'), -0.28 + i * 0.18, 0.65, 0.08));
      return g;
    }
    case 'monkey_totem': {
      g.add(lm(cylG(0.28, 0.32, 0.5, '#1a1410', 8), 0, 0.25, 0));
      g.add(lm(icoG(0.18, '#3a3028', 8), 0, 0.62, 0));
      g.add(lm(boxG(0.35, 0.06, 0.02, '#c040e0'), 0.2, 0.85, 0));
      return g;
    }
    case 'black_pride_banner': {
      g.add(lm(boxG(0.1, 1.1, 0.08, '#6b4a2c'), 0, 0.55, 0));
      g.add(lm(boxG(0.55, 0.7, 0.04, '#1a1410'), 0, 0.75, 0));
      g.add(lm(boxG(0.5, 0.06, 0.02, '#c040e0'), 0, 1.08, 0));
      return g;
    }
    case 'chimperton_throne': {
      g.add(lm(boxG(0.7, 0.45, 0.55, '#8a6020'), 0, 0.22, 0));
      g.add(lm(boxG(0.75, 0.55, 0.1, '#d8a020'), 0, 0.52, 0));
      g.add(lm(boxG(0.12, 0.7, 0.12, '#6b4a2c'), -0.38, 0.35, 0));
      g.add(lm(boxG(0.12, 0.7, 0.12, '#6b4a2c'), 0.38, 0.35, 0));
      return g;
    }
    case 'chimperton_statue': {
      g.add(lm(boxG(0.5, 0.15, 0.5, '#6b5a4a'), 0, 0.07, 0));
      g.add(lm(cylG(0.14, 0.16, 0.55, '#9a7a50', 8), 0, 0.42, 0));
      g.add(lm(icoG(0.14, '#9a7a50', 8), 0, 0.78, 0));
      g.add(lm(cylG(0.06, 0.08, 0.22, '#d8a020', 6), 0.12, 0.55, 0.1));
      return g;
    }
    case 'chimperton_plaque': {
      g.add(lm(boxG(0.7, 0.5, 0.08, '#8a7a5c'), 0, 0.25, 0));
      g.add(lm(boxG(0.12, 0.6, 0.12, '#6b4a2c'), 0, 0.55, 0));
      g.add(lm(boxG(0.55, 0.35, 0.04, '#d8a020'), 0, 0.72, 0));
      return g;
    }
    case 'golden_banana_pedestal': {
      g.add(lm(boxG(0.45, 0.35, 0.45, '#6b5a4a'), 0, 0.17, 0));
      g.add(lm(cylG(0.22, 0.26, 0.12, '#b0c8d8', 10), 0, 0.42, 0));
      g.add(lm(cylG(0.08, 0.1, 0.28, '#d8a020', 6), 0.05, 0.58, 0));
      return g;
    }
    case 'dentist_chair': {
      g.add(lm(boxG(0.55, 0.35, 0.75, '#c8c0b8'), 0, 0.17, 0));
      g.add(lm(boxG(0.5, 0.45, 0.08, '#a8a098'), 0, 0.42, 0));
      g.add(lm(cylG(0.04, 0.04, 0.55, '#8a8a90', 5), -0.28, 0.55, 0.3));
      g.add(lm(cylG(0.04, 0.04, 0.55, '#8a8a90', 5), 0.28, 0.55, 0.3));
      return g;
    }
    case 'tick_aquarium': {
      g.add(lm(boxG(0.65, 0.45, 0.45, '#6b5a4a'), 0, 0.22, 0));
      g.add(lm(boxG(0.55, 0.35, 0.06, '#90c8e8'), 0, 0.52, 0));
      for (let i = 0; i < 4; i++) {
        const tx = -0.15 + hash2(i, 44) * 0.3, tz = -0.12 + hash2(i, 45) * 0.24;
        g.add(lm(icoG(0.04, '#2a2018', 6), tx, 0.48 + hash2(i, 46) * 0.08, tz));
      }
      return g;
    }
    case 'dental_lamp': {
      g.add(lm(cylG(0.04, 0.04, 0.9, '#8a8a90', 5), 0, 0.45, 0));
      g.add(lm(cylG(0.18, 0.22, 0.08, '#e8f0f8', 10), 0, 0.92, 0));
      const bulb = gm(icoG(0.1, '#f8f8ff', 8), 0, 0.98, 0);
      bulb.name = 'fxflame';
      g.add(bulb);
      return g;
    }
    case 'tick_nest': {
      g.add(lm(cylG(0.32, 0.38, 0.12, '#5a4a30', 8), 0, 0.06, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(lm(icoG(0.05, '#3a2818', 6), Math.cos(a) * 0.15, 0.14, Math.sin(a) * 0.15));
      }
      return g;
    }
    case 'ge_booth': {
      // grand gilded exchange booth
      g.add(lm(boxG(1.1, 0.78, 0.7, '#6e5232'), 0, 0.39, 0));               // counter
      g.add(lm(boxG(1.2, 0.08, 0.8, '#d8b84a'), 0, 0.82, 0));               // gilded countertop
      g.add(lm(boxG(1.16, 0.06, 0.76, '#d8b84a'), 0, 0.28, 0));             // gilded skirting band
      for (const px of [-0.52, 0.52]) g.add(lm(boxG(0.08, 1.7, 0.08, '#8f6c42'), px, 0.85, 0));
      for (let i = 0; i < 4; i++) g.add(lm(boxG(0.035, 0.55, 0.035, '#b9b9c2'), -0.33 + i * 0.22, 1.14, 0));
      g.add(lm(boxG(1.34, 0.1, 0.92, '#b08828'), 0, 1.7, 0));               // canopy
      g.add(lm(boxG(1.02, 0.26, 0.72, '#d8b84a'), 0, 1.88, 0));             // gilded crest
      const finial = gm(tetraG(0.09, '#ffe27a'), 0, 2.1, 0, 0.5, 0.6);      // gleaming finial
      g.add(finial);
      return g;
    }
    case 'fountain': {
      g.add(lm(cylG(0.62, 0.7, 0.22, '#8d8a82', 9), 0, 0.11, 0));           // basin wall
      g.add(lm(cylG(0.52, 0.56, 0.05, '#36598c', 9), 0, 0.23, 0));          // pooled water
      g.add(lm(cylG(0.11, 0.16, 0.5, '#85827a', 7), 0, 0.47, 0));           // column
      g.add(lm(cylG(0.3, 0.34, 0.08, '#9c9890', 8), 0, 0.74, 0));           // upper bowl
      g.add(lm(cylG(0.24, 0.27, 0.04, '#36598c', 8), 0, 0.79, 0));          // upper water
      const jet = gm(coneG(0.05, 0.32, '#bfe0ff', 6, 0.1), 0, 0.96, 0);
      jet.name = 'fxflame';                                                 // shimmering jet
      g.add(jet);
      buildRipplesInto(g, 0.24);                                            // animated water ring
      return g;
    }
    case 'stalagmite':
      g.add(lm(coneG(0.18, 0.95, '#55525c', 6, 0.1), 0, 0.47, 0));
      g.add(lm(coneG(0.11, 0.55, '#615e68', 5, 0.1), 0.2, 0.27, 0.13));
      g.add(lm(coneG(0.09, 0.4, '#4c4954', 5, 0.1), -0.21, 0.2, -0.14));
      return g;
    case 'cave_mouth': {
      // dark arch: rough pillars, lintel, and a void within
      g.add(lm(boxG(0.36, 1.3, 0.5, '#55525c', 0.09), -0.46, 0.65, 0));
      g.add(lm(boxG(0.36, 1.3, 0.5, '#55525c', 0.09), 0.46, 0.65, 0));
      g.add(lm(boxG(1.36, 0.34, 0.56, '#615e68', 0.09), 0, 1.42, 0));
      g.add(lm(icoG(0.2, '#4c4954', 0), -0.55, 1.32, 0.12));
      g.add(lm(icoG(0.17, '#4c4954', 0), 0.55, 1.3, -0.1));
      g.add(gm(boxG(0.56, 1.26, 0.4, '#08060a', 0), 0, 0.63, 0));           // black interior void
      return g;
    }
    // ---- Phase 6 deco ----
    case 'bush':
      g.add(lm(icoG(0.3, '#33602a', 0), 0, 0.22, 0));
      g.add(lm(icoG(0.22, '#3e7032', 0), 0.22, 0.18, 0.1));
      g.add(lm(icoG(0.19, '#2c5424', 0), -0.2, 0.16, -0.12));
      return g;
    case 'fern':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        g.add(lm(coneG(0.05, 0.42, i % 2 ? '#3f7a34' : '#356a2c', 4),
          Math.cos(a) * 0.14, 0.18, Math.sin(a) * 0.14, Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7));
      }
      return g;
    case 'boulder_small':
      g.add(lm(icoG(0.24, '#7a766c'), 0, 0.14, 0));
      g.add(lm(icoG(0.15, '#6e6a60'), 0.2, 0.09, -0.1));
      return g;
    case 'mushroom_patch':
      for (let i = 0; i < 4; i++) {
        const px = -0.22 + hash2(i, 71) * 0.45, pz = -0.2 + hash2(i, 72) * 0.42;
        const hh = 0.09 + hash2(i, 73) * 0.08;
        g.add(lm(cylG(0.022, 0.03, hh, '#e0d8c4', 5), px, hh / 2, pz));
        g.add(lm(coneG(0.07 + hash2(i, 74) * 0.04, 0.07, i % 2 ? '#b04838' : '#c2643c', 6), px, hh + 0.03, pz));
      }
      return g;
    case 'reeds':
      for (let i = 0; i < 7; i++) {
        const px = -0.2 + hash2(i, 81) * 0.4, pz = -0.2 + hash2(i, 82) * 0.4;
        const hh = 0.5 + hash2(i, 83) * 0.3;
        g.add(lm(cylG(0.012, 0.018, hh, '#6a7a3a', 4), px, hh / 2 - 0.1, pz, (hash2(i, 84) - 0.5) * 0.25, 0, (hash2(i, 85) - 0.5) * 0.25));
        if (i % 2 === 0) g.add(lm(cylG(0.028, 0.028, 0.1, '#6b4a2c', 5), px, hh - 0.12, pz));
      }
      return g;
    case 'lilypad':
      g.add(lm(cylG(0.2, 0.2, 0.02, '#3e7a34', 7), 0, WATER_LEVEL + 0.04, 0));
      g.add(lm(cylG(0.13, 0.13, 0.025, '#4a8a3e', 6), 0.24, WATER_LEVEL + 0.04, 0.14));
      g.add(lm(tetraG(0.045, '#e8c8e0'), 0.02, WATER_LEVEL + 0.1, -0.02, 0.4, 0.7));
      return g;
    case 'driftwood':
      g.add(lm(cylG(0.07, 0.1, 0.95, '#9a8a72', 5), 0, 0.08, 0, Math.PI / 2, 0, 0.25));
      g.add(lm(cylG(0.03, 0.045, 0.4, '#8a7a64', 4), 0.12, 0.13, 0.2, Math.PI / 2.4, 0.6, 0));
      return g;
    case 'barrel':
      g.add(lm(cylG(0.2, 0.23, 0.52, '#7a5a36', 8), 0, 0.26, 0));
      g.add(lm(cylG(0.245, 0.245, 0.04, '#55534e', 9), 0, 0.12, 0));
      g.add(lm(cylG(0.245, 0.245, 0.04, '#55534e', 9), 0, 0.4, 0));
      g.add(lm(cylG(0.21, 0.21, 0.025, '#8a6a40', 8), 0, 0.53, 0));
      return g;
    case 'crate':
      g.add(lm(boxG(0.5, 0.5, 0.5, '#8a6a3e'), 0, 0.25, 0));
      g.add(lm(boxG(0.54, 0.06, 0.54, '#6b4a2c'), 0, 0.07, 0));
      g.add(lm(boxG(0.54, 0.06, 0.54, '#6b4a2c'), 0, 0.43, 0));
      return g;
    case 'cactus': {
      // saguaro-style: tall trunk + two raised arms
      const cg = '#4a7a3e';
      g.add(lm(cylG(0.12, 0.14, 1.15, cg, 7), 0, 0.57, 0));
      g.add(lm(cylG(0.13, 0.13, 0.06, '#54864a', 7), 0, 1.16, 0));
      g.add(lm(cylG(0.07, 0.08, 0.32, cg, 6), -0.26, 0.62, 0, 0, 0, Math.PI / 2)); // left elbow
      g.add(lm(cylG(0.07, 0.08, 0.42, cg, 6), -0.38, 0.84, 0));                    // left arm up
      g.add(lm(cylG(0.06, 0.07, 0.26, cg, 6), 0.23, 0.78, 0.02, 0, 0, -Math.PI / 2));
      g.add(lm(cylG(0.06, 0.07, 0.34, cg, 6), 0.33, 0.96, 0.02));
      return g;
    }
    case 'ice_spike':
      g.add(lm(coneG(0.18, 1.1, '#bfe0f4', 6, 0.1), 0, 0.55, 0));
      g.add(lm(coneG(0.1, 0.6, '#a8d0ec', 5, 0.1), 0.2, 0.3, 0.12));
      g.add(lm(coneG(0.08, 0.42, '#d4ecfa', 5, 0.1), -0.2, 0.21, -0.13));
      return g;
    case 'snow_pine': {
      // conifer with snow-dusted tiers
      g.add(lm(cylG(0.08, 0.12, 0.5, '#4a3826'), 0, 0.25, 0));
      const tiers = [[0.5, 0.55, 0.52], [0.4, 0.5, 0.92], [0.28, 0.44, 1.3]];
      for (const [r, h, y] of tiers) {
        g.add(lm(coneG(r, h, '#27452c', 7), 0, y + h / 2, 0));
        g.add(lm(coneG(r * 0.82, h * 0.4, '#e2eaf0', 7), 0, y + h * 0.78, 0));
      }
      g.add(lm(coneG(0.1, 0.22, '#e8f0f6', 6), 0, 1.78, 0));
      return g;
    }
    case 'dead_tree_deco': case 'dead_tree':
      g.add(lm(cylG(0.08, 0.14, 1.0, '#54483c', 6), 0, 0.5, 0, 0, 0, 0.07));
      g.add(lm(cylG(0.03, 0.05, 0.6, '#4a4036', 4), -0.18, 1.15, 0, 0, 0, 0.7));
      g.add(lm(cylG(0.025, 0.045, 0.5, '#4a4036', 4), 0.16, 1.05, 0.08, 0.3, 0, -0.8));
      g.add(lm(cylG(0.02, 0.035, 0.35, '#44382e', 4), 0.02, 1.3, -0.06, -0.4, 0, 0.15));
      return g;
    // ---- Phase 6 mountain agility (frost-styled course pieces) ----
    case 'ice_ledge':
      g.add(lm(boxG(0.28, 0.32, 0.5, '#9ec4dc'), 0, 0.16, -0.55));
      g.add(lm(boxG(0.28, 0.32, 0.5, '#9ec4dc'), 0, 0.16, 0.55));
      g.add(lm(boxG(0.24, 0.08, 1.5, '#cfe6f4', 0.08), 0, 0.36, 0));
      g.add(lm(coneG(0.06, 0.22, '#bfe0f4', 5), -0.2, 0.11, 0));
      return g;
    case 'rope_bridge':
      g.add(lm(boxG(0.1, 0.9, 0.1, '#5a4630'), -0.62, 0.45, -0.6));
      g.add(lm(boxG(0.1, 0.9, 0.1, '#5a4630'), 0.62, 0.45, -0.6));
      g.add(lm(boxG(0.1, 0.9, 0.1, '#5a4630'), -0.62, 0.45, 0.6));
      g.add(lm(boxG(0.1, 0.9, 0.1, '#5a4630'), 0.62, 0.45, 0.6));
      for (let i = 0; i < 5; i++) {
        g.add(lm(boxG(1.1, 0.05, 0.18, i % 2 ? '#7a5c38' : '#6b4e2e'), 0, 0.2 + Math.sin((i / 4) * Math.PI) * -0.06, -0.5 + i * 0.25));
      }
      g.add(lm(cylG(0.018, 0.018, 1.25, '#bca878', 4), -0.62, 0.78, 0, Math.PI / 2, 0, 0));
      g.add(lm(cylG(0.018, 0.018, 1.25, '#bca878', 4), 0.62, 0.78, 0, Math.PI / 2, 0, 0));
      return g;
    case 'rock_climb':
      g.add(lm(boxG(1.0, 1.6, 0.36, '#6e6a62', 0.1), 0, 0.8, 0));
      g.add(lm(icoG(0.22, '#7a766c'), -0.34, 1.52, 0.04));
      g.add(lm(icoG(0.18, '#65615a'), 0.36, 1.46, -0.04));
      for (let i = 0; i < 4; i++) {
        g.add(lm(boxG(0.16, 0.07, 0.1, '#8a867c'), (i % 2 === 0 ? -0.2 : 0.24), 0.28 + i * 0.36, 0.21));
      }
      return g;
    case 'snow_slope':
      g.add(lm(boxG(0.9, 0.1, 1.5, '#e6edf3', 0.05), 0, 0.42, 0, -0.5));
      g.add(lm(boxG(0.95, 0.34, 0.5, '#cdd9e2', 0.06), 0, 0.6, -0.6));
      g.add(lm(icoG(0.14, '#bfcdd8'), -0.36, 0.1, 0.6));
      g.add(lm(icoG(0.12, '#d4dfe8'), 0.38, 0.08, 0.55));
      return g;
    // ---- Phase 6 fire altar (ember-toned stone circle) ----
    case 'fire_altar': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const m = lm(boxG(0.26, 1.15, 0.2, '#6a5048', 0.08), Math.cos(a) * 0.85, 0.55, Math.sin(a) * 0.85);
        m.rotation.set((hash2(i, 3) - 0.5) * 0.16, a + Math.PI / 2, (hash2(i, 7) - 0.5) * 0.16);
        g.add(m);
      }
      g.add(lm(cylG(0.4, 0.46, 0.18, '#5e4a42', 7), 0, 0.09, 0));
      const rune = gm(tetraG(0.12, '#ff9a3a'), 0, 0.4, 0, 0.6, 0.4);
      rune.name = 'fxflame';
      g.add(rune);
      buildFlameInto(g, 0, 0.16, 0, 0.45);
      buildSmokeInto(g, 0, 0.55, 0, 0.7);
      return g;
    }
    case 'gem_stall': {
      g.add(lm(boxG(1.0, 0.6, 0.8, '#5a4a6a'), 0, 0.3, 0));
      g.add(lm(boxG(1.06, 0.07, 0.86, '#7a6a8a'), 0, 0.6, 0));
      for (const [px, pz] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) {
        g.add(lm(boxG(0.06, 1.25, 0.06, '#4a3c58'), px, 0.62, pz));
      }
      g.add(lm(boxG(1.2, 0.05, 0.5, '#6a3a8a'), 0, 1.3, -0.25, -0.22));
      g.add(lm(boxG(1.2, 0.05, 0.5, '#d8cce8'), 0, 1.19, 0.22, -0.22));
      // glittering gems on the counter
      const gems = ['#5a8aff', '#48d878', '#e85060'];
      for (let i = 0; i < 3; i++) {
        const sp = gm(tetraG(0.06, gems[i]), -0.24 + i * 0.24, 0.7, 0.06 - (i % 2) * 0.14, i, i * 1.3);
        sp.name = 'fxflame';
        g.add(sp);
      }
      return g;
    }
    // ---- interior furniture ----
    case 'chair': {
      g.add(lm(boxG(0.38, 0.06, 0.38, '#8a6a3e'), 0, 0.42, 0));
      g.add(lm(boxG(0.36, 0.08, 0.06, '#7a5a30'), 0, 0.48, -0.16));
      for (const [px, pz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]] as const) {
        g.add(lm(boxG(0.05, 0.42, 0.05, '#6b4a28'), px, 0.21, pz));
      }
      return g;
    }
    case 'table':
      g.add(lm(boxG(0.9, 0.08, 0.6, '#6b4a2c'), 0, 0.72, 0));
      for (const [px, pz] of [[-0.36, -0.22], [0.36, -0.22], [-0.36, 0.22], [0.36, 0.22]] as const) {
        g.add(lm(boxG(0.07, 0.68, 0.07, '#5a3a20'), px, 0.34, pz));
      }
      return g;
    case 'bed':
      g.add(lm(boxG(0.55, 0.28, 1.05, '#5a4030'), 0, 0.14, 0));
      g.add(lm(boxG(0.5, 0.12, 0.95, '#c8b898'), 0, 0.34, 0));
      g.add(lm(boxG(0.52, 0.22, 0.12, '#d8d0c0'), 0, 0.5, -0.46));
      return g;
    case 'bookshelf':
      g.add(lm(boxG(0.85, 1.35, 0.28, '#6b4a2c'), 0, 0.67, 0));
      for (let i = 0; i < 4; i++) {
        g.add(lm(boxG(0.78, 0.04, 0.24, '#5a3a20'), 0, 0.18 + i * 0.32, 0));
        const colors = ['#8a4030', '#304878', '#486838', '#785838'];
        g.add(lm(boxG(0.12, 0.18, 0.18, colors[i % 4]), -0.22 + (i % 2) * 0.44, 0.28 + i * 0.32, 0.02));
        g.add(lm(boxG(0.1, 0.16, 0.16, colors[(i + 1) % 4]), 0.08, 0.3 + i * 0.32, 0.02));
      }
      return g;
    case 'banner':
      g.add(lm(cylG(0.025, 0.025, 1.5, '#5a4630', 4), 0, 0.75, 0));
      g.add(lm(boxG(0.55, 0.7, 0.04, '#c83848'), 0.28, 1.05, 0, 0, 0, -0.12));
      g.add(lm(boxG(0.55, 0.7, 0.04, '#3868b8'), 0.28, 1.05, 0.04, 0, 0, -0.12));
      g.add(lm(boxG(0.55, 0.7, 0.04, '#d8b838'), 0.28, 1.05, -0.04, 0, 0, -0.12));
      return g;
    case 'rug_deco':
      g.add(lm(boxG(0.95, 0.03, 0.65, '#8a4038'), 0, 0.015, 0));
      g.add(lm(boxG(0.75, 0.025, 0.45, '#b85848'), 0, 0.03, 0));
      g.add(lm(boxG(0.35, 0.02, 0.35, '#d8c878'), 0, 0.035, 0));
      return g;
    case 'cauldron':
      g.add(lm(cylG(0.32, 0.38, 0.42, '#2a2828', 8), 0, 0.21, 0));
      g.add(lm(cylG(0.28, 0.3, 0.06, '#1a1818', 8), 0, 0.45, 0));
      g.add(lm(cylG(0.04, 0.04, 0.12, '#3a3838', 4), -0.28, 0.06, 0.22));
      g.add(lm(cylG(0.04, 0.04, 0.12, '#3a3838', 4), 0.28, 0.06, -0.22));
      return g;
    case 'hay_bale':
      g.add(lm(cylG(0.38, 0.42, 0.55, '#c8a848', 8), 0, 0.27, 0, Math.PI / 2, 0, 0));
      g.add(lm(cylG(0.36, 0.4, 0.04, '#b89838', 8), 0, 0.52, 0, Math.PI / 2, 0, 0));
      g.add(lm(cylG(0.36, 0.4, 0.04, '#b89838', 8), 0, 0.02, 0, Math.PI / 2, 0, 0));
      return g;
    case 'lamp_post':
      g.add(lm(cylG(0.05, 0.06, 1.35, '#3a3838', 6), 0, 0.67, 0));
      g.add(lm(boxG(0.22, 0.06, 0.22, '#2a2828'), 0, 0.03, 0));
      g.add(lm(boxG(0.18, 0.14, 0.18, '#484848'), 0, 1.42, 0));
      g.add(lm(boxG(0.1, 0.08, 0.1, '#ffe878'), 0, 1.36, 0));
      return g;
    case 'weapon_rack':
      g.add(lm(boxG(0.12, 0.85, 0.55, '#5a4030'), -0.28, 0.42, 0));
      g.add(lm(boxG(0.12, 0.85, 0.55, '#5a4030'), 0.28, 0.42, 0));
      g.add(lm(boxG(0.75, 0.08, 0.12, '#6a5038'), 0, 0.88, 0));
      g.add(lm(boxG(0.04, 0.55, 0.04, '#787878'), -0.18, 0.62, 0.08, 0.15, 0, 0.2));
      g.add(lm(boxG(0.04, 0.55, 0.04, '#787878'), 0.18, 0.62, -0.08, -0.15, 0, -0.2));
      g.add(lm(boxG(0.03, 0.48, 0.03, '#686868'), 0, 0.58, 0, 0, 0, 0.35));
      return g;
    // ---- the Untuned Mine (dungeon objects) ----
    case 'rocks_ringing': {
      // ore pile with sour glowing seams — the dungeon's mineable veins
      const rock = '#5e5a64';
      g.add(lm(icoG(0.3, rock), 0, 0.18, 0.05));
      g.add(lm(icoG(0.21, rock), -0.28, 0.13, -0.16));
      g.add(lm(icoG(0.17, rock), 0.26, 0.11, -0.22));
      g.add(lm(tetraG(0.1, '#7a4a8a'), 0.04, 0.4, 0.08, 0.4, 0.7));
      g.add(gm(tetraG(0.07, '#d98aff'), -0.24, 0.28, -0.08, 0.9, 0.2));
      g.add(gm(tetraG(0.06, '#b86adf'), 0.26, 0.24, -0.16, 0.2, 1.6));
      const seam = gm(boxG(0.5, 0.025, 0.03, '#c47ae8'), 0, 0.26, 0.18, 0, 0, 0.3);
      seam.name = 'fxflame';
      g.add(seam);
      return g;
    }
    case 'crystal_node': {
      // sour crystal cluster — glowing dungeon deco
      g.add(lm(icoG(0.2, '#4a4652'), 0, 0.1, 0));
      g.add(gm(coneG(0.12, 0.62, '#c47ae8', 5), 0, 0.38, 0, 0.12, 0, 0.08));
      g.add(gm(coneG(0.08, 0.4, '#9a5ad2', 5), 0.18, 0.26, -0.08, 0.05, 0, -0.4));
      g.add(gm(coneG(0.07, 0.34, '#e0a8ff', 5), -0.17, 0.24, 0.1, -0.1, 0, 0.45));
      return g;
    }
    case 'mine_ladder': {
      const wood = '#6a5230';
      g.add(lm(boxG(0.08, 1.6, 0.08, wood), -0.22, 0.8, 0));
      g.add(lm(boxG(0.08, 1.6, 0.08, wood), 0.22, 0.8, 0));
      for (let i = 0; i < 5; i++) g.add(lm(boxG(0.42, 0.06, 0.06, '#7a6038'), 0, 0.22 + i * 0.3, 0));
      // shaft collar
      g.add(lm(boxG(0.7, 0.1, 0.7, '#4e4a44'), 0, 0.05, 0));
      return g;
    }
    case 'mine_rope': {
      // knotted rope dropping into a dark shaft
      g.add(lm(boxG(0.74, 0.12, 0.74, '#4e4a44'), 0, 0.06, 0));
      g.add(lm(cylG(0.035, 0.035, 1.5, '#8a7448', 6), 0, 0.85, 0));
      for (let i = 0; i < 3; i++) g.add(lm(sphG(0.06, '#7a6438'), 0, 0.4 + i * 0.42, 0));
      g.add(lm(boxG(0.5, 0.08, 0.08, '#6a5230'), 0, 1.6, 0)); // cross-beam
      return g;
    }
    case 'mine_exit_portal': {
      // folded daylight in a stone arch — the way back out
      const stone = '#5a564e';
      g.add(lm(boxG(0.18, 1.3, 0.3, stone), -0.4, 0.65, 0));
      g.add(lm(boxG(0.18, 1.3, 0.3, stone), 0.4, 0.65, 0));
      g.add(lm(boxG(1.0, 0.2, 0.3, stone), 0, 1.36, 0));
      const light = gm(boxG(0.62, 1.1, 0.06, '#ffeebb'), 0, 0.62, 0);
      light.name = 'fxflame';
      g.add(light);
      return g;
    }
    case 'mine_plaque': {
      // Brigh's slate of record on a timber post
      g.add(lm(boxG(0.1, 0.7, 0.1, '#6a5230'), 0, 0.35, 0));
      g.add(lm(boxG(0.8, 0.55, 0.07, '#46424c'), 0, 0.85, 0));
      g.add(lm(boxG(0.66, 0.04, 0.075, '#b8b4ac'), 0, 1.0, 0.0));
      g.add(lm(boxG(0.5, 0.03, 0.075, '#9a968e'), 0, 0.9, 0));
      g.add(lm(boxG(0.56, 0.03, 0.075, '#9a968e'), 0, 0.8, 0));
      g.add(lm(boxG(0.44, 0.03, 0.075, '#9a968e'), 0, 0.7, 0));
      return g;
    }
    case 'resonance_stand': {
      // a music stand of black stone, far older than the mine (Ch4)
      const black = '#26222c';
      g.add(lm(cylG(0.2, 0.26, 0.12, black, 7), 0, 0.06, 0));
      g.add(lm(cylG(0.05, 0.07, 0.7, black, 6), 0, 0.45, 0));
      const desk = lm(boxG(0.56, 0.4, 0.05, '#322c3c'), 0, 0.95, 0, -0.5);
      g.add(desk);
      g.add(gm(boxG(0.5, 0.02, 0.02, '#c47ae8'), 0, 1.08, -0.08, -0.5));
      return g;
    }
    case 'conductors_lectern': {
      // travelling lectern draped in pale temple silk (Ch4)
      g.add(lm(boxG(0.5, 0.1, 0.4, '#3a3430'), 0, 0.05, 0));
      g.add(lm(boxG(0.14, 0.8, 0.14, '#4a4238'), 0, 0.45, 0));
      const top = lm(boxG(0.6, 0.05, 0.42, '#564c40'), 0, 0.9, 0, -0.35);
      g.add(top);
      // pale silk drape
      g.add(lm(boxG(0.56, 0.5, 0.04, '#e8e2d2'), 0, 0.62, 0.12, -0.12));
      g.add(lm(boxG(0.5, 0.03, 0.36, '#f4f0e4'), 0, 0.94, 0.01, -0.35));
      return g;
    }
    default:
      // unknown object: a humble marker crate so nothing is invisible
      g.add(lm(boxG(0.5, 0.5, 0.5, '#8a7a5a'), 0, 0.25, 0));
      return g;
  }
}

// ---- instance variation: ~4 precomputed hue/value variants per template ----
// (geometry color attributes are cloned once per variant, never per instance)
const N_VARIANTS = 4;
const variantGeoCache = new Map<string, THREE.BufferGeometry>();

function variantGeo(src: THREE.BufferGeometry, v: number, salt: number): THREE.BufferGeometry {
  const k = `${src.uuid}|${v}`;
  let g = variantGeoCache.get(k);
  if (g) return g;
  g = src.clone();
  const col = g.getAttribute('color');
  if (col) {
    // small seeded hue/value jitter: per-channel multipliers around 1
    const fr = 0.9 + hash2(v, salt, 1) * 0.2;
    const fg = 0.9 + hash2(v, salt, 2) * 0.2;
    const fb = 0.9 + hash2(v, salt, 3) * 0.2;
    const arr = (col.array as Float32Array).slice();
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = Math.min(1, arr[i] * fr);
      arr[i + 1] = Math.min(1, arr[i + 1] * fg);
      arr[i + 2] = Math.min(1, arr[i + 2] * fb);
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  variantGeoCache.set(k, g);
  return g;
}

const objTemplates = new Map<string, THREE.Group[]>();
function objTemplate(rkey: string, variant = 0): THREE.Group {
  let arr = objTemplates.get(rkey);
  if (!arr) {
    const base = buildObjectTemplate(rkey);
    let salt = 17;
    for (let i = 0; i < rkey.length; i++) salt = (salt * 31 + rkey.charCodeAt(i)) | 0;
    arr = [base];
    for (let v = 1; v < N_VARIANTS; v++) {
      const clone = base.clone();
      clone.traverse((ch) => {
        const m = ch as THREE.Mesh;
        if (m.isMesh && m.geometry) m.geometry = variantGeo(m.geometry as THREE.BufferGeometry, v, salt);
      });
      arr.push(clone);
    }
    objTemplates.set(rkey, arr);
  }
  return arr[Math.abs(variant) % N_VARIANTS];
}

// natural objects get the full 0.8-1.2 scale + rotation spread; built things stay tidy
const NATURAL_RE = /^(tree|oak|willow|maple|yew|magic_tree|stump|rocks_|boulder|bush|fern|mushroom|reeds|lilypad|driftwood|cactus|ice_spike|snow_pine|dead_tree|stalagmite|flax_plant)/;

// ================= FIGURES (entities) =================
interface Limbs { la: THREE.Group; ra: THREE.Group; ll: THREE.Group; rl: THREE.Group; }
interface FigureData { limbs: Limbs | null; bob: THREE.Object3D; seed: number; yaw: number; quad: boolean; }

function limbGroup(mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(mesh);
  return g;
}

interface HumanOpts {
  skin?: string; hair?: string; tunic?: string; pants?: string;
  helm?: string; bodyArmor?: string; legArmor?: string;
  hat?: 'wizard' | 'straw' | 'cook'; hatCol?: string;
  apron?: string; eyepatch?: boolean; beard?: string;
  weapon?: 'sword' | 'scimitar' | 'axe' | 'bow' | 'pistol' | 'staff' | null; weaponCol?: string;
  shieldCol?: string | null;
  goblin?: boolean; scale?: number;
}

// Figures face +Z at rotation.y = 0.
function makeHumanoid(o: HumanOpts): THREE.Group {
  const skin = o.skin ?? '#d8a878';
  const tunic = o.bodyArmor ?? o.tunic ?? '#7a5a3a';
  const pants = o.legArmor ?? o.pants ?? '#4f4536';
  const gob = !!o.goblin;
  const legH = gob ? 0.26 : 0.36, armH = gob ? 0.42 : 0.36;
  const torsoH = 0.4, torsoW = gob ? 0.38 : 0.34, torsoD = 0.19;
  const headS = gob ? 0.26 : 0.22;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // legs — tapered hexagonal columns with rounded boots
  const legY = legH;
  const legCol = o.legArmor ?? pants;
  const mkLeg = (sx: number) => {
    const g = limbGroup(lm(cylG(0.05, 0.062, legH - 0.06, legCol, 6), 0, -legH / 2 + 0.02, 0), sx * 0.085, legY, 0);
    const boot = lm(sphG(0.062, '#3a3026'), 0, -legH + 0.045, 0.015);
    boot.scale.set(1, 0.7, 1.25);
    g.add(boot);
    return g;
  };
  const ll = mkLeg(-1), rl = mkLeg(1);
  body.add(ll, rl);

  // hips bridge the legs into the torso
  const hips = lm(sphG(0.125, legCol), 0, legH + 0.01, 0);
  hips.scale.set(torsoW / 0.34, 0.55, 0.72);
  body.add(hips);

  // torso — tapered octagonal chest, broad at the shoulders
  const torsoY = legH + torsoH / 2;
  const torso = lm(cylG(torsoW * 0.5, torsoW * 0.38, torsoH, tunic, 8), 0, torsoY, 0);
  torso.scale.z = 0.62;
  if (gob) { torso.rotation.x = 0.3; torso.position.z = 0.04; }
  body.add(torso);
  // shoulder caps (pads when armoured, cloth otherwise)
  const shoulderY = legH + torsoH - 0.03;
  for (const sx of [-1, 1]) {
    const pad = lm(sphG(o.bodyArmor ? 0.075 : 0.06, o.bodyArmor ?? tunic), sx * (torsoW / 2 + 0.04), shoulderY + 0.015, gob ? 0.06 : 0);
    pad.scale.y = 0.8;
    body.add(pad);
  }
  if (o.apron) {
    const ap = lm(sphG(torsoW * 0.42, o.apron), 0, torsoY - 0.04, torsoD * 0.32 + 0.02);
    ap.scale.set(0.95, torsoH * 2.1, 0.28);
    body.add(ap);
  }

  // arms — slim capsules with sphere hands
  const armCol = o.bodyArmor ?? tunic;
  const mkArm = (sx: number) =>
    limbGroup(lm(capG(0.042, armH - 0.1, armCol), 0, -armH / 2 + 0.02, 0), sx * (torsoW / 2 + 0.055), shoulderY, gob ? 0.06 : 0);
  const la = mkArm(-1), ra = mkArm(1);
  body.add(la, ra);
  // hands
  la.add(lm(sphG(0.048, skin), 0, -armH + 0.02, 0));
  ra.add(lm(sphG(0.048, skin), 0, -armH + 0.02, 0));

  // head — faceted sphere with a neck
  const headR = headS * 0.56;
  const headY = legH + torsoH + headR + 0.035;
  body.add(lm(cylG(0.045, 0.055, 0.06, skin, 6), 0, legH + torsoH + 0.015, gob ? 0.05 : 0));
  const head = new THREE.Group();
  head.position.set(0, headY, gob ? 0.09 : 0);
  const skull = lm(sphG(headR, skin));
  skull.scale.set(0.92, 1.04, 0.95);
  head.add(skull);
  if (gob) head.scale.setScalar(1.18);
  // eyes
  head.add(lm(boxG(0.032, 0.032, 0.012, '#24201c'), -0.045, 0.02, headR * 0.85));
  if (o.eyepatch) {
    head.add(lm(boxG(0.055, 0.045, 0.014, '#181614'), 0.045, 0.02, headR * 0.86));
    head.add(lm(torusG(headR * 0.95, 0.01, '#181614'), 0, 0.04, 0, Math.PI / 2.3));
  } else {
    head.add(lm(boxG(0.032, 0.032, 0.012, '#24201c'), 0.045, 0.02, headR * 0.85));
  }
  if (o.beard) {
    const bd = lm(sphG(headR * 0.72, o.beard), 0, -headR * 0.62, headR * 0.42);
    bd.scale.set(0.85, 0.8, 0.6);
    head.add(bd);
  }
  if (gob) {
    head.add(lm(tetraG(0.07, skin), -headR - 0.045, 0.04, 0, 0, 0, 1.9));
    head.add(lm(tetraG(0.07, skin), headR + 0.045, 0.04, 0, 0, 0, -1.9));
  }
  if (o.helm) {
    // rounded dome helm with a rim and nose guard
    head.add(lm(domeG(headR + 0.035, o.helm), 0, -0.005, 0));
    head.add(lm(cylG(headR + 0.04, headR + 0.045, 0.035, o.helm, 8), 0, -0.005, 0));
    head.add(lm(boxG(0.03, 0.1, 0.02, o.helm), 0, -0.02, headR + 0.02));
  } else if (o.hat === 'wizard') {
    const hc = o.hatCol ?? '#3a4ea8';
    head.add(lm(cylG(0.17, 0.19, 0.03, hc, 8), 0, headS / 2 + 0.01, 0));
    head.add(lm(coneG(0.12, 0.3, hc, 7), 0, headS / 2 + 0.17, 0));
  } else if (o.hat === 'straw') {
    head.add(lm(cylG(0.21, 0.22, 0.025, '#d2b86a', 8), 0, headS / 2 + 0.01, 0));
    head.add(lm(cylG(0.1, 0.11, 0.08, '#c2a85a', 8), 0, headS / 2 + 0.06, 0));
  } else if (o.hat === 'cook') {
    head.add(lm(cylG(0.12, 0.1, 0.2, '#f2f0ea', 8), 0, headS / 2 + 0.1, 0));
    head.add(lm(cylG(0.13, 0.13, 0.04, '#f8f6f2', 8), 0, headS / 2 + 0.21, 0));
  } else if (o.hair) {
    // rounded hair: dome cap on top, blob hugging the back of the skull
    head.add(lm(domeG(headR + 0.015, o.hair), 0, 0.012, -0.008));
    const back = lm(sphG(headR * 0.92, o.hair), 0, -0.01, -headR * 0.38);
    back.scale.set(0.95, 0.9, 0.6);
    head.add(back);
  }
  body.add(head);

  // weapon in right hand
  const handY = -armH + 0.02;
  const wc = o.weaponCol ?? '#9aa0a8';
  if (o.weapon === 'sword' || o.weapon === 'scimitar') {
    ra.add(lm(boxG(0.045, 0.4, 0.025, wc), o.weapon === 'scimitar' ? 0.03 : 0, handY - 0.22, 0.03, 0, 0, o.weapon === 'scimitar' ? 0.18 : 0));
    ra.add(lm(boxG(0.13, 0.03, 0.04, '#5e4023'), 0, handY - 0.04, 0.03));
  } else if (o.weapon === 'axe') {
    ra.add(lm(boxG(0.035, 0.42, 0.035, '#6b4a2c'), 0, handY - 0.2, 0.03));
    ra.add(lm(boxG(0.05, 0.12, 0.16, wc), 0, handY - 0.32, 0.1));
  } else if (o.weapon === 'staff') {
    ra.add(lm(cylG(0.02, 0.025, 0.95, '#5e4023', 5), 0, handY - 0.1, 0.04));
    ra.add(gm(icoG(0.05, '#7ab0ff', 0), 0, handY + 0.38, 0.04));
  } else if (o.weapon === 'bow') {
    const bc = '#7a5630';
    ra.add(lm(boxG(0.03, 0.3, 0.04, bc), 0, handY + 0.13, 0.06, 0.5));
    ra.add(lm(boxG(0.03, 0.3, 0.04, bc), 0, handY - 0.13, 0.06, -0.5));
    ra.add(lm(boxG(0.012, 0.52, 0.012, '#d8d0c0'), 0, handY, 0.13));
  } else if (o.weapon === 'pistol') {
    const polymer = wc === '#3a3a42';
    const grip = polymer ? '#3a3a42' : '#5e4226';
    const barrel = polymer ? '#2a2a30' : '#3a3a3e';
    // slide + barrel
    ra.add(lm(boxG(0.055, 0.045, 0.2, wc), 0, handY - 0.07, 0.12));
    ra.add(lm(boxG(0.03, 0.03, 0.1, barrel), 0, handY - 0.08, 0.22));
    // grip (angled)
    ra.add(lm(boxG(0.048, 0.15, 0.07, grip), 0.02, handY + 0.02, 0.07, 0.12, 0, 0.22));
    // trigger guard + trigger
    ra.add(lm(boxG(0.012, 0.07, 0.07, wc), -0.01, handY - 0.01, 0.09));
    ra.add(lm(boxG(0.01, 0.04, 0.02, '#2a2a30'), -0.01, handY - 0.03, 0.1));
    // muzzle
    ra.add(lm(cylG(0.018, 0.02, 0.04, barrel, 6), 0, handY - 0.08, 0.28, Math.PI / 2, 0, 0));
  }
  if (o.shieldCol) {
    la.add(lm(boxG(0.05, 0.34, 0.26, o.shieldCol), -0.06, handY - 0.06, 0.02));
  }

  const s = o.scale ?? 1;
  root.scale.setScalar(s);
  root.userData.fig = { limbs: { la, ra, ll, rl }, bob: body, seed: 0, yaw: 0, quad: false } as FigureData;
  return root;
}

function makeQuadruped(opts: { body: string; patches?: boolean; horns?: boolean; woolly?: boolean; sheared?: boolean; rat?: boolean; scale: number }): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fig: FigureData = { limbs: null as any, bob: body, seed: 0, yaw: 0, quad: true };

  if (opts.rat) {
    const fur = opts.body;
    const trunk = lm(sphG(0.22, fur), 0, 0.24, -0.04);
    trunk.scale.set(0.72, 0.6, 1.5);
    body.add(trunk);
    body.add(lm(coneG(0.11, 0.28, fur, 6), 0, 0.26, 0.42, Math.PI / 2));
    body.add(lm(tetraG(0.05, '#caa8a0'), -0.08, 0.38, 0.32));
    body.add(lm(tetraG(0.05, '#caa8a0'), 0.08, 0.38, 0.32));
    body.add(lm(cylG(0.012, 0.03, 0.55, '#b08878', 4), 0, 0.2, -0.5, Math.PI / 2.4));
    const mkLeg = (sx: number, sz: number) =>
      limbGroup(lm(cylG(0.03, 0.038, 0.16, fur, 5), 0, -0.08, 0), sx * 0.12, 0.16, sz * 0.2);
    const fl = mkLeg(-1, 1), fr = mkLeg(1, 1), bl = mkLeg(-1, -1), br = mkLeg(1, -1);
    body.add(fl, fr, bl, br);
    fig.limbs = { la: fl, ra: br, ll: bl, rl: fr };
  } else if (opts.woolly) {
    const wool = '#e8e4da';
    body.add(lm(icoG(0.3, wool, 0), 0, 0.46, 0));
    body.add(lm(icoG(0.24, '#ded8ca', 0), 0, 0.5, 0.22));
    body.add(lm(icoG(0.22, '#e2dccf', 0), 0.02, 0.5, -0.2));
    const sheepHead = lm(sphG(0.1, '#3a3530'), 0, 0.52, 0.44);
    sheepHead.scale.set(0.85, 0.85, 1.15);
    body.add(sheepHead);
    const mkLeg = (sx: number, sz: number) =>
      limbGroup(lm(cylG(0.035, 0.042, 0.26, '#3a3530', 5), 0, -0.13, 0), sx * 0.14, 0.27, sz * 0.18);
    const fl = mkLeg(-1, 1), fr = mkLeg(1, 1), bl = mkLeg(-1, -1), br = mkLeg(1, -1);
    body.add(fl, fr, bl, br);
    fig.limbs = { la: fl, ra: br, ll: bl, rl: fr };
  } else if (opts.sheared) {
    const trunk = lm(sphG(0.24, '#d8c8be'), 0, 0.42, 0);
    trunk.scale.set(0.75, 0.65, 1.35);
    body.add(trunk);
    const sheepHead = lm(sphG(0.1, '#3a3530'), 0, 0.52, 0.42);
    sheepHead.scale.set(0.85, 0.85, 1.15);
    body.add(sheepHead);
    const mkLeg = (sx: number, sz: number) =>
      limbGroup(lm(cylG(0.035, 0.042, 0.26, '#3a3530', 5), 0, -0.13, 0), sx * 0.12, 0.27, sz * 0.18);
    const fl = mkLeg(-1, 1), fr = mkLeg(1, 1), bl = mkLeg(-1, -1), br = mkLeg(1, -1);
    body.add(fl, fr, bl, br);
    fig.limbs = { la: fl, ra: br, ll: bl, rl: fr };
  } else {
    // cow — barrel body, muzzled head, rounded haunches
    const trunk = lm(sphG(0.3, opts.body), 0, 0.56, 0);
    trunk.scale.set(0.85, 0.75, 1.5);
    body.add(trunk);
    if (opts.patches) {
      for (const [px, py, pz, ps] of [[0.16, 0.62, 0.2, 0.16], [-0.12, 0.52, -0.24, 0.18], [0.14, 0.55, -0.02, 0.14]] as const) {
        const patch = lm(sphG(ps, '#46423c'), px, py, pz);
        patch.scale.set(1.4, 0.9, 1.2);
        body.add(patch);
      }
    }
    const head = new THREE.Group();
    head.position.set(0, 0.74, 0.52);
    const skull = lm(sphG(0.15, opts.body));
    skull.scale.set(0.9, 0.95, 1.05);
    head.add(skull);
    const muzzle = lm(sphG(0.09, '#caa0a0'), 0, -0.05, 0.12);
    muzzle.scale.set(1.1, 0.75, 0.9);
    head.add(muzzle);
    head.add(lm(tetraG(0.045, opts.body), -0.14, 0.08, -0.02, 0, 0, 1.6));
    head.add(lm(tetraG(0.045, opts.body), 0.14, 0.08, -0.02, 0, 0, -1.6));
    if (opts.horns) {
      head.add(lm(coneG(0.03, 0.14, '#e8e4d8', 5), -0.15, 0.12, 0.02, 0, 0, 0.9));
      head.add(lm(coneG(0.03, 0.14, '#e8e4d8', 5), 0.15, 0.12, 0.02, 0, 0, -0.9));
    }
    body.add(head);
    body.add(lm(cylG(0.015, 0.02, 0.34, opts.body, 4), 0, 0.6, -0.48, 0.5));
    const mkLeg = (sx: number, sz: number) =>
      limbGroup(lm(cylG(0.05, 0.06, 0.36, opts.body, 6), 0, -0.18, 0), sx * 0.17, 0.37, sz * 0.3);
    const fl = mkLeg(-1, 1), fr = mkLeg(1, 1), bl = mkLeg(-1, -1), br = mkLeg(1, -1);
    body.add(fl, fr, bl, br);
    fig.limbs = { la: fl, ra: br, ll: bl, rl: fr };
  }

  root.scale.setScalar(opts.scale);
  root.userData.fig = fig;
  return root;
}

function makeChicken(scale: number): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const trunk = lm(sphG(0.15, '#eae4d6'), 0, 0.3, 0);
  trunk.scale.set(0.85, 0.8, 1.1);
  body.add(trunk);
  body.add(lm(sphG(0.075, '#eae4d6'), 0, 0.48, 0.16));
  body.add(lm(coneG(0.028, 0.08, '#e8a020', 5), 0, 0.48, 0.26, Math.PI / 2));
  body.add(lm(boxG(0.025, 0.06, 0.07, '#d23a2a'), 0, 0.57, 0.15));
  body.add(lm(tetraG(0.1, '#dcd6c8'), 0, 0.34, -0.18, 0.5, 0.4));
  const mkWing = (sx: number) => {
    const wing = lm(sphG(0.09, '#dcd6c8'), sx * 0.02, -0.06, 0);
    wing.scale.set(0.35, 0.85, 1.15);
    return limbGroup(wing, sx * 0.13, 0.38, 0);
  };
  const lw = mkWing(-1), rw = mkWing(1);
  body.add(lw, rw);
  const mkLeg = (sx: number) =>
    limbGroup(lm(cylG(0.015, 0.015, 0.12, '#e8a020', 4), 0, -0.06, 0), sx * 0.06, 0.19, 0);
  const ll = mkLeg(-1), rl = mkLeg(1);
  body.add(ll, rl);
  root.scale.setScalar(scale * 1.1);
  root.userData.fig = { limbs: { la: lw, ra: rw, ll, rl }, bob: body, seed: 0, yaw: 0, quad: false } as FigureData;
  return root;
}

const MAN_TUNICS = ['#7a5a3a', '#5a6e8a', '#6e4a5a', '#5d7a4a'];

// ---- boss / city figures (original models) ----
function makeWarlord(size: number): THREE.Group {
  const root = makeHumanoid({
    skin: '#4f7e34', tunic: '#5a3a2a', bodyArmor: '#6e3a2e', legArmor: '#4a3026',
    helm: '#7c4a32', goblin: true, weapon: 'sword', weaponCol: '#8a8a92',
    shieldCol: '#5e4023', scale: size,
  });
  const fig = root.userData.fig as FigureData;
  // war banner on his back: pole, crossbar, hanging cloth with a crude emblem
  const bob = fig.bob;
  bob.add(lm(cylG(0.025, 0.032, 1.5, '#5e4023', 5), 0, 0.9, -0.2));
  bob.add(lm(boxG(0.46, 0.045, 0.045, '#5e4023'), 0, 1.58, -0.2));
  bob.add(lm(boxG(0.4, 0.52, 0.025, '#962a22', 0.08), 0, 1.3, -0.24));
  bob.add(lm(boxG(0.14, 0.14, 0.03, '#e8c428'), 0, 1.32, -0.26));
  bob.add(lm(tetraG(0.05, '#8a8a92'), 0, 1.68, -0.2, 0.5, 0.4));
  return root;
}

function makeBogHorror(size: number): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // hulking moss mound
  body.add(lm(icoG(0.52, '#3c5226', 0), 0, 0.6, 0));
  body.add(lm(icoG(0.4, '#46602c', 0), 0.08, 1.0, 0.06));
  body.add(lm(icoG(0.3, '#34481f', 0), -0.32, 0.48, 0.24));
  body.add(lm(icoG(0.26, '#50682f', 0), 0.34, 0.42, -0.28));
  // dripping moss strands
  body.add(lm(coneG(0.07, 0.4, '#2c3e1a', 5), -0.2, 0.32, 0.42, Math.PI));
  body.add(lm(coneG(0.06, 0.34, '#2c3e1a', 5), 0.3, 0.42, 0.3, Math.PI));
  // glowing eyes
  body.add(gm(icoG(0.05, '#b8ff58', 0), -0.13, 1.08, 0.4));
  body.add(gm(icoG(0.05, '#b8ff58', 0), 0.15, 1.1, 0.38));
  // heavy arms
  const mkArm = (sx: number) => {
    const a = limbGroup(lm(cylG(0.085, 0.11, 0.62, '#3a5024', 6, 0.09), 0, -0.3, 0), sx * 0.56, 0.95, 0.08);
    a.add(lm(icoG(0.14, '#46602c', 0), 0, -0.62, 0.02));
    return a;
  };
  const la = mkArm(-1), ra = mkArm(1);
  body.add(la, ra);
  // stumpy legs under the mound
  const mkLeg = (sx: number) =>
    limbGroup(lm(cylG(0.09, 0.11, 0.32, '#2e421c', 6, 0.09), 0, -0.16, 0), sx * 0.22, 0.32, 0);
  const ll = mkLeg(-1), rl = mkLeg(1);
  body.add(ll, rl);
  root.scale.setScalar(size);
  root.userData.fig = { limbs: { la, ra, ll, rl }, bob: body, seed: 0, yaw: 0, quad: false } as FigureData;
  return root;
}

function makeShadowDrake(size: number): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const dk = '#2c2434', dk2 = '#3a3046', wing = '#221a2a';
  // torso — deep-chested barrel
  const trunk = lm(sphG(0.32, dk), 0, 0.55, 0);
  trunk.scale.set(0.85, 0.72, 1.5);
  body.add(trunk);
  // dorsal ridge spikes
  for (let i = 0; i < 4; i++) body.add(lm(coneG(0.05, 0.16, dk2, 4), 0, 0.8 - i * 0.02, 0.3 - i * 0.22, -0.3 + 0.1 * i));
  // neck rising forward — tapered serpentine segments
  body.add(lm(cylG(0.1, 0.14, 0.4, dk2, 7), 0, 0.82, 0.5, -1.05));
  body.add(lm(cylG(0.08, 0.11, 0.34, dk2, 7), 0, 1.06, 0.68, -1.25));
  // head with snout, horns, ember eyes
  const head = new THREE.Group();
  head.position.set(0, 1.2, 0.84);
  const skull = lm(sphG(0.13, dk));
  skull.scale.set(0.95, 0.85, 1.15);
  head.add(skull);
  head.add(lm(coneG(0.075, 0.24, dk2, 6), 0, -0.03, 0.2, Math.PI / 2)); // snout
  head.add(gm(sphG(0.025, '#ff7a30', 5, 4), -0.075, 0.04, 0.1));
  head.add(gm(sphG(0.025, '#ff7a30', 5, 4), 0.075, 0.04, 0.1));
  head.add(lm(coneG(0.035, 0.18, dk2, 5), -0.08, 0.12, -0.06, -0.7, 0, 0.35)); // swept horns
  head.add(lm(coneG(0.035, 0.18, dk2, 5), 0.08, 0.12, -0.06, -0.7, 0, -0.35));
  body.add(head);
  // folded wings along the flanks — membrane fans with a wing-claw
  for (const sx of [-1, 1]) {
    const w = lm(sphG(0.3, wing), sx * 0.34, 0.86, -0.12);
    w.scale.set(0.12, 0.95, 1.3);
    w.rotation.set(0.22, 0, sx * -0.34);
    body.add(w);
    body.add(lm(coneG(0.04, 0.14, dk2, 4), sx * 0.42, 1.16, 0.04, 0.3, 0, sx * -0.8));
  }
  // tail trailing behind
  body.add(lm(coneG(0.13, 0.95, dk2, 5, 0.08), 0, 0.46, -0.84, -Math.PI / 2 - 0.22));
  // four legs
  const mkLeg = (sx: number, sz: number) =>
    limbGroup(lm(cylG(0.055, 0.075, 0.4, dk2, 6), 0, -0.2, 0), sx * 0.27, 0.4, sz * 0.3);
  const fl = mkLeg(-1, 1), fr = mkLeg(1, 1), bl = mkLeg(-1, -1), br = mkLeg(1, -1);
  body.add(fl, fr, bl, br);
  root.scale.setScalar(size);
  root.userData.fig = { limbs: { la: fl, ra: br, ll: bl, rl: fr }, bob: body, seed: 0, yaw: 0, quad: true } as FigureData;
  return root;
}

// ---- Phase 6 creature models (original designs) ----
function makeWolf(fur: string, belly: string, size: number): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // lean chest-heavy trunk with a separate haunch
  const chest = lm(sphG(0.19, fur), 0, 0.42, 0.14);
  chest.scale.set(0.85, 0.85, 1.25);
  body.add(chest);
  const haunch = lm(sphG(0.17, fur), 0, 0.38, -0.22);
  haunch.scale.set(0.8, 0.8, 1.1);
  body.add(haunch);
  const bellyM = lm(sphG(0.14, belly), 0, 0.32, 0.05);
  bellyM.scale.set(0.8, 0.6, 1.6);
  body.add(bellyM);
  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.42);
  const skull = lm(sphG(0.12, fur));
  skull.scale.set(0.9, 0.85, 1);
  head.add(skull);
  head.add(lm(coneG(0.065, 0.2, belly, 6), 0, -0.045, 0.18, Math.PI / 2)); // snout
  head.add(lm(sphG(0.025, '#1a1a1e'), 0, -0.04, 0.27)); // nose
  head.add(lm(coneG(0.04, 0.1, fur, 4), -0.08, 0.14, -0.02, -0.25, 0, 0.3)); // ears
  head.add(lm(coneG(0.04, 0.1, fur, 4), 0.08, 0.14, -0.02, -0.25, 0, -0.3));
  head.add(lm(boxG(0.03, 0.025, 0.01, '#88c8e8'), -0.055, 0.03, 0.105));
  head.add(lm(boxG(0.03, 0.025, 0.01, '#88c8e8'), 0.055, 0.03, 0.105));
  body.add(head);
  // bushy tail
  body.add(lm(coneG(0.07, 0.4, fur, 5), 0, 0.5, -0.5, Math.PI / 2.6));
  const mkLeg = (sx: number, sz: number) =>
    limbGroup(lm(cylG(0.038, 0.05, 0.28, fur, 5), 0, -0.14, 0), sx * 0.12, 0.28, sz * 0.26);
  const fl = mkLeg(-1, 1), fr = mkLeg(1, 1), bl = mkLeg(-1, -1), br = mkLeg(1, -1);
  body.add(fl, fr, bl, br);
  root.scale.setScalar(size);
  root.userData.fig = { limbs: { la: fl, ra: br, ll: bl, rl: fr }, bob: body, seed: 0, yaw: 0, quad: true } as FigureData;
  return root;
}

function makeScorpion(size: number): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shell = '#8a5a28', shell2 = '#9a6830';
  // low wide segmented carapace
  const cara = lm(sphG(0.26, shell, 7, 4, 0.08), 0, 0.15, 0.08);
  cara.scale.set(1.05, 0.45, 0.95);
  body.add(cara);
  const abdomen = lm(sphG(0.21, shell2, 7, 4, 0.08), 0, 0.14, -0.22);
  abdomen.scale.set(1.05, 0.45, 0.85);
  body.add(abdomen);
  // claws — arm, rounded pincer palm, pincer tips
  for (const sx of [-1, 1]) {
    body.add(lm(cylG(0.04, 0.05, 0.26, shell, 5), sx * 0.3, 0.12, 0.32, Math.PI / 2, sx * -0.5));
    const palm = lm(sphG(0.09, shell2, 7, 4, 0.08), sx * 0.4, 0.12, 0.46);
    palm.scale.set(1.1, 0.7, 1.2);
    body.add(palm);
    body.add(lm(coneG(0.035, 0.12, shell, 4), sx * 0.42, 0.14, 0.58, 1.2, 0, sx * 0.3));
    body.add(lm(coneG(0.035, 0.12, shell, 4), sx * 0.47, 0.12, 0.57, 1.2, 0, sx * -0.3));
  }
  // curled tail segments rising to a stinger
  const tail: Array<[number, number, number, number]> = [[0, 0.18, -0.42, 0.075], [0, 0.3, -0.54, 0.07], [0, 0.44, -0.58, 0.062], [0, 0.56, -0.5, 0.055]];
  for (const [tx, ty, tz, tr] of tail) body.add(lm(sphG(tr, shell2, 6, 4, 0.08), tx, ty, tz));
  body.add(lm(coneG(0.05, 0.16, '#5a3418', 5), 0, 0.64, -0.4, 2.4));
  // legs (static splay)
  for (let i = 0; i < 3; i++) {
    for (const sx of [-1, 1]) {
      body.add(lm(cylG(0.018, 0.025, 0.3, shell, 4), sx * 0.32, 0.1, 0.16 - i * 0.18, 0, 0, sx * 1.0));
    }
  }
  // small lifted leg pair used for walk animation
  const mkLeg = (sx: number) =>
    limbGroup(lm(cylG(0.018, 0.025, 0.28, shell, 4), 0, -0.1, 0, 0, 0, sx * 0.9), sx * 0.26, 0.16, 0);
  const ll = mkLeg(-1), rl = mkLeg(1);
  body.add(ll, rl);
  root.scale.setScalar(size);
  root.userData.fig = { limbs: { la: ll, ra: rl, ll, rl }, bob: body, seed: 0, yaw: 0, quad: true } as FigureData;
  return root;
}

function makeMagmaCrawler(size: number): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // low ember slug: charred segments with glowing seams
  const crust = '#2c2018';
  body.add(lm(icoG(0.3, crust, 0), 0, 0.22, 0.18));
  body.add(lm(icoG(0.26, '#342419', 0), 0, 0.2, -0.12));
  body.add(lm(icoG(0.2, crust, 0), 0, 0.16, -0.38));
  body.add(gm(boxG(0.5, 0.04, 0.06, '#ff7a1e'), 0, 0.2, 0.06));
  body.add(gm(boxG(0.4, 0.04, 0.06, '#ff9434'), 0, 0.17, -0.26, 0, 0.3));
  const e1 = gm(icoG(0.04, '#ffc24a', 0), -0.1, 0.32, 0.42); e1.name = 'fxflame';
  const e2 = gm(icoG(0.04, '#ffc24a', 0), 0.1, 0.32, 0.42); e2.name = 'fxflame';
  body.add(e1, e2);
  root.scale.setScalar(size);
  root.userData.fig = { limbs: null, bob: body, seed: 0, yaw: 0, quad: true } as FigureData;
  return root;
}

function makeMagmaFiend(size: number): THREE.Group {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rock = '#33231a', rock2 = '#412c1e';
  // massive molten hulk: cracked stone body over a glowing core
  body.add(lm(icoG(0.55, rock, 0), 0, 0.75, 0));
  body.add(lm(icoG(0.42, rock2, 0), 0.06, 1.15, 0.04));
  body.add(gm(icoG(0.3, '#ff6a14', 0), 0, 0.78, 0.12)); // exposed core
  body.add(lm(icoG(0.3, rock, 0), -0.34, 0.6, 0.26));
  body.add(lm(icoG(0.28, rock2, 0), 0.36, 0.55, -0.26));
  // head: craggy boulder with furnace eyes
  body.add(lm(icoG(0.2, rock2, 0), 0, 1.5, 0.1));
  body.add(gm(boxG(0.06, 0.05, 0.02, '#ffb028'), -0.08, 1.52, 0.26));
  body.add(gm(boxG(0.06, 0.05, 0.02, '#ffb028'), 0.08, 1.52, 0.26));
  // glowing fissures
  body.add(gm(boxG(0.05, 0.5, 0.04, '#ff8a20'), -0.2, 0.9, 0.34, 0, 0, 0.4));
  body.add(gm(boxG(0.05, 0.4, 0.04, '#ff8a20'), 0.26, 1.0, -0.3, 0.3, 0, -0.5));
  // huge arms with ember knuckles
  const mkArm = (sx: number) => {
    const a = limbGroup(lm(cylG(0.1, 0.13, 0.7, rock2, 6, 0.09), 0, -0.34, 0), sx * 0.6, 1.2, 0.06);
    a.add(lm(icoG(0.17, rock, 0), 0, -0.7, 0.02));
    a.add(gm(tetraG(0.06, '#ff8a20'), 0, -0.78, 0.12, 0.4, sx));
    return a;
  };
  const la = mkArm(-1), ra = mkArm(1);
  body.add(la, ra);
  const mkLeg = (sx: number) =>
    limbGroup(lm(cylG(0.11, 0.13, 0.4, rock, 6, 0.09), 0, -0.2, 0), sx * 0.26, 0.4, 0);
  const ll = mkLeg(-1), rl = mkLeg(1);
  body.add(ll, rl);
  root.scale.setScalar(size);
  root.userData.fig = { limbs: { la, ra, ll, rl }, bob: body, seed: 0, yaw: 0, quad: false } as FigureData;
  return root;
}

function makeIceTroll(size: number): THREE.Group {
  // bulky pale-blue brute: hunched goblin frame scaled wide, icy growths on the back
  const root = makeHumanoid({
    skin: '#a8c8dc', tunic: '#6a8a9c', pants: '#54707e', goblin: true,
    weapon: null, scale: size * 1.15,
  });
  const fig = root.userData.fig as FigureData;
  fig.bob.scale.x = 1.25; // broad shoulders
  fig.bob.add(lm(tetraG(0.09, '#cfe6f4'), -0.1, 0.78, -0.16, 0.4, 0.3));
  fig.bob.add(lm(tetraG(0.07, '#bfdcec'), 0.12, 0.84, -0.14, 0.2, -0.5));
  fig.bob.add(lm(tetraG(0.06, '#d8ecf8'), 0.0, 0.66, -0.2, 0.7, 0.9));
  return root;
}

function makeIceQueen(size: number): THREE.Group {
  // regal crystalline figure: pale gown, frost cloak, spiked crown
  const root = makeHumanoid({
    skin: '#dce8f2', hair: '#eaf4fa', tunic: '#9ec4dc', pants: '#86aec8',
    weapon: 'staff', weaponCol: '#bfe0f4', scale: size,
  });
  const fig = root.userData.fig as FigureData;
  // crystalline crown above the head (head centre ~y 0.89)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = gm(tetraG(0.035, '#d4ecfa'), Math.cos(a) * 0.09, 1.04 + (i % 2) * 0.03, Math.sin(a) * 0.09, 0.4, a);
    fig.bob.add(spike);
  }
  // frost cloak panel
  fig.bob.add(lm(boxG(0.36, 0.55, 0.03, '#cfe2ee'), 0, 0.5, -0.13));
  return root;
}

function makeBanditKing(size: number): THREE.Group {
  const root = makeHumanoid({
    skin: '#b8845a', hair: '#2a201a', beard: '#2a201a', tunic: '#5a4a3a', pants: '#46382c',
    weapon: 'scimitar', weaponCol: '#c8b04a', scale: size,
  });
  const fig = root.userData.fig as FigureData;
  // red sash across the torso (torso centre ~y 0.56)
  const sash = lm(boxG(0.09, 0.5, 0.04, '#b02828'), 0, 0.56, 0.105, 0, 0, 0.7);
  fig.bob.add(sash);
  fig.bob.add(lm(boxG(0.4, 0.07, 0.22, '#962a22'), 0, 0.38, 0)); // waist wrap
  return root;
}

function makeAshFiend(size: number): THREE.Group {
  // tall dark figure with ember eyes
  const root = makeHumanoid({
    skin: '#241f28', hair: '#16121a', tunic: '#1e1a24', pants: '#16121a', scale: size * 1.18,
  });
  const fig = root.userData.fig as FigureData;
  fig.bob.add(gm(boxG(0.04, 0.03, 0.015, '#ff7a30'), -0.05, 0.92, 0.115));
  fig.bob.add(gm(boxG(0.04, 0.03, 0.015, '#ff7a30'), 0.05, 0.92, 0.115));
  // ash wisps drifting off the shoulders
  fig.bob.add(gm(tetraG(0.035, '#5a4a44'), -0.22, 0.86, -0.04, 0.4, 0.7));
  fig.bob.add(gm(tetraG(0.03, '#4a3c38'), 0.24, 0.9, -0.06, 0.9, 0.2));
  return root;
}

// ---- the Untuned Mine creatures (original designs) ----
function makeDiscordMote(size: number): THREE.Group {
  // a wisp of the wrong colour — glowing core with off-tint shards
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(gm(icoG(0.16, '#d98aff', 0), 0, 0.55, 0));
  body.add(gm(icoG(0.07, '#8a5aff', 0), 0.16, 0.66, 0.05));
  body.add(gm(icoG(0.05, '#ff6ad2', 0), -0.15, 0.48, -0.08));
  body.add(gm(tetraG(0.05, '#b86adf'), 0.02, 0.34, 0.1, 0.4, 0.8));
  const halo = gm(ringG(0.2, 0.24, '#b86adf'), 0, 0.55, 0, -Math.PI / 2);
  body.add(halo);
  root.scale.setScalar(size);
  root.userData.fig = { limbs: null, bob: body, seed: 0, yaw: 0, quad: false } as FigureData;
  return root;
}

function makeUntunedGolem(size: number): THREE.Group {
  // ore that stood up mid-smelt: boulder body with glowing wrong-note seams
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rock = '#6a665e', rock2 = '#7a766c';
  const trunk = lm(icoG(0.34, rock, 0), 0, 0.62, 0);
  trunk.scale.set(1, 1.15, 0.85);
  body.add(trunk);
  body.add(lm(icoG(0.18, rock2, 0), 0, 1.06, 0.04)); // head boulder
  body.add(gm(boxG(0.05, 0.04, 0.02, '#d98aff'), -0.07, 1.08, 0.17)); // eyes
  body.add(gm(boxG(0.05, 0.04, 0.02, '#d98aff'), 0.07, 1.08, 0.17));
  // glowing seams across the chest
  body.add(gm(boxG(0.4, 0.03, 0.04, '#c47ae8'), 0, 0.72, 0.26, 0, 0, 0.35));
  body.add(gm(boxG(0.3, 0.025, 0.04, '#9a5ad2'), 0.04, 0.52, 0.27, 0, 0, -0.2));
  const mkArm = (sx: number) => {
    const a = limbGroup(lm(cylG(0.08, 0.11, 0.5, rock, 6, 0.09), 0, -0.25, 0), sx * 0.42, 0.85, 0);
    a.add(lm(icoG(0.13, rock2, 0), 0, -0.52, 0.02));
    return a;
  };
  const la = mkArm(-1), ra = mkArm(1);
  body.add(la, ra);
  const mkLeg = (sx: number) =>
    limbGroup(lm(cylG(0.1, 0.12, 0.3, rock, 6, 0.09), 0, -0.15, 0), sx * 0.18, 0.3, 0);
  const ll = mkLeg(-1), rl = mkLeg(1);
  body.add(ll, rl);
  root.scale.setScalar(size * 0.9);
  root.userData.fig = { limbs: { la, ra, ll, rl }, bob: body, seed: 0, yaw: 0, quad: false } as FigureData;
  return root;
}

function makeSeamCreeper(size: number): THREE.Group {
  // a fast low lunger that lives in the skipped beat between pick-strikes
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hide = '#46523e', hide2 = '#56644a';
  const trunk = lm(sphG(0.22, hide), 0, 0.26, 0);
  trunk.scale.set(0.8, 0.6, 1.7);
  body.add(trunk);
  // ridge plates down the spine
  for (let i = 0; i < 4; i++) body.add(lm(tetraG(0.06, hide2), 0, 0.42, 0.26 - i * 0.18, 0.3, i));
  // head low and forward, single sour eye
  const head = lm(sphG(0.13, hide2), 0, 0.26, 0.42);
  head.scale.set(0.9, 0.8, 1.1);
  body.add(head);
  body.add(gm(sphG(0.04, '#d98aff', 5, 4), 0, 0.3, 0.55));
  // mandibles
  body.add(lm(coneG(0.03, 0.14, '#38422f', 4), -0.07, 0.18, 0.52, 1.2));
  body.add(lm(coneG(0.03, 0.14, '#38422f', 4), 0.07, 0.18, 0.52, 1.2));
  const mkLeg = (sx: number, sz: number) =>
    limbGroup(lm(cylG(0.035, 0.05, 0.26, hide, 5), 0, -0.13, 0), sx * 0.2, 0.26, sz * 0.22);
  const fl = mkLeg(-1, 1), fr = mkLeg(1, 1), bl = mkLeg(-1, -1), br = mkLeg(1, -1);
  body.add(fl, fr, bl, br);
  root.scale.setScalar(size);
  root.userData.fig = { limbs: { la: fl, ra: br, ll: bl, rl: fr }, bob: body, seed: 0, yaw: 0, quad: true } as FigureData;
  return root;
}

function makeForemanEcho(size: number): THREE.Group {
  // the mine foreman's looping last shift — pale, translucent-looking, pick in hand
  const root = makeHumanoid({
    skin: '#bfe4dd', hair: '#9adcd2', tunic: '#7ab4ac', pants: '#5e948c', scale: size,
  });
  const fig = root.userData.fig as FigureData;
  // hollow glowing eyes + lamp glow at the brow (Hollis's lamp, still lit)
  fig.bob.add(gm(boxG(0.035, 0.03, 0.015, '#dffff8'), -0.05, 0.92, 0.115));
  fig.bob.add(gm(boxG(0.035, 0.03, 0.015, '#dffff8'), 0.05, 0.92, 0.115));
  fig.bob.add(gm(sphG(0.035, '#fff4c8', 5, 4), 0, 1.02, 0.1));
  // spectral pick slung across the right shoulder
  const pick = new THREE.Group();
  pick.position.set(0.26, 0.78, 0.06);
  pick.rotation.z = -0.6;
  pick.add(lm(cylG(0.025, 0.03, 0.6, '#8adcd0', 5), 0, 0.1, 0));
  pick.add(lm(coneG(0.05, 0.3, '#cffff6', 4), 0.12, 0.4, 0, 0, 0, -Math.PI / 2));
  pick.add(lm(coneG(0.05, 0.3, '#cffff6', 4), -0.12, 0.4, 0, 0, 0, Math.PI / 2));
  fig.bob.add(pick);
  return root;
}

function makeCrystalHeart(size: number): THREE.Group {
  // a huge resonating crystal — the dungeon's final boss. Pulsing emissive
  // spires over a cracked stone socket; it never moves, it only rings.
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // stone socket
  body.add(lm(icoG(0.42, '#4a4652', 0), 0, 0.2, 0));
  body.add(lm(icoG(0.26, '#56525e', 0), -0.4, 0.14, 0.2));
  body.add(lm(icoG(0.22, '#403c48', 0), 0.42, 0.12, -0.18));
  // the heart: main spire + chorus of lesser spires
  body.add(gm(coneG(0.3, 1.5, '#c47ae8', 6), 0, 1.0, 0, 0.06, 0, 0.04));
  body.add(gm(coneG(0.16, 0.9, '#9a5ad2', 5), 0.34, 0.66, 0.14, 0.1, 0, -0.5));
  body.add(gm(coneG(0.14, 0.8, '#e0a8ff', 5), -0.32, 0.6, -0.12, -0.08, 0, 0.5));
  body.add(gm(coneG(0.1, 0.55, '#8a5aff', 5), 0.1, 0.5, -0.32, -0.45, 0, 0));
  body.add(gm(coneG(0.09, 0.5, '#ff6ad2', 5), -0.12, 0.48, 0.32, 0.45, 0, 0));
  // inner glow core
  body.add(gm(icoG(0.18, '#f0d2ff', 0), 0, 0.66, 0));
  root.scale.setScalar(size);
  root.userData.fig = { limbs: null, bob: body, seed: 0, yaw: 0, quad: false } as FigureData;
  return root;
}

function buildNpcTemplate(n: Npc): THREE.Group {
  const id = n.def.id;
  const size = (n.def as any).size ?? 1;
  switch (id) {
    case 'chicken': return makeChicken(size);
    case 'cow': return makeQuadruped({ body: '#ded8ca', patches: true, horns: true, scale: size });
    case 'sheep': return makeQuadruped({
      body: '#e8e4da', woolly: !(n.meta?.sheared), sheared: !!n.meta?.sheared, scale: size,
    });
    case 'giant_rat': return makeQuadruped({ body: '#6a5a4a', rat: true, scale: size * 1.2 });
    case 'goblin': return makeHumanoid({ skin: '#5a8a3a', tunic: '#6e5a32', pants: '#4a4026', goblin: true, scale: size, hair: undefined });
    case 'man': {
      const h = hash2(n.spawnX, n.spawnY, 77);
      return makeHumanoid({ tunic: MAN_TUNICS[Math.floor(h * MAN_TUNICS.length)], hair: h > 0.5 ? '#3a2a14' : '#6e5430', scale: size });
    }
    case 'shopkeeper': return makeHumanoid({ tunic: '#3e6e5a', apron: '#caa86a', hair: '#4a3826', scale: size });
    case 'banker': return makeHumanoid({ tunic: '#33415e', pants: '#2a3040', hair: '#2c2218', scale: size });
    case 'tanner': return makeHumanoid({ tunic: '#8a6a42', apron: '#5e4226', hair: '#3a2a14', beard: '#3a2a14', scale: size });
    case 'slayer_master': return makeHumanoid({
      tunic: '#2e2e36', bodyArmor: '#3a3a44', pants: '#26262e', eyepatch: true,
      weapon: 'sword', weaponCol: '#6e6e76', hair: '#2a2a2e', scale: size,
    });
    case 'magic_tutor': return makeHumanoid({ tunic: '#3a4ea8', pants: '#2c3a7a', hat: 'wizard', hatCol: '#3a4ea8', weapon: 'staff', scale: size });
    case 'gardener': return makeHumanoid({ tunic: '#6e7a3a', hat: 'straw', apron: '#7a6a4a', beard: '#8a8a82', scale: size });
    case 'cook': return makeHumanoid({ tunic: '#8a8a92', hat: 'cook', apron: '#f0eee8', scale: size });
    case 'carpenter': return makeHumanoid({ tunic: '#7a5630', hair: '#6e5430', apron: '#5e4226', scale: size });
    case 'goblin_warlord': return makeWarlord(size);
    case 'bog_horror': return makeBogHorror(size);
    case 'shadow_drake': return makeShadowDrake(size);
    case 'city_guard': return makeHumanoid({
      tunic: '#5a6e8a', bodyArmor: '#9aa2ac', legArmor: '#7a828c', helm: '#9aa2ac',
      weapon: 'sword', weaponCol: '#b4bac2', shieldCol: '#6a7280', scale: size,
    });
    case 'ge_clerk': return makeHumanoid({ tunic: '#2e4a7a', pants: '#26324a', apron: '#d8b84a', hair: '#3a2a14', scale: size });
    case 'innkeeper': return makeHumanoid({ tunic: '#7a3a2e', apron: '#e8e0d0', hair: '#5a4026', beard: '#5a4026', scale: size });
    // ---- Phase 6 monsters & bosses ----
    case 'ice_troll': return makeIceTroll(size);
    case 'ice_wolf': return makeWolf('#e8eef4', '#cfd9e2', size);
    case 'scorpion': return makeScorpion(size);
    case 'desert_bandit': return makeHumanoid({
      skin: '#b8845a', hair: '#3a3530', tunic: '#6a5a48', pants: '#564a3c',
      weapon: 'scimitar', weaponCol: '#9aa0a8', scale: size,
    });
    case 'magma_crawler': return makeMagmaCrawler(size);
    case 'ash_fiend': return makeAshFiend(size);
    case 'ice_queen': return makeIceQueen(size);
    case 'bandit_king': return makeBanditKing(size);
    case 'magma_fiend': return makeMagmaFiend(size);
    // ---- Phase 6 friendly NPCs (distinct original looks) ----
    case 'fishmonger': return makeHumanoid({
      tunic: '#3a6a7a', pants: '#2e4a54', apron: '#c8d4da', hat: 'straw', hair: '#5a4026', scale: size,
    });
    case 'harbormaster': return makeHumanoid({
      tunic: '#2a3a5e', pants: '#222c44', hair: '#8a8a82', beard: '#9a9a92', shieldCol: null, scale: size,
    });
    case 'mountain_guide': return makeHumanoid({
      tunic: '#7a6a52', pants: '#5e5240', apron: '#8a7a62', beard: '#6e5430', hair: '#6e5430', scale: size,
    });
    case 'desert_nomad': return makeHumanoid({
      skin: '#b8845a', tunic: '#c8b88a', pants: '#b0a078', hair: '#e8e0cc', scale: size,
    });
    case 'gem_trader': return makeHumanoid({
      tunic: '#5a3a7a', pants: '#42305a', apron: '#d8b84a', hair: '#2c2218', beard: '#2c2218', scale: size,
    });
    case 'gun_trainer': return makeHumanoid({
      tunic: '#4a5a68', pants: '#3a4248', hair: '#2a2a2e', beard: '#4a4a52',
      weapon: 'pistol', weaponCol: '#3a3a42', scale: size,
    });
    case 'gun_guild_master': return makeHumanoid({
      tunic: '#3a3a42', pants: '#2a2a30', apron: '#8a7a52', hair: '#1a1a1e', beard: '#2a2a2e',
      weapon: 'pistol', weaponCol: '#6e6e76', scale: size,
    });
    case 'armourer': return makeHumanoid({ tunic: '#7a8694', apron: '#5a6470', hair: '#3a2a14', scale: size });
    case 'grocer': return makeHumanoid({ tunic: '#a8854f', apron: '#e8e0d0', hair: '#5a4026', scale: size });
    // the Untuned Mine
    case 'discord_mote': return makeDiscordMote(size);
    case 'untuned_golem': return makeUntunedGolem(size);
    case 'seam_creeper': return makeSeamCreeper(size);
    case 'foreman_echo': return makeForemanEcho(size);
    case 'crystal_heart': return makeCrystalHeart(size);
    case 'cantor_surveyor': return makeHumanoid({
      tunic: '#b08a4a', pants: '#5e4a2e', apron: '#3a3430', hair: '#3a2a14', scale: size,
    });
    default: return makeHumanoid({ tunic: (n.def as any).color ?? '#7a5a3a', hair: '#3a2a14', scale: size });
  }
}

function metalTint(id: string | undefined | null): string | null {
  if (!id) return null;
  if (id.startsWith('bronze')) return '#9a6a3a';
  if (id.startsWith('iron')) return '#6e6e76';
  if (id.startsWith('steel')) return '#b4bac2';
  if (id.startsWith('mithril')) return '#5a78c8';
  if (id.startsWith('adamant')) return '#2e7a4a';
  if (id.startsWith('drake')) return '#3a3046';
  if (id.startsWith('warlord')) return '#7c4a32';
  if (id.startsWith('leather')) return '#8a6a42';
  if (id.startsWith('wooden')) return '#7a5630';
  if (id === 'glock_18') return '#3a3a42';
  if (id.includes('pistol')) {
    if (id.startsWith('bronze')) return '#9a6a3a';
    if (id.startsWith('iron')) return '#6e6e76';
    if (id.startsWith('steel')) return '#b4bac2';
    if (id.startsWith('mithril')) return '#5a78c8';
    if (id.startsWith('adamant')) return '#2e7a4a';
    if (id.startsWith('rune')) return '#699cb4';
  }
  return '#8c8c94';
}

// shared player-style figure builder — used by the local player and remote players.
// `ids` maps equip slot -> item id (or null/undefined when empty).
function figureFromAppearance(ids: Record<string, string | null | undefined>, tunic = '#3a5a8a', pants = '#3e3a30'): THREE.Group {
  const wepId = ids.weapon ?? undefined;
  let weapon: HumanOpts['weapon'] = null;
  if (wepId) {
    if (wepId.includes('scimitar')) weapon = 'scimitar';
    else if (wepId.includes('pistol') || wepId === 'glock_18') weapon = 'pistol';
    else if (wepId.includes('bow') && !wepId.includes('bowstring')) weapon = 'bow';
    else if (wepId.includes('pickaxe') || wepId.includes('axe')) weapon = 'axe';
    else if (wepId.includes('staff')) weapon = 'staff';
    else weapon = 'sword';
  }
  return makeHumanoid({
    skin: '#d8a878', hair: '#5a3a1a', tunic, pants,
    helm: metalTint(ids.head) ?? undefined,
    bodyArmor: ids.body ? metalTint(ids.body) ?? undefined : undefined,
    legArmor: ids.legs ? metalTint(ids.legs) ?? undefined : undefined,
    weapon, weaponCol: metalTint(wepId) ?? '#c0c8d0',
    shieldCol: ids.shield ? (metalTint(ids.shield) ?? '#7a5630') : null,
  });
}

const APP_SLOTS = ['head', 'body', 'legs', 'weapon', 'shield'] as const;

function buildPlayerFigure(): THREE.Group {
  const eq = state.player.equipment as any;
  const ids: Record<string, string | undefined> = {};
  for (const s of APP_SLOTS) ids[s] = eq?.[s]?.id;
  return figureFromAppearance(ids);
}

// remote players get a slightly varied tunic by name so identical loadouts read apart
const RP_TUNICS = ['#3a5a8a', '#6e3a5a', '#3a7a5a', '#7a5a3a', '#5a3a7a', '#8a5a3a'];
function nameHash(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h * 33) ^ name.charCodeAt(i)) >>> 0;
  return h;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

type AnimKind = null | 'attack' | 'chop' | 'mine' | 'fish';

function animateFigure(root: THREE.Group, moving: boolean, now: number, anim: AnimKind) {
  const fig = root.userData.fig as FigureData | undefined;
  if (!fig) return;
  const phase = now * (Math.PI * 2) / TICK_MS * 2 + fig.seed;
  const swing = moving ? Math.sin(phase) * (fig.quad ? 0.45 : 0.6) : 0;
  const idleSway = (off: number) => (moving ? 0 : Math.sin(now / 900 + fig.seed + off) * 0.05);
  // reset per-frame poses that the action animations touch
  fig.bob.rotation.y = 0;
  fig.bob.rotation.x = 0;
  if (fig.limbs) {
    fig.limbs.ll.rotation.x = swing;
    fig.limbs.rl.rotation.x = -swing;
    if (!fig.quad) {
      let la = -swing * 0.8 + idleSway(0);
      let ra = swing * 0.8 + idleSway(1);
      if (!moving && anim === 'attack') {
        // melee strike: wind the arm back, snap forward, recover — body twists with it
        const c = (now % 600) / 600;
        const wind = Math.min(c / 0.4, 1);
        const strike = c < 0.4 ? 0 : Math.min((c - 0.4) / 0.18, 1);
        const recover = c < 0.58 ? 0 : Math.min((c - 0.58) / 0.42, 1);
        ra = -0.5 - wind * 1.7 + strike * 2.0 - recover * 0.3;
        la = -0.2 + wind * 0.25 - strike * 0.3;
        fig.bob.rotation.y = -wind * 0.22 + strike * 0.38 - recover * 0.16;
      } else if (!moving && anim === 'chop') {
        // woodcutting: slow horizontal hew into the trunk
        const c = (now % 1200) / 1200;
        const wind = Math.min(c / 0.45, 1);
        const hew = c < 0.45 ? 0 : Math.min((c - 0.45) / 0.2, 1);
        const recover = c < 0.65 ? 0 : Math.min((c - 0.65) / 0.35, 1);
        ra = -0.9 - wind * 1.2 + hew * 1.5 - recover * 0.3;
        fig.bob.rotation.y = wind * 0.3 - hew * 0.45 + recover * 0.15;
        fig.bob.rotation.x = hew * 0.08 - recover * 0.08;
      } else if (!moving && anim === 'mine') {
        // mining: heavy overhead pick swing with a lean into the rock
        const c = (now % 1200) / 1200;
        const wind = Math.min(c / 0.5, 1);
        const strike = c < 0.5 ? 0 : Math.min((c - 0.5) / 0.16, 1);
        const recover = c < 0.66 ? 0 : Math.min((c - 0.66) / 0.34, 1);
        ra = -0.6 - wind * 2.0 + strike * 2.3 - recover * 0.3;
        la = -0.6 - wind * 2.0 + strike * 2.3 - recover * 0.3; // two-handed
        fig.bob.rotation.x = wind * -0.06 + strike * 0.14 - recover * 0.08;
      } else if (!moving && anim === 'fish') {
        // fishing: rod held out, slow patient bob with the odd wrist flick
        const flick = Math.max(0, Math.sin(now / 1400 + fig.seed)) ** 6 * 0.35;
        ra = -1.15 - flick;
        la = -0.25 + idleSway(0);
      }
      fig.limbs.la.rotation.x = la;
      fig.limbs.ra.rotation.x = ra;
    } else {
      fig.limbs.la.rotation.x = -swing;
      fig.limbs.ra.rotation.x = swing;
      if (!moving && anim === 'attack') {
        // quadruped lunge: rock the body forward on a short cycle
        const c = (now % 600) / 600;
        const lunge = Math.sin(Math.min(c / 0.5, 1) * Math.PI);
        fig.bob.rotation.x = lunge * 0.16;
        fig.limbs.la.rotation.x = -lunge * 0.7;
        fig.limbs.rl.rotation.x = -lunge * 0.7;
      }
    }
  }
  fig.bob.position.y = moving ? Math.abs(Math.sin(phase)) * 0.03 : Math.sin(now / 750 + fig.seed) * 0.018;
}

// ================= SPRITE OVERLAYS (hitsplats / health bars / projectile orbs) =================
const spriteMatCache = new Map<string, THREE.SpriteMaterial>();

function canvasSpriteMat(keyStr: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.SpriteMaterial {
  let m = spriteMatCache.get(keyStr);
  if (m) return m;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  spriteMatCache.set(keyStr, m);
  return m;
}

function hitsplatMat(dmg: number): THREE.SpriteMaterial {
  return canvasSpriteMat(`hs${dmg}`, 48, 48, (g) => {
    g.fillStyle = dmg > 0 ? '#b02020' : '#2848b0';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? 22 : 16;
      const px = 24 + Math.cos(a) * r, py = 24 + Math.sin(a) * r;
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 20px Verdana';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(dmg), 24, 25);
  });
}

function healthbarMat(ratio: number): THREE.SpriteMaterial {
  const bucket = Math.max(0, Math.min(20, Math.round(ratio * 20)));
  return canvasSpriteMat(`hb${bucket}`, 64, 10, (g) => {
    g.fillStyle = '#7a1414'; g.fillRect(0, 0, 64, 10);
    g.fillStyle = '#28b428'; g.fillRect(0, 0, Math.round(64 * bucket / 20), 10);
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeRect(0.5, 0.5, 63, 9);
  });
}

// floating name label over remote players (cached per name)
function nameLabelMat(name: string): THREE.SpriteMaterial {
  return canvasSpriteMat(`nm|${name}`, 256, 40, (g) => {
    g.font = 'bold 22px Verdana';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(name, 128, 20);
    g.fillStyle = '#f8e848';
    g.fillText(name, 128, 20);
  });
}

// overhead chat text (cached per message; messages are <=80 chars and short-lived)
function chatBubbleMat(text: string): THREE.SpriteMaterial {
  const short = text.length > 60 ? text.slice(0, 57) + '...' : text;
  return canvasSpriteMat(`cb|${short}`, 512, 40, (g) => {
    g.font = 'bold 20px Verdana';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(short, 256, 20);
    g.fillStyle = '#f8e848';
    g.fillText(short, 256, 20);
  });
}

// big named boss HP bar (wider than the normal bar), bucketed for caching
function bossBarMat(name: string, ratio: number): THREE.SpriteMaterial {
  const bucket = Math.max(0, Math.min(24, Math.round(ratio * 24)));
  return canvasSpriteMat(`bb|${name}|${bucket}`, 256, 44, (g) => {
    g.font = 'bold 18px Verdana';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.strokeText(name, 128, 11);
    g.fillStyle = '#ffe8a0';
    g.fillText(name, 128, 11);
    g.fillStyle = '#5a0e0e'; g.fillRect(4, 24, 248, 16);
    g.fillStyle = '#28b428'; g.fillRect(4, 24, Math.round(248 * bucket / 24), 16);
    g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 2; g.strokeRect(4, 24, 248, 16);
  });
}

function orbMat(): THREE.SpriteMaterial {
  let m = spriteMatCache.get('orb');
  if (m) return m;
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(220,240,255,1)');
  grad.addColorStop(0.4, 'rgba(120,180,255,0.8)');
  grad.addColorStop(1, 'rgba(60,100,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, blending: THREE.AdditiveBlending });
  spriteMatCache.set('orb', m);
  return m;
}

const spritePool: THREE.Sprite[] = [];
let spriteUsed = 0;
function takeSprite(): THREE.Sprite {
  let s = spritePool[spriteUsed];
  if (!s) {
    s = new THREE.Sprite();
    s.renderOrder = 10;
    spritePool.push(s);
    overlayGroup!.add(s);
  }
  spriteUsed++;
  s.visible = true;
  return s;
}

// projectile darts (arrows + bullets)
const arrowPool: THREE.Mesh[] = [];
let arrowUsed = 0;
const bulletPool: THREE.Mesh[] = [];
let bulletUsed = 0;
function takeBullet(): THREE.Mesh {
  let m = bulletPool[bulletUsed];
  if (!m) {
    const gb = new GeoBuilder();
    gb.box(0, 0, 0, 0.02, 0.02, 0.06, new THREE.Color('#9a7a40'), 0.02);
    gb.box(0, 0, 0.04, 0.018, 0.018, 0.05, new THREE.Color('#b8b0a0'), 0.02);
    gb.box(0, 0, 0.08, 0.012, 0.012, 0.02, new THREE.Color('#6a6a72'), 0.02);
    m = new THREE.Mesh(gb.build(), litMat);
    bulletPool.push(m);
    overlayGroup!.add(m);
  }
  bulletUsed++;
  m.visible = true;
  return m;
}
function takeArrow(): THREE.Mesh {
  let m = arrowPool[arrowUsed];
  if (!m) {
    const gb = new GeoBuilder();
    gb.box(0, -0.18, 0, 0.025, 0.3, 0.025, new THREE.Color('#8a6a40'), 0.04);
    gb.box(0, 0.12, 0, 0.05, 0.08, 0.05, new THREE.Color('#9aa0a8'), 0.04);
    gb.box(0, -0.22, 0, 0.07, 0.06, 0.012, new THREE.Color('#d8d0c0'), 0.04);
    m = new THREE.Mesh(gb.build(), litMat);
    arrowPool.push(m);
    overlayGroup!.add(m);
  }
  arrowUsed++;
  m.visible = true;
  return m;
}

// ================= SKILLING FX (spark bursts + fishing ripple pulses) =================
// Pooled glowing tetra sparks for mining/smithing strikes. Fixed-size pool,
// analytic motion (origin + velocity + gravity from birth time): zero
// allocation per frame once the pool has warmed up.
const SPARK_POOL_MAX = 24;
const SPARK_LIFE = 400;          // ms
const SPARK_GRAV = 5.5;          // tiles/s^2
interface Spark { m: THREE.Mesh; ox: number; oy: number; oz: number; vx: number; vy: number; vz: number; born: number; }
const sparkPool: Spark[] = [];
let sparkSeed = 12345;
let lastSparkCycle = -1;
function sparkRnd() { sparkSeed = (sparkSeed * 16807) % 2147483647; return sparkSeed / 2147483647; }

function emitSparks(x: number, y: number, z: number, now: number) {
  const n = 6 + Math.floor(sparkRnd() * 5); // 6-10 per strike
  let emitted = 0;
  for (let i = 0; i < SPARK_POOL_MAX && emitted < n; i++) {
    let s = sparkPool[i];
    if (!s) {
      const m = new THREE.Mesh(tetraG(0.045, '#ffd86a'), glowMat);
      m.visible = false;
      overlayGroup!.add(m);
      s = { m, ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, born: -1e9 };
      sparkPool.push(s);
    }
    if (now - s.born < SPARK_LIFE) continue; // still in flight
    const a = sparkRnd() * Math.PI * 2;
    const sp = 0.5 + sparkRnd() * 0.9;
    s.ox = x; s.oy = y; s.oz = z;
    s.vx = Math.cos(a) * sp;
    s.vz = Math.sin(a) * sp;
    s.vy = 1.1 + sparkRnd() * 1.5;
    s.born = now;
    s.m.visible = true;
    emitted++;
  }
}

function updateSparks(now: number) {
  for (const s of sparkPool) {
    const ms = now - s.born;
    if (ms >= SPARK_LIFE) { s.m.visible = false; continue; }
    const t = ms / 1000;
    s.m.position.set(
      s.ox + s.vx * t,
      s.oy + s.vy * t - SPARK_GRAV * t * t * 0.5,
      s.oz + s.vz * t,
    );
    const k = 1 - ms / SPARK_LIFE;
    s.m.scale.setScalar(0.5 + k * 0.9);
    s.m.rotation.set(t * 9 + s.born % 7, t * 7, 0);
  }
}

// occasional extra ripple pulses at the fishing spot while fishing
const RIPPLE_POOL_MAX = 3;
const RIPPLE_LIFE = 900;         // ms
const ripplePulses: { m: THREE.Mesh; born: number }[] = [];
let nextRippleAt = 0;

function emitRipplePulse(x: number, y: number, z: number, now: number) {
  for (let i = 0; i < RIPPLE_POOL_MAX; i++) {
    let r = ripplePulses[i];
    if (!r) {
      const m = new THREE.Mesh(ringG(0.3, 0.4, '#dceeff'), rippleMat.clone());
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      m.visible = false;
      overlayGroup!.add(m);
      r = { m, born: -1e9 };
      ripplePulses.push(r);
    }
    if (now - r.born < RIPPLE_LIFE) continue;
    r.m.position.set(x, y, z);
    r.m.visible = true;
    r.born = now;
    return;
  }
}

function updateRipplePulses(now: number) {
  for (const r of ripplePulses) {
    const t = (now - r.born) / RIPPLE_LIFE;
    if (t >= 1) { r.m.visible = false; continue; }
    const s = 0.4 + t * 2.2;
    r.m.scale.set(s, s, 1);
    (r.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
  }
}

function syncSkillFx(now: number) {
  const p = state.player;
  const a = p?.action;
  let sparkObj: WorldObject | null = null;
  let fishObj: WorldObject | null = null;
  if (a && a.type === 'interact-obj' && a.obj && !p.dead) {
    const t = a.obj.type;
    const adjacent = Math.max(Math.abs(p.x - a.obj.x), Math.abs(p.y - a.obj.y)) <= 1;
    const still = p.x === p.prevX && p.y === p.prevY;
    if (adjacent && still) {
      if ((t.startsWith('rocks') && t !== 'rocks_empty' && a.obj.depletedUntil === 0)
        || t === 'anvil' || t === 'furnace') sparkObj = a.obj;
      else if (t.includes('fishing') || t === 'lobster_spot' || t === 'harpoon_spot') fishObj = a.obj;
    }
  }
  if (sparkObj) {
    // sync bursts to the 1200ms swing cycle (the mine anim's strike lands ~58% in)
    const cyc = Math.floor(now / 1200);
    const ph = (now % 1200) / 1200;
    if (ph >= 0.58 && cyc !== lastSparkCycle) {
      lastSparkCycle = cyc;
      const ox = sparkObj.x + 0.5, oz = sparkObj.y + 0.5;
      // contact point: object centre nudged toward the player
      const dx = (p.x + 0.5) - ox, dz = (p.y + 0.5) - oz;
      const dl = Math.hypot(dx, dz) || 1;
      emitSparks(ox + (dx / dl) * 0.32, groundH(ox, oz) + 0.45, oz + (dz / dl) * 0.32, now);
    }
  }
  if (fishObj && now >= nextRippleAt) {
    nextRippleAt = now + 1100 + sparkRnd() * 1400;
    emitRipplePulse(fishObj.x + 0.5, WATER_LEVEL + 0.09, fishObj.y + 0.5, now);
  }
  updateSparks(now);
  updateRipplePulses(now);
}

// ================= INSTANCE SYNC =================
interface ObjInst {
  rkey: string;
  node: THREE.Group;
  fx: THREE.Mesh[];
  // tree-fall transition: set when a tree depletes; the old node tips over,
  // then sinks/fades, then the normal depleted (stump) swap happens
  fall?: { start: number; baseY: number; mats: THREE.Material[] };
}
const TREE_FALL_RE = /^(tree|oak|willow|maple|yew|magic_tree|snow_pine)$/;
const TREE_TIP_MS = 700;
const TREE_SINK_MS = 300;

const objInst = new Map<WorldObject, ObjInst>();
const giInst = new Map<GroundItem, THREE.Mesh>();
const npcInst = new Map<Npc, { node: THREE.Group; rkey: string }>();
let playerNode: THREE.Group | null = null;
let playerKey = '';

function objectRenderKey(o: WorldObject): string {
  if (o.depletedUntil > 0) return o.depletedAs ?? o.type;
  if (o.type === 'farming_patch') return `farming_patch:${o.meta?.stage ?? 'bare'}`;
  return o.type;
}

function itemTierColor(id: string): string {
  if (id === 'coins') return '#e8c428';
  if (id === 'glock_18') return '#4a4a52';
  if (id.includes('pistol')) return '#8c8c94';
  if (id.endsWith('_round')) return '#c8a848';
  if (id.endsWith('_bullet_casing')) return '#b8a060';
  if (id === 'gunpowder') return '#3a3028';
  const v = ITEMS[id]?.value ?? 1;
  if (v >= 500) return '#b060e0';
  if (v >= 100) return '#5a8ae0';
  if (v >= 20) return '#58b048';
  return '#d8d4c8';
}

const groundGeoCache = new Map<string, THREE.BufferGeometry>();
function groundItemGeo(id: string): THREE.BufferGeometry {
  const hit = groundGeoCache.get(id);
  if (hit) return hit;
  const gb = new GeoBuilder();
  if (id === 'glock_18' || id.includes('pistol')) {
    gb.box(0, 0, 0, 0.1, 0.04, 0.18, new THREE.Color(itemTierColor(id)), 0.03);
    gb.box(0, -0.02, -0.02, 0.06, 0.1, 0.05, new THREE.Color(id === 'glock_18' ? '#3a3a42' : '#5e4226'), 0.03);
  } else if (id.endsWith('_round')) {
    gb.box(0, 0, 0, 0.05, 0.05, 0.08, new THREE.Color('#b8a060'), 0.02);
    gb.box(0, 0, 0.05, 0.04, 0.04, 0.06, new THREE.Color(itemTierColor(id)), 0.02);
  } else if (id.endsWith('_bullet_casing')) {
    gb.box(0, 0, 0, 0.05, 0.07, 0.05, new THREE.Color('#b8a060'), 0.02);
  } else if (id === 'gunpowder') {
    gb.box(0, 0, 0, 0.1, 0.1, 0.1, new THREE.Color('#3a3028'), 0.03);
    gb.box(0, 0.08, 0, 0.05, 0.04, 0.05, new THREE.Color('#2a2018'), 0.03);
  } else {
    const geo = tetraG(0.16, itemTierColor(id));
    groundGeoCache.set(id, geo);
    return geo;
  }
  const geo = gb.build();
  groundGeoCache.set(id, geo);
  return geo;
}

function syncObjects(now: number, px: number, pz: number) {
  const seen = new Set<WorldObject>();
  for (const o of objects) {
    seen.add(o);
    const rkey = objectRenderKey(o);
    let inst = objInst.get(o);
    if (inst && inst.rkey !== rkey) {
      // tree depleting -> play the fall animation on the old node first
      if (!inst.fall && o.depletedUntil > 0 && TREE_FALL_RE.test(inst.rkey)) {
        const mats: THREE.Material[] = [];
        inst.node.traverse((ch) => {
          const m = ch as THREE.Mesh;
          if (m.isMesh) {
            const mm = (m.material as THREE.Material).clone();
            mm.transparent = true;
            m.material = mm;
            m.castShadow = false; // a fading ghost shouldn't throw a shadow
            mats.push(mm);
          }
        });
        inst.fall = { start: now, baseY: inst.node.position.y, mats };
      }
      if (inst.fall && now - inst.fall.start < TREE_TIP_MS + TREE_SINK_MS) {
        // still falling: animate, defer the stump swap
        const ft = now - inst.fall.start;
        const tip = Math.min(1, ft / TREE_TIP_MS);
        const ease = 1 - (1 - tip) * (1 - tip);
        // slight bounce as the trunk hits the ground
        const bounce = tip >= 1 ? 0 : Math.sin(tip * Math.PI * 2.6) * 0.05 * (1 - tip) * tip;
        inst.node.rotation.z = (70 * Math.PI / 180) * ease + bounce;
        if (ft > TREE_TIP_MS) {
          const s = (ft - TREE_TIP_MS) / TREE_SINK_MS;
          inst.node.position.y = inst.fall.baseY - 0.6 * s;
          for (const m of inst.fall.mats) m.opacity = 1 - s;
        }
        continue;
      }
      if (inst.fall) for (const m of inst.fall.mats) m.dispose();
      objectGroup!.remove(inst.node);
      inst = undefined;
    }
    if (!inst) {
      const natural = NATURAL_RE.test(rkey);
      const variant = Math.floor(hash2(o.x, o.y, 8) * N_VARIANTS);
      const node = objTemplate(rkey, variant).clone();
      node.position.set(o.x + 0.5, groundH(o.x + 0.5, o.y + 0.5), o.y + 0.5);
      const noSpin = rkey.startsWith('agility') || rkey === 'bank_booth' || rkey === 'ge_booth'
        || rkey === 'slot_machine' || rkey === 'blackjack_table' || rkey === 'roulette_table' || rkey === 'coinflip_pedestal'
        || rkey === 'hedon_bar' || rkey === 'hot_tub' || rkey === 'disco_ball' || rkey === 'pride_fountain' || rkey === 'pride_stage'
        || rkey === 'larp_pride_sign' || rkey === 'larp_campfire' || rkey === 'foam_weapon_rack' || rkey === 'monkey_totem'
        || rkey === 'chimperton_throne' || rkey === 'chimperton_statue' || rkey === 'chimperton_plaque' || rkey === 'golden_banana_pedestal'
        || rkey === 'dentist_chair' || rkey === 'tick_aquarium' || rkey === 'dental_lamp' || rkey === 'tick_nest'
        || rkey === 'ice_ledge' || rkey === 'rope_bridge' || rkey === 'rock_climb' || rkey === 'snow_slope';
      node.rotation.y = noSpin
        ? 0
        : natural
          ? hash2(o.x, o.y, 4) * Math.PI * 2                      // full seeded Y-rotation
          : (hash2(o.x, o.y, 4) - 0.5) * Math.PI * 1.6;
      const sj = natural ? 0.8 + hash2(o.x, o.y, 16) * 0.4 : 0.96 + hash2(o.x, o.y, 16) * 0.08;
      node.scale.multiplyScalar(sj);
      const fx: THREE.Mesh[] = [];
      node.traverse((ch) => { if (ch.name.startsWith('fx') && (ch as THREE.Mesh).isMesh) fx.push(ch as THREE.Mesh); });
      inst = { rkey, node, fx };
      objInst.set(o, inst);
      objectGroup!.add(node);
    }
    // distance culling + animation
    const dx = o.x + 0.5 - px, dz = o.y + 0.5 - pz;
    const visible = dx * dx + dz * dz < 42 * 42;
    inst.node.visible = visible;
    if (visible && inst.fx.length) {
      for (const f of inst.fx) {
        if (f.name === 'fxflame') {
          const s = 0.85 + Math.sin(now * 0.018 + f.id) * 0.18 + hash2(f.id, Math.floor(now / 90)) * 0.1;
          f.scale.set(s, 0.8 + Math.sin(now * 0.023 + f.id * 2) * 0.25, s);
        } else if (f.name.startsWith('fxripple')) {
          const i = +f.name.slice(8);
          const t = ((now * 0.0007 + i * 0.33) % 1);
          const s = 0.4 + t * 2.4;
          f.scale.set(s, s, 1);
        } else if (f.name.startsWith('fxsmoke')) {
          const i = +f.name.slice(7);
          const b = f.userData.smokeBase as { x: number; y: number; z: number; scale: number };
          const t = ((now * 0.00038 + i / 3) % 1);
          f.position.set(
            b.x + Math.sin(now * 0.0011 + i * 2.1) * 0.14 * t,
            b.y + t * 1.35 * b.scale,
            b.z + Math.cos(now * 0.0009 + i * 1.7) * 0.1 * t,
          );
          const s = 0.45 + t * 1.7;
          f.scale.set(s, s * 0.85, s);
          (f.material as THREE.MeshLambertMaterial).opacity = 0.45 * (1 - t) * Math.min(1, t * 7);
        }
      }
    }
  }
  for (const [o, inst] of objInst) {
    if (!seen.has(o)) { objectGroup!.remove(inst.node); objInst.delete(o); }
  }
}

function syncGroundItems(now: number) {
  const seen = new Set<GroundItem>();
  for (const gi of state.groundItems) {
    seen.add(gi);
    let m = giInst.get(gi);
    if (!m) {
      m = new THREE.Mesh(groundItemGeo(gi.item), litMat);
      giInst.set(gi, m);
      objectGroup!.add(m);
    }
    const base = groundH(gi.x + 0.5, gi.y + 0.5);
    m.position.set(gi.x + 0.5, base + 0.28 + Math.sin(now / 500 + gi.x * 3 + gi.y) * 0.05, gi.y + 0.5);
    m.rotation.y = now * 0.0025 + gi.x;
    m.rotation.x = 0.6;
  }
  for (const [gi, m] of giInst) {
    if (!seen.has(gi)) { objectGroup!.remove(m); giInst.delete(gi); }
  }
}

function placeEntity(node: THREE.Group, e: { x: number; y: number; prevX: number; prevY: number }, now: number, faceDx: number, faceDy: number, anim: AnimKind, alphaOverride?: number) {
  const t = alphaOverride ?? tickAlpha();
  const fx = lerp(e.prevX, e.x, t) + 0.5;
  const fz = lerp(e.prevY, e.y, t) + 0.5;
  node.position.set(fx, Math.max(groundH(fx, fz), WATER_LEVEL), fz);
  const fig = node.userData.fig as FigureData | undefined;
  const moving = (e.x !== e.prevX || e.y !== e.prevY) && t < 1;
  if (fig) {
    if (faceDx !== 0 || faceDy !== 0) {
      const target = Math.atan2(faceDx, faceDy);
      fig.yaw = lerpAngle(fig.yaw, target, 0.2);
    }
    node.rotation.y = fig.yaw;
  }
  animateFigure(node, moving, now, anim);
}

function entityOverlays(e: { x: number; y: number; prevX: number; prevY: number; updatedAt?: number }, hitsplat: { dmg: number; until: number } | null, hpRatio: number | null, height: number, alphaOverride?: number) {
  const now = performance.now();
  const t = alphaOverride ?? moveAlpha(e, now);
  const fx = lerp(e.prevX, e.x, t) + 0.5;
  const fz = lerp(e.prevY, e.y, t) + 0.5;
  const gy = Math.max(groundH(fx, fz), WATER_LEVEL);
  if (hpRatio !== null) {
    const s = takeSprite();
    s.material = healthbarMat(hpRatio);
    s.position.set(fx, gy + height + 0.34, fz);
    s.scale.set(0.85, 0.13, 1);
  }
  if (hitsplat && now < hitsplat.until) {
    const s = takeSprite();
    s.material = hitsplatMat(hitsplat.dmg);
    s.position.set(fx, gy + height * 0.55, fz);
    s.scale.set(0.55, 0.55, 1);
  }
}

function syncNpcs(now: number, px: number, pz: number) {
  const seen = new Set<Npc>();
  for (const n of state.npcs) {
    if (n.dead) continue;
    const dxp = n.x - px, dzp = n.y - pz;
    if (dxp * dxp + dzp * dzp > 42 * 42) continue;
    seen.add(n);
    const rkey = n.def.id + (n.def.id === 'sheep' ? (n.meta?.sheared ? ':sheared' : ':woolly') : '');
    let inst = npcInst.get(n);
    if (inst && inst.rkey !== rkey) { entityGroup!.remove(inst.node); inst = undefined; }
    if (!inst) {
      const node = buildNpcTemplate(n);
      const fig = node.userData.fig as FigureData;
      fig.seed = hash2(n.spawnX, n.spawnY, 13) * 7;
      node.userData.entRef = n;
      inst = { node, rkey };
      npcInst.set(n, inst);
      entityGroup!.add(node);
    }
    const attacking = n.target === 'player' &&
      Math.max(Math.abs(state.player.x - n.x), Math.abs(state.player.y - n.y)) <= 1;
    let fdx = n.x - n.prevX, fdy = n.y - n.prevY;
    if (fdx === 0 && fdy === 0 && attacking) { fdx = state.player.x - n.x; fdy = state.player.y - n.y; }
    const t = moveAlpha(n, now);
    placeEntity(inst.node, n, now, fdx, fdy, attacking ? 'attack' : null, t);
    // health bar + hitsplat (same rules as the 2D renderer)
    const showHp = performance.now() < (n.hitsplat?.until ?? 0) + 3000 && n.lastDamagedAt > state.tick - 12;
    const size = (n.def as any).size ?? 1;
    const bossShow = !!(n.def as any).boss && n.lastDamagedAt > state.tick - 12;
    entityOverlays(n, n.hitsplat, !bossShow && showHp ? Math.max(0, n.hp / n.def.hitpoints) : null, 1.1 * size, t);
    if (bossShow) {
      // wide named boss HP bar pinned above the model
      const bfx = lerp(n.prevX, n.x, t) + 0.5, bfz = lerp(n.prevY, n.y, t) + 0.5;
      const bgy = Math.max(groundH(bfx, bfz), WATER_LEVEL);
      const s = takeSprite();
      s.material = bossBarMat(n.def.name, Math.max(0, n.hp / n.def.hitpoints));
      s.position.set(bfx, bgy + 1.1 * size + 0.7, bfz);
      s.scale.set(2.4, 0.41, 1);
    }
  }
  for (const [n, inst] of npcInst) {
    if (!seen.has(n) || n.dead) { entityGroup!.remove(inst.node); npcInst.delete(n); }
  }
}

// Derive the player's action animation from the pending action: gathering
// handlers return 'continue' each tick, so the action stays set while the
// player chops/mines/fishes and we can animate it without touching game logic.
function playerAnim(p: typeof state.player): AnimKind {
  const a = p.action;
  if (!a) return null;
  if (a.type === 'attack' || a.type === 'attack-player') return 'attack';
  if (a.type === 'interact-obj' && a.obj) {
    const t = a.obj.type;
    if (t.startsWith('tree')) return 'chop';
    if (t.startsWith('rocks') && t !== 'rocks_empty') return 'mine';
    if (t.includes('fishing')) return 'fish';
  }
  return null;
}

function syncPlayer(now: number) {
  const p = state.player;
  const eq = p.equipment as any;
  const k = ['head', 'body', 'legs', 'weapon', 'shield'].map((s) => eq?.[s]?.id ?? '').join('|');
  if (!playerNode || k !== playerKey) {
    if (playerNode) entityGroup!.remove(playerNode);
    playerNode = buildPlayerFigure();
    playerKey = k;
    entityGroup!.add(playerNode);
  }
  const moving = p.x !== p.prevX || p.y !== p.prevY;
  const fdx = moving ? p.x - p.prevX : (p.lastFacing?.dx ?? 0);
  const fdy = moving ? p.y - p.prevY : (p.lastFacing?.dy ?? 1);
  placeEntity(playerNode, p, now, fdx, fdy, playerAnim(p));
  playerNode.visible = !p.dead;
  const maxHp = level('Hitpoints');
  entityOverlays(p, p.hitsplat, p.curHp < maxHp ? Math.max(0, p.curHp / maxHp) : null, 1.1);
}

// ---- remote players (multiplayer presence) ----
// pooled by name; figure rebuilt only when the .app equipment key changes
const remoteInst = new Map<string, { node: THREE.Group; key: string }>();

function syncRemotePlayers(now: number, px: number, pz: number) {
  const rps = (state.remotePlayers ?? []) as RemotePlayer[];
  const seen = new Set<string>();
  for (const rp of rps) {
    if (!rp || !rp.name || rp.dead) continue;
    seen.add(rp.name);
    const app = rp.app ?? {};
    const akey = APP_SLOTS.map((s) => app[s] ?? '').join('|');
    let inst = remoteInst.get(rp.name);
    if (inst && inst.key !== akey) { entityGroup!.remove(inst.node); inst = undefined; }
    if (!inst) {
      const h = nameHash(rp.name);
      const node = figureFromAppearance(app, RP_TUNICS[h % RP_TUNICS.length]);
      (node.userData.fig as FigureData).seed = (h % 97) / 97 * 7;
      inst = { node, key: akey };
      remoteInst.set(rp.name, inst);
      entityGroup!.add(node);
    }
    const dx = rp.x + 0.5 - px, dz = rp.y + 0.5 - pz;
    const visible = dx * dx + dz * dz < 42 * 42;
    inst.node.visible = visible;
    if (!visible) continue;
    // remote players interpolate on their own snapshot clock, not the local tick clock
    const t = moveAlpha(rp, now);
    placeEntity(inst.node, rp, now, rp.x - rp.prevX, rp.y - rp.prevY, null, t);
    const fx = lerp(rp.prevX, rp.x, t) + 0.5, fz = lerp(rp.prevY, rp.y, t) + 0.5;
    const gy = Math.max(groundH(fx, fz), WATER_LEVEL);
    const rpMaxHp = rp.maxHp ?? 10;
    const showHp = performance.now() < (rp.hitsplat?.until ?? 0) + 3000 && (rp.lastDamagedAt ?? 0) > state.tick - 12;
    entityOverlays(
      { x: rp.x, y: rp.y, prevX: rp.prevX, prevY: rp.prevY, updatedAt: rp.updatedAt },
      rp.hitsplat ?? null,
      showHp && rp.hp !== undefined ? Math.max(0, rp.hp / rpMaxHp) : null,
      1.1, t,
    );
    // floating name label (guild tag prefixed when present)
    const lbl = takeSprite();
    lbl.material = nameLabelMat(rp.tag ? `[${rp.tag}] ${rp.name}` : rp.name);
    lbl.position.set(fx, gy + 1.5, fz);
    lbl.scale.set(1.6, 0.25, 1);
    // overhead chat while fresh
    if (rp.chat && now < rp.chat.until) {
      const cb = takeSprite();
      cb.material = chatBubbleMat(rp.chat.text);
      cb.position.set(fx, gy + 1.82, fz);
      cb.scale.set(3.2, 0.25, 1);
    }
  }
  for (const [name, inst] of remoteInst) {
    if (!seen.has(name)) { entityGroup!.remove(inst.node); remoteInst.delete(name); }
  }
}

function syncProjectiles(now: number) {
  const projs = ((state as any).projectiles ?? []) as Projectile[];
  for (const pr of projs) {
    const t = Math.max(0, Math.min(1, (now - pr.startMs) / pr.durMs));
    if (t >= 1) continue;
    const fx = lerp(pr.fromX, pr.toX, t) + 0.5;
    const fz = lerp(pr.fromY, pr.toY, t) + 0.5;
    const fy = Math.max(groundH(fx, fz), WATER_LEVEL) + 1.0 + Math.sin(t * Math.PI) * 0.55;
    if (pr.kind === 'arrow') {
      const m = takeArrow();
      m.position.set(fx, fy, fz);
      const nt = Math.min(1, t + 0.05);
      const dir = new THREE.Vector3(
        lerp(pr.fromX, pr.toX, nt) - lerp(pr.fromX, pr.toX, t),
        Math.sin(nt * Math.PI) * 0.55 - Math.sin(t * Math.PI) * 0.55,
        lerp(pr.fromY, pr.toY, nt) - lerp(pr.fromY, pr.toY, t),
      );
      if (dir.lengthSq() > 1e-8) {
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      }
    } else if (pr.kind === 'bullet') {
      const m = takeBullet();
      m.position.set(fx, fy, fz);
      const nt = Math.min(1, t + 0.08);
      const dir = new THREE.Vector3(
        lerp(pr.fromX, pr.toX, nt) - lerp(pr.fromX, pr.toX, t),
        0,
        lerp(pr.fromY, pr.toY, nt) - lerp(pr.fromY, pr.toY, t),
      );
      if (dir.lengthSq() > 1e-8) {
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
      }
    } else {
      const s = takeSprite();
      s.material = orbMat();
      s.position.set(fx, fy, fz);
      const sc = 0.5 + Math.sin(now * 0.02) * 0.08;
      s.scale.set(sc, sc, 1);
    }
  }
}

// ================= CAMERA + INPUT =================
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

function bindInput(cv: HTMLCanvasElement) {
  if (inputBound) return;
  inputBound = true;

  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      keysDown.add(e.key);
      if (state.started) e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => keysDown.delete(e.key));
  window.addEventListener('blur', () => keysDown.clear());

  // middle-mouse orbit drag
  let dragging = false, lastX = 0, lastY = 0;
  cv.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    yawT -= (e.clientX - lastX) * 0.008;
    pitchT = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitchT + (e.clientY - lastY) * 0.006));
    lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 1) dragging = false; });
  cv.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    // Mac trackpad pinch arrives as a wheel event with ctrlKey set -> zoom
    if (e.ctrlKey) {
      distT = Math.max(DIST_MIN, Math.min(DIST_MAX, distT * Math.exp(e.deltaY * 0.012)));
      return;
    }
    // two-finger horizontal swipe -> rotate yaw
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      yawT -= e.deltaX * 0.006;
      return;
    }
    // shift + vertical swipe -> pitch
    if (e.shiftKey) {
      pitchT = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitchT - e.deltaY * 0.004));
      return;
    }
    // plain vertical (mouse wheel or two-finger up/down) -> zoom
    distT = Math.max(DIST_MIN, Math.min(DIST_MAX, distT * Math.exp(e.deltaY * 0.0012)));
  }, { passive: false });

  const compass = document.getElementById('compass');
  if (compass) {
    compass.style.cursor = 'pointer';
    compass.addEventListener('click', () => {
      // reset to north via the shortest spin
      yawT = Math.round(yawT / (Math.PI * 2)) * Math.PI * 2;
    });
  }
}

function updateCamera(dt: number) {
  // held-key rotation
  if (keysDown.has('ArrowLeft')) yawT += 2.2 * dt;
  if (keysDown.has('ArrowRight')) yawT -= 2.2 * dt;
  if (keysDown.has('ArrowUp')) pitchT = Math.min(PITCH_MAX, pitchT + 1.6 * dt);
  if (keysDown.has('ArrowDown')) pitchT = Math.max(PITCH_MIN, pitchT - 1.6 * dt);

  const k = 1 - Math.exp(-dt * 10);
  camYaw += (yawT - camYaw) * k;
  camPitch += (pitchT - camPitch) * k;
  camDist += (distT - camDist) * k;

  const p = state.player;
  const t = tickAlpha();
  const fx = lerp(p.prevX, p.x, t) + 0.5;
  const fz = lerp(p.prevY, p.y, t) + 0.5;
  const fy = Math.max(groundH(fx, fz), WATER_LEVEL) + 0.9;

  const cx = fx + Math.sin(camYaw) * Math.cos(camPitch) * camDist;
  const cy = fy + Math.sin(camPitch) * camDist;
  const cz = fz + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
  cam3!.position.set(cx, cy, cz);
  cam3!.lookAt(fx, fy, fz);

  const compass = document.getElementById('compass');
  if (compass) compass.style.transform = `rotate(${camYaw}rad)`;
}

// ================= SHORE FOAM =================
const foamMat = new THREE.MeshBasicMaterial({
  color: 0xe4f2fc, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
});

function buildFoam(sc: THREE.Scene) {
  const gb = new GeoBuilder();
  const white = new THREE.Color(0xffffff);
  const fy = WATER_LEVEL + 0.085;
  const isWaterT = (t: number) => t === TC.WATER || t === TC.BRIDGE;
  const quad = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, x3: number, z3: number) => {
    gb.tri(x0, fy, z0, x1, fy, z1, x2, fy, z2, white, 0);
    gb.tri(x0, fy, z0, x2, fy, z2, x3, fy, z3, white, 0);
  };
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (tAt(x, y) !== TC.WATER) continue;
      // jittered strip widths so the foam line wobbles with the coast
      const wA = 0.1 + hash2(x, y, 91) * 0.12, wB = 0.1 + hash2(x + 1, y + 1, 91) * 0.12;
      if (!isWaterT(tAt(x, y - 1))) quad(x, y, x + 1, y, x + 1, y + wB, x, y + wA);             // north shore
      if (!isWaterT(tAt(x, y + 1))) quad(x, y + 1 - wA, x + 1, y + 1 - wB, x + 1, y + 1, x, y + 1); // south
      if (!isWaterT(tAt(x - 1, y))) quad(x, y, x + wA, y, x + wB, y + 1, x, y + 1);             // west
      if (!isWaterT(tAt(x + 1, y))) quad(x + 1 - wA, y, x + 1, y, x + 1, y + 1, x + 1 - wB, y + 1); // east
    }
  }
  if (gb.pos.length === 0) return;
  const m = new THREE.Mesh(gb.build(), foamMat);
  m.matrixAutoUpdate = false;
  m.renderOrder = 2;
  sc.add(m);
}

// ================= BUILDING ROOFS =================
// Interior FLOOR regions enclosed by WALL tiles get a hipped shingle roof.
// The roof group whose region contains the player's tile is hidden each frame
// so stepping inside reveals the interior (OSRS style). Doorway gaps (FLOOR or
// PATH breaks in the wall ring) don't matter: the region is just the connected
// set of interior FLOOR tiles, and we hide the roof while standing on any of them.
let roofRegion: Int32Array | null = null;       // tile -> region id (-1 = outdoors)
const roofGroups: THREE.Group[] = [];           // region id -> roof group
let hiddenRoofId = -1;

const ROOF_SHINGLES = ['#8a4a32', '#96583a', '#7c4a3c', '#a06a3c', '#84503a', '#8e5a30'];
const ROOF_EAVE_Y = WALL_H + 0.08;              // just above the wall top cap
const ROOF_OVERHANG = 0.3;

// hipped roof over the rect [x0..x1]x[z0..z1] at base height yb
function buildHipRoof(gb: GeoBuilder, x0: number, z0: number, x1: number, z1: number, base: THREE.Color) {
  const yb = ROOF_EAVE_Y;
  const w = x1 - x0, d = z1 - z0;
  const half = Math.min(w, d) / 2;
  const yr = yb + Math.min(half * 0.72, 2.3);
  const dark = base.clone().multiplyScalar(0.8);
  // ridge runs along the longer axis; equal sides give a pyramid hip (ridge len 0)
  if (w >= d) {
    const zm = (z0 + z1) / 2, rx0 = x0 + half, rx1 = x1 - half;
    // long slopes split into bands for a cheap shingle feel
    const bands = 3;
    for (let b = 0; b < bands; b++) {
      const t0 = b / bands, t1 = (b + 1) / bands;
      const c = base.clone().multiplyScalar(0.88 + (bands - 1 - b) * 0.09);
      // south slope (+z)
      gb.tri(lerp(x0, rx0, t0), lerp(yb, yr, t0), lerp(z1, zm, t0),
        lerp(x1, rx1, t0), lerp(yb, yr, t0), lerp(z1, zm, t0),
        lerp(x1, rx1, t1), lerp(yb, yr, t1), lerp(z1, zm, t1), c, 0.05);
      gb.tri(lerp(x0, rx0, t0), lerp(yb, yr, t0), lerp(z1, zm, t0),
        lerp(x1, rx1, t1), lerp(yb, yr, t1), lerp(z1, zm, t1),
        lerp(x0, rx0, t1), lerp(yb, yr, t1), lerp(z1, zm, t1), c, 0.05);
      // north slope (-z)
      gb.tri(lerp(x1, rx1, t0), lerp(yb, yr, t0), lerp(z0, zm, t0),
        lerp(x0, rx0, t0), lerp(yb, yr, t0), lerp(z0, zm, t0),
        lerp(x0, rx0, t1), lerp(yb, yr, t1), lerp(z0, zm, t1), c, 0.05);
      gb.tri(lerp(x1, rx1, t0), lerp(yb, yr, t0), lerp(z0, zm, t0),
        lerp(x0, rx0, t1), lerp(yb, yr, t1), lerp(z0, zm, t1),
        lerp(x1, rx1, t1), lerp(yb, yr, t1), lerp(z0, zm, t1), c, 0.05);
    }
    // hip ends
    gb.tri(x1, yb, z1, x1, yb, z0, rx1, yr, zm, base.clone().multiplyScalar(0.92), 0.05);
    gb.tri(x0, yb, z0, x0, yb, z1, rx0, yr, zm, base.clone().multiplyScalar(0.92), 0.05);
    // ridge beam
    if (rx1 - rx0 > 0.05) gb.box((rx0 + rx1) / 2, yr - 0.04, zm, rx1 - rx0 + 0.2, 0.1, 0.16, dark, 0.04);
  } else {
    const xm = (x0 + x1) / 2, rz0 = z0 + half, rz1 = z1 - half;
    const bands = 3;
    for (let b = 0; b < bands; b++) {
      const t0 = b / bands, t1 = (b + 1) / bands;
      const c = base.clone().multiplyScalar(0.88 + (bands - 1 - b) * 0.09);
      // east slope (+x)
      gb.tri(lerp(x1, xm, t0), lerp(yb, yr, t0), lerp(z1, rz1, t0),
        lerp(x1, xm, t0), lerp(yb, yr, t0), lerp(z0, rz0, t0),
        lerp(x1, xm, t1), lerp(yb, yr, t1), lerp(z0, rz0, t1), c, 0.05);
      gb.tri(lerp(x1, xm, t0), lerp(yb, yr, t0), lerp(z1, rz1, t0),
        lerp(x1, xm, t1), lerp(yb, yr, t1), lerp(z0, rz0, t1),
        lerp(x1, xm, t1), lerp(yb, yr, t1), lerp(z1, rz1, t1), c, 0.05);
      // west slope (-x)
      gb.tri(lerp(x0, xm, t0), lerp(yb, yr, t0), lerp(z0, rz0, t0),
        lerp(x0, xm, t0), lerp(yb, yr, t0), lerp(z1, rz1, t0),
        lerp(x0, xm, t1), lerp(yb, yr, t1), lerp(z1, rz1, t1), c, 0.05);
      gb.tri(lerp(x0, xm, t0), lerp(yb, yr, t0), lerp(z0, rz0, t0),
        lerp(x0, xm, t1), lerp(yb, yr, t1), lerp(z1, rz1, t1),
        lerp(x0, xm, t1), lerp(yb, yr, t1), lerp(z0, rz0, t1), c, 0.05);
    }
    gb.tri(x0, yb, z1, x1, yb, z1, xm, yr, rz1, base.clone().multiplyScalar(0.92), 0.05);
    gb.tri(x1, yb, z0, x0, yb, z0, xm, yr, rz0, base.clone().multiplyScalar(0.92), 0.05);
    if (rz1 - rz0 > 0.05) gb.box(xm, yr - 0.04, (rz0 + rz1) / 2, 0.16, 0.1, rz1 - rz0 + 0.2, dark, 0.04);
  }
}

function buildRoofs(sc: THREE.Scene) {
  roofRegion = new Int32Array(MAP_W * MAP_H).fill(-1);
  const seen = new Uint8Array(MAP_W * MAP_H);
  for (let sy = 0; sy < MAP_H; sy++) {
    for (let sx = 0; sx < MAP_W; sx++) {
      if (tAt(sx, sy) !== TC.FLOOR || seen[key(sx, sy)]) continue;
      // flood-fill this contiguous FLOOR region
      const tiles: number[] = [];
      const qx = [sx], qy = [sy];
      seen[key(sx, sy)] = 1;
      let minX = sx, maxX = sx, minY = sy, maxY = sy;
      let wallEdges = 0, totalEdges = 0;
      for (let head = 0; head < qx.length; head++) {
        const x = qx[head], y = qy[head];
        tiles.push(key(x, y));
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ox, ny = y + oy;
          const nt = tAt(nx, ny);
          if (nt === TC.FLOOR) {
            if (!seen[key(nx, ny)]) { seen[key(nx, ny)] = 1; qx.push(nx); qy.push(ny); }
          } else {
            totalEdges++;
            if (nt === TC.WALL) wallEdges++;
          }
        }
      }
      // only roof proper buildings: small-ish, and mostly ringed by walls
      // (a couple of doorway gaps are expected and fine)
      if (tiles.length < 4 || tiles.length > 800 || totalEdges === 0) continue;
      if (wallEdges / totalEdges < 0.65) continue;

      const id = roofGroups.length;
      for (const k of tiles) roofRegion[k] = id;

      // roof spans the interior bbox + the wall ring + eave overhang
      const gb = new GeoBuilder();
      const base = new THREE.Color(ROOF_SHINGLES[Math.floor(hash2(minX, minY, 101) * ROOF_SHINGLES.length)])
        .multiplyScalar(0.92 + hash2(minX, maxY, 102) * 0.16);
      buildHipRoof(gb,
        minX - 1 - ROOF_OVERHANG, minY - 1 - ROOF_OVERHANG,
        maxX + 2 + ROOF_OVERHANG, maxY + 2 + ROOF_OVERHANG, base);
      const mesh = new THREE.Mesh(gb.build(), litMat);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const group = new THREE.Group();
      group.add(mesh);
      roofGroups.push(group);
      sc.add(group);
    }
  }
}

// hide the roof over the region the player is standing in; show all others.
// only visibility flips — the meshes themselves are static.
function updateRoofs(px: number, py: number) {
  if (!roofRegion) return;
  const id = (px >= 0 && py >= 0 && px < MAP_W && py < MAP_H) ? roofRegion[key(px, py)] : -1;
  if (id === hiddenRoofId) return;
  if (hiddenRoofId >= 0 && roofGroups[hiddenRoofId]) roofGroups[hiddenRoofId].visible = true;
  if (id >= 0 && roofGroups[id]) roofGroups[id].visible = false;
  hiddenRoofId = id;
}

// ================= SCENE INIT =================
function ensureScene(): boolean {
  if (renderer) return true;
  const cv = document.getElementById('viewport') as HTMLCanvasElement | null;
  if (!cv) return false;

  buildHeights();

  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  const w = cv.clientWidth || 515, h = cv.clientHeight || 336;
  renderer.setPixelRatio(Math.min((window.devicePixelRatio || 1) * viewScale, 3));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x191209);
  // slightly gentler fog curve than before so the middle distance reads
  scene.fog = new THREE.FogExp2(0x1d150b, 0.027);

  cam3 = new THREE.PerspectiveCamera(50, w / h, 0.1, 220);

  // warm key light + subtle cool hemisphere fill
  const sun = new THREE.DirectionalLight(0xffdfae, 1.4);
  sun.position.set(45, 80, 25);
  // soft shadow map: a tight ortho frustum re-centred on the player each frame
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.05;
  sunLight = sun;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xb8d0ee, 0x6a5a42, 0.55));
  scene.add(new THREE.AmbientLight(0x9a8a72, 0.5));

  // terrain chunks (+ one merged emissive lava mesh across the map)
  pickMeshes = [];
  const lavaGb = new GeoBuilder();
  for (let cy = 0; cy < MAP_H; cy += CHUNK) {
    for (let cx = 0; cx < MAP_W; cx += CHUNK) {
      const m = buildChunk(cx, cy, lavaGb);
      if (m) { scene.add(m); pickMeshes.push(m); }
    }
  }
  if (lavaGb.pos.length > 0) {
    const lavaMesh = new THREE.Mesh(lavaGb.build(), lavaMat);
    lavaMesh.matrixAutoUpdate = false;
    scene.add(lavaMesh);
  }

  // water plane (animated, semi-transparent, depth-tinted by distance to land)
  const seg = Math.min(160, Math.max(52, Math.floor(MAP_W / 2)));
  const wg = new THREE.PlaneGeometry(MAP_W, MAP_H, seg, seg);
  wg.rotateX(-Math.PI / 2);
  wg.translate(MAP_W / 2, WATER_LEVEL, MAP_H / 2);
  waterBase = (wg.getAttribute('position').array as Float32Array).slice();
  {
    // deeper water (further from land) is darker toward channel centres
    const wp = wg.getAttribute('position');
    const wcols = new Float32Array(wp.count * 3);
    const shallow = new THREE.Color(0x4670a4), deep = new THREE.Color(0x1c2c46);
    const wcol = new THREE.Color();
    for (let i = 0; i < wp.count; i++) {
      const tx = Math.max(0, Math.min(MAP_W - 1, Math.floor(wp.getX(i))));
      const tz = Math.max(0, Math.min(MAP_H - 1, Math.floor(wp.getZ(i))));
      const d = distLand ? distLand[tz * MAP_W + tx] : 1;
      wcol.copy(shallow).lerp(deep, Math.min(1, d / 4));
      wcols[i * 3] = wcol.r; wcols[i * 3 + 1] = wcol.g; wcols[i * 3 + 2] = wcol.b;
    }
    wg.setAttribute('color', new THREE.BufferAttribute(wcols, 3));
  }
  const wm = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.76 });
  waterMesh = new THREE.Mesh(wg, wm);
  scene.add(waterMesh);

  // shoreline foam strips following the actual coast tiles
  buildFoam(scene);

  // hipped roofs over enclosed FLOOR interiors (hidden while the player is inside)
  buildRoofs(scene);

  objectGroup = new THREE.Group();
  entityGroup = new THREE.Group();
  overlayGroup = new THREE.Group();
  scene.add(objectGroup, entityGroup, overlayGroup);

  bindInput(cv);
  return true;
}

function animateWater(now: number) {
  if (!waterMesh || !waterBase) return;
  const attr = waterMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const t = now * 0.0014;
  // two overlapping sine fields drifting at different rates — slightly larger
  // amplitude than before, still subtle
  for (let i = 0; i < arr.length; i += 3) {
    const x = waterBase[i], z = waterBase[i + 2];
    arr[i + 1] = WATER_LEVEL
      + Math.sin(x * 0.7 + t) * 0.042 + Math.cos(z * 0.55 + t * 1.4) * 0.036
      + Math.sin((x + z) * 0.31 - t * 0.8) * 0.022 + Math.cos((x - z) * 0.43 + t * 1.1) * 0.016;
  }
  attr.needsUpdate = true;
}

// ================= MAIN RENDER =================
// ================= TRANSIENT GROUND FX (boss telegraphs) =================
// Short-lived world-space markers: expanding shockwave rings and lit floor
// tiles, used by the Untuned Mine telegraphs (and reusable by any boss pack).
interface ActiveGroundFx {
  mesh: THREE.Mesh;
  start: number;
  dur: number;
  kind: 'ring' | 'tile';
  maxR: number;
}
const activeGroundFx: ActiveGroundFx[] = [];

export function addGroundFx(
  kind: 'ring' | 'tile', x: number, y: number,
  opts: { dur?: number; color?: string; radius?: number } = {},
) {
  if (!scene) return;
  const dur = opts.dur ?? 1200;
  const color = opts.color ?? '#c47ae8';
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
  });
  const geo = kind === 'ring'
    ? new THREE.RingGeometry(0.42, 0.6, 24)
    : new THREE.PlaneGeometry(0.92, 0.92);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  const fx = x + 0.5, fz = y + 0.5;
  mesh.position.set(fx, Math.max(groundH(fx, fz), WATER_LEVEL) + 0.06, fz);
  scene.add(mesh);
  activeGroundFx.push({ mesh, start: performance.now(), dur, kind, maxR: opts.radius ?? 4 });
}

function syncGroundFx(now: number) {
  for (let i = activeGroundFx.length - 1; i >= 0; i--) {
    const f = activeGroundFx[i];
    const t = (now - f.start) / f.dur;
    if (t >= 1) {
      scene?.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
      activeGroundFx.splice(i, 1);
      continue;
    }
    const mat = f.mesh.material as THREE.MeshBasicMaterial;
    if (f.kind === 'ring') {
      // expand outward to the blast radius, fading as it travels
      const s = 1 + t * f.maxR * 1.8;
      f.mesh.scale.set(s, s, 1);
      mat.opacity = 0.8 * (1 - t);
    } else {
      // lit tile: urgent pulse that quickens as the downbeat lands
      mat.opacity = 0.22 + 0.3 * Math.abs(Math.sin(t * t * Math.PI * 6));
    }
  }
}

export function render() {
  const p = state.player;
  if (!p) return;
  if (!ensureScene()) return;

  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameAt) / 1000);
  lastFrameAt = now;

  // keep legacy camera export coherent (pixel coords of viewport centre)
  const pp = entityPixel(p);
  camera.x = pp.px; camera.y = pp.py;

  updateCamera(dt);
  // keep the shadow frustum centred on the player so shadows stay sharp
  if (sunLight) {
    const sfx = lerp(p.prevX, p.x, tickAlpha()) + 0.5;
    const sfz = lerp(p.prevY, p.y, tickAlpha()) + 0.5;
    sunLight.position.set(sfx + 45, 80, sfz + 25);
    sunLight.target.position.set(sfx, 0, sfz);
  }
  animateWater(now);
  // pulse the molten lava glow + shimmer the shore foam
  lavaMat.color.setScalar(0.78 + Math.sin(now * 0.0035) * 0.18 + Math.sin(now * 0.011) * 0.05);
  // foam pulses out of phase with the wave field (wave clock is now*0.0014)
  foamMat.opacity = 0.28
    + (Math.sin(now * 0.0014 + Math.PI) * 0.5 + 0.5) * 0.2
    + (Math.sin(now * 0.0023 + 1.7) * 0.5 + 0.5) * 0.08;

  spriteUsed = 0;
  arrowUsed = 0;
  bulletUsed = 0;
  const t = tickAlpha();
  const pfx = lerp(p.prevX, p.x, t) + 0.5, pfz = lerp(p.prevY, p.y, t) + 0.5;
  updateRoofs(p.x, p.y);
  syncObjects(now, pfx, pfz);
  syncSkillFx(now);
  syncGroundItems(now);
  syncNpcs(now, p.x, p.y);
  syncPlayer(now);
  syncRemotePlayers(now, pfx, pfz);
  syncProjectiles(now);
  syncGroundFx(now);
  for (let i = spriteUsed; i < spritePool.length; i++) spritePool[i].visible = false;
  for (let i = arrowUsed; i < arrowPool.length; i++) arrowPool[i].visible = false;
  for (let i = bulletUsed; i < bulletPool.length; i++) bulletPool[i].visible = false;

  renderer!.render(scene!, cam3!);
}

// ================= PICKING =================
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

export function screenToTile(sx: number, sy: number): { x: number; y: number } {
  const p = state.player;
  const fallback = { x: p ? p.x : 0, y: p ? p.y : 0 };
  const cv = document.getElementById('viewport') as HTMLCanvasElement | null;
  if (!cv || !cam3) return fallback;
  const r = cv.getBoundingClientRect();
  ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, cam3);

  const clampTile = (wx: number, wz: number) => ({
    x: Math.max(0, Math.min(MAP_W - 1, Math.floor(wx))),
    y: Math.max(0, Math.min(MAP_H - 1, Math.floor(wz))),
  });

  // NPC models first (so clicking a figure targets its tile even on slopes)
  let npcHit: { dist: number; tile: { x: number; y: number } } | null = null;
  if (entityGroup) {
    const hits = raycaster.intersectObjects(entityGroup.children, true);
    for (const h of hits) {
      let node: THREE.Object3D | null = h.object;
      while (node && !node.userData.entRef) node = node.parent;
      const n = node?.userData.entRef as Npc | undefined;
      if (n && !n.dead) { npcHit = { dist: h.distance, tile: { x: n.x, y: n.y } }; break; }
    }
  }

  // terrain (height-displaced ground + walls + bridges)
  const terrHits = raycaster.intersectObjects(pickMeshes, false);
  if (terrHits.length > 0) {
    if (npcHit && npcHit.dist < terrHits[0].distance + 0.4) return npcHit.tile;
    const pt = terrHits[0].point.clone().addScaledVector(raycaster.ray.direction, 0.002);
    return clampTile(pt.x, pt.z);
  }
  if (npcHit) return npcHit.tile;

  // fall back to the y=0 ground plane
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const out = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, out)) return clampTile(out.x, out.z);
  return fallback;
}

// ================= MINIMAP (2D, rotates with camera yaw) =================
let minimapBase: HTMLCanvasElement | null = null;

const MM_COLS: Record<number, string> = {
  [TC.GRASS]: '#4a7434',
  [TC.WATER]: '#3e6ec0',
  [TC.PATH]: '#c4ad7e',
  [TC.FLOOR]: '#948c80',
  [TC.WALL]: '#f0f0f0',
  [TC.BRIDGE]: '#9a7644',
  [TC.SWAMP]: '#46582e',
  [TC.FENCE]: '#8a6336',
  [TC.SAND]: '#cdb988',
  [TC.DIRT]: '#6b4a2c',
  [TC.FLOWERS]: '#578442',
  [TC.CAVE]: '#34343a',
  [TC.LAVA]: '#e05a18',
  [TC.ROCK]: '#8a8782',
  [TC.SNOW]: '#e8eef4',
  [TC.ICE]: '#bcd8ee',
  [TC.DSAND]: '#dcc080',
};

export function buildMinimapBase() {
  minimapBase = document.createElement('canvas');
  minimapBase.width = MAP_W * 2; minimapBase.height = MAP_H * 2;
  const g = minimapBase.getContext('2d')!;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const t = terrain[key(x, y)];
    g.fillStyle = MM_COLS[t] ?? MM_COLS[TC.GRASS];
    g.fillRect(x * 2, y * 2, 2, 2);
  }
  for (const o of objects) {
    let col: string | null = null;
    if (o.type === 'tree' || o.type === 'oak' || o.type === 'willow'
      || o.type === 'maple' || o.type === 'yew' || o.type === 'magic_tree' || o.type === 'snow_pine') col = '#1e4012';
    else if (o.type.startsWith('rocks')) col = '#6e6e6e';
    else if (o.type === 'bank_booth') col = '#f0d020';
    else if (o.type === 'fire_altar') col = '#e07030';
    else if (o.type === 'gem_stall') col = '#b050e0';
    else if (o.type === 'ge_booth') col = '#e8a020';
    else if (o.type === 'slot_machine' || o.type === 'blackjack_table' || o.type === 'roulette_table' || o.type === 'coinflip_pedestal') col = '#c02060';
    else if (o.type === 'hedon_bar' || o.type === 'disco_ball' || o.type === 'hot_tub') col = '#e040a0';
    else if (o.type === 'rainbow_banner' || o.type === 'pride_fountain' || o.type === 'pride_stage' || o.type === 'dance_floor') col = '#c040e0';
    else if (o.type === 'larp_pride_sign' || o.type === 'larp_campfire' || o.type === 'foam_weapon_rack' || o.type === 'monkey_totem' || o.type === 'black_pride_banner') col = '#1a1410';
    else if (o.type === 'chimperton_throne' || o.type === 'chimperton_statue' || o.type === 'chimperton_plaque' || o.type === 'golden_banana_pedestal') col = '#d8a020';
    else if (o.type === 'dentist_chair' || o.type === 'tick_aquarium' || o.type === 'dental_lamp' || o.type === 'tick_nest') col = '#90c8e8';
    else if (o.type === 'fountain') col = '#70c0f0';
    else if (o.type === 'altar' || o.type === 'air_altar') col = '#b050e0';
    else if (o.type === 'furnace' || o.type === 'anvil' || o.type === 'range') col = '#c06028';
    else if (o.type === 'fishing_spot' || o.type === 'rod_fishing_spot') col = '#70c0f0';
    if (col) { g.fillStyle = col; g.fillRect(o.x * 2, o.y * 2, 2, 2); }
  }
}

export function renderMinimap() {
  const c = document.getElementById('minimap') as HTMLCanvasElement;
  if (!c) return;
  const g = c.getContext('2d')!;
  const p = state.player;
  if (!p || !minimapBase) return;
  g.fillStyle = '#0c0e0a';
  g.fillRect(0, 0, c.width, c.height);

  const pp = entityPixel(p);
  const scale = 2 / TILE; // minimap px per viewport px
  const cx = pp.px * scale, cy = pp.py * scale;

  g.save();
  // circular vignette so the rotated map doesn't show ragged corners
  g.beginPath();
  g.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 2 - 1, 0, Math.PI * 2);
  g.clip();
  g.translate(c.width / 2, c.height / 2);
  g.rotate(camYaw); // rotate with camera yaw: camera-forward is "up"
  g.drawImage(minimapBase, -cx, -cy);

  // npc dots (yellow)
  for (const n of state.npcs) {
    if (n.dead) continue;
    const nx = (n.x * 2 + 1) - cx, ny = (n.y * 2 + 1) - cy;
    if (nx * nx + ny * ny > 90 * 90) continue;
    g.fillStyle = '#f4e428';
    g.fillRect(nx - 1.5, ny - 1.5, 3, 3);
  }
  // remote player dots (white)
  for (const rp of (state.remotePlayers ?? [])) {
    const nx = (rp.x * 2 + 1) - cx, ny = (rp.y * 2 + 1) - cy;
    if (nx * nx + ny * ny > 90 * 90) continue;
    g.fillStyle = '#f4f4f4';
    g.fillRect(nx - 1.5, ny - 1.5, 3, 3);
  }
  // ground item dots (red)
  for (const gi of state.groundItems) {
    const nx = (gi.x * 2 + 1) - cx, ny = (gi.y * 2 + 1) - cy;
    if (nx * nx + ny * ny > 90 * 90) continue;
    g.fillStyle = '#e83030';
    g.fillRect(nx - 1.5, ny - 1.5, 3, 3);
  }
  g.restore();

  // player marker stays centered + unrotated
  g.fillStyle = '#000';
  g.fillRect(c.width / 2 - 3, c.height / 2 - 3, 6, 6);
  g.fillStyle = '#fff';
  g.fillRect(c.width / 2 - 2, c.height / 2 - 2, 4, 4);
}

export function minimapClickToTile(ev: MouseEvent): { x: number; y: number } | null {
  const c = document.getElementById('minimap') as HTMLCanvasElement;
  const r = c.getBoundingClientRect();
  const mx = (ev.clientX - r.left) * (c.width / r.width);
  const my = (ev.clientY - r.top) * (c.height / r.height);
  const p = state.player;
  // invert the yaw rotation applied in renderMinimap
  const dx0 = mx - c.width / 2, dy0 = my - c.height / 2;
  const cos = Math.cos(-camYaw), sin = Math.sin(-camYaw);
  const dx = dx0 * cos - dy0 * sin;
  const dy = dx0 * sin + dy0 * cos;
  const tx = Math.round(p.x + dx / 2);
  const ty = Math.round(p.y + dy / 2);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
  return { x: tx, y: ty };
}
