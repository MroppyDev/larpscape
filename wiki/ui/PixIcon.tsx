// PixIcon — renders a serialized item sprite (pixmap grid + palette from
// wiki-data.json) onto a small pixelated <canvas>, replicating the game's
// drawPixmap. Unknown / not-yet-authored ids render a neutral '?' tile.
import { useEffect, useRef } from 'react';
import wikiData from './data/wiki-data.json';
import type { SpriteSpec, WikiData } from './types';

const SPRITES: Record<string, SpriteSpec> = (wikiData as WikiData).sprites ?? {};

const GRID = 16;   // sprites are authored on a 16x16 grid
const SCALE = 2;   // internal render scale (32x32 backing store)

export function spriteFor(id: string): SpriteSpec | null {
  return SPRITES[id] ?? null;
}

// Draws the sprite (or '?' fallback) into a canvas. Shared by the <PixIcon>
// component and the article-HTML hydrator in App.tsx.
export function drawItemSprite(canvas: HTMLCanvasElement, id: string): void {
  canvas.width = GRID * SCALE;
  canvas.height = GRID * SCALE;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = false;
  const spec = spriteFor(id);
  if (spec) {
    for (let y = 0; y < spec.grid.length; y++) {
      const row = spec.grid[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const col = spec.palette[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
    return;
  }
  // '?' fallback — art not authored yet.
  g.fillStyle = '#d8d2c0';
  g.fillRect(3, 3, 26, 26);
  g.strokeStyle = '#8a8270';
  g.lineWidth = 2;
  g.strokeRect(4, 4, 24, 24);
  g.fillStyle = '#6b6452';
  g.font = 'bold 18px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 16, 17);
}

// Creates a ready-to-insert canvas element for a given item id.
export function createItemCanvas(id: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'pix-icon-canvas';
  c.setAttribute('aria-hidden', 'true');
  drawItemSprite(c, id);
  return c;
}

// Hydrates server-generated `<span class="pix-icon" data-item="...">`
// placeholders inside dangerouslySetInnerHTML article bodies.
export function hydratePixIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.pix-icon[data-item]').forEach((el) => {
    if (el.dataset.pixDrawn) return;
    el.dataset.pixDrawn = '1';
    el.appendChild(createItemCanvas(el.dataset.item!));
  });
}

export default function PixIcon({ id, size = 24 }: { id: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawItemSprite(ref.current, id);
  }, [id]);
  return (
    <canvas
      ref={ref}
      className="pix-icon-canvas"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
