// World map overlay: full-map view with terrain, location icons, legend, and the
// player's position. Opened from a globe button under the minimap (or the M key).
//
// Phase 7: the world is 1000x1000, so the base px-per-tile scale adapts to keep the
// canvas at ~2048px, terrain is blitted via a single ImageData put (no 1M fillRects),
// zoom buttons re-render at 1x/2x/4x (canvas capped at 4096px), and region labels are
// generated from the world module's POIS export on top of the legacy hand-placed set.

import { state } from './game';
import { terrain, objects, MAP_W, MAP_H, key, T } from './world';
import * as world from './world';

// adaptive base scale: px per tile, canvas never exceeds ~2048px at 1x
const BASE_SCALE = Math.max(1, Math.floor(2048 / MAP_W));
const MAX_CANVAS = 4096; // hard cap on canvas dimension across zoom levels

let zoom = 1; // 1 | 2 | 4 (clamped so MAP_W * BASE_SCALE * zoom <= MAX_CANVAS)
function S(): number { return BASE_SCALE * zoom; }
function maxZoom(): number {
  let z = 1;
  for (const c of [2, 4]) if (Math.max(MAP_W, MAP_H) * BASE_SCALE * c <= MAX_CANVAS) z = c;
  return z;
}

const TERRAIN_COLS: Record<number, string> = {
  [T.GRASS]: '#4e7a36', [T.WATER]: '#3f5e9e', [T.PATH]: '#9a8a66', [T.FLOOR]: '#8a8278',
  [T.WALL]: '#d8d8d8', [T.BRIDGE]: '#8a6a3e', [T.SWAMP]: '#44552c', [T.FENCE]: '#7a5a2a',
  [T.SAND]: '#b8a878', [T.DIRT]: '#7a5c38', [T.FLOWERS]: '#5e8a40', [T.CAVE]: '#3c3a42',
  [T.LAVA]: '#d84a10', [T.ROCK]: '#6e6a64', [T.SNOW]: '#dde8ee', [T.ICE]: '#a8cede',
  [T.DSAND]: '#d2b478',
};

