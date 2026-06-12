// Larpscape server: accounts, character saves, presence/chat relay, Grand Exchange.
// Run: npx tsx server/index.ts   (or `npm run server`)
// Production: NODE_ENV=production also serves ../dist statically.

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { WebSocketServer, WebSocket } from 'ws';
import {
  initSim, tickSim, fullSnapshot, dropPlayer,
  handleSwing, handlePickup, handleDrop, handleInteract,
  setCombatProfileFor, setSwingStateHooks, setOnHpChanged, setResolvePlayerDeath,
  type PlayerView, type SwingProfile, type SNpc, type SwingEchoExtras,
} from './sim';
import { deriveCombatProfile, getSpell, isValidStyle, type AttackMode, type CombatProfile, type CombatStyle } from './combat';
import {
  SKILLS, levelForXp, SkillName,
  getCoins, removeCoins, addCoins, invAdd, invRemove, invCount, invHas,
  addXp, skillLevel,
} from './state';
import { initSocial } from './social';
import {
  initDungeon, startRun, endRun, getRecords, inDungeon,
  OVERWORLD_EXIT, onDisconnect as dungeonOnDisconnect,
} from './dungeon';
import { getRanking, getPlayerHiscores } from './hiscores';
import { ECONOMY_FROZEN, FREEZE_MSG } from './econ-freeze';
import { initForum } from './forum';
import { initMarket } from './market';
import { createStateStore, serverStarterOwned } from './state';
import { makeIntents, dispatchIntentWs, registerIntentRoutes } from './intents-wire';
import './intent-shop'; // side-effect: registers the 'shop'/'bank' WS domain handlers
import './intent-produce'; // side-effect: registers production/gathering domain intents
import './intent-misc'; // side-effect: registers gambling/slayer/misc-grant domain intents
import { installSlayerKillHook } from './intent-misc';
import './intent-questb'; // side-effect: registers the 'questb-grant' repeatable quest-object domain
import { installQuestKillHook } from './intent-quest'; // side-effect: registers quest-mark/turnin/craft; kill hook installed below
import { mergeSave } from '../shared/save-schema';
import { initPortraits } from './portrait';
import { initProfiles } from './profiles';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
// Shared secret for ops endpoints (broadcast). Empty = endpoints disabled.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// Deployed build id — clients compare against their baked-in __BUILD_ID__ and
// refresh when they differ, so nobody plays a stale cached client.
const BUILD_ID = (() => {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  try {
    return execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
})();

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

// DB location is overridable via DB_PATH so the adversarial pen-test
// (scripts/pentest-economy.ts) can boot the REAL server against a throwaway
// temp database instead of the live data.db. Defaults to the production file.
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passhash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  save TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('buy','sell')),
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  filled INTEGER NOT NULL DEFAULT 0,
  collected_qty INTEGER NOT NULL DEFAULT 0,
  coins_owed INTEGER NOT NULL DEFAULT 0,
  items_owed INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offers_book ON offers (item, kind, active);
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_item ON trades (item, id);
CREATE TABLE IF NOT EXISTS bans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mutes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  until INTEGER,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_log_id ON chat_log (id);
CREATE TABLE IF NOT EXISTS save_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  save TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  label TEXT
);
CREATE INDEX IF NOT EXISTS idx_save_backups_user ON save_backups (user_id, id);
`);

// Migration (docs/ECONOMY-AUTHORITY.md §1.2): the characters.save column is now
// the AUTHORITATIVE server-owned document. Add a `rev` integer bumped on every
// server-side mutation (optimistic concurrency + client cache key). Idempotent:
// PRAGMA table_info is checked so a second boot does not error on the existing
// column. Existing rows backfill to rev 0 via the column DEFAULT.
{
  const cols = db.prepare("PRAGMA table_info('characters')").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'rev')) {
    db.exec('ALTER TABLE characters ADD COLUMN rev INTEGER NOT NULL DEFAULT 0');
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-zA-Z0-9]{3,12}$/;
const ITEM_RE = /^[a-z][a-z0-9_]{0,47}$/; // plausible item id: snake_case token
const MAX_QTY = 2_000_000_000;
const MAX_PRICE = 2_000_000_000;

function isPosInt(n: unknown, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= max;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface AuthedRequest extends Request {
  userId?: number;
  username?: string;
}

function createSession(userId: number): string {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?,?,?)')
    .run(token, userId, Date.now());
  return token;
}

// Sessions expire server-side after 90 days (matches the cookie Max-Age).
// Expired rows are deleted lazily on next use so a leaked token can't grant
// indefinite access.
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
function userForToken(token: string): { id: number; username: string } | null {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  const row = db.prepare(
    'SELECT u.id, u.username, s.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).get(token) as { id: number; username: string; created_at: number } | undefined;
  if (!row) return null;
  if (Date.now() - row.created_at > SESSION_TTL_MS) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, username: row.username };
}

// Invalidate every session for a user (e.g. after password change or on demand).
export function invalidateAllSessions(userId: number) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// --- Cookie sessions ---------------------------------------------------------
// The same session token lives in the sessions table whether it arrived as a
// Bearer header (game client localStorage) or as the bs_session cookie (set on
// login/register so larpscape.net / play / forum share one sign-in).

const SESSION_COOKIE = 'bs_session';
const SESSION_MAX_AGE_S = 90 * 24 * 60 * 60; // 90 days

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (!k) continue;
    let v = part.slice(eq + 1).trim();
    try { v = decodeURIComponent(v); } catch { /* keep raw */ }
    out[k] = v;
  }
  return out;
}

function requestHost(req: Request): string {
  const raw = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  return raw.split(',')[0].trim().split(':')[0].toLowerCase();
}

function isSecureRequest(req: Request): boolean {
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function isLarpscapeHost(host: string): boolean {
  return host === 'larpscape.net' || host.endsWith('.larpscape.net');
}

function sessionCookieAttrs(req: Request): string[] {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax'];
  // Share the cookie across larpscape.net subdomains in production; omit
  // Domain entirely on localhost so dev still works. Exact-suffix match so a
  // spoofed Host like "evillarpscape.net" can never pick up the shared Domain.
  if (isLarpscapeHost(requestHost(req))) attrs.push('Domain=.larpscape.net');
  if (isSecureRequest(req)) attrs.push('Secure');
  return attrs;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  res.append('Set-Cookie',
    [`${SESSION_COOKIE}=${token}`, `Max-Age=${SESSION_MAX_AGE_S}`, ...sessionCookieAttrs(req)].join('; '));
}

function clearSessionCookie(req: Request, res: Response) {
  res.append('Set-Cookie',
    [`${SESSION_COOKIE}=`, 'Max-Age=0', ...sessionCookieAttrs(req)].join('; '));
}

function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
  return m ? m[1] : null;
}

// Bearer header wins; the cookie is the fallback.
function requestToken(req: Request): string | null {
  return bearerToken(req) ?? parseCookieHeader(req.headers.cookie)[SESSION_COOKIE] ?? null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = requestToken(req);
  const user = token ? userForToken(token) : null;
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return; }
  req.userId = user.id;
  req.username = user.username;
  next();
}

// Constant-time admin-token check. Compare fixed-length SHA-256 digests so the
// comparison time does not leak token contents (the login path uses the same
// pattern). A missing/empty header still fails closed.
const ADMIN_TOKEN_DIGEST = ADMIN_TOKEN
  ? crypto.createHash('sha256').update(ADMIN_TOKEN).digest()
  : null;
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers['x-admin-token'];
  if (!ADMIN_TOKEN_DIGEST || typeof provided !== 'string') {
    res.status(401).json({ error: 'unauthorized' }); return;
  }
  const providedDigest = crypto.createHash('sha256').update(provided).digest();
  if (!crypto.timingSafeEqual(providedDigest, ADMIN_TOKEN_DIGEST)) {
    res.status(401).json({ error: 'unauthorized' }); return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Moderation helpers
// ---------------------------------------------------------------------------

function isBanned(userId: number): boolean {
  return !!db.prepare('SELECT 1 FROM bans WHERE user_id = ?').get(userId);
}

// Mute check with lazy cleanup of expired rows.
function isMuted(userId: number): boolean {
  const row = db.prepare('SELECT until FROM mutes WHERE user_id = ?')
    .get(userId) as { until: number | null } | undefined;
  if (!row) return false;
  if (row.until !== null && row.until <= Date.now()) {
    db.prepare('DELETE FROM mutes WHERE user_id = ?').run(userId);
    return false;
  }
  return true;
}

let chatLogCounter = 0;
function logChat(userId: number, username: string, text: string) {
  db.prepare('INSERT INTO chat_log (user_id, username, text, created_at) VALUES (?,?,?,?)')
    .run(userId, username, text, Date.now());
  if (++chatLogCounter % 200 === 0) {
    db.prepare(`DELETE FROM chat_log WHERE id <= (
      SELECT id FROM chat_log ORDER BY id DESC LIMIT 1 OFFSET 20000
    )`).run();
  }
}

// Snapshot a user's current save into save_backups (no-op if no save yet),
// keeping at most 10 backups per user.
function backupSave(userId: number, label: string) {
  const row = db.prepare('SELECT save FROM characters WHERE user_id = ?')
    .get(userId) as { save: string } | undefined;
  if (!row) return;
  db.prepare('INSERT INTO save_backups (user_id, save, created_at, label) VALUES (?,?,?,?)')
    .run(userId, row.save, Date.now(), label);
  db.prepare(`DELETE FROM save_backups WHERE user_id = ? AND id NOT IN (
    SELECT id FROM save_backups WHERE user_id = ? ORDER BY id DESC LIMIT 10
  )`).run(userId, userId);
}

function kickClient(userId: number, code: number, reason: string): boolean {
  let kicked = false;
  for (const c of clients) {
    if (c.userId !== userId) continue;
    try { c.ws.close(code, reason); } catch { /* ignore */ }
    clients.delete(c);
    dropPlayer(c.userId);
    kicked = true;
  }
  return kicked;
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

const app = express();
// nginx terminates TLS on the same box — trust loopback proxies only so
// req.ip reflects the real client (per-IP rate limits) without letting a
// direct remote connection spoof X-Forwarded-For.
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '1mb' }));

// Baseline hardening headers (audit web #1/#2) on every response — clickjacking
// and MIME-sniffing defense at the app layer (nginx adds the same + HSTS/CSP at
// the edge). DENY because no first-party page legitimately frames these routes.
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Generic fixed-window per-IP rate limiter (same shape as the hiscores one).
function ipRateLimit(windowMs: number, max: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now >= entry.reset) {
      if (hits.size > 10_000) hits.clear(); // bound memory
      entry = { count: 0, reset: now + windowMs };
      hits.set(ip, entry);
    }
    if (++entry.count > max) {
      res.status(429).json({ error: 'too many attempts, slow down' }); return;
    }
    next();
  };
}

// Brute-force / spam guards on credential endpoints.
const saveRateLimit = ipRateLimit(60_000, 60);         // 60 saves / min / IP (debounced client sends ~1/2s)
const offerRateLimit = ipRateLimit(60_000, 30);        // 30 GE offers / min / IP
const loginRateLimit = ipRateLimit(10 * 60_000, 20);   // 20 attempts / 10 min / IP
const registerRateLimit = ipRateLimit(60 * 60_000, 10); // 10 accounts / hour / IP

// CSRF guard: a NON-GET /api request that authenticates via the session cookie
// (i.e. carries bs_session but no Bearer header) must originate from a
// larpscape.net page (or localhost in dev). Bearer-authenticated requests —
// the game client's normal path — skip this entirely.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') { next(); return; }
  if (bearerToken(req)) { next(); return; }
  if (!parseCookieHeader(req.headers.cookie)[SESSION_COOKIE]) { next(); return; }
  const src = String(req.headers.origin || req.headers.referer || '');
  let host = '';
  try { host = new URL(src).hostname.toLowerCase(); } catch { host = ''; }
  const ok = host === 'localhost' || host === '127.0.0.1'
    || host === 'larpscape.net' || host.endsWith('.larpscape.net');
  if (!ok) { res.status(403).json({ error: 'csrf check failed' }); return; }
  next();
});

app.post('/api/register', registerRateLimit, (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'username must be 3-12 alphanumeric characters' }); return;
  }
  if (typeof password !== 'string' || password.length < 4 || password.length > 64) {
    res.status(400).json({ error: 'password must be 4-64 characters' }); return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) { res.status(409).json({ error: 'username taken' }); return; }
  const passhash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, passhash, created_at) VALUES (?,?,?)')
    .run(username, passhash, Date.now());
  const token = createSession(Number(info.lastInsertRowid));
  setSessionCookie(req, res, token);
  res.json({ token, username });
});

app.post('/api/login', loginRateLimit, (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'bad request' }); return;
  }
  const user = db.prepare('SELECT id, username, passhash FROM users WHERE username = ?')
    .get(username) as { id: number; username: string; passhash: string } | undefined;
  if (!user || !bcrypt.compareSync(password, user.passhash)) {
    res.status(401).json({ error: 'invalid username or password' }); return;
  }
  if (isBanned(user.id)) { res.status(403).json({ error: 'account banned' }); return; }
  const token = createSession(user.id);
  setSessionCookie(req, res, token);
  res.json({ token, username: user.username });
});

// GET /api/me — who am I (Bearer or cookie)? 200 {username} or 401.
app.get('/api/me', (req, res) => {
  const token = requestToken(req);
  const user = token ? userForToken(token) : null;
  if (!user || isBanned(user.id)) { res.status(401).json({ error: 'unauthorized' }); return; }
  res.json({ username: user.username });
});

// POST /api/auth/logout — deletes the session row and clears the cookie.
app.post('/api/auth/logout', (req, res) => {
  const token = requestToken(req);
  if (token && token.length <= 128) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/character', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT save FROM characters WHERE user_id = ?')
    .get(req.userId) as { save: string } | undefined;
  if (!row) { res.json({ save: serverStarterOwned() }); return; }
  try { res.json({ save: JSON.parse(row.save) }); }
  catch { res.json({ save: null }); }
});

// Anti-dupe fence: after a trade mutates a user's save server-side, reject
// client save PUTs for a short window so an in-flight PUT carrying pre-trade
// inventory cannot overwrite the trade result. The client retries after the
// window with post-trade state (it applies the trade diff on trade_complete).
export const SAVE_FENCE_MS = 4000;
const saveFence = new Map<number, number>(); // userId -> fence expiry (ms epoch)

function fenceSaves(userIds: number[]) {
  const until = Date.now() + SAVE_FENCE_MS;
  for (const id of userIds) saveFence.set(id, until);
}

// Authoritative state store (docs/ECONOMY-AUTHORITY.md §1.3). Every server-side
// mutation of owned fields (xp/coins/bank/inventory/equipment/quests/hp/…) goes
// through this. Its onSavesMutated runs the SAME plumbing the market uses: the
// save fence + the {t:'save_reload'} push to any online client, so an in-flight
// client PUT carrying stale state is 409'd and the client re-snapshots.
// requestSaveReload is a hoisted function declaration defined further below.
export const stateStore = createStateStore(db, (ids) => {
  fenceSaves(ids);
  requestSaveReload(ids);
  // Any authoritative mutation (xp/equipment change via a skilling/equip/kill
  // intent) can change the derived combat profile — rebuild the cache for online
  // players so the next swing uses fresh numbers (§3.1). No-op for offline ids.
  onAuthStateMutated(ids);
});

// Progression-authority intents (docs/ECONOMY-AUTHORITY.md §2): server-side
// resolution of every non-combat value/progress path (skilling/process/make/
// shop/bank/quest/pickup/drop). `makeIntents` also installs the sim's
// authoritative inventory hooks (pickup grant / drop debit through withState),
// so item gain/loss is server-owned. HTTP routes (shop/bank/quest) are
// registered here; the WS skilling intents dispatch from the message handler.
const intents = makeIntents(stateStore);
registerIntentRoutes(app, stateStore, intents, requireAuth);
// Quest sub-progress kill credit (server/intent-quest.ts): server-authoritative
// kill counters for quest steps (giant_rat / hollow_miner / boss kills, …),
// bound to the same store the intents use. Domain handlers (quest-mark/turnin/
// craft) self-register via the import side-effect above.
installQuestKillHook(stateStore);
installSlayerKillHook(stateStore);

// Defined after the profile cache below; hoisted via function declaration so the
// store callback above can reference it.
function onAuthStateMutated(userIds: number[]) {
  for (const id of userIds) {
    if (!combatProfiles.has(id)) continue;
    rebuildProfile(id);
    const c = onlineClient(id);
    if (c) applyProfileToView(c.view, combatProfiles.get(id)!);
  }
}

// ---------------------------------------------------------------------------
// Combat profile cache (docs/ECONOMY-AUTHORITY.md §3.1/§3.3)
// ---------------------------------------------------------------------------
// One entry per connected player: the SERVER-DERIVED combat numbers + the live
// (RAM) spec energy. Built from the authoritative save on connect and rebuilt
// whenever the player's xp / equipment / style / autocast change. Combat is the
// hot path — the swing handler reads this cache, never the DB, and never the
// wire (closes G1/M4). Spec energy lives here and is flushed to the save lazily.
interface ProfileEntry {
  profile: CombatProfile;
  style: CombatStyle;
  autocastSpell: string | null;
  specEnergy: number; // live, 0..100 (authoritative; the wire no longer reports it)
  hpDirty: boolean;   // live HP diverged from the persisted curHp → flush due
  activePrayers: string[]; // live mirror of save.activePrayers (server drain)
  prayerDrainAcc: number;  // accumulates drain units; -1 pp per 100
}
const combatProfiles = new Map<number, ProfileEntry>();

// Rebuild (or build) a player's cached profile from the authoritative save.
// Returns the entry, or null if the character row is missing. Preserves the
// live spec energy across rebuilds (xp/equip changes don't refund spec).
function rebuildProfile(userId: number): ProfileEntry | null {
  const state = stateStore.loadState(userId);
  if (!state) return null;
  const prev = combatProfiles.get(userId);
  const style: CombatStyle = prev?.style ?? (isValidStyle((state as any).combatStyle) ? (state as any).combatStyle : 'accurate');
  const autocast: string | null = prev?.autocastSpell
    ?? (typeof (state as any).autocastSpell === 'string' ? (state as any).autocastSpell : null);
  const profile = deriveCombatProfile(state, style, autocast);
  const specEnergy = prev ? prev.specEnergy
    : (typeof state.specEnergy === 'number' ? Math.max(0, Math.min(100, state.specEnergy)) : 100);
  const savedPrayers = Array.isArray(state.activePrayers)
    ? state.activePrayers.filter((id): id is string => typeof id === 'string') : [];
  const entry: ProfileEntry = {
    profile, style, autocastSpell: autocast, specEnergy,
    hpDirty: prev?.hpDirty ?? false,
    activePrayers: prev?.activePrayers ?? savedPrayers,
    prayerDrainAcc: prev?.prayerDrainAcc ?? 0,
  };
  combatProfiles.set(userId, entry);
  return entry;
}

// Apply the player's combat style / autocast SELECTION (validated) and rebuild
// the profile so accuracy/maxHit/mode reflect it. The selection itself is
// presentation (client-chosen) but the EFFECT is server-applied (§1.1).
function setStyleSelection(userId: number, style: unknown, autocast: unknown) {
  const entry = combatProfiles.get(userId);
  if (!entry) return;
  if (isValidStyle(style)) entry.style = style;
  if (typeof autocast === 'string') entry.autocastSpell = autocast || null;
  else if (autocast === null) entry.autocastSpell = null;
  const state = stateStore.loadState(userId);
  if (state) entry.profile = deriveCombatProfile(state, entry.style, entry.autocastSpell);
}

// The structural SwingProfile sim.ts consumes, wired to the live cache. The
// spec-energy debit (trySpendSpec) is honoured against the RAM energy and the
// regen below; it is flushed to the save lazily.
function swingProfileFor(userId: number): SwingProfile | null {
  const entry = combatProfiles.get(userId);
  if (!entry) return null;
  const p = entry.profile;
  return {
    attackSpeed: p.attackSpeed,
    weaponMode: p.weaponMode,
    melee: p.melee, ranged: p.ranged, gun: p.gun,
    magicLvl: p.magicLvl, magicMaxHit: p.magicMaxHit,
    effectGear: p.effectGear,
    specItemId: p.specItemId,
    trySpendSpec: (itemId: string) => {
      // cost lives on the item's spec def; sim already validated the id is the
      // equipped spec item. Look the cost up server-side (never from the wire).
      const cost = SPEC_ENERGY_COST.get(itemId) ?? 100;
      if (entry.specEnergy < cost) return false;
      entry.specEnergy -= cost;
      entry.hpDirty = true; // spec energy is flushed alongside hp
      return true;
    },
  };
}

// spec energy cost per item id, read once from the item catalog (spec.energy).
const SPEC_ENERGY_COST: Map<string, number> = (() => {
  const m = new Map<string, number>();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/items.json'), 'utf8'));
    for (const id of Object.keys(raw)) {
      const e = raw[id]?.spec?.energy;
      if (typeof e === 'number') m.set(id, Math.max(0, Math.min(100, e)));
    }
  } catch { /* empty → default 100 */ }
  return m;
})();

const PRAYER_DRAIN: Map<string, number> = (() => {
  const m = new Map<string, number>();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/magic.json'), 'utf8'));
    for (const p of raw.prayers ?? []) {
      if (typeof p?.id === 'string' && typeof p?.drain === 'number') m.set(p.id, p.drain);
    }
  } catch { /* empty */ }
  return m;
})();

// Sync a player's view combat fields from the cached profile (server-derived).
function applyProfileToView(view: PlayerView, entry: ProfileEntry, opts: { resetHp?: boolean } = {}) {
  const p = entry.profile;
  view.cb = p.combatLevel;
  view.effDef = p.effDef;
  view.defBonus = p.defBonus;
  view.maxHp = p.maxHp;
  if (opts.resetHp || view.hp > p.maxHp) view.hp = Math.min(view.hp || p.maxHp, p.maxHp);
}

setCombatProfileFor(swingProfileFor);

function combatXpForHit(userId: number, dmg: number, mode: AttackMode): { skill: SkillName; amount: number }[] {
  const entry = combatProfiles.get(userId);
  const style: CombatStyle = entry?.style ?? 'accurate';
  const xp: { skill: SkillName; amount: number }[] = [];
  const push = (skill: SkillName, mult: number) => {
    const amount = Math.floor(dmg * mult);
    if (amount > 0) xp.push({ skill, amount });
  };
  if (mode === 'melee') {
    if (style === 'accurate') push('Attack', 4);
    else if (style === 'aggressive') push('Strength', 4);
    else push('Defence', 4);
  } else if (mode === 'ranged') push('Ranged', 4);
  else if (mode === 'gun') push('Gun', 4);
  else push('Magic', 2);
  push('Hitpoints', 1.33);
  return xp;
}

// Combat XP + swing consumables (runes/ammo) are server-owned: debited/granted
// inside withState so they persist across refresh (client PUT cannot author xp).
setSwingStateHooks(
  (userId, mode) => {
    const extras: { ok: boolean } & SwingEchoExtras = { ok: true };
    const entry = combatProfiles.get(userId);
    const autocast = entry?.autocastSpell ?? null;
    const ok = stateStore.withState(userId, (state) => {
      if (mode === 'magic') {
        if (!autocast) return false;
        const sp = getSpell(autocast);
        if (!sp || skillLevel(state, 'Magic') < sp.level) return false;
        for (const r of sp.runes) if (!invHas(state, r.item, r.qty)) return false;
        const removed: { id: string; qty: number }[] = [];
        for (const r of sp.runes) {
          invRemove(state, r.item, r.qty);
          removed.push({ id: r.item, qty: r.qty });
        }
        const castXp = Math.floor(sp.xp);
        if (castXp > 0) addXp(state, 'Magic', castXp);
        extras.removed = removed;
        extras.xp = castXp > 0 ? [{ skill: 'Magic', amount: castXp }] : [];
        return true;
      }
      if (mode === 'ranged' || mode === 'gun') {
        const suffix = mode === 'ranged' ? '_arrow' : '_round';
        const ammo = state.equipment?.ammo;
        if (!ammo || !ammo.id.endsWith(suffix) || ammo.qty <= 0) return false;
        ammo.qty -= 1;
        if (ammo.qty <= 0) state.equipment!.ammo = null;
        extras.equip = { ammo: state.equipment?.ammo ?? null };
        return true;
      }
      return true;
    });
    return { ok: ok === true, ...extras };
  },
  (userId, dmg, mode) => {
    const planned = combatXpForHit(userId, dmg, mode as AttackMode);
    stateStore.withState(userId, (state) => {
      for (const x of planned) addXp(state, x.skill, x.amount);
    });
    return planned;
  },
  (userId) => {
    const e = combatProfiles.get(userId);
    return e ? { spec: e.specEnergy } : {};
  },
);

// HP changed (server-authoritative). Persist lazily — mark dirty; the tick
// flush below writes curHp + specEnergy to the save. We push the authoritative
// hp to the client immediately so its HUD is correct (it already rode out on the
// npcHitYou/death message; this is the lazy persistence side).
setOnHpChanged((view, _reason) => {
  const entry = combatProfiles.get(view.userId);
  if (entry) entry.hpDirty = true;
});

// Server-side death resolution (§3.2). Runs inside withState: restores curHp to
// max on the authoritative save and clears the live spec/hp dirty flags. Returns
// the respawn point. No item/xp penalty is applied (preserves current PvE feel;
// a softcore xp loss would slot in here via addXp with a negative-after clamp).
const RESPAWN = { x: 22, y: 38 };
setResolvePlayerDeath((view, _killerNpc) => {
  const entry = combatProfiles.get(view.userId);
  stateStore.withState(view.userId, (state) => {
    state.curHp = entry ? entry.profile.maxHp : (typeof state.curHp === 'number' ? state.curHp : 10);
    state.activePrayers = [];
    // (softcore xp penalty would be applied here, e.g. addXp(state, skill, -loss))
  });
  if (entry) { entry.hpDirty = false; entry.activePrayers = []; entry.prayerDrainAcc = 0; }
  return RESPAWN;
});

app.put('/api/character', saveRateLimit, requireAuth, (req: AuthedRequest, res) => {
  const fencedUntil = saveFence.get(req.userId!) ?? 0;
  if (fencedUntil > Date.now()) {
    res.status(409).json({ error: 'save_fenced' }); return;
  }
  if (fencedUntil) saveFence.delete(req.userId!);
  const { save } = req.body ?? {};
  if (save === undefined || save === null || typeof save !== 'object') {
    res.status(400).json({ error: 'save must be an object' }); return;
  }
  // Size cap is applied to the CLIENT payload before we do anything with it
  // (cheap DoS guard, unchanged from before).
  if (JSON.stringify(save).length > 512 * 1024) {
    res.status(413).json({ error: 'save too large' }); return;
  }

  // AUTHORITATIVE MERGE (docs/ECONOMY-AUTHORITY.md §1.2 / §1.3, closes G5/H1/M6):
  // the client may NO LONGER write owned fields (xp/coins/bank/inventory/
  // equipment/quests/collectionLog/specEnergy/hp/slayer). We take the server's
  // authoritative owned fields and overlay ONLY the presentation fields from the
  // client payload (position/run/energy/style-selection/autocast/music). A forged
  // PUT with inflated xp/coins/inventory therefore has zero effect on value or
  // progress — the save-edit master key is neutralised.
  //
  // NOTE (Phase boundary): until the skilling/loot intents land in Phase 2, the
  // client has no server-validated path to GAIN items, so legitimate gains are
  // not yet reflected. That is EXPECTED per the plan; Phase 2 routes the gains.
  // We deliberately do NOT half-route gains here.
  const row = db.prepare('SELECT save FROM characters WHERE user_id = ?')
    .get(req.userId) as { save: string } | undefined;

  // The authoritative owned baseline: an existing row's stored owned fields, or
  // for a brand-new character the SERVER-DEFINED starter state. We NEVER take
  // owned fields from the client — not even on first save — so registering a
  // fresh account and forging its first PUT seeds nothing (closes the first-save
  // bypass that let any new account inject coins/levels/items/quests).
  let authoritative: Record<string, unknown>;
  if (row) {
    try { authoritative = JSON.parse(row.save) as Record<string, unknown>; }
    catch { authoritative = serverStarterOwned() as Record<string, unknown>; }
  } else {
    authoritative = serverStarterOwned() as Record<string, unknown>;
  }
  const merged = mergeSave(authoritative, save as Record<string, unknown>);

  const text = JSON.stringify(merged);
  if (text.length > 512 * 1024) { res.status(413).json({ error: 'save too large' }); return; }
  db.prepare(`INSERT INTO characters (user_id, save, updated_at) VALUES (?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET save = excluded.save, updated_at = excluded.updated_at`)
    .run(req.userId, text, Date.now());
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Grand Exchange
// ---------------------------------------------------------------------------

interface OfferRow {
  id: number; user_id: number; kind: 'buy' | 'sell'; item: string;
  qty: number; price: number; filled: number; collected_qty: number;
  coins_owed: number; items_owed: number; active: number; created_at: number;
}

function offerJson(o: OfferRow) {
  return {
    id: o.id, kind: o.kind, item: o.item, qty: o.qty, price: o.price,
    filled: o.filled, collectedQty: o.collected_qty,
    coinsOwed: o.coins_owed, itemsOwed: o.items_owed, active: !!o.active,
  };
}

// Matching engine. Trades execute at the RESTING offer's price; partial fills allowed.
// Escrow model (SERVER-AUTHORITATIVE — docs/ECONOMY-AUTHORITY.md §4.1, closes G4/M1):
//   The offer's backing value really left the player's authoritative inventory at
//   creation time (see /api/ge/offer below, inside the SAME transaction as the
//   insert+match). matchOffer therefore only SHUFFLES already-escrowed value
//   between the two offers' owed columns; it never mints.
//   buy offer  — qty*price coins were escrowed at creation; itemsOwed accrues the
//                bought items, coinsOwed accrues the spread refund when filled
//                cheaper than the buyer's limit (refunding escrow the buyer prepaid).
//   sell offer — qty items were escrowed at creation; coinsOwed accrues proceeds.
const matchOffer = db.transaction((incoming: OfferRow): OfferRow => {
  let remaining = incoming.qty - incoming.filled;
  const opposite = incoming.kind === 'buy' ? 'sell' : 'buy';
  // Best price first, then oldest (price-time priority).
  const order = incoming.kind === 'buy' ? 'price ASC, id ASC' : 'price DESC, id ASC';
  const priceCond = incoming.kind === 'buy' ? 'price <= ?' : 'price >= ?';
  // Never self-match: matching your own buy with your own sell mints/launders
  // value with no counterparty.
  const book = db.prepare(
    `SELECT * FROM offers WHERE item = ? AND kind = ? AND active = 1 AND filled < qty
       AND user_id != ? AND ${priceCond} ORDER BY ${order}`
  ).all(incoming.item, opposite, incoming.user_id, incoming.price) as OfferRow[];

  for (const resting of book) {
    if (remaining <= 0) break;
    const avail = resting.qty - resting.filled;
    const q = Math.min(remaining, avail);
    const tradePrice = resting.price; // resting offer sets the price

    const buy = incoming.kind === 'buy' ? incoming : resting;
    const sell = incoming.kind === 'sell' ? incoming : resting;

    buy.filled += q;
    buy.items_owed += q;
    buy.coins_owed += q * (buy.price - tradePrice); // spread refund (0 when resting buy)
    sell.filled += q;
    sell.coins_owed += q * tradePrice;

    for (const o of [buy, sell]) {
      if (o.filled >= o.qty) o.active = 0;
      db.prepare('UPDATE offers SET filled=?, coins_owed=?, items_owed=?, active=? WHERE id=?')
        .run(o.filled, o.coins_owed, o.items_owed, o.active, o.id);
    }
    db.prepare('INSERT INTO trades (item, qty, price, created_at) VALUES (?,?,?,?)')
      .run(incoming.item, q, tradePrice, Date.now());
    remaining = incoming.qty - incoming.filled;
  }
  return db.prepare('SELECT * FROM offers WHERE id = ?').get(incoming.id) as OfferRow;
});

// Offer creation + escrow + match, all in ONE transaction so the escrow debit,
// the offer insert and the initial match are atomic: if the player cannot cover
// the offer the whole thing rolls back and no offer exists (docs/ECONOMY-AUTHORITY
// §4.1, closes G4 — "GE escrow with no backing"). Escrow is taken from the SAME
// carried-inventory pool the in-game GE UI spends (src/ge.ts uses invCount/
// addItem/removeItem 'coins' and inventory items), so the value really leaves the
// player here on the server, not just client-side.
const placeOffer = db.transaction((userId: number, kind: 'buy' | 'sell', item: string, qty: number, price: number):
    { error?: string; status?: number; offer?: OfferRow } => {
  const activeCount = (db.prepare('SELECT COUNT(*) AS n FROM offers WHERE user_id = ? AND active = 1')
    .get(userId) as { n: number }).n;
  if (activeCount >= 8) return { error: 'too many active offers', status: 400 };

  // Escrow the backing value out of the authoritative carried inventory. We do it
  // through stateStore.withState so the debit bumps rev + fences + pushes
  // save_reload exactly like every other owned mutation. A `false` return (or a
  // missing character row → undefined) means the player cannot cover the offer.
  const escrowOk = stateStore.withState(userId, (state) => {
    if (kind === 'buy') {
      // buyer prepays qty*price coins; the spread (price - tradePrice) is later
      // returned as coins_owed when filled cheaper than their limit.
      if (getCoins(state) < qty * price) return false;
      return removeCoins(state, qty * price);
    }
    // seller escrows the items themselves.
    if (invCount(state, item) < qty) return false;
    return invRemove(state, item, qty);
  });
  if (escrowOk !== true) {
    return {
      error: kind === 'buy' ? 'you do not have enough coins for that offer'
                            : 'you do not have that many to sell',
      status: 400,
    };
  }

  const info = db.prepare(
    'INSERT INTO offers (user_id, kind, item, qty, price, created_at) VALUES (?,?,?,?,?,?)'
  ).run(userId, kind, item, qty, price, Date.now());
  const inserted = db.prepare('SELECT * FROM offers WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as OfferRow;
  const after = matchOffer(inserted);
  return { offer: after };
});

app.post('/api/ge/offer', offerRateLimit, requireAuth, (req: AuthedRequest, res) => {
  if (ECONOMY_FROZEN) { res.status(503).json({ error: FREEZE_MSG }); return; }
  const { kind, item, qty, price } = req.body ?? {};
  if (kind !== 'buy' && kind !== 'sell') { res.status(400).json({ error: 'kind must be buy or sell' }); return; }
  if (typeof item !== 'string' || !ITEM_RE.test(item)) { res.status(400).json({ error: 'invalid item id' }); return; }
  if (item === 'coins') { res.status(400).json({ error: 'coins cannot be traded' }); return; }
  if (!isPosInt(qty, MAX_QTY)) { res.status(400).json({ error: 'qty must be a positive integer' }); return; }
  if (!isPosInt(price, MAX_PRICE)) { res.status(400).json({ error: 'price must be a positive integer' }); return; }
  if (qty * price > Number.MAX_SAFE_INTEGER) { res.status(400).json({ error: 'offer too large' }); return; }

  let out;
  try { out = placeOffer(req.userId!, kind, item, qty, price); }
  catch { res.status(500).json({ error: 'offer failed' }); return; }
  if (out.error) { res.status(out.status ?? 400).json({ error: out.error }); return; }
  res.json({ offer: offerJson(out.offer!) });
});

app.get('/api/ge/offers', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT * FROM offers WHERE user_id = ?
       AND (active = 1 OR coins_owed > 0 OR items_owed > 0)
     ORDER BY id DESC LIMIT 40`
  ).all(req.userId) as OfferRow[];
  res.json({ offers: rows.map(offerJson) });
});

