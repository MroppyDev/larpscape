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
  type PlayerView,
} from './sim';
import { initSocial } from './social';
import {
  initDungeon, startRun, endRun, getRecords, inDungeon,
  OVERWORLD_EXIT, onDisconnect as dungeonOnDisconnect,
} from './dungeon';

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

const db = new Database(path.join(__dirname, 'data.db'));
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

function userForToken(token: string): { id: number; username: string } | null {
  if (!token || typeof token !== 'string' || token.length > 128) return null;
  const row = db.prepare(
    'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).get(token) as { id: number; username: string } | undefined;
  return row ?? null;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(\S+)$/.exec(header);
  const user = m ? userForToken(m[1]) : null;
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return; }
  req.userId = user.id;
  req.username = user.username;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) {
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
app.use(express.json({ limit: '1mb' }));

app.post('/api/register', (req, res) => {
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
  res.json({ token, username });
});

app.post('/api/login', (req, res) => {
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
  res.json({ token, username: user.username });
});

app.get('/api/character', requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare('SELECT save FROM characters WHERE user_id = ?')
    .get(req.userId) as { save: string } | undefined;
  if (!row) { res.json({ save: null }); return; }
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

app.put('/api/character', requireAuth, (req: AuthedRequest, res) => {
  const fencedUntil = saveFence.get(req.userId!) ?? 0;
  if (fencedUntil > Date.now()) {
    res.status(409).json({ error: 'save_fenced' }); return;
  }
  if (fencedUntil) saveFence.delete(req.userId!);
  const { save } = req.body ?? {};
  if (save === undefined || save === null || typeof save !== 'object') {
    res.status(400).json({ error: 'save must be an object' }); return;
  }
  const text = JSON.stringify(save);
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
// Escrow model (client-authoritative):
//   buy offer  — buyer already removed qty*price coins client-side; itemsOwed accrues
//                bought items, coinsOwed accrues the spread refund when filling cheaper.
//   sell offer — seller already removed the items client-side; coinsOwed accrues proceeds.
const matchOffer = db.transaction((incoming: OfferRow): OfferRow => {
  let remaining = incoming.qty - incoming.filled;
  const opposite = incoming.kind === 'buy' ? 'sell' : 'buy';
  // Best price first, then oldest (price-time priority).
  const order = incoming.kind === 'buy' ? 'price ASC, id ASC' : 'price DESC, id ASC';
  const priceCond = incoming.kind === 'buy' ? 'price <= ?' : 'price >= ?';
  const book = db.prepare(
    `SELECT * FROM offers WHERE item = ? AND kind = ? AND active = 1 AND filled < qty AND ${priceCond} ORDER BY ${order}`
  ).all(incoming.item, opposite, incoming.price) as OfferRow[];

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

app.post('/api/ge/offer', requireAuth, (req: AuthedRequest, res) => {
  const { kind, item, qty, price } = req.body ?? {};
  if (kind !== 'buy' && kind !== 'sell') { res.status(400).json({ error: 'kind must be buy or sell' }); return; }
  if (typeof item !== 'string' || !ITEM_RE.test(item)) { res.status(400).json({ error: 'invalid item id' }); return; }
  if (!isPosInt(qty, MAX_QTY)) { res.status(400).json({ error: 'qty must be a positive integer' }); return; }
  if (!isPosInt(price, MAX_PRICE)) { res.status(400).json({ error: 'price must be a positive integer' }); return; }
  if (qty * price > Number.MAX_SAFE_INTEGER) { res.status(400).json({ error: 'offer too large' }); return; }

  const activeCount = db.prepare('SELECT COUNT(*) AS n FROM offers WHERE user_id = ? AND active = 1')
    .get(req.userId) as { n: number };
  if (activeCount.n >= 8) { res.status(400).json({ error: 'too many active offers' }); return; }

  const info = db.prepare(
    'INSERT INTO offers (user_id, kind, item, qty, price, created_at) VALUES (?,?,?,?,?,?)'
  ).run(req.userId, kind, item, qty, price, Date.now());
  const inserted = db.prepare('SELECT * FROM offers WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as OfferRow;
  const after = matchOffer(inserted);
  res.json({ offer: offerJson(after) });
});

app.get('/api/ge/offers', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(
    `SELECT * FROM offers WHERE user_id = ?
       AND (active = 1 OR coins_owed > 0 OR items_owed > 0)
     ORDER BY id DESC LIMIT 40`
  ).all(req.userId) as OfferRow[];
  res.json({ offers: rows.map(offerJson) });
});

app.post('/api/ge/abort', requireAuth, (req: AuthedRequest, res) => {
  const { id } = req.body ?? {};
  if (!isPosInt(id, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad id' }); return; }
  const o = db.prepare('SELECT * FROM offers WHERE id = ? AND user_id = ?')
    .get(id, req.userId) as OfferRow | undefined;
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

app.post('/api/ge/collect', requireAuth, (req: AuthedRequest, res) => {
  const { id } = req.body ?? {};
  if (!isPosInt(id, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad id' }); return; }
  const o = db.prepare('SELECT * FROM offers WHERE id = ? AND user_id = ?')
    .get(id, req.userId) as OfferRow | undefined;
  if (!o) { res.status(404).json({ error: 'offer not found' }); return; }
  const items = o.items_owed > 0 ? [{ id: o.item, qty: o.items_owed }] : [];
  const coins = o.coins_owed;
  db.prepare('UPDATE offers SET coins_owed=0, items_owed=0, collected_qty = collected_qty + ? WHERE id=?')
    .run(o.items_owed, o.id);
  res.json({ items, coins });
});

app.get('/api/ge/price/:item', requireAuth, (req: AuthedRequest, res) => {
  const item = String(req.params.item ?? '');
  if (!ITEM_RE.test(item)) { res.status(400).json({ error: 'invalid item id' }); return; }
  const row = db.prepare('SELECT price FROM trades WHERE item = ? ORDER BY id DESC LIMIT 1')
    .get(item) as { price: number } | undefined;
  res.json({ last: row ? row.price : null });
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
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
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
  view: PlayerView; // shared with the world sim (combat stats snapshot etc.)
}

const clients = new Set<Client>();

const social = initSocial({
  db,
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
  onSavesMutated: fenceSaves,
});
social.registerRoutes(app, requireAuth);

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

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/ws', 'http://localhost');
  const user = userForToken(url.searchParams.get('token') ?? '');
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
  const client: Client = {
    ws, userId: user.id, name: user.username,
    x: 0, y: 0, app: null, lastPos: 0, alive: true,
    view,
  };
  clients.add(client);
  ws.send(JSON.stringify({ t: 'hello', name: user.username, buildId: BUILD_ID }));
  social.notifyFriendsOnline(user.id, user.username, true);
  // authoritative world state: full NPC + ground item snapshot on connect
  // (filtered to this user — instanced dungeon NPCs stay private)
  ws.send(JSON.stringify(fullSnapshot(user.id)));

  const clampStat = (n: unknown, lo: number, hi: number, dflt: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;

  ws.on('message', (raw) => {
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
      // client-reported combat snapshot (trusted, clamped)
      view.cb = clampStat(msg.cb, 1, 126, view.cb);
      view.effDef = clampStat(msg.effDef, 1, 200, view.effDef);
      view.defBonus = clampStat(msg.defBonus, 0, 500, view.defBonus);
      view.hp = clampStat(msg.hp, 0, 999, view.hp);
      view.maxHp = clampStat(msg.maxHp, 1, 999, view.maxHp);
      if (typeof msg.d === 'boolean') view.dead = msg.d;
    } else if (msg.t === 'swing') {
      handleSwing(view, msg);
    } else if (msg.t === 'pickup') {
      handlePickup(view, msg);
    } else if (msg.t === 'drop') {
      handleDrop(view, msg);
    } else if (msg.t === 'interact') {
      handleInteract(view, msg);
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
  ws.on('close', () => {
    clients.delete(client);
    dropPlayer(client.userId);
    dungeonOnDisconnect(client.userId); // despawns any active dungeon run
    social.onDisconnect(client.userId); // cancels any in-flight trade
    social.notifyFriendsOnline(client.userId, client.name, false);
  });
  ws.on('error', () => {
    clients.delete(client);
    dropPlayer(client.userId);
    dungeonOnDisconnect(client.userId);
    social.onDisconnect(client.userId);
    social.notifyFriendsOnline(client.userId, client.name, false);
  });
});

// World tick (600ms, matches the client TICK_MS): NPC sim + delta broadcast,
// then the presence snapshot for remote-player rendering.
setInterval(() => {
  const players = new Map<number, PlayerView>();
  for (const c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) players.set(c.userId, c.view);
  }
  tickSim(players);

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