// precomputed [r,g,b] per terrain id for the ImageData blit
const TERRAIN_RGB: Record<number, [number, number, number]> = {};
for (const k of Object.keys(TERRAIN_COLS)) {
  const hex = TERRAIN_COLS[+k];
  TERRAIN_RGB[+k] = [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// icon glyph + color per point of interest
interface PoiDef { glyph: string; color: string; bg: string; label: string; }
const POI: Record<string, PoiDef> = {
  bank_booth: { glyph: '$', color: '#1a1a1a', bg: '#f0d040', label: 'Bank' },
  ge_booth: { glyph: 'E', color: '#fff', bg: '#b06010', label: 'Aldgate Exchange' },
  altar: { glyph: '✟', color: '#fff', bg: '#7a4ab0', label: 'Altar' },
  air_altar: { glyph: 'R', color: '#fff', bg: '#4a6ab8', label: 'Runecrafting altar' },
  furnace: { glyph: 'F', color: '#fff', bg: '#c05818', label: 'Furnace' },
  anvil: { glyph: 'A', color: '#fff', bg: '#585858', label: 'Anvil' },
  range: { glyph: 'C', color: '#fff', bg: '#a03828', label: 'Cooking range' },
  spinning_wheel: { glyph: 'S', color: '#fff', bg: '#8a6a9a', label: 'Spinning wheel' },
  workbench: { glyph: 'W', color: '#fff', bg: '#6a5030', label: 'Workbench' },
  fishing_spot: { glyph: 'f', color: '#fff', bg: '#2878b8', label: 'Net fishing' },
  rod_fishing_spot: { glyph: 'f', color: '#fff', bg: '#18589a', label: 'Rod fishing' },
  cave_mouth: { glyph: 'D', color: '#fff', bg: '#28242e', label: 'Cave entrance' },
  bake_stall: { glyph: 't', color: '#1a1a1a', bg: '#d8b868', label: 'Market stall' },
  fountain: { glyph: 'o', color: '#fff', bg: '#48a0c8', label: 'Fountain' },
  fire_altar: { glyph: 'R', color: '#fff', bg: '#b8501a', label: 'Fire altar' },
  lobster_spot: { glyph: 'f', color: '#fff', bg: '#1a6a86', label: 'Lobster fishing' },
  harpoon_spot: { glyph: 'f', color: '#fff', bg: '#123a6e', label: 'Harpoon fishing' },
};
// mining icon covers all rock types
const ROCK_TYPES = ['rocks_copper', 'rocks_tin', 'rocks_iron', 'rocks_coal', 'rocks_essence', 'rocks_mithril', 'rocks_adamantite', 'rocks_gold', 'rocks_runite', 'rocks_gem'];
const MINE_POI: PoiDef = { glyph: 'p', color: '#fff', bg: '#5a5a66', label: 'Mining' };
// high-level trees share the sparse woodcutting icon with oaks/willows
const ICON_TREES = ['oak', 'willow', 'maple', 'yew', 'magic_tree'];
const TREE_POI: PoiDef = { glyph: 'w', color: '#fff', bg: '#2e6a1e', label: 'Woodcutting' };
const BOSS_POI: PoiDef = { glyph: '☠', color: '#fff', bg: '#a01818', label: 'Boss lair' };
const QUEST_POI: PoiDef = { glyph: '!', color: '#fff', bg: '#2858c8', label: 'Quest start' };
const SHOP_POI: PoiDef = { glyph: '€', color: '#1a1a1a', bg: '#c8c060', label: 'Shop' };

// fixed markers (npc-based points the object scan can't see)
const NPC_MARKERS: { x: number; y: number; def: PoiDef }[] = [
  { x: 150, y: 35, def: QUEST_POI },   // slayer master (Embers Below)
  { x: 137, y: 43, def: QUEST_POI },   // cook (Empty Larder)
  { x: 156, y: 23, def: QUEST_POI },   // gardener (Seeds / Heart of the Bog)
  { x: 209, y: 22, def: QUEST_POI },   // innkeeper (Streets of Aldgate)
  { x: 199, y: 38, def: QUEST_POI },   // city guard (Warlord's Banner)
  { x: 266, y: 22, def: BOSS_POI },   // goblin warlord
  { x: 144, y: 96, def: BOSS_POI },    // bog horror
  { x: 260, y: 152, def: BOSS_POI },  // shadow drake
  { x: 155, y: 49, def: SHOP_POI },    // general store
  { x: 162, y: 30, def: SHOP_POI },    // magic tutor
  { x: 236, y: 23, def: SHOP_POI },   // armoury
  { x: 236, y: 44, def: SHOP_POI },   // grocer
  // phase 6 districts
  { x: 325, y: 20, def: BOSS_POI },   // Maraza the Rimebound (ice queen)
  { x: 150, y: 200, def: BOSS_POI },  // Saif the Red Smile (bandit king)
  { x: 330, y: 150, def: BOSS_POI },  // Korr the Molten (magma fiend)
  { x: 292, y: 54, def: QUEST_POI },  // mountain guide (foothills)
  { x: 133, y: 178, def: QUEST_POI },  // desert nomad (tent)
  { x: 238, y: 210, def: QUEST_POI }, // harbormaster (dock end)
  { x: 138, y: 176, def: QUEST_POI },  // gem trader (rumours)
  { x: 227, y: 187, def: SHOP_POI },  // fishmonger
  { x: 132, y: 180, def: SHOP_POI },   // nomad supplies tent
  { x: 137, y: 178, def: SHOP_POI },   // gem stall
];

// legacy hand-placed labels for the original 224x224 region
const LEGACY_LABELS: { x: number; y: number; text: string }[] = [
  { x: 141, y: 37, text: 'The Castle' },
  { x: 223, y: 30, text: 'Aldgate' },
  { x: 266, y: 21, text: "Warlord's Fort" },
  { x: 142, y: 68, text: 'Swamp Mine' },
  { x: 144, y: 95, text: 'Deep Bog' },
  { x: 225, y: 135, text: 'The Underdeep' },
  { x: 182, y: 28, text: 'River' },
  { x: 184, y: 77, text: 'Hunter Meadow' },
  { x: 316, y: 55, text: 'Frostpeak Mountains' },
  { x: 155, y: 190, text: 'Sunscorch Desert' },
  { x: 225, y: 196, text: 'Port Brackwater' },
  { x: 310, y: 135, text: 'Ashen Depths' },
];

// legacy labels + entries generated from the world module's POIS export.
// world.ts is being rewritten concurrently — read POIS defensively per the SPEC contract.
function regionLabels(): { x: number; y: number; text: string }[] {
  const labels = [...LEGACY_LABELS];
  const pois: { id: string; label?: string; name?: string; x: number; y: number }[] =
    (world as any).POIS ?? [];
  for (const p of pois) {
    const text = p?.label ?? p?.name;
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !text) continue;
    // skip anything sitting inside the legacy box already covered by hand labels
    // (legacy box right edge shifted +120 by the west expansion: 224 -> 344)
    if (p.x < 344 && p.y < 224) continue;
    labels.push({ x: p.x, y: p.y, text });
  }
  return labels;
}

let overlay: HTMLDivElement | null = null;
let mapCanvas: HTMLCanvasElement | null = null;
let zoomBtns: HTMLButtonElement[] = [];
let renderedZoom = 0; // zoom level the base was last rendered at (0 = never)

function buildOverlay() {
  if (overlay) return;
  const style = document.createElement('style');
  style.textContent = `
    #worldmap-overlay {
      position: fixed; inset: 0; z-index: 80; display: none;
      background: rgba(10, 8, 5, 0.85);
      align-items: center; justify-content: center;
    }
    .wm-frame {
      background: #c0a886; border: 5px solid #3e3529; border-radius: 4px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.9);
      padding: 8px; display: flex; gap: 8px; max-width: 96vw; max-height: 94vh;
    }
    .wm-map-wrap { overflow: auto; border: 2px solid #3e3529; background: #000; max-width: 70vw; max-height: 86vh; }
    .wm-map-wrap canvas { display: block; image-rendering: pixelated; }
    .wm-side { width: 210px; display: flex; flex-direction: column; font-family: Verdana, sans-serif; }
    .wm-title { font-weight: bold; color: #5a2000; font-size: 15px; text-align: center; margin: 2px 0 8px; }
    .wm-zoom-row { display: flex; gap: 4px; margin: 0 0 8px; justify-content: center; }
    .wm-zoom-btn {
      background: linear-gradient(#8a7450, #6a5638); color: #f0e6c8;
      border: 2px outset #9a8460; border-radius: 3px; cursor: pointer;
      font-weight: bold; font-size: 11px; padding: 4px 7px; min-width: 30px;
      font-family: Verdana, sans-serif;
    }
    .wm-zoom-btn:hover { filter: brightness(1.15); }
    .wm-zoom-btn.wm-zoom-active { background: linear-gradient(#5a8a40, #3e6a28); border-color: #7ab058; }
    .wm-zoom-btn:disabled { opacity: 0.4; cursor: default; }
    .wm-legend { flex: 1; overflow-y: auto; font-size: 11px; color: #3a2d18; }
    .wm-leg-row { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
    .wm-leg-icon {
      width: 16px; height: 16px; border-radius: 3px; border: 1px solid #000;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: bold; flex: 0 0 auto;
    }
    .wm-close {
      margin-top: 8px; background: linear-gradient(#8a2020, #5e1414); color: #fff;
      border: 2px outset #a33; padding: 6px; font-weight: bold; cursor: pointer;
      border-radius: 3px; font-size: 12px;
    }
    .wm-hint { font-size: 10px; color: #6a543a; text-align: center; margin-top: 6px; }
    #worldmap-btn {
      position: absolute; bottom: 6px; right: 10px; width: 30px; height: 30px;
      background: radial-gradient(#3878c8 30%, #1e4a86); border: 2px solid #1c1812;
      border-radius: 50%; cursor: pointer; z-index: 3;
      display: flex; align-items: center; justify-content: center;
      color: #d8eaff; font-size: 15px; font-weight: bold;
      box-shadow: 0 0 0 2px #5a4e3c, 0 2px 6px rgba(0,0,0,0.6);
    }
    #worldmap-btn:hover { filter: brightness(1.2); }
  `;
  document.head.appendChild(style);

  overlay = document.createElement('div');
  overlay.id = 'worldmap-overlay';
  overlay.style.display = 'none'; // inline so isMapOpen() reads correctly before first open

  const frame = document.createElement('div');
  frame.className = 'wm-frame';

  const mapWrap = document.createElement('div');
  mapWrap.className = 'wm-map-wrap';
  mapCanvas = document.createElement('canvas');
  mapCanvas.width = MAP_W * S();
  mapCanvas.height = MAP_H * S();
  mapWrap.appendChild(mapCanvas);
  frame.appendChild(mapWrap);

  const side = document.createElement('div');
  side.className = 'wm-side';
  side.innerHTML = `<div class="wm-title">World Map</div>`;

  // zoom controls: [-][1x][2x][4x][+]
  const zoomRow = document.createElement('div');
  zoomRow.className = 'wm-zoom-row';
  zoomBtns = [];
  const mkBtn = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.className = 'wm-zoom-btn';
    b.textContent = label;
    b.onclick = onClick;
    zoomRow.appendChild(b);
    zoomBtns.push(b);
    return b;
  };
  mkBtn('-', () => setZoom(zoom === 4 ? 2 : 1));
  mkBtn('1x', () => setZoom(1));
  mkBtn('2x', () => setZoom(2));
  mkBtn('4x', () => setZoom(4));
  mkBtn('+', () => setZoom(zoom === 1 ? 2 : 4));
  side.appendChild(zoomRow);

  const legend = document.createElement('div');
  legend.className = 'wm-legend';
  const legendEntries: PoiDef[] = [
    POI.bank_booth, POI.ge_booth, SHOP_POI, QUEST_POI, BOSS_POI,
    MINE_POI, TREE_POI, POI.fishing_spot, POI.rod_fishing_spot,
    POI.lobster_spot, POI.harpoon_spot,
    POI.furnace, POI.anvil, POI.range, POI.spinning_wheel, POI.workbench,
    POI.altar, POI.air_altar, POI.fire_altar, POI.cave_mouth, POI.bake_stall, POI.fountain,
  ];
  for (const e of legendEntries) {
    const row = document.createElement('div');
    row.className = 'wm-leg-row';
    row.innerHTML = `<span class="wm-leg-icon" style="background:${e.bg};color:${e.color}">${e.glyph}</span> ${e.label}`;
    legend.appendChild(row);
  }
  const youRow = document.createElement('div');
  youRow.className = 'wm-leg-row';
  youRow.innerHTML = `<span class="wm-leg-icon" style="background:#fff;color:#fff;border-radius:50%"></span> You are here`;
  legend.insertBefore(youRow, legend.firstChild);
  side.appendChild(legend);

  const close = document.createElement('button');
  close.className = 'wm-close';
  close.textContent = 'Close map';
  close.onclick = closeMap;
  side.appendChild(close);
  const hint = document.createElement('div');
  hint.className = 'wm-hint';
  hint.textContent = 'Press M or Esc to close';
  side.appendChild(hint);
  frame.appendChild(side);

  overlay.appendChild(frame);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMap(); });
  document.body.appendChild(overlay);
  updateZoomButtons();
}

