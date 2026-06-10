// Procedural 500×500 world expansion — preserves legacy 224×224 at origin.
// Run: npm run world:gen
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  LEGACY, NEW_W, NEW_H, T,
  biomeAt, terrainForBiome, ObjectPlacer,
  stampBuilding, carvePath, encodeTerrain, decodeTerrain, mulberry32,
  idx, type TerrainGrid, type MapObject, type Biome,
} from './world-gen-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data');

const SEED = 50042;
const rng = mulberry32(SEED);

type Rect = { x0: number; y0: number; x1: number; y1: number };

interface SpawnsFile {
  npcSpawns: { id: string; x: number; y: number }[];
  groundSpawns: { item: string; x: number; y: number; respawnTicks: number }[];
}

interface InteriorTheme {
  name: string;
  rect: Rect;
  props: string[];
  density: number;
}

// ─── terrain helpers ───────────────────────────────────────────────────────

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

function fillRect(x0: number, y0: number, w: number, h: number, tile: number, terrain: TerrainGrid) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= NEW_W || y >= NEW_H) continue;
      terrain[idx(x, y)] = tile;
    }
  }
}

function stampLakeRing(cx: number, cy: number, innerR: number, outerR: number, terrain: TerrainGrid) {
  for (let y = cy - outerR; y <= cy + outerR; y++) {
    for (let x = cx - outerR; x <= cx + outerR; x++) {
      if (x < 0 || y < 0 || x >= NEW_W || y >= NEW_H) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d >= innerR && d <= outerR) terrain[idx(x, y)] = T.WATER;
      else if (d < innerR - 0.5) terrain[idx(x, y)] = T.GRASS;
    }
  }
}

function stampPalisade(r: Rect, terrain: TerrainGrid, gateSide: 'south' | 'north' = 'south') {
  for (let x = r.x0; x <= r.x1; x++) {
    terrain[idx(x, r.y0)] = T.FENCE;
    terrain[idx(x, r.y1)] = T.FENCE;
  }
  for (let y = r.y0; y <= r.y1; y++) {
    terrain[idx(r.x0, y)] = T.FENCE;
    terrain[idx(r.x1, y)] = T.FENCE;
  }
  const midX = Math.floor((r.x0 + r.x1) / 2);
  const midY = Math.floor((r.y0 + r.y1) / 2);
  if (gateSide === 'south') terrain[idx(midX, r.y1)] = T.PATH;
  else terrain[idx(midX, r.y0)] = T.PATH;
}

function isNewZone(x: number, y: number): boolean {
  return x >= LEGACY || y >= LEGACY;
}

function terrainName(t: number): string {
  const names = ['GRASS', 'WATER', 'PATH', 'FLOOR', 'WALL', 'BRIDGE', 'SWAMP', 'FENCE',
    'SAND', 'DIRT', 'FLOWERS', 'CAVE', 'LAVA', 'ROCK', 'SNOW', 'ICE', 'DSAND'];
  return names[t] ?? `?${t}`;
}

// ─── step 1–3: load + terrain ───────────────────────────────────────────────

function buildTerrain(legacyTerrain: TerrainGrid): TerrainGrid {
  const terrain = new Uint8Array(NEW_W * NEW_H);

  for (let y = 0; y < LEGACY; y++) {
    for (let x = 0; x < LEGACY; x++) {
      terrain[idx(x, y)] = legacyTerrain[idx(x, y, LEGACY)];
    }
  }

  for (let y = 0; y < NEW_H; y++) {
    for (let x = 0; x < NEW_W; x++) {
      if (!isNewZone(x, y)) continue;
      const b = biomeAt(x, y);
      terrain[idx(x, y)] = terrainForBiome(b, rng);
    }
  }

  return terrain;
}

// ─── step 4: transition paths ───────────────────────────────────────────────

function isWalkableLegacyEdge(terrain: TerrainGrid, x: number, y: number): boolean {
  const t = terrain[idx(x, y)];
  if (t === T.PATH || t === T.BRIDGE) return true;
  if (t !== T.GRASS && t !== T.DIRT && t !== T.FLOWERS) return false;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= LEGACY || ny >= LEGACY) continue;
    const nt = terrain[idx(nx, ny)];
    if (nt === T.PATH || nt === T.BRIDGE) return true;
  }
  return false;
}

