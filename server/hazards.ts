// Server-side environmental hazards: lava-edge damage, player poison DoT.

import { terrain, key, T, MAP_W, MAP_H } from './world';
import type { PlayerView } from './sim';

export interface PlayerDot {
  every: number;
  dmg: number;
  hitsLeft: number;
  nextAt: number;
  fx?: string;
}

const playerDots = new Map<number, PlayerDot[]>();

export function getPlayerDots(userId: number): PlayerDot[] {
  return playerDots.get(userId) ?? [];
}

export function applyPlayerPoison(p: PlayerView, every = 5, dmg = 1, hits = 4): void {
  const dots = playerDots.get(p.userId) ?? [];
  dots.push({ every, dmg, hitsLeft: hits, nextAt: 0, fx: 'bog_poison' });
  playerDots.set(p.userId, dots);
  p.send({ t: 'fx', kind: 'bog_spit', npc: -1, def: 'bog_horror' });
}

export function clearPlayerDots(userId: number): void {
  playerDots.delete(userId);
}

function nearLavaEdge(x: number, y: number): boolean {
  const check = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < MAP_W && cy < MAP_H && terrain[key(cx, cy)] === T.LAVA;
  return (
    (x > 0 && check(x - 1, y)) ||
    (x < MAP_W - 1 && check(x + 1, y)) ||
    (y > 0 && check(x, y - 1)) ||
    (y < MAP_H - 1 && check(x, y + 1))
  );
}

export function tickPlayerHazards(
  tick: number,
  players: Map<number, PlayerView>,
  damage: (p: PlayerView, dmg: number, fx: string) => void,
): void {
  if (tick % 3 !== 0) return;
  for (const p of players.values()) {
    if (p.dead) continue;
    if (nearLavaEdge(p.x, p.y)) damage(p, 1, 'lava_edge');
  }
}

export function tickPlayerDots(
  tick: number,
  players: Map<number, PlayerView>,
  damage: (p: PlayerView, dmg: number, fx: string) => void,
): void {
  for (const [userId, dots] of playerDots) {
    const p = players.get(userId);
    if (!p || p.dead) { playerDots.delete(userId); continue; }
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      if (tick < d.nextAt) continue;
      d.hitsLeft--;
      d.nextAt = tick + d.every;
      if (d.hitsLeft <= 0) dots.splice(i, 1);
      damage(p, d.dmg, d.fx ?? 'poison');
      if (p.dead) { playerDots.delete(userId); break; }
    }
    if (dots.length === 0) playerDots.delete(userId);
  }
}