function updateZoomButtons() {
  const mz = maxZoom();
  // buttons: [-, 1x, 2x, 4x, +]
  const levels = [0, 1, 2, 4, 0];
  zoomBtns.forEach((b, i) => {
    const lvl = levels[i];
    if (lvl) {
      b.disabled = lvl > mz;
      b.classList.toggle('wm-zoom-active', lvl === zoom);
    } else {
      b.disabled = i === 0 ? zoom <= 1 : zoom >= mz;
    }
  });
}

function setZoom(z: number) {
  const clamped = Math.min(z, maxZoom());
  if (clamped === zoom) { updateZoomButtons(); return; }
  zoom = clamped;
  updateZoomButtons();
  renderBase();
  centerOnPlayer();
  drawPlayerDot();
}

function centerOnPlayer() {
  if (!overlay) return;
  const wrap = overlay.querySelector('.wm-map-wrap') as HTMLElement | null;
  const p = state.player;
  if (p && wrap) {
    wrap.scrollLeft = p.x * S() - wrap.clientWidth / 2;
    wrap.scrollTop = p.y * S() - wrap.clientHeight / 2;
  }
}

function drawIcon(g: CanvasRenderingContext2D, x: number, y: number, def: PoiDef, size = 12) {
  const s = S();
  const px = x * s + s / 2, py = y * s + s / 2;
  g.fillStyle = def.bg;
  g.strokeStyle = '#000';
  g.lineWidth = 1;
  const r = size / 2;
  g.beginPath();
  // rounded square
  g.roundRect(px - r, py - r, size, size, 3);
  g.fill(); g.stroke();
  g.fillStyle = def.color;
  g.font = `bold ${size - 3}px Verdana`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(def.glyph, px, py + 0.5);
}