function carveLegacyTransitions(terrain: TerrainGrid) {
  const eastExits: { x: number; y: number }[] = [];
  const southExits: { x: number; y: number }[] = [];

  for (let y = 0; y < LEGACY; y++) {
    if (isWalkableLegacyEdge(terrain, 223, y)) eastExits.push({ x: 223, y });
  }
  for (let x = 0; x < LEGACY; x++) {
    if (isWalkableLegacyEdge(terrain, x, 223)) southExits.push({ x, y: 223 });
  }

  // Primary hub connections
  const hubs = [
    { x: 300, y: 265 },  // Eldermere
    { x: 330, y: 440 },  // Southern savanna
    { x: 320, y: 85 },   // Northern highlands trail
  ];

  for (const exit of eastExits) {
    const hub = hubs.reduce((best, h) =>
      Math.hypot(h.x - exit.x, h.y - exit.y) < Math.hypot(best.x - exit.x, best.y - exit.y) ? h : best);
    carvePath(terrain, [exit, { x: 260, y: exit.y }, { x: 280, y: Math.floor((exit.y + hub.y) / 2) }, hub], 1);
  }

  for (const exit of southExits) {
    const hub = exit.x < 120
      ? { x: 78, y: 382 }   // toward Gullswreck ferry coast
      : { x: 330, y: 440 }; // savanna belt
    carvePath(terrain, [exit, { x: exit.x, y: 260 }, { x: Math.floor((exit.x + hub.x) / 2), y: 300 }, hub], 1);
  }

  // Explicit east/south seam roads along legacy border
  carvePath(terrain, [{ x: 223, y: 35 }, { x: 280, y: 35 }, { x: 300, y: 265 }], 1);
  carvePath(terrain, [{ x: 223, y: 196 }, { x: 280, y: 220 }, { x: 300, y: 265 }], 1);
  carvePath(terrain, [{ x: 103, y: 223 }, { x: 103, y: 280 }, { x: 300, y: 440 }], 1);
  carvePath(terrain, [{ x: 196, y: 223 }, { x: 250, y: 280 }, { x: 345, y: 340 }], 1);
}

// ─── step 5: POI stamping ───────────────────────────────────────────────────

