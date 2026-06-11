// Hiscores: rankings computed from saved characters in the SQLite 'characters'
// table. Saves are JSON blobs written by the client (src/game.ts saveGame);
// the xp array is indexed by SKILL_NAMES order. Results are cached for 120s
// and recomputed lazily on demand. Banned users are excluded.

import type { Database } from 'better-sqlite3';
import { SKILL_NAMES } from '../shared/schema';

export const HISCORE_SKILLS: readonly string[] = SKILL_NAMES;
const NUM_SKILLS = SKILL_NAMES.length; // 24

// Classic cumulative XP table (same public formula as src/defs.ts).
const XP_TABLE: number[] = (() => {
  const t = [0, 0]; // index by level; level 1 = 0 xp
  let points = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

function levelForXp(xp: number): number {
  for (let i = 99; i >= 1; i--) {
    if (xp >= XP_TABLE[i]) return i;
  }
  return 1;
}

export interface OverallEntry {
  rank: number;
  username: string;
  totalLevel: number;
  totalXp: number;
}

export interface SkillEntry {
  rank: number;
  username: string;
  level: number;
  xp: number;
}

export interface PlayerHiscores {
  username: string;
  overall: { rank: number; totalLevel: number; totalXp: number };
  skills: { skill: string; rank: number; level: number; xp: number }[];
}

interface HiscoreData {
  overall: OverallEntry[];
  skills: Map<string, SkillEntry[]>; // key: lowercase skill name
  players: Map<string, PlayerHiscores>; // key: lowercase username
}

const CACHE_TTL_MS = 120_000;
let cache: HiscoreData | null = null;
let cacheAt = 0;

// Parse one save blob into a normalized xp array (length NUM_SKILLS).
function parseXp(saveJson: string): number[] | null {
  let d: unknown;
  try { d = JSON.parse(saveJson); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const raw = (d as { xp?: unknown }).xp;
  if (!Array.isArray(raw)) return null;
  const xp: number[] = [];
  for (let i = 0; i < NUM_SKILLS; i++) {
    const v = raw[i];
    xp.push(typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  }
  return xp;
}

function compute(db: Database): HiscoreData {
  const rows = db.prepare(`
    SELECT u.username AS username, c.save AS save
    FROM characters c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN bans b ON b.user_id = c.user_id
    WHERE b.user_id IS NULL
  `).all() as { username: string; save: string }[];

  interface P { username: string; xp: number[]; levels: number[]; totalLevel: number; totalXp: number }
  const players: P[] = [];
  for (const row of rows) {
    const xp = parseXp(row.save);
    if (!xp) continue; // unreadable or pre-skills save: skip
    const levels = xp.map(levelForXp);
    players.push({
      username: row.username,
      xp,
      levels,
      totalLevel: levels.reduce((a, b) => a + b, 0),
      totalXp: xp.reduce((a, b) => a + b, 0),
    });
  }

  // Overall: total level desc, then total xp desc, then name for stability.
  const byOverall = [...players].sort((a, b) =>
    b.totalLevel - a.totalLevel || b.totalXp - a.totalXp ||
    a.username.localeCompare(b.username));
  const overall: OverallEntry[] = byOverall.map((p, i) => ({
    rank: i + 1, username: p.username, totalLevel: p.totalLevel, totalXp: p.totalXp,
  }));

  const playerMap = new Map<string, PlayerHiscores>();
  for (const e of overall) {
    playerMap.set(e.username.toLowerCase(), {
      username: e.username,
      overall: { rank: e.rank, totalLevel: e.totalLevel, totalXp: e.totalXp },
      skills: [],
    });
  }

  // Per-skill: xp desc (level follows from xp), then name.
  const skills = new Map<string, SkillEntry[]>();
  for (let s = 0; s < NUM_SKILLS; s++) {
    const sorted = [...players].sort((a, b) =>
      b.xp[s] - a.xp[s] || a.username.localeCompare(b.username));
    const entries: SkillEntry[] = sorted.map((p, i) => ({
      rank: i + 1, username: p.username, level: p.levels[s], xp: p.xp[s],
    }));
    skills.set(SKILL_NAMES[s].toLowerCase(), entries);
    for (const e of entries) {
      playerMap.get(e.username.toLowerCase())?.skills.push({
        skill: SKILL_NAMES[s], rank: e.rank, level: e.level, xp: e.xp,
      });
    }
  }
  // (Each player's skill list ends up in canonical SKILL_NAMES order because
  // the loop above iterates skills in that order.)

  return { overall, skills, players: playerMap };
}

function getData(db: Database): HiscoreData {
  const now = Date.now();
  if (!cache || now - cacheAt > CACHE_TTL_MS) {
    cache = compute(db);
    cacheAt = now;
  }
  return cache;
}

// Public API ----------------------------------------------------------------

// skill: 'overall' or a skill name (case-insensitive). Returns null for an
// unknown skill so the route can 400.
export function getRanking(
  db: Database, skill: string, limit: number,
): OverallEntry[] | SkillEntry[] | null {
  const data = getData(db);
  const key = skill.toLowerCase();
  if (key === 'overall') return data.overall.slice(0, limit);
  const list = data.skills.get(key);
  return list ? list.slice(0, limit) : null;
}

export function getPlayerHiscores(db: Database, username: string): PlayerHiscores | null {
  return getData(db).players.get(username.toLowerCase()) ?? null;
}