// FAST terrain blit: write every pixel into one ImageData and put it once,
// instead of MAP_W*MAP_H fillRect calls (1M+ at the Phase 7 world size).
function blitTerrain(g: CanvasRenderingContext2D) {
  const s = S();
  const w = MAP_W * s, h = MAP_H * s;
  const img = g.createImageData(w, h);
  const data = img.data;
  for (let ty = 0; ty < MAP_H; ty++) {
    // build one row of pixels (the first pixel-row of this tile-row), then copy it s-1 times
    const rowStart = ty * s * w * 4;
    for (let tx = 0; tx < MAP_W; tx++) {
      const rgb = TERRAIN_RGB[terrain[key(tx, ty)]] ?? [0, 0, 0];
      const base = rowStart + tx * s * 4;
      for (let px = 0; px < s; px++) {
        const i = base + px * 4;
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
      }
    }
    const rowBytes = w * 4;
    for (let py = 1; py < s; py++) {
      data.copyWithin(rowStart + py * rowBytes, rowStart, rowStart + rowBytes);
    }
  }
  g.putImageData(img, 0, 0);
}

function renderBase() {
  if (!mapCanvas) return;
  const s = S();
  mapCanvas.width = MAP_W * s;
  mapCanvas.height = MAP_H * s;
  const g = mapCanvas.getContext('2d')!;
  blitTerrain(g);

  // trees as simple dots (woodcutting areas readable without icon spam)
  g.fillStyle = '#1e4a12';
  for (const o of objects) {
    if (o.type === 'tree' || ICON_TREES.includes(o.type)) {
      g.beginPath();
      g.arc(o.x * s + s / 2, o.y * s + s / 2, Math.max(0.8, s * 0.45), 0, 7);
      g.fill();
    }
  }
  // sparse icons: one mining/tree icon per cluster. Radii widened for the Phase 7
  // megamap so the canvas stays readable (mining/tree icons every ~12 tiles min).
  const iconed = new Set<number>();
  const sparse = (x: number, y: number, radius: number) => {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (iconed.has(key(Math.max(0, Math.min(MAP_W - 1, x + dx)), Math.max(0, Math.min(MAP_H - 1, y + dy))))) return false;
    }
    iconed.add(key(x, y));
    return true;
  };
  for (const o of objects) {
    if (ROCK_TYPES.includes(o.type)) { if (sparse(o.x, o.y, 12)) drawIcon(g, o.x, o.y, MINE_POI); continue; }
    if (ICON_TREES.includes(o.type)) { if (sparse(o.x, o.y, 12)) drawIcon(g, o.x, o.y, TREE_POI); continue; }
    // deco objects (bush/fern/reeds/...) have no POI entry, so the lookup skips them
    const def = POI[o.type];
    if (def && sparse(o.x, o.y, 4)) drawIcon(g, o.x, o.y, def);
  }
  for (const m of NPC_MARKERS) drawIcon(g, m.x, m.y, m.def, 13);

  // region labels: legacy + generated from world POIS
  g.font = 'bold 13px Georgia';
  g.textAlign = 'center';
  for (const l of regionLabels()) {
    const px = l.x * s + s / 2, py = l.y * s - 12;
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 3;
    g.strokeText(l.text, px, py);
    g.fillStyle = '#f0e6c8';
    g.fillText(l.text, px, py);
  }
  renderedZoom = zoom;
  prevDotTiles = []; // fresh base: nothing to restore (avoids erasing icons)
}