function stampRegions(terrain: TerrainGrid, placer: ObjectPlacer) {
  // Eldermere village
  const eldermere: Rect = { x0: 290, y0: 255, x1: 310, y1: 275 };
  fillRect(eldermere.x0, eldermere.y0, eldermere.x1 - eldermere.x0 + 1, eldermere.y1 - eldermere.y0 + 1, T.GRASS, terrain);
  carvePath(terrain, [{ x: 300, y: 275 }, { x: 300, y: 270 }, { x: 295, y: 265 }, { x: 305, y: 265 }], 1);
  stampBuilding(terrain, 294, 258, 6, 5, 'south', 0.5);   // general store
  stampBuilding(terrain, 302, 257, 7, 6, 'south', 0.5);   // elder hall
  placer.place('fountain', 300, 268, terrain);             // village well
  placer.place('bake_stall', 296, 261, terrain);
  placer.place('workbench', 304, 260, terrain);
  for (let i = 0; i < 18; i++) {
    const x = eldermere.x0 + Math.floor(rng() * (eldermere.x1 - eldermere.x0));
    const y = eldermere.y0 + Math.floor(rng() * (eldermere.y1 - eldermere.y0));
    placer.place(rng() < 0.6 ? 'tree' : 'oak', x, y, terrain);
  }
  placer.place('lamp_post', 292, 274, terrain);
  placer.place('lamp_post', 308, 274, terrain);

  // Mirrormere lake (before tanglewood overlap — water ring)
  stampLakeRing(329, 250, 4, 9, terrain);
  for (let a = 0; a < 360; a += 18) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(329 + 9 * Math.cos(rad));
    const y = Math.round(250 + 9 * Math.sin(rad));
    if (placer.canPlace(x, y, terrain, new Set([T.WATER, T.WALL, T.LAVA]))) {
      placer.place(rng() < 0.5 ? 'reeds' : 'lilypad', x, y, terrain);
    }
  }
  placer.place('fishing_spot', 338, 250, terrain);
  placer.place('rod_fishing_spot', 320, 250, terrain);
  placer.place('fishing_spot', 329, 241, terrain);

  // Tanglewood forest
  const tanglewood: Rect = { x0: 350, y0: 320, x1: 400, y1: 360 };
  for (let y = tanglewood.y0; y <= tanglewood.y1; y++) {
    for (let x = tanglewood.x0; x <= tanglewood.x1; x++) {
      terrain[idx(x, y)] = rng() < 0.25 ? T.SWAMP : T.GRASS;
    }
  }
  stampBuilding(terrain, 372, 345, 4, 3, 'east', 0.5); // ruined shack
  for (let i = 0; i < 120; i++) {
    const x = tanglewood.x0 + Math.floor(rng() * (tanglewood.x1 - tanglewood.x0));
    const y = tanglewood.y0 + Math.floor(rng() * (tanglewood.y1 - tanglewood.y0));
    const roll = rng();
    const type = roll < 0.35 ? 'yew' : roll < 0.65 ? 'oak' : roll < 0.85 ? 'tree' : 'bush';
    placer.place(type, x, y, terrain);
  }
  placer.place('stump', 373, 346, terrain);
  placer.place('crate', 374, 345, terrain);
  placer.place('barrel', 371, 346, terrain);
  placer.place('mushroom_patch', 365, 335, terrain);
  placer.place('mushroom_patch', 390, 352, terrain);
  carvePath(terrain, [{ x: 345, y: 310 }, { x: 360, y: 325 }, { x: 375, y: 340 }], 1);

  // Stonewatch outpost
  const stonewatch: Rect = { x0: 410, y0: 115, x1: 430, y1: 130 };
  fillRect(stonewatch.x0, stonewatch.y0, stonewatch.x1 - stonewatch.x0 + 1, stonewatch.y1 - stonewatch.y0 + 1, T.GRASS, terrain);
  stampPalisade(stonewatch, terrain, 'south');
  stampBuilding(terrain, 418, 117, 5, 6, 'south', 0.5);  // watchtower
  stampBuilding(terrain, 424, 122, 4, 4, 'west', 0.5);   // trapper shop
  placer.place('fire', 421, 125, terrain);
  placer.place('hay_bale', 412, 118, terrain);
  placer.place('hay_bale', 428, 118, terrain);
  carvePath(terrain, [{ x: 420, y: 130 }, { x: 420, y: 145 }, { x: 300, y: 265 }], 1);

  // Gullswreck Isle
  const gullswreck: Rect = { x0: 68, y0: 372, x1: 88, y1: 392 };
  for (let y = gullswreck.y0; y <= gullswreck.y1; y++) {
    for (let x = gullswreck.x0; x <= gullswreck.x1; x++) {
      const edge = x === gullswreck.x0 || x === gullswreck.x1 || y === gullswreck.y0;
      terrain[idx(x, y)] = edge && rng() < 0.4 ? T.SAND : (rng() < 0.3 ? T.SAND : T.GRASS);
    }
  }
  fillRect(70, 388, 16, 4, T.WATER, terrain);
  carvePath(terrain, [{ x: 72, y: 387 }, { x: 84, y: 387 }], 0);
  stampBuilding(terrain, 76, 376, 5, 4, 'south', 0.5); // boatman hut
  for (let i = 0; i < 25; i++) {
    placer.place(rng() < 0.5 ? 'driftwood' : 'barrel', gullswreck.x0 + Math.floor(rng() * 20), gullswreck.y0 + Math.floor(rng() * 20), terrain);
  }
  placer.place('crate', 82, 384, terrain);
  placer.place('crate', 79, 382, terrain);
  placer.place('stump', 85, 378, terrain);

  // Eastern Marshes
  const marshes: Rect = { x0: 430, y0: 290, x1: 470, y1: 320 };
  for (let y = marshes.y0; y <= marshes.y1; y++) {
    for (let x = marshes.x0; x <= marshes.x1; x++) {
      terrain[idx(x, y)] = rng() < 0.65 ? T.SWAMP : T.GRASS;
    }
  }
  for (let i = 0; i < 40; i++) {
    placer.place('reeds', marshes.x0 + Math.floor(rng() * (marshes.x1 - marshes.x0)), marshes.y0 + Math.floor(rng() * (marshes.y1 - marshes.y0)), terrain);
  }
  stampBuilding(terrain, 448, 298, 5, 4, 'north', 0.5);
  for (let i = 0; i < 8; i++) {
    const x = marshes.x0 + Math.floor(rng() * (marshes.x1 - marshes.x0));
    const y = marshes.y0 + Math.floor(rng() * (marshes.y1 - marshes.y0));
    if (terrain[idx(x, y)] === T.SWAMP) terrain[idx(x, y)] = T.WALL;
  }

  // Southern Savanna
  const savanna: Rect = { x0: 300, y0: 420, x1: 380, y1: 460 };
  for (let y = savanna.y0; y <= savanna.y1; y++) {
    for (let x = savanna.x0; x <= savanna.x1; x++) {
      terrain[idx(x, y)] = terrainForBiome('desert', rng);
    }
  }
  for (let i = 0; i < 55; i++) {
    const x = savanna.x0 + Math.floor(rng() * (savanna.x1 - savanna.x0));
    const y = savanna.y0 + Math.floor(rng() * (savanna.y1 - savanna.y0));
    placer.place(rng() < 0.55 ? 'cactus' : 'dead_tree_deco', x, y, terrain);
  }
  placer.place('boulder_small', 340, 435, terrain);
  placer.place('boulder_small', 360, 448, terrain);

  // Northern Highlands extension
  const highlands: Rect = { x0: 280, y0: 50, x1: 350, y1: 120 };
  for (let y = highlands.y0; y <= highlands.y1; y++) {
    for (let x = highlands.x0; x <= highlands.x1; x++) {
      const b = y < 80 ? 'snow' : 'mountain';
      terrain[idx(x, y)] = terrainForBiome(b, rng);
    }
  }
  for (let i = 0; i < 35; i++) {
    const x = highlands.x0 + Math.floor(rng() * (highlands.x1 - highlands.x0));
    const y = highlands.y0 + Math.floor(rng() * (highlands.y1 - highlands.y0));
    const roll = rng();
    const type = roll < 0.35 ? 'snow_pine' : roll < 0.6 ? 'ice_spike' : roll < 0.8 ? 'rock_climb' : 'boulder_small';
    placer.place(type, x, y, terrain);
  }
  placer.place('rock_climb', 310, 70, terrain);
  placer.place('snow_slope', 325, 55, terrain);

  // Cinderholm
  const cinderholm: Rect = { x0: 460, y0: 460, x1: 490, y1: 490 };
  for (let y = cinderholm.y0; y <= cinderholm.y1; y++) {
    for (let x = cinderholm.x0; x <= cinderholm.x1; x++) {
      terrain[idx(x, y)] = terrainForBiome('lava', rng);
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = cinderholm.x0 + Math.floor(rng() * (cinderholm.x1 - cinderholm.x0));
    const y = cinderholm.y0 + Math.floor(rng() * (cinderholm.y1 - cinderholm.y0));
    placer.place(rng() < 0.5 ? 'boulder_small' : 'stalagmite', x, y, terrain);
  }
  placer.place('rocks_coal', 475, 472, terrain);
  placer.place('rocks_coal', 482, 478, terrain);
  carvePath(terrain, [{ x: 440, y: 455 }, { x: 460, y: 465 }, { x: 475, y: 475 }], 1);
}