// ABORT — cancel the unfilled remainder. The escrow taken at creation for the
// UNFILLED portion is released back into the owed columns (which collect then
// pays into the authoritative ledger). Because the escrow was real (taken at
// creation), this is a return of the player's own value, not an unbacked credit
// (docs/ECONOMY-AUTHORITY.md §4.1, closes M1 "abort/collect is no longer an
// unbacked credit"). No ledger mutation happens here — only at collect — so the
// player makes exactly one inventory-space decision.
app.post('/api/ge/abort', requireAuth, (req: AuthedRequest, res) => {
  const { id } = req.body ?? {};
  if (!isPosInt(id, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad id' }); return; }
  const o = db.prepare('SELECT * FROM offers WHERE id = ? AND user_id = ?')
    .get(id, req.userId) as OfferRow | undefined;
  if (!o) { res.status(404).json({ error: 'offer not found' }); return; }
  if (o.active) {
    const remaining = o.qty - o.filled;
    if (o.kind === 'buy') o.coins_owed += remaining * o.price; // release prepaid coin escrow
    else o.items_owed += remaining;                            // return escrowed unsold items
    o.active = 0;
    db.prepare('UPDATE offers SET active=0, coins_owed=?, items_owed=? WHERE id=?')
      .run(o.coins_owed, o.items_owed, o.id);
  }
  res.json({ offer: offerJson(o) });
});

// COLLECT — pay the owed coins/items into the authoritative carried inventory.
// Done inside ONE transaction: the owed columns are zeroed only if the ledger
// credit actually lands (inventory has room). If the inventory is full the
// columns are left intact so the player can free space and collect again — no
// value is destroyed and none is minted (the owed columns were backed by escrow
// taken at offer/match time).
const collectOffer = db.transaction((userId: number, offerId: number):
    { error?: string; status?: number; items?: { id: string; qty: number }[]; coins?: number } => {
  const o = db.prepare('SELECT * FROM offers WHERE id = ? AND user_id = ?')
    .get(offerId, userId) as OfferRow | undefined;
  if (!o) return { error: 'offer not found', status: 404 };
  if (o.coins_owed <= 0 && o.items_owed <= 0) return { items: [], coins: 0 };

  let gotItems = 0;
  let gotCoins = 0;
  const ok = stateStore.withState(userId, (state) => {
    if (o.items_owed > 0) {
      if (invAdd(state, o.item, o.items_owed)) gotItems = o.items_owed;
    }
    if (o.coins_owed > 0) {
      if (addCoins(state, o.coins_owed)) gotCoins = o.coins_owed;
    }
    return true;
  });
  if (ok !== true) return { error: 'no character save found', status: 400 };
  if (gotItems === 0 && gotCoins === 0) {
    return { error: 'your inventory is too full to collect', status: 400 };
  }
  // Zero only what we actually credited; a partial (e.g. items fit, coins did not)
  // leaves the rest owed for a follow-up collect.
  db.prepare('UPDATE offers SET coins_owed = coins_owed - ?, items_owed = items_owed - ?, collected_qty = collected_qty + ? WHERE id = ?')
    .run(gotCoins, gotItems, gotItems, o.id);
  const items = gotItems > 0 ? [{ id: o.item, qty: gotItems }] : [];
  return { items, coins: gotCoins };
});

app.post('/api/ge/collect', requireAuth, (req: AuthedRequest, res) => {
  if (ECONOMY_FROZEN) { res.status(503).json({ error: FREEZE_MSG }); return; }
  const { id } = req.body ?? {};
  if (!isPosInt(id, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad id' }); return; }
  let out;
  try { out = collectOffer(req.userId!, id); }
  catch { res.status(500).json({ error: 'collect failed' }); return; }
  if (out.error) { res.status(out.status ?? 400).json({ error: out.error }); return; }
  res.json({ items: out.items, coins: out.coins });
});

app.get('/api/ge/price/:item', requireAuth, (req: AuthedRequest, res) => {
  const item = String(req.params.item ?? '');
  if (!ITEM_RE.test(item)) { res.status(400).json({ error: 'invalid item id' }); return; }
  const row = db.prepare('SELECT price FROM trades WHERE item = ? ORDER BY id DESC LIMIT 1')
    .get(item) as { price: number } | undefined;
  res.json({ last: row ? row.price : null });
});

// GET /api/ge/history/:item — daily price/volume buckets from the trades
// table (last 90 days), for the trade site's price charts. Public, cached 5 min.
const geHistoryCache = new Map<string, { at: number; body: unknown }>();
const GE_HISTORY_CACHE_MS = 5 * 60_000;
app.get('/api/ge/history/:item', (req, res) => {
  const item = String(req.params.item ?? '');
  if (!ITEM_RE.test(item)) { res.status(400).json({ error: 'invalid item id' }); return; }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  const hit = geHistoryCache.get(item);
  if (hit && Date.now() - hit.at < GE_HISTORY_CACHE_MS) { res.json(hit.body); return; }
  const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const rows = db.prepare(
    `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS date,
            CAST(ROUND(CAST(SUM(price * qty) AS REAL) / SUM(qty)) AS INTEGER) AS avgPrice,
            SUM(qty) AS volume
       FROM trades WHERE item = ? AND created_at >= ?
      GROUP BY date ORDER BY date`
  ).all(item, since) as Array<{ date: string; avgPrice: number; volume: number }>;
  const body = { item, days: rows };
  if (geHistoryCache.size > 1000) geHistoryCache.clear(); // bound memory
  geHistoryCache.set(item, { at: Date.now(), body });
  res.json(body);
});

// Public bulk GE prices for the wiki (last traded price per item, no auth).
app.get('/api/ge/prices', (_req, res) => {
  const rows = db.prepare(
    'SELECT item, price FROM trades t INNER JOIN (SELECT item AS i, MAX(id) AS mid FROM trades GROUP BY item) latest ON t.item = latest.i AND t.id = latest.mid',
  ).all() as { item: string; price: number }[];
  const prices: Record<string, number> = {};
  for (const r of rows) prices[r.item] = r.price;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ prices });
});

// ---------------------------------------------------------------------------
// Hiscores (public, no auth — server/hiscores.ts, results cached 120s)
// ---------------------------------------------------------------------------

// Light per-IP rate limit for the public hiscores endpoints.
const HISCORES_RL_WINDOW_MS = 60_000;
const HISCORES_RL_MAX = 60;
const hiscoresHits = new Map<string, { count: number; reset: number }>();
function hiscoresRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  let entry = hiscoresHits.get(ip);
  if (!entry || now >= entry.reset) {
    if (hiscoresHits.size > 10_000) hiscoresHits.clear(); // bound memory
    entry = { count: 0, reset: now + HISCORES_RL_WINDOW_MS };
    hiscoresHits.set(ip, entry);
  }
  if (++entry.count > HISCORES_RL_MAX) {
    res.status(429).json({ error: 'too many requests' }); return;
  }
  next();
}

function hiscoresHeaders(res: Response) {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
}

// GET /api/hiscores?skill=overall|<SkillName>&limit=N (default 25, max 100)
app.get('/api/hiscores', hiscoresRateLimit, (req, res) => {
  const skill = typeof req.query.skill === 'string' && req.query.skill ? req.query.skill : 'overall';
  const rawLimit = Number(req.query.limit);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 25;
  const ranking = getRanking(db, skill, limit);
  if (!ranking) { res.status(400).json({ error: 'unknown skill' }); return; }
  hiscoresHeaders(res);
  res.json({ skill, ranking });
});

// GET /api/stats/online — public live player count for the homepage counter.
app.get('/api/stats/online', hiscoresRateLimit, (_req, res) => {
  hiscoresHeaders(res);
  res.json({ online: clients.size });
});

// GET /api/hiscores/player/:username — all skills for one player.
app.get('/api/hiscores/player/:username', hiscoresRateLimit, (req, res) => {
  const username = String(req.params.username ?? '');
  if (!USERNAME_RE.test(username)) { res.status(404).json({ error: 'player not found' }); return; }
  const player = getPlayerHiscores(db, username);
  if (!player) { res.status(404).json({ error: 'player not found' }); return; }
  hiscoresHeaders(res);
  res.json(player);
});

// ---------------------------------------------------------------------------
// The Untuned Mine — instanced dungeon (server/dungeon.ts)
// ---------------------------------------------------------------------------

// POST /api/dungeon/enter — validates quest access against the stored save
// (gd3_sealed_wing >= 6, the exact gate from QUEST-DESIGN §14.2), creates a
// private run, spawns its owner-tagged NPC set and replies with spawn coords.
app.post('/api/dungeon/enter', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT save FROM characters WHERE user_id = ?')
    .get(req.userId) as { save: string } | undefined;
  let stage = 0;
  try {
    const save = row ? JSON.parse(row.save) : null;
    stage = Number(save?.quests?.['gd3_sealed_wing'] ?? 0);
  } catch { stage = 0; }
  if (!(stage >= 6)) {
    res.status(403).json({ error: 'the sealed wing has not been opened' }); return;
  }
  const spawn = startRun(req.userId!);
  res.json({ x: spawn.x, y: spawn.y });
});

