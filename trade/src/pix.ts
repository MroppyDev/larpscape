// Pixel-art item icons — replicates the game's drawPixmap / the wiki's PixIcon
// over build-time-serialized pixmaps (trade/build-sprites.ts -> data/sprites.json).
import spritesJson from './data/sprites.json';

type SpriteSpec = { grid: string[]; palette: Record<string, string> };
const SPRITES = spritesJson as Record<string, SpriteSpec>;

const GRID = 16;  // sprites are authored on a 16x16 grid
const SCALE = 2;  // 32x32 backing store

export function drawItemSprite(canvas: HTMLCanvasElement, id: string): void {
  canvas.width = GRID * SCALE;
  canvas.height = GRID * SCALE;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = false;
  const spec = SPRITES[id];
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

export function itemCanvas(id: string, size = 32): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'pix-icon';
  c.style.width = `${size}px`;
  c.style.height = `${size}px`;
  c.setAttribute('aria-hidden', 'true');
  drawItemSprite(c, id);
  return c;
}