// ─── step 6: biome scatter ──────────────────────────────────────────────────

const BIOME_OBJECTS: Record<Biome, { types: string[]; density: number }> = {
  legacy: { types: [], density: 0 },
  sea: { types: [], density: 0 },
  coast: { types: ['driftwood', 'reeds', 'bush'], density: 0.012 },
  plains: { types: ['tree', 'bush', 'boulder_small', 'fern'], density: 0.018 },
  forest: { types: ['tree', 'oak', 'willow', 'bush', 'fern', 'mushroom_patch'], density: 0.035 },
  marsh: { types: ['reeds', 'bush', 'mushroom_patch'], density: 0.028 },
  desert: { types: ['cactus', 'dead_tree_deco', 'boulder_small'], density: 0.022 },
  mountain: { types: ['boulder_small', 'rock_climb', 'snow_pine'], density: 0.025 },
  snow: { types: ['snow_pine', 'ice_spike', 'boulder_small'], density: 0.03 },
  cave: { types: ['stalagmite', 'boulder_small'], density: 0.02 },
  lava: { types: ['stalagmite', 'boulder_small'], density: 0.015 },
  village: { types: ['tree', 'bush', 'fern'], density: 0.008 },
  tanglewood: { types: ['tree', 'oak', 'yew', 'bush', 'fern', 'mushroom_patch'], density: 0.12 },
};