// POST /api/dungeon/exit — despawns the run; replies with the breach-side tile.
app.post('/api/dungeon/exit', requireAuth, (req: AuthedRequest, res) => {
  endRun(req.userId!, 'exit');
  res.json({ x: OVERWORLD_EXIT.x, y: OVERWORLD_EXIT.y });
});

// GET /api/dungeon/records — fastest boss-kill times (the entrance plaque).
app.get('/api/dungeon/records', requireAuth, (req: AuthedRequest, res) => {
  res.json(getRecords(req.userId));
});

// ---------------------------------------------------------------------------
// Version (deploy auto-refresh)
// ---------------------------------------------------------------------------

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ buildId: BUILD_ID });
});

// ---------------------------------------------------------------------------
// Forum, profiles, portraits (self-contained modules — server/forum.ts,
// server/profiles.ts, server/portrait.ts). Registered BEFORE the production
// static catch-all so /forum and /profile pages are reachable.
// ---------------------------------------------------------------------------

function userFromRequest(req: Request): { id: number; username: string } | null {
  const token = requestToken(req);
  return token ? userForToken(token) : null;
}

initPortraits(app, db);
initProfiles(app, db, { userFromRequest }); // creates profile_meta (forum reads signatures from it)
initForum(app, db, { userFromRequest, onlineCount: () => clients.size });

