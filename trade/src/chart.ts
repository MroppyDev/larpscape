// Hand-drawn canvas price-history chart (no chart lib): volume-weighted daily
// average line + volume bars, parchment-styled axes, hover readout.
import type { HistoryDay } from './api';
import { coins, commas } from './fmt';

const INK = '#4a3c28';
const INK_FAINT = 'rgba(74, 60, 40, .28)';
const LINE = '#8a3a1c';
const DOT = '#6c2414';
const VOL = 'rgba(110, 90, 50, .55)';
const HOVER_BG = '#2b2114';
const HOVER_FG = '#e8d9b8';

export function renderPriceChart(canvas: HTMLCanvasElement, days: HistoryDay[]): void {
  const cssW = canvas.parentElement ? canvas.parentElement.clientWidth - 20 : 640;
  const W = Math.max(320, Math.min(860, cssW));
  const H = Math.round(W * 0.45);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  const padL = 56, padR = 12, padT = 12, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const volH = Math.round(plotH * 0.24); // volume bars sit in the bottom band

  // axes frame
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.strokeRect(padL, padT, plotW, plotH);

  if (!days.length) {
    g.fillStyle = INK;
    g.font = `italic 15px Alegreya, Georgia, serif`;
    g.textAlign = 'center';
    g.fillText('No trades recorded these ninety days.', padL + plotW / 2, padT + plotH / 2);
    return;
  }

  const maxPrice = Math.max(...days.map((d) => d.avgPrice));
  const minPrice = Math.min(...days.map((d) => d.avgPrice));
  const span = Math.max(1, maxPrice - minPrice);
  const loP = Math.max(0, minPrice - span * 0.12);
  const hiP = maxPrice + span * 0.12;
  const maxVol = Math.max(1, ...days.map((d) => d.volume));

  const x = (i: number) =>
    days.length === 1 ? padL + plotW / 2 : padL + (i / (days.length - 1)) * plotW;
  const yPrice = (p: number) => padT + (1 - (p - loP) / (hiP - loP)) * (plotH - volH - 6);
  const yVol0 = padT + plotH;

  // horizontal gridlines + price labels
  g.font = '11px Alegreya, Georgia, serif';
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) {
    const p = loP + ((hiP - loP) * i) / 3;
    const y = yPrice(p);
    g.strokeStyle = INK_FAINT;
    g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + plotW, y); g.stroke();
    g.fillStyle = INK;
    g.fillText(coins(Math.round(p)), padL - 6, y);
  }

  // date labels (first / middle / last)
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const labelIdx = days.length > 2 ? [0, Math.floor(days.length / 2), days.length - 1] : [0, days.length - 1];
  for (const i of new Set(labelIdx)) {
    g.fillStyle = INK;
    g.fillText(days[i].date.slice(5), x(i), padT + plotH + 6);
  }

  // volume bars
  const barW = Math.max(2, Math.min(14, (plotW / days.length) * 0.6));
  for (let i = 0; i < days.length; i++) {
    const h = Math.max(1, (days[i].volume / maxVol) * (volH - 2));
    g.fillStyle = VOL;
    g.fillRect(x(i) - barW / 2, yVol0 - h, barW, h);
  }

  // price line + dots
  g.strokeStyle = LINE;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < days.length; i++) {
    const px = x(i), py = yPrice(days[i].avgPrice);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();
  g.fillStyle = DOT;
  for (let i = 0; i < days.length; i++) {
    g.beginPath();
    g.arc(x(i), yPrice(days[i].avgPrice), days.length > 50 ? 1.6 : 2.6, 0, Math.PI * 2);
    g.fill();
  }

  // hover readout — redraw base then overlay (cheap at this size)
  canvas.onmousemove = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < days.length; i++) {
      const d = Math.abs(x(i) - mx);
      if (d < bestD) { bestD = d; best = i; }
    }
    canvas.onmousemove = null; // avoid recursion while re-rendering
    renderPriceChart(canvas, days);
    drawHover(canvas, days, best, x(best), yPrice(days[best].avgPrice), W);
  };
  canvas.onmouseleave = () => {
    canvas.onmousemove = null;
    renderPriceChart(canvas, days);
  };
}

function drawHover(
  canvas: HTMLCanvasElement, days: HistoryDay[], i: number, px: number, py: number, W: number
): void {
  const dpr = window.devicePixelRatio || 1;
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const d = days[i];

  g.strokeStyle = INK;
  g.setLineDash([3, 3]);
  g.beginPath();
  g.moveTo(px, 12);
  g.lineTo(px, canvas.height / dpr - 30);
  g.stroke();
  g.setLineDash([]);

  g.fillStyle = LINE;
  g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill();

  const text = `${d.date} — ${commas(d.avgPrice)} gp · vol ${commas(d.volume)}`;
  g.font = '12px Alegreya, Georgia, serif';
  const w = g.measureText(text).width + 14;
  const bx = Math.min(Math.max(6, px - w / 2), W - w - 6);
  g.fillStyle = HOVER_BG;
  g.fillRect(bx, 16, w, 22);
  g.strokeStyle = '#8d7d62';
  g.strokeRect(bx + 0.5, 16.5, w - 1, 21);
  g.fillStyle = HOVER_FG;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, bx + 7, 27);
}