function scatterWildObjects(terrain: TerrainGrid, placer: ObjectPlacer, targetTotal: number) {
  while (placer.objects.length < targetTotal) {
    let placed = 0;
    for (let y = 0; y < NEW_H; y++) {
      for (let x = 0; x < NEW_W; x++) {
        if (!isNewZone(x, y)) continue;
        if (inRect(x, y, { x0: 290, y0: 255, x1: 310, y1: 275 })) continue;
        if (inRect(x, y, { x0: 410, y0: 115, x1: 430, y1: 130 })) continue;
        if (inRect(x, y, { x0: 68, y0: 372, x1: 88, y1: 392 })) continue;

        const biome = biomeAt(x, y);
        const cfg = BIOME_OBJECTS[biome];
        if (!cfg || cfg.density === 0) continue;
        if (rng() > cfg.density) continue;

        const type = cfg.types[Math.floor(rng() * cfg.types.length)];
        if (placer.place(type, x, y, terrain)) placed++;
        if (placer.objects.length >= targetTotal) break;
      }
      if (placer.objects.length >= targetTotal) break;
    }
    if (placed === 0) break;
  }
}

// ─── step 7: interior decoration ──────────────────────────────────────────

function isDoorTile(x: number, y: number, terrain: TerrainGrid): boolean {
  if (terrain[idx(x, y)] !== T.FLOOR) return false;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= NEW_W || ny >= NEW_H) continue;
    const t = terrain[idx(nx, ny)];
    if (t !== T.FLOOR && t !== T.WALL) return true;
  }
  return false;
}

const INTERIOR_THEMES: InteriorTheme[] = [
  { name: 'Stonecourt castle', rect: { x0: 13, y0: 28, x1: 28, y1: 46 }, props: ['banner', 'bookshelf', 'chair', 'table', 'bed', 'rug_deco', 'cauldron', 'barrel', 'crate'], density: 0.22 },
  { name: 'Aldgate inn', rect: { x0: 85, y0: 18, x1: 95, y1: 28 }, props: ['chair', 'table', 'bed', 'barrel', 'rug_deco', 'cauldron'], density: 0.28 },
  { name: 'Armoury', rect: { x0: 112, y0: 18, x1: 122, y1: 28 }, props: ['weapon_rack', 'barrel', 'crate', 'table', 'banner'], density: 0.25 },
  { name: 'Grocer', rect: { x0: 112, y0: 40, x1: 122, y1: 50 }, props: ['crate', 'barrel', 'table', 'chair', 'hay_bale'], density: 0.24 },
  { name: 'Gun guild', rect: { x0: 112, y0: 18, x1: 124, y1: 24 }, props: ['weapon_rack', 'table', 'chair', 'barrel', 'banner'], density: 0.3 },
  { name: 'Port warehouses', rect: { x0: 95, y0: 185, x1: 125, y1: 205 }, props: ['crate', 'barrel', 'hay_bale', 'table', 'chair'], density: 0.15 },
  { name: 'Boghollow huts', rect: { x0: 8, y0: 58, x1: 40, y1: 110 }, props: ['cauldron', 'barrel', 'crate', 'rug_deco', 'chair', 'hay_bale'], density: 0.12 },
  { name: 'Eldermere general store', rect: { x0: 294, y0: 258, x1: 299, y1: 262 }, props: ['crate', 'barrel', 'table', 'chair'], density: 0.35 },
  { name: 'Eldermere elder hall', rect: { x0: 302, y0: 257, x1: 308, y1: 262 }, props: ['bookshelf', 'table', 'chair', 'banner', 'rug_deco'], density: 0.3 },
  { name: 'Stonewatch tower', rect: { x0: 418, y0: 117, x1: 422, y1: 122 }, props: ['weapon_rack', 'table', 'chair', 'barrel', 'banner'], density: 0.28 },
  { name: 'Stonewatch trapper shop', rect: { x0: 424, y0: 122, x1: 427, y1: 125 }, props: ['crate', 'barrel', 'rug_deco', 'table'], density: 0.32 },
  { name: 'Gullswreck hut', rect: { x0: 76, y0: 376, x1: 80, y1: 379 }, props: ['chair', 'table', 'bed', 'barrel', 'crate'], density: 0.35 },
  { name: 'Tanglewood shack', rect: { x0: 372, y0: 345, x1: 375, y1: 347 }, props: ['crate', 'barrel', 'chair', 'rug_deco'], density: 0.4 },
  { name: 'Marsh ruins', rect: { x0: 448, y0: 298, x1: 452, y1: 301 }, props: ['crate', 'barrel', 'cauldron', 'banner'], density: 0.25 },
];