let playerDotTimer: number | null = null;

// OSRS-convention live entity dots: yellow for NPCs, white for other players,
// red for ground items. Previous dot tiles get their terrain restored each
// refresh so moving entities don't smear trails over the base render.
let prevDotTiles: { x: number; y: number }[] = [];

function drawEntityDots() {
  if (!mapCanvas) return;
  const g = mapCanvas.getContext('2d')!;
  const s = S();
  // restore terrain under last frame's dots
  for (const t of prevDotTiles) {
    g.fillStyle = TERRAIN_COLS[terrain[key(t.x, t.y)]] ?? '#000';
    g.fillRect(t.x * s, t.y * s, s, s);
  }
  prevDotTiles = [];
  const r = Math.max(1.5, s * 0.45);
  const dot = (x: number, y: number, fill: string) => {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    g.fillStyle = fill;
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x * s + s / 2, y * s + s / 2, r, 0, 7);
    g.fill(); g.stroke();
    prevDotTiles.push({ x, y });
  };
  for (const gi of state.groundItems) dot(gi.x, gi.y, '#e02020');
  for (const n of state.npcs) if (!n.dead) dot(n.x, n.y, '#f0e030');
  for (const rp of state.remotePlayers) if (!rp.dead) dot(rp.x, rp.y, '#ffffff');
}