// ---------------------------------------------------------------------------
// Static frontend (production)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, {
      setHeaders(res, filePath) {
        // Vite emits hash-named files under assets/ — cache those forever,
        // along with the big immutable soundfont. Everything else
        // (index.html) must revalidate so deploys reach browsers instead of
        // being stuck behind their cache.
        if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.endsWith('.sf2')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')
          && !req.path.startsWith('/forum') && !req.path.startsWith('/profile')) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(dist, 'index.html'));
      } else next();
    });
    console.log(`[server] serving static frontend from ${dist}`);
  } else {
    console.warn('[server] NODE_ENV=production but ../dist not found — run `npm run build` first');
  }
}

// ---------------------------------------------------------------------------
// Admin / ops
// ---------------------------------------------------------------------------

function broadcastSystem(text: string) {
  const payload = JSON.stringify({ t: 'system', text });
  let n = 0;
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) { c.ws.send(payload); n++; }
  }
  return n;
}

// POST /api/admin/broadcast { text } — header: x-admin-token. Used by the deploy
// script to announce restarts in-game before the service bounces.
app.post('/api/admin/broadcast', requireAdmin, (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 200).trim() : '';
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  res.json({ ok: true, delivered: broadcastSystem(text) });
});

// GET /api/admin/online — currently connected players.
app.get('/api/admin/online', requireAdmin, (_req, res) => {
  const players = [];
  for (const c of clients) {
    players.push({ userId: c.userId, name: c.name, x: c.x, y: c.y, app: c.app });
  }
  res.json({ players, count: players.length });
});