function decorateInteriors(terrain: TerrainGrid, placer: ObjectPlacer) {
  for (const theme of INTERIOR_THEMES) {
    for (let y = theme.rect.y0; y <= theme.rect.y1; y++) {
      for (let x = theme.rect.x0; x <= theme.rect.x1; x++) {
        if (terrain[idx(x, y)] !== T.FLOOR) continue;
        if (isDoorTile(x, y, terrain)) continue;
        if (placer.occupied.has(idx(x, y))) continue;
        if (rng() > theme.density) continue;
        const prop = theme.props[Math.floor(rng() * theme.props.length)];
        placer.placeOnFloor(prop, x, y, terrain);
      }
    }
  }
}

// ─── step 9: spawns ─────────────────────────────────────────────────────────

function appendSpawns(existing: SpawnsFile): SpawnsFile {
  const npcSpawns = [...existing.npcSpawns];
  const groundSpawns = [...existing.groundSpawns];
  const occupied = new Set(existing.npcSpawns.map((s) => `${s.x},${s.y}`));

  function addNpc(id: string, x: number, y: number) {
    const k = `${x},${y}`;
    if (occupied.has(k)) return;
    occupied.add(k);
    npcSpawns.push({ id, x, y });
  }

  function scatterNpc(id: string, r: Rect, count: number) {
    for (let i = 0; i < count * 3 && i < count * 10; i++) {
      const x = r.x0 + Math.floor(rng() * (r.x1 - r.x0 + 1));
      const y = r.y0 + Math.floor(rng() * (r.y1 - r.y0 + 1));
      addNpc(id, x, y);
      if (npcSpawns.filter((s) => s.id === id && inRect(s.x, s.y, r)).length >= count) break;
    }
  }

  addNpc('village_elder', 300, 265);
  addNpc('wayfarer', 345, 310);
  addNpc('trapper', 420, 122);
  addNpc('boatman', 78, 382);

  scatterNpc('bear', { x0: 260, y0: 280, x1: 420, y1: 400 }, 8);
  scatterNpc('dire_wolf', { x0: 280, y0: 50, x1: 350, y1: 120 }, 6);
  scatterNpc('forest_spider', { x0: 350, y0: 320, x1: 400, y1: 360 }, 12);
  scatterNpc('ruin_wraith', { x0: 430, y0: 290, x1: 470, y1: 320 }, 8);
  scatterNpc('pirate', { x0: 68, y0: 372, x1: 100, y1: 395 }, 6);
  scatterNpc('pirate', { x0: 250, y0: 400, x1: 320, y1: 430 }, 4);
  scatterNpc('cinder_imp', { x0: 460, y0: 460, x1: 490, y1: 490 }, 10);
  scatterNpc('cow', { x0: 290, y0: 255, x1: 320, y1: 280 }, 4);
  scatterNpc('chicken', { x0: 292, y0: 258, x1: 308, y1: 272 }, 6);
  scatterNpc('goblin', { x0: 300, y0: 420, x1: 380, y1: 460 }, 8);
  scatterNpc('goblin', { x0: 350, y0: 330, x1: 400, y1: 360 }, 5);

  const groundOccupied = new Set(existing.groundSpawns.map((s) => `${s.x},${s.y}`));
  function addGround(item: string, x: number, y: number, respawnTicks = 80) {
    const k = `${x},${y}`;
    if (groundOccupied.has(k)) return;
    groundOccupied.add(k);
    groundSpawns.push({ item, x, y, respawnTicks });
  }

  function scatterGround(item: string, r: Rect, count: number, ticks = 80) {
    let n = 0;
    for (let attempt = 0; attempt < count * 8 && n < count; attempt++) {
      const x = r.x0 + Math.floor(rng() * (r.x1 - r.x0 + 1));
      const y = r.y0 + Math.floor(rng() * (r.y1 - r.y0 + 1));
      const k = `${x},${y}`;
      if (groundOccupied.has(k)) continue;
      groundOccupied.add(k);
      groundSpawns.push({ item, x, y, respawnTicks: ticks });
      n++;
    }
  }

  scatterGround('grimy_guam', { x0: 430, y0: 290, x1: 470, y1: 320 }, 12);
  scatterGround('grimy_marrentill', { x0: 350, y0: 320, x1: 400, y1: 360 }, 10);
  scatterGround('grimy_ranarr', { x0: 280, y0: 280, x1: 380, y1: 380 }, 8);
  scatterGround('coins', { x0: 290, y0: 255, x1: 380, y1: 460 }, 15, 120);
  scatterGround('coins', { x0: 68, y0: 372, x1: 88, y1: 392 }, 5, 100);
  scatterGround('raw_shrimps', { x0: 68, y0: 372, x1: 88, y1: 392 }, 6, 60);
  scatterGround('raw_shrimps', { x0: 318, y0: 242, x1: 340, y1: 258 }, 4, 60);
  scatterGround('raw_anchovies', { x0: 318, y0: 242, x1: 340, y1: 258 }, 3, 70);

  return { npcSpawns, groundSpawns };
}