function drawPlayerDot() {
  // re-render base then dot, so the pulse animates cleanly
  if (!mapCanvas) return;
  const g = mapCanvas.getContext('2d')!;
  const p = state.player;
  if (!p) return;
  const s = S();
  const px = p.x * s + s / 2, py = p.y * s + s / 2;
  const pulse = 4 + Math.sin(performance.now() / 250) * 1.5;
  g.fillStyle = '#fff';
  g.strokeStyle = '#000';
  g.beginPath(); g.arc(px, py, pulse, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#e02020';
  g.beginPath(); g.arc(px, py, 2.2, 0, 7); g.fill();
}

export function openMap() {
  buildOverlay();
  if (renderedZoom !== zoom) renderBase();
  overlay!.style.display = 'flex';
  centerOnPlayer();
  if (playerDotTimer === null) {
    playerDotTimer = window.setInterval(() => {
      if (overlay!.style.display === 'none') return;
      renderBaseRegion();
      drawEntityDots();
      drawPlayerDot();
    }, 120);
  }
}

// cheap partial refresh: redraw a small square around the player so the pulse animates
function renderBaseRegion() {
  if (!mapCanvas) return;
  const g = mapCanvas.getContext('2d')!;
  const p = state.player;
  if (!p) return;
  const s = S();
  const r = Math.max(3, Math.ceil(7 / s)); // cover the pulse radius even at 1px tiles
  for (let y = Math.max(0, p.y - r); y <= Math.min(MAP_H - 1, p.y + r); y++) {
    for (let x = Math.max(0, p.x - r); x <= Math.min(MAP_W - 1, p.x + r); x++) {
      g.fillStyle = TERRAIN_COLS[terrain[key(x, y)]] ?? '#000';
      g.fillRect(x * s, y * s, s, s);
    }
  }
}

export function closeMap() {
  if (overlay) overlay.style.display = 'none';
  if (playerDotTimer !== null) { clearInterval(playerDotTimer); playerDotTimer = null; }
}

export function isMapOpen(): boolean {
  return !!overlay && overlay.style.display !== 'none';
}

// globe button under the minimap + M hotkey
function init() {
  const area = document.getElementById('minimap-area');
  if (area && !document.getElementById('worldmap-btn')) {
    const btn = document.createElement('div');
    btn.id = 'worldmap-btn';
    btn.title = 'World map (M)';
    btn.textContent = '🗺';
    btn.onclick = () => (isMapOpen() ? closeMap() : openMap());
    buildOverlay(); // ensures the stylesheet exists for the button
    area.appendChild(btn);
  }
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'm' || e.key === 'M') { if (state.started) (isMapOpen() ? closeMap() : openMap()); }
    if (e.key === 'Escape' && isMapOpen()) closeMap();
  });
}

init();
