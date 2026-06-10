// Larpscape server: accounts, character saves, presence/chat relay, Grand Exchange.
// Run: npx tsx server/index.ts   (or `npm run server`)
// Production: NODE_ENV=production also serves ../dist statically.

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
// Shared secret for ops endpoints (broadcast). Empty = endpoints disabled.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

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

app.put('/api/character', requireAuth, (req: AuthedRequest, res) => {
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

// ---------------------------------------------------------------------------
// Static frontend (production)
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
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
app.post('/api/admin/broadcast', (req, res) => {
  if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    res.status(401).json({ error: 'unauthorized' }); return;
  }
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 200).trim() : '';
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  res.json({ ok: true, delivered: broadcastSystem(text) });
});

// 404 for unknown API routes
app.use('/api', (_req, res) => { res.status(404).json({ error: 'not found' }); });

// ---------------------------------------------------------------------------
// WebSocket: presence + chat relay
// ---------------------------------------------------------------------------

interface Client {
  ws: WebSocket;
  userId: number;
  name: string;
  x: number; y: number;
  app: unknown; // equipment appearance ids, opaque to the server
  lastPos: number;
  alive: boolean;
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set<Client>();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/ws', 'http://localhost');
  const user = userForToken(url.searchParams.get('token') ?? '');
  if (!user) { ws.close(4001, 'unauthorized'); return; }

  // Drop any previous connection for the same account.
  for (const c of clients) if (c.userId === user.id) { c.ws.close(4002, 'replaced'); clients.delete(c); }

  const client: Client = {
    ws, userId: user.id, name: user.username,
    x: 0, y: 0, app: null, lastPos: 0, alive: true,
  };
  clients.add(client);
  ws.send(JSON.stringify({ t: 'hello', name: user.username }));

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
    } else if (msg.t === 'chat') {
      if (typeof msg.text !== 'string') return;
      const text = msg.text.slice(0, 80).replace(/[\x00-\x1f]/g, '').trim();
      if (!text) return;
      const payload = JSON.stringify({ t: 'chat', from: client.name, text });
      for (const c of clients) {
        if (c !== client && c.ws.readyState === WebSocket.OPEN) c.ws.send(payload);
      }
    }
  });

  ws.on('pong', () => { client.alive = true; });
  ws.on('close', () => clients.delete(client));
  ws.on('error', () => clients.delete(client));
});

// Players snapshot broadcast (~every 600ms), excluding self.
setInterval(() => {
  if (clients.size === 0) return;
  for (const c of clients) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;
    const players = [];
    for (const o of clients) {
      if (o === c) continue;
      players.push({ name: o.name, x: o.x, y: o.y, app: o.app });
    }
    c.ws.send(JSON.stringify({ t: 'players', players }));
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