// ─── stats ──────────────────────────────────────────────────────────────────

function terrainBreakdown(terrain: TerrainGrid): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < terrain.length; i++) {
    const name = terrainName(terrain[i]);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

// ─── main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('Larpscape world generator — 224 → 500 expansion\n');

  const mapPath = path.join(DATA, 'map.json');
  const spawnsPath = path.join(DATA, 'spawns.json');

  const legacyMap = JSON.parse(readFileSync(mapPath, 'utf8')) as {
    width: number; height: number; terrain: string; objects: MapObject[];
  };

  if (legacyMap.width !== LEGACY || legacyMap.height !== LEGACY) {
    console.warn(`Warning: expected legacy map ${LEGACY}×${LEGACY}, got ${legacyMap.width}×${legacyMap.height}`);
  }

  const legacyTerrain = decodeTerrain(legacyMap.terrain, legacyMap.width, legacyMap.height);
  const terrain = buildTerrain(legacyTerrain);

  carveLegacyTransitions(terrain);

  const placer = new ObjectPlacer(legacyMap.objects);
  console.log(`Loaded ${placer.objects.length} legacy objects`);

  stampRegions(terrain, placer);
  scatterWildObjects(terrain, placer, 6200);
  decorateInteriors(terrain, placer);

  const outMap = {
    width: NEW_W,
    height: NEW_H,
    terrain: encodeTerrain(terrain),
    objects: placer.objects,
  };
  writeFileSync(mapPath, JSON.stringify(outMap, null, 2) + '\n');
  console.log(`Wrote ${mapPath} (${NEW_W}×${NEW_H}, ${placer.objects.length} objects)`);

  const existingSpawns = JSON.parse(readFileSync(spawnsPath, 'utf8')) as SpawnsFile;
  const prevNpc = existingSpawns.npcSpawns.length;
  const prevGround = existingSpawns.groundSpawns.length;
  const updatedSpawns = appendSpawns(existingSpawns);
  writeFileSync(spawnsPath, JSON.stringify(updatedSpawns, null, 2) + '\n');
  console.log(
    `Wrote ${spawnsPath} (+${updatedSpawns.npcSpawns.length - prevNpc} NPC spawns, ` +
    `+${updatedSpawns.groundSpawns.length - prevGround} ground spawns)`,
  );

  const breakdown = terrainBreakdown(terrain);
  console.log('\n── Terrain breakdown ──');
  const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sorted) {
    const pct = ((count / terrain.length) * 100).toFixed(1);
    console.log(`  ${name.padEnd(8)} ${String(count).padStart(7)}  (${pct}%)`);
  }

  console.log('\n── Summary ──');
  console.log(`  Total objects:     ${placer.objects.length}`);
  console.log(`  Legacy preserved:  ${LEGACY}×${LEGACY} at origin`);
  console.log(`  New NPC spawns:    ${updatedSpawns.npcSpawns.length} total`);
  console.log(`  New ground spawns: ${updatedSpawns.groundSpawns.length} total`);
  console.log('\nDone.');
}

main();