// GET /api/admin/stats — quick server health/usage numbers.
app.get('/api/admin/stats', requireAdmin, (_req, res) => {
  const count = (sql: string, ...args: unknown[]) =>
    (db.prepare(sql).get(...args) as { n: number }).n;
  const dayStart = new Date().setHours(0, 0, 0, 0);
  res.json({
    uptimeSec: Math.round(process.uptime()),
    online: clients.size,
    users: count('SELECT COUNT(*) AS n FROM users'),
    characters: count('SELECT COUNT(*) AS n FROM characters'),
    activeOffers: count('SELECT COUNT(*) AS n FROM offers WHERE active = 1'),
    tradesToday: count('SELECT COUNT(*) AS n FROM trades WHERE created_at >= ?', dayStart),
    chatLines: count('SELECT COUNT(*) AS n FROM chat_log'),
  });
});

// GET /api/admin/users?q=<substr>&offset=<n> — paged user list with mod status.
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 32) : '';
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
  const like = '%' + q.replace(/[%_\\]/g, (ch) => '\\' + ch) + '%';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM users WHERE username LIKE ? ESCAPE '\\'`)
    .get(like) as { n: number }).n;
  const rows = db.prepare(
    `SELECT u.id, u.username, u.created_at,
            b.user_id AS ban_id, m.until AS mute_until, m.user_id AS mute_id,
            c.updated_at AS save_updated_at
       FROM users u
       LEFT JOIN bans b ON b.user_id = u.id
       LEFT JOIN mutes m ON m.user_id = u.id AND (m.until IS NULL OR m.until > ?)
       LEFT JOIN characters c ON c.user_id = u.id
      WHERE u.username LIKE ? ESCAPE '\\'
      ORDER BY u.id LIMIT 50 OFFSET ?`
  ).all(Date.now(), like, offset) as Array<{
    id: number; username: string; created_at: number;
    ban_id: number | null; mute_until: number | null; mute_id: number | null;
    save_updated_at: number | null;
  }>;
  res.json({
    users: rows.map((r) => ({
      id: r.id, username: r.username, createdAt: r.created_at,
      banned: r.ban_id !== null,
      mutedUntil: r.mute_id === null ? null : (r.mute_until ?? 'permanent'),
      saveUpdatedAt: r.save_updated_at,
    })),
    total,
  });
});

// GET /api/admin/character/:userId — save + backup list.
app.get('/api/admin/character/:userId', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  if (!isPosInt(userId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad userId' }); return; }
  const row = db.prepare('SELECT save, updated_at FROM characters WHERE user_id = ?')
    .get(userId) as { save: string; updated_at: number } | undefined;
  let save: unknown = null;
  try { if (row) save = JSON.parse(row.save); } catch { save = null; }
  const backups = db.prepare(
    'SELECT id, created_at, label FROM save_backups WHERE user_id = ? ORDER BY id DESC'
  ).all(userId) as Array<{ id: number; created_at: number; label: string | null }>;
  res.json({
    save,
    updatedAt: row ? row.updated_at : null,
    backups: backups.map((b) => ({ id: b.id, createdAt: b.created_at, label: b.label })),
  });
});

// PUT /api/admin/character/:userId { save } — backs up the current save first.
app.put('/api/admin/character/:userId', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  if (!isPosInt(userId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad userId' }); return; }
  const { save } = req.body ?? {};
  if (save === undefined || save === null || typeof save !== 'object') {
    res.status(400).json({ error: 'save must be an object' }); return;
  }
  const text = JSON.stringify(save);
  if (text.length > 512 * 1024) { res.status(413).json({ error: 'save too large' }); return; }
  backupSave(userId, 'pre-admin-edit');
  db.prepare(`INSERT INTO characters (user_id, save, updated_at) VALUES (?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET save = excluded.save, updated_at = excluded.updated_at`)
    .run(userId, text, Date.now());
  res.json({ ok: true });
});

// POST /api/admin/character/:userId/rollback { backupId } — restore a backup.
app.post('/api/admin/character/:userId/rollback', requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  if (!isPosInt(userId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad userId' }); return; }
  const { backupId } = req.body ?? {};
  if (!isPosInt(backupId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad backupId' }); return; }
  const backup = db.prepare('SELECT save FROM save_backups WHERE id = ? AND user_id = ?')
    .get(backupId, userId) as { save: string } | undefined;
  if (!backup) { res.status(404).json({ error: 'backup not found' }); return; }
  backupSave(userId, 'pre-rollback');
  db.prepare(`INSERT INTO characters (user_id, save, updated_at) VALUES (?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET save = excluded.save, updated_at = excluded.updated_at`)
    .run(userId, backup.save, Date.now());
  res.json({ ok: true });
});

// POST /api/admin/kick { userId }
app.post('/api/admin/kick', requireAdmin, (req, res) => {
  const { userId } = req.body ?? {};
  if (!isPosInt(userId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad userId' }); return; }
  const wasOnline = kickClient(userId, 4004, 'kicked');
  res.json({ ok: true, wasOnline });
});

// POST /api/admin/ban { userId, reason? } — also kills sessions and kicks.
app.post('/api/admin/ban', requireAdmin, (req, res) => {
  const { userId, reason } = req.body ?? {};
  if (!isPosInt(userId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad userId' }); return; }
  const reasonText = typeof reason === 'string' ? reason.slice(0, 200) : null;
  db.prepare('INSERT OR REPLACE INTO bans (user_id, reason, created_at) VALUES (?,?,?)')
    .run(userId, reasonText, Date.now());
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  const wasOnline = kickClient(userId, 4006, 'banned');
  res.json({ ok: true, wasOnline });
});

// POST /api/admin/unban { userId }
app.post('/api/admin/unban', requireAdmin, (req, res) => {
  const { userId } = req.body ?? {};
  if (!isPosInt(userId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad userId' }); return; }
  db.prepare('DELETE FROM bans WHERE user_id = ?').run(userId);
  res.json({ ok: true });
});

// POST /api/admin/mute { userId, minutes?, reason? } — minutes absent/0 = permanent.
app.post('/api/admin/mute', requireAdmin, (req, res) => {
  const { userId, minutes, reason } = req.body ?? {};
  if (!isPosInt(userId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad userId' }); return; }
  if (minutes !== undefined && minutes !== 0 && !isPosInt(minutes, 60 * 24 * 365)) {
    res.status(400).json({ error: 'bad minutes' }); return;
  }
  const until = minutes ? Date.now() + minutes * 60_000 : null;
  const reasonText = typeof reason === 'string' ? reason.slice(0, 200) : null;
  db.prepare('INSERT OR REPLACE INTO mutes (user_id, until, reason, created_at) VALUES (?,?,?,?)')
    .run(userId, until, reasonText, Date.now());
  res.json({ ok: true, until });
});

// POST /api/admin/unmute { userId }
app.post('/api/admin/unmute', requireAdmin, (req, res) => {
  const { userId } = req.body ?? {};
  if (!isPosInt(userId, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad userId' }); return; }
  db.prepare('DELETE FROM mutes WHERE user_id = ?').run(userId);
  res.json({ ok: true });
});

// GET /api/admin/chat?limit=<n<=500>&before=<id> — chat log, newest first.
app.get('/api/admin/chat', requireAdmin, (req, res) => {
  const limit = Math.min(500, Math.max(1, Math.floor(Number(req.query.limit) || 100)));
  const before = Math.floor(Number(req.query.before) || 0);
  const rows = (before > 0
    ? db.prepare('SELECT * FROM chat_log WHERE id < ? ORDER BY id DESC LIMIT ?').all(before, limit)
    : db.prepare('SELECT * FROM chat_log ORDER BY id DESC LIMIT ?').all(limit)
  ) as Array<{ id: number; user_id: number; username: string; text: string; created_at: number }>;
  res.json({
    lines: rows.map((r) => ({
      id: r.id, userId: r.user_id, username: r.username, text: r.text, createdAt: r.created_at,
    })),
  });
});

// GET /api/admin/ge — outstanding offers (with owner) + recent trades.
app.get('/api/admin/ge', requireAdmin, (_req, res) => {
  const offers = db.prepare(
    `SELECT o.*, u.username FROM offers o JOIN users u ON u.id = o.user_id
      WHERE o.active = 1 OR o.coins_owed > 0 OR o.items_owed > 0
      ORDER BY o.id DESC`
  ).all() as Array<OfferRow & { username: string }>;
  const trades = db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT 100')
    .all() as Array<{ id: number; item: string; qty: number; price: number; created_at: number }>;
  res.json({
    offers: offers.map((o) => ({ ...offerJson(o), userId: o.user_id, username: o.username })),
    trades,
  });
});

// POST /api/admin/ge/cancel { id } — abort any offer, releasing escrow to its owner.
app.post('/api/admin/ge/cancel', requireAdmin, (req, res) => {
  const { id } = req.body ?? {};
  if (!isPosInt(id, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad id' }); return; }
  const o = db.prepare('SELECT * FROM offers WHERE id = ?').get(id) as OfferRow | undefined;
  if (!o) { res.status(404).json({ error: 'offer not found' }); return; }
  if (o.active) {
    const remaining = o.qty - o.filled;
    if (o.kind === 'buy') o.coins_owed += remaining * o.price; // release coin escrow
    else o.items_owed += remaining;                            // return unsold items
    o.active = 0;
    db.prepare('UPDATE offers SET active=0, coins_owed=?, items_owed=? WHERE id=?')
      .run(o.coins_owed, o.items_owed, o.id);
  }
  res.json({ offer: offerJson(o) });
});

// ---------------------------------------------------------------------------
// WebSocket clients (declared early for friends/coinflip routes)
// ---------------------------------------------------------------------------

interface Client {
  ws: WebSocket;
  userId: number;
  name: string;
  x: number; y: number;
  app: unknown; // equipment appearance ids, opaque to the server
  lastPos: number;
  alive: boolean;
  // Inbound message-rate token bucket (per connection). Refilled lazily.
  msgTokens: number;
  msgRefill: number;
  view: PlayerView; // shared with the world sim (combat stats snapshot etc.)
}

const clients = new Set<Client>();

const social = initSocial({
  db,
  stateStore,
  getClients: () => {
    const out: { userId: number; name: string; send: (m: unknown) => void }[] = [];
    for (const c of clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        out.push({
          userId: c.userId,
          name: c.name,
          send: (m) => { c.ws.send(JSON.stringify(m)); },
        });
      }
    }
    return out;
  },
  usernameRe: USERNAME_RE,
  isPosInt,
  // Fence + push save_reload (same plumbing the market/state store use) so an
  // in-flight client PUT carrying pre-trade inventory is 409'd and re-snapshots.
  onSavesMutated: (ids) => { fenceSaves(ids); requestSaveReload(ids); },
});
social.registerRoutes(app, requireAuth);

// Market (trade.larpscape.net backend — server/market.ts). Registered before
// the /api 404; cookie or Bearer auth via userFromRequest, save fence reused.
function isOnlineName(username: string): boolean {
  const lower = username.toLowerCase();
  for (const c of clients) {
    if (c.name.toLowerCase() === lower && c.ws.readyState === WebSocket.OPEN) return true;
  }
  return false;
}
// The live Client for a userId (or null) — used to refresh the view's
// server-derived combat fields when the authoritative state mutates.
function onlineClient(userId: number): Client | null {
  for (const c of clients) {
    if (c.userId === userId && c.ws.readyState === WebSocket.OPEN) return c;
  }
  return null;
}
function systemMessageTo(username: string, text: string) {
  const lower = username.toLowerCase();
  for (const c of clients) {
    if (c.name.toLowerCase() === lower && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify({ t: 'system', text }));
    }
  }
}
// Tell an online game client that its server-side save was rewritten out from
// under it (e.g. by a market mutation made on trade.larpscape.net) so it
// re-fetches GET /api/character and rebuilds local state INSTEAD of clobbering
// the new server save with its now-stale in-memory inventory. The save fence
// (fenceSaves) only buys ~4s; without this push the client's post-fence
// re-snapshot re-dupes the escrowed item. The game client must handle
// {t:'save_reload'} (see src/net.ts) for this to fully close the dupe.
function requestSaveReload(userIds: number[]) {
  const ids = new Set(userIds);
  for (const c of clients) {
    if (ids.has(c.userId) && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify({ t: 'save_reload' }));
    }
  }
}
initMarket(app, db, {
  userFromRequest,
  isOnline: isOnlineName,
  systemMessageTo,
  onSavesMutated: (ids) => { fenceSaves(ids); requestSaveReload(ids); },
});

// 404 for unknown API routes
app.use('/api', (_req, res) => { res.status(404).json({ error: 'not found' }); });

// ---------------------------------------------------------------------------
// WebSocket: presence + chat relay
// ---------------------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function wsBroadcast(msg: unknown) {
  const payload = JSON.stringify(msg);
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(payload);
  }
}

initSim(wsBroadcast);
initDungeon(db, (userId, msg) => {
  for (const c of clients) {
    if (c.userId === userId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify(msg));
    }
  }
});

// Per-IP WS-upgrade rate limit (audit M3): a reconnect loop forces a fresh
// fullSnapshot + per-friend presence query on every connect — a cheap DoS /
// friend-spam amplifier. Cap upgrades per IP per minute. nginx is the only
// proxy (trust proxy = loopback), so the left-most X-Forwarded-For entry is the
// real client; fall back to the socket address for direct connections.
const wsUpgradeHits = new Map<string, { count: number; reset: number }>();
function wsUpgradeAllowed(req: import('http').IncomingMessage): boolean {
  const xff = req.headers['x-forwarded-for'];
  const fwd = Array.isArray(xff) ? xff[0] : xff;
  const ip = (fwd ? String(fwd).split(',')[0].trim() : '')
    || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = wsUpgradeHits.get(ip);
  if (!entry || now >= entry.reset) {
    if (wsUpgradeHits.size > 10_000) wsUpgradeHits.clear(); // bound memory
    entry = { count: 0, reset: now + 60_000 };
    wsUpgradeHits.set(ip, entry);
  }
  return ++entry.count <= 60; // 60 upgrades / min / IP
}

wss.on('connection', (ws, req) => {
  if (!wsUpgradeAllowed(req)) { ws.close(4008, 'rate limited'); return; }
  const url = new URL(req.url ?? '/ws', 'http://localhost');
  // ?token= (Bearer-style, the game client's stored token) wins; otherwise
  // accept the bs_session cookie sent on the upgrade request.
  const queryToken = url.searchParams.get('token');
  const cookieToken = parseCookieHeader(req.headers.cookie)[SESSION_COOKIE] || '';
  // Cross-site WS guard: when authentication rides in on the ambient cookie
  // (no explicit ?token=), the upgrade must come from a larpscape.net page.
  // Browsers always send Origin on WebSocket upgrades, so a present-but-foreign
  // Origin means a cross-site page is trying to use the victim's cookie.
  if (!queryToken && cookieToken && req.headers.origin) {
    let oHost = '';
    try { oHost = new URL(String(req.headers.origin)).hostname.toLowerCase(); } catch { oHost = ''; }
    const okOrigin = oHost === 'localhost' || oHost === '127.0.0.1' || isLarpscapeHost(oHost);
    if (!okOrigin) { ws.close(4007, 'forbidden origin'); return; }
  }
  const token = queryToken || cookieToken;
  const user = userForToken(token);
  if (!user) { ws.close(4001, 'unauthorized'); return; }
  if (isBanned(user.id)) { ws.close(4006, 'banned'); return; }

  // Drop any previous connection for the same account.
  for (const c of clients) if (c.userId === user.id) { c.ws.close(4002, 'replaced'); clients.delete(c); }

  const view: PlayerView = {
    userId: user.id, name: user.username,
    x: 0, y: 0, dead: false,
    cb: 3, effDef: 1, defBonus: 0, hp: 10, maxHp: 10,
    send: (msg: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  // Build the server-derived combat profile from the authoritative save and seed
  // the view's combat fields + authoritative HP. The client no longer reports
  // any of these — they are derived here (closes G1/M4). Live HP starts from the
  // persisted curHp (clamped to the derived max).
  {
    const entry = rebuildProfile(user.id);
    if (entry) {
      const persisted = stateStore.loadState(user.id);
      const startHp = (persisted && typeof persisted.curHp === 'number')
        ? Math.max(0, Math.min(entry.profile.maxHp, Math.round(persisted.curHp)))
        : entry.profile.maxHp;
      view.hp = startHp > 0 ? startHp : entry.profile.maxHp;
      applyProfileToView(view, entry);
    }
  }
  const client: Client = {
    ws, userId: user.id, name: user.username,
    x: 0, y: 0, app: null, lastPos: 0, alive: true,
    msgTokens: 60, msgRefill: Date.now(),
    view,
  };
  clients.add(client);
  ws.send(JSON.stringify({ t: 'hello', name: user.username, buildId: BUILD_ID }));
  social.notifyFriendsOnline(user.id, user.username, true);
  // authoritative world state: full NPC + ground item snapshot on connect
  // (filtered to this user — instanced dungeon NPCs stay private)
  ws.send(JSON.stringify(fullSnapshot(user.id)));

  ws.on('message', (raw) => {
    // Per-connection inbound message-rate cap (audit M3): a token bucket that
    // refills at ~30 msg/s up to a 60-msg burst, covering EVERY message type
    // (pos has its own 200ms throttle; swing is cooldown-bound; this bounds the
    // rest — stats/interact/trade_*/chat — and blunts tight reconnect-free spam).
    const now = Date.now();
    const refilled = client.msgTokens + ((now - client.msgRefill) / 1000) * 30;
    client.msgTokens = Math.min(60, refilled);
    client.msgRefill = now;
    if (client.msgTokens < 1) return; // drop silently when over budget
    client.msgTokens -= 1;
    let msg: any;
    try { msg = JSON.parse(String(raw).slice(0, 2048)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'pos') {
      const now = Date.now();
      if (now - client.lastPos < 200) return; // rate limit
      client.lastPos = now;
      if (typeof msg.x === 'number' && Number.isFinite(msg.x)) client.x = Math.round(msg.x);
      if (typeof msg.y === 'number' && Number.isFinite(msg.y)) client.y = Math.round(msg.y);
      if (msg.app !== undefined) client.app = msg.app;
      view.x = client.x;
      view.y = client.y;
      if (typeof msg.d === 'boolean') view.dead = msg.d;
    } else if (msg.t === 'stats') {
      // The client no longer reports combat NUMBERS (cb/effDef/defBonus/hp/maxHp
      // are server-derived from the cached profile — closes G1/M4). It may still
      // send its combat-style / autocast SELECTION and its alive flag; the
      // selection is validated and applied server-side, then the view's combat
      // fields are refreshed from the re-derived profile.
      setStyleSelection(view.userId, msg.combatStyle, msg.autocastSpell);
      const entry = combatProfiles.get(view.userId);
      if (entry) applyProfileToView(view, entry);
      if (typeof msg.d === 'boolean') view.dead = msg.d;
    } else if (msg.t === 'swing') {
      handleSwing(view, msg);
    } else if (msg.t === 'pickup') {
      handlePickup(view, msg);
    } else if (msg.t === 'drop') {
      handleDrop(view, msg);
    } else if (msg.t === 'interact') {
      handleInteract(view, msg);
    } else if (msg.t === 'intent') {
      // Server-authoritative skilling intents (gather/fish/cook/firemake/make).
      // Validates level/inputs/tool/range vs server state, rolls, applies via
      // withState, and replies with the authoritative {t:'intent',...} echo.
      const intentRes = dispatchIntentWs(stateStore, intents, view, msg);
      if (intentRes?.ok && Array.isArray(intentRes.activePrayers)) {
        const pe = combatProfiles.get(view.userId);
        if (pe) pe.activePrayers = intentRes.activePrayers;
      }
    } else if (msg.t === 'chat') {
      if (typeof msg.text !== 'string') return;
      const text = msg.text.slice(0, 80).replace(/[\x00-\x1f]/g, '').trim();
      if (!text) return;
      logChat(client.userId, client.name, text);
      if (isMuted(client.userId)) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: 'system', text: 'You are muted.' }));
        }
        return;
      }
      // '/g ' prefix: guild channel — delivered only to online guildmates
      if (/^\/g(\s|$)/i.test(text)) {
        const gText = text.replace(/^\/g\s*/i, '').slice(0, 80);
        if (gText) social.guildChat({ userId: client.userId, name: client.name, send: view.send }, gText);
        return;
      }
      const payload = JSON.stringify({
        t: 'chat', from: client.name, tag: social.getGuildTag(client.userId), text,
      });
      for (const c of clients) {
        if (c !== client && c.ws.readyState === WebSocket.OPEN) c.ws.send(payload);
      }
    } else if (typeof msg.t === 'string' && msg.t.startsWith('trade_')) {
      social.handleTradeWs({ userId: client.userId, name: client.name, send: view.send }, msg);
    }
  });

  ws.on('pong', () => { client.alive = true; });
  const onGone = () => {
    clients.delete(client);
    flushCombatState(client.userId, client.view); // persist live HP + spec, then drop the cache
    combatProfiles.delete(client.userId);
    dropPlayer(client.userId);
    dungeonOnDisconnect(client.userId); // despawns any active dungeon run
    social.onDisconnect(client.userId); // cancels any in-flight trade
    social.notifyFriendsOnline(client.userId, client.name, false);
  };
  ws.on('close', onGone);
  ws.on('error', onGone);
});

// Flush a player's live (RAM) combat state — authoritative HP + spec energy —
// to the persisted save when it has diverged. Called on a cadence in the tick
// and on disconnect, so combat never opens a DB transaction per hit (§3.3).
function flushCombatState(userId: number, view: PlayerView) {
  const entry = combatProfiles.get(userId);
  if (!entry || !entry.hpDirty) return;
  stateStore.withState(userId, (state) => {
    state.curHp = Math.max(0, Math.min(entry.profile.maxHp, Math.round(view.hp)));
    state.specEnergy = Math.max(0, Math.min(100, Math.round(entry.specEnergy)));
    state.activePrayers = [...entry.activePrayers];
  });
  entry.hpDirty = false;
}

// World tick (600ms, matches the client TICK_MS): NPC sim + delta broadcast,
// then the presence snapshot for remote-player rendering.
let serverTick = 0;
setInterval(() => {
  const players = new Map<number, PlayerView>();
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) players.set(c.userId, c.view);
  }
  tickSim(players);

  serverTick++;
  // Server-authoritative regen + lazy persistence of live combat state (§3.3).
  // HP regen +1 / 100 ticks, spec regen +10 / 50 ticks — same cadence the client
  // used, now owned by the server. Live state is flushed to the save every ~50
  // ticks (~30s) so a crash loses at most that window; per-hit DB writes are
  // avoided. Pushes the authoritative hp to the client when it changes.
  for (const c of clients) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;
    const entry = combatProfiles.get(c.userId);
    if (!entry) continue;
    if (serverTick % 100 === 0 && !c.view.dead && c.view.hp > 0 && c.view.hp < entry.profile.maxHp) {
      c.view.hp++;
      entry.hpDirty = true;
      c.view.send({ t: 'hpSync', hp: c.view.hp, maxHp: entry.profile.maxHp });
    }
    if (serverTick % 50 === 0 && entry.specEnergy < 100) {
      entry.specEnergy = Math.min(100, entry.specEnergy + 10);
      entry.hpDirty = true;
      c.view.send({ t: 'specSync', spec: entry.specEnergy });
    }
    if (serverTick % 50 === 0) flushCombatState(c.userId, c.view);
    // Server-authoritative prayer drain (same cadence as client TICK_MS).
    if (entry.activePrayers.length > 0) {
      let drain = 0;
      for (const id of entry.activePrayers) drain += PRAYER_DRAIN.get(id) ?? 0;
      if (drain > 0) {
        entry.prayerDrainAcc += drain;
        if (entry.prayerDrainAcc >= 100) {
          const pointsLost = Math.floor(entry.prayerDrainAcc / 100);
          entry.prayerDrainAcc %= 100;
          const sync = stateStore.withState(c.userId, (state) => {
            const cur = Math.max(0, state.prayerPoints ?? 0);
            state.prayerPoints = Math.max(0, cur - pointsLost);
            if (state.prayerPoints <= 0) {
              state.activePrayers = [];
              entry.activePrayers = [];
            }
            return {
              prayerPoints: state.prayerPoints,
              activePrayers: entry.activePrayers,
            };
          });
          if (sync) {
            entry.hpDirty = true;
            c.view.send({ t: 'prayerSync', ...sync });
          }
        }
      }
    }
  }

  if (clients.size === 0) return;
  for (const c of clients) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;
    const others = [];
    for (const o of clients) {
      if (o === c) continue;
      // players inside the instanced dungeon are invisible to everyone:
      // runs are private, so presence stops broadcasting their position
      if (inDungeon(o.x, o.y)) continue;
      others.push({
        name: o.name, x: o.x, y: o.y, app: o.app,
        cb: o.view.cb, hp: o.view.hp, maxHp: o.view.maxHp, d: o.view.dead,
        tag: social.getGuildTag(o.userId), // guild tag for the overhead label
      });
    }
    c.ws.send(JSON.stringify({ t: 'players', players: others }));
  }
}, 600);

// Heartbeat: drop dead sockets.
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) { c.ws.terminate(); clients.delete(c); continue; }
    c.alive = false;
    c.ws.ping();
  }
}, 30_000);

server.listen(PORT, () => {
  console.log(`[server] Larpscape server listening on http://localhost:${PORT}`);
});

// Graceful shutdown: announce in-game, give the message a moment to deliver,
// then close sockets so clients flip into reconnect mode while the service restarts.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received — broadcasting restart notice`);
  broadcastSystem('Server is restarting for an update — you will be reconnected automatically.');
  setTimeout(() => {
    for (const c of clients) { try { c.ws.close(4003, 'server restart'); } catch { /* ignore */ } }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  }, 1200);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
