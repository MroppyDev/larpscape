// Larpscape Market — trade.larpscape.net backend (server-authoritative escrow).
//
// Unlike the in-game GE (client-trusted escrow), every market mutation here is
// a single synchronous SQLite transaction against the SERVER copy of the
// characters save JSON, and every save rewrite bumps the save fence
// (onSavesMutated) so an in-flight client PUT /api/character carrying stale
// inventory gets a 409 and re-snapshots — same anti-dupe pattern as
// server/social.ts face-to-face trading.
//
// Escrow invariants (hold at every commit point):
//   * An ACTIVE listing's qty of its item exists ONLY in market_listings —
//     it was removed from the seller's bank at creation.
//   * A SOLD listing's item is in the buyer's bank; its price is in
//     market_proceeds (minus nothing — the fee was charged at creation).
//   * A CANCELLED listing's item is back in the seller's bank.
//   * market_proceeds coins exist nowhere else until COLLECT moves them
//     into the seller's bank.
//   * The 1% listing fee (min 10gp) is destroyed at creation (gold sink).
//
// Additional invariants enforced here / by the surrounding plumbing:
//   * Every save-mutating endpoint (list/buy/cancel/collect) runs its read +
//     bank rewrite + status flip in ONE synchronous better-sqlite3
//     transaction. better-sqlite3 is blocking and single-threaded, so no two
//     mutations interleave within a process: a listing's status is therefore
//     re-checked === 'active' INSIDE the buy/cancel tx, defeating double-sell,
//     sell-vs-cancel, double-collect, and over-listing-via-rapid-creates.
//   * The qty/price domain is closed at the route: positive safe integers,
//     qty <= MAX_QTY, total price <= MAX_PRICE. price is a TOTAL (never
//     qty*per-unit), so there is no price*qty multiply to overflow.
//   * buyer != seller is checked INSIDE the tx; 'coins' may never be listed.
//   * Every mutating route is auth'd (cookie or Bearer) and, for cookie auth,
//     CSRF-guarded by the global /api Origin-host middleware in index.ts.
//   * systemMessageTo is only ever called with server-derived text (item
//     META names, server-side qty/price) — never raw client input — so it
//     cannot be used to spoof arbitrary system messages.
//   * CLIENT FENCE: a market mutation rewrites the SERVER save while a player
//     who is also in-game holds an authoritative LOCAL save with no knowledge
//     of the escrow. fenceSaves() 409s their in-flight PUT, but the game
//     client's post-fence re-snapshot would re-send stale local inventory and
//     RE-DUPE. onSavesMutated therefore ALSO pushes {t:'save_reload'} to the
//     online client (see index.ts) so it re-fetches GET /api/character before
//     re-saving. The client MUST handle that message (src/net.ts) for the
//     dupe to be fully closed — the fence alone is NOT sufficient for the
//     market the way trade_complete diffs make it sufficient for f2f trades.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ITEM_RE = /^[a-z][a-z0-9_]{0,47}$/;
const MAX_QTY = 2_000_000_000;       // per-stack cap (keeps qty a safe integer)
const MAX_PRICE = 2_000_000_000;     // total listing price cap
const MAX_ACTIVE_LISTINGS = 12;
const FEE_RATE = 0.01;
const FEE_MIN = 10;
const BANK_MAX_STACKS = 800;         // soft cap on distinct bank stacks
const PAGE_SIZE = 25;
const SEARCH_CACHE_MS = 30_000;

// ---------------------------------------------------------------------------
// Item metadata, precomputed once at boot so search filters are cheap.
// ---------------------------------------------------------------------------

interface RawItem {
  id: string; name: string; stackable?: boolean; value?: number;
  equipSlot?: string; attackSpeed?: number;
  attBonus?: number; strBonus?: number; rangedBonus?: number;
  mageBonus?: number; gunBonus?: number;
  levelReq?: Array<{ skill: string; level: number }>;
  effects?: Array<{ type: string }>;
  spec?: { name: string };
}

export interface ItemMeta {
  id: string;
  name: string;
  nameLower: string;
  slot: string | null;
  levelReq: number;            // highest level across all requirements (0 = none)
  levelReqs: Array<{ skill: string; level: number }>;
  effects: string[];           // effect type tokens, e.g. ['burn']
  spec: string | null;         // special attack name, null if none
  bonuses: { att: number; str: number; ranged: number; mage: number; gun: number };
  attackSpeed: number | null;
  stackable: boolean;
  value: number;
}

const ITEMS: Record<string, RawItem> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/items.json'), 'utf8'),
);

const META: Record<string, ItemMeta> = {};
for (const [id, it] of Object.entries(ITEMS)) {
  const reqs = Array.isArray(it.levelReq) ? it.levelReq : [];
  META[id] = {
    id,
    name: it.name ?? id,
    nameLower: (it.name ?? id).toLowerCase(),
    slot: it.equipSlot ?? null,
    levelReq: reqs.reduce((m, r) => Math.max(m, r.level || 0), 0),
    levelReqs: reqs,
    effects: Array.isArray(it.effects) ? it.effects.map((e) => String(e.type)) : [],
    spec: it.spec?.name ?? null,
    bonuses: {
      att: it.attBonus ?? 0, str: it.strBonus ?? 0, ranged: it.rangedBonus ?? 0,
      mage: it.mageBonus ?? 0, gun: it.gunBonus ?? 0,
    },
    attackSpeed: it.attackSpeed ?? null,
    stackable: !!it.stackable,
    value: it.value ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Bank helpers — save.bank is a dense ItemStack[] ({id, qty}); the bank stacks
// everything by id (see src/game.ts bankDeposit), so "add" merges or pushes.
// ---------------------------------------------------------------------------

interface ItemStack { id: string; qty: number }

function bankOf(save: any): ItemStack[] {
  if (!Array.isArray(save?.bank)) throw new Error('bad save');
  return save.bank as ItemStack[];
}

function bankCount(save: any, id: string): number {
  let n = 0;
  for (const s of bankOf(save)) if (s && s.id === id) n += s.qty;
  return n;
}

function bankRemove(save: any, id: string, qty: number): boolean {
  const bank = bankOf(save);
  if (bankCount(save, id) < qty) return false;
  let left = qty;
  for (let i = bank.length - 1; i >= 0 && left > 0; i--) {
    const s = bank[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take; left -= take;
    if (s.qty <= 0) bank.splice(i, 1);
  }
  return left === 0;
}

// Returns an error string, or null on success.
function bankAdd(save: any, id: string, qty: number): string | null {
  const bank = bankOf(save);
  const slot = bank.find((s) => s && s.id === id);
  if (slot) {
    if (slot.qty + qty > MAX_QTY) return 'bank stack limit reached for that item';
    slot.qty += qty;
    return null;
  }
  if (bank.length >= BANK_MAX_STACKS) return 'bank is full';
  if (qty > MAX_QTY) return 'bank stack limit reached for that item';
  bank.push({ id, qty });
  return null;
}

// ---------------------------------------------------------------------------
// initMarket
// ---------------------------------------------------------------------------

export interface MarketHelpers {
  userFromRequest: (req: Request) => { id: number; username: string } | null;
  isOnline: (username: string) => boolean;
  systemMessageTo: (username: string, text: string) => void;
  // Save fence: called with every userId whose save was rewritten server-side.
  onSavesMutated: (userIds: number[]) => void;
}

interface ListingRow {
  id: number; user_id: number; item: string; qty: number; price: number;
  created_at: number; status: 'active' | 'sold' | 'cancelled';
  sold_at: number | null; buyer_id: number | null;
}

function isPosInt(n: unknown, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= max;
}

function fmtCoins(n: number): string {
  return n.toLocaleString('en-US');
}

export function initMarket(app: Express, db: Database.Database, helpers: MarketHelpers) {
  const { userFromRequest, isOnline, systemMessageTo, onSavesMutated } = helpers;

  db.exec(`
CREATE TABLE IF NOT EXISTS market_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled')),
  sold_at INTEGER,
  buyer_id INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_market_listings_active ON market_listings (status, item);
CREATE INDEX IF NOT EXISTS idx_market_listings_user ON market_listings (user_id, id);
CREATE TABLE IF NOT EXISTS market_proceeds (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  coins INTEGER NOT NULL DEFAULT 0
);
`);

  // ---- save access (same storage social.ts trusts) ----
  function loadSave(userId: number): any | null {
    const row = db.prepare('SELECT save FROM characters WHERE user_id = ?')
      .get(userId) as { save: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.save); } catch { return null; }
  }
  function writeSave(userId: number, save: any) {
    db.prepare(`INSERT INTO characters (user_id, save, updated_at) VALUES (?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET save = excluded.save, updated_at = excluded.updated_at`)
      .run(userId, JSON.stringify(save), Date.now());
  }
  function usernameOf(userId: number): string {
    const row = db.prepare('SELECT username FROM users WHERE id = ?')
      .get(userId) as { username: string } | undefined;
    return row?.username ?? '?';
  }

  // Cookie-or-Bearer auth. CSRF for cookie-authed writes is enforced by the
  // global /api middleware in index.ts (Origin host check) — nothing extra here.
  function requireUser(req: Request, res: Response): { id: number; username: string } | null {
    const user = userFromRequest(req);
    if (!user) { res.status(401).json({ error: 'unauthorized' }); return null; }
    return user;
  }

  function listingJson(l: ListingRow, sellerName?: string) {
    const meta = META[l.item];
    return {
      id: l.id,
      item: l.item,
      name: meta?.name ?? l.item,
      qty: l.qty,
      price: l.price,
      pricePer: Math.ceil(l.price / l.qty),
      createdAt: l.created_at,
      status: l.status,
      soldAt: l.sold_at,
      seller: sellerName ?? usernameOf(l.user_id),
      meta: meta ? {
        slot: meta.slot, levelReq: meta.levelReq, levelReqs: meta.levelReqs,
        effects: meta.effects, spec: meta.spec, bonuses: meta.bonuses,
        attackSpeed: meta.attackSpeed, stackable: meta.stackable, value: meta.value,
      } : null,
    };
  }

  // -------------------------------------------------------------------------
  // CREATE — escrow the item out of the seller's bank, charge the fee.
  // -------------------------------------------------------------------------

  const txCreate = db.transaction((userId: number, item: string, qty: number, price: number):
      { error?: string; status?: number; listing?: ListingRow } => {
    const active = (db.prepare(
      "SELECT COUNT(*) AS n FROM market_listings WHERE user_id = ? AND status = 'active'"
    ).get(userId) as { n: number }).n;
    if (active >= MAX_ACTIVE_LISTINGS) {
      return { error: `you may have at most ${MAX_ACTIVE_LISTINGS} active listings`, status: 400 };
    }
    const save = loadSave(userId);
    if (!save || !Array.isArray(save.bank)) return { error: 'no character save found', status: 400 };
    const fee = Math.max(FEE_MIN, Math.floor(price * FEE_RATE));
    if (bankCount(save, 'coins') < fee) {
      return { error: `listing fee is ${fmtCoins(fee)} coins — not enough in your bank`, status: 400 };
    }
    if (bankCount(save, item) < qty) {
      return { error: 'your bank does not hold that many', status: 400 };
    }
    // Escrow: item leaves the bank, fee is destroyed.
    bankRemove(save, item, qty);
    bankRemove(save, 'coins', fee);
    writeSave(userId, save);
    const info = db.prepare(
      'INSERT INTO market_listings (user_id, item, qty, price, created_at) VALUES (?,?,?,?,?)'
    ).run(userId, item, qty, price, Date.now());
    const listing = db.prepare('SELECT * FROM market_listings WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as ListingRow;
    return { listing };
  });

  app.post('/api/market/list', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const { item, qty, price } = req.body ?? {};
    if (typeof item !== 'string' || !ITEM_RE.test(item) || !META[item]) {
      res.status(400).json({ error: 'invalid item id' }); return;
    }
    if (item === 'coins') { res.status(400).json({ error: 'coins cannot be listed' }); return; }
    if (!isPosInt(qty, MAX_QTY)) { res.status(400).json({ error: 'qty must be a positive integer' }); return; }
    if (!isPosInt(price, MAX_PRICE)) {
      res.status(400).json({ error: `price must be 1..${MAX_PRICE} coins (total)` }); return;
    }
    let out;
    try { out = txCreate(user.id, item, qty, price); }
    catch { res.status(500).json({ error: 'listing failed' }); return; }
    if (out.error) { res.status(out.status ?? 400).json({ error: out.error }); return; }
    onSavesMutated([user.id]);
    searchCache.clear();
    res.json({ listing: listingJson(out.listing!, user.username) });
  });

  // -------------------------------------------------------------------------
  // BUYOUT — coins out of buyer bank, item in, proceeds owed to seller.
  // -------------------------------------------------------------------------

  const txBuy = db.transaction((listingId: number, buyerId: number):
      { error?: string; status?: number; listing?: ListingRow } => {
    const l = db.prepare('SELECT * FROM market_listings WHERE id = ?')
      .get(listingId) as ListingRow | undefined;
    if (!l) return { error: 'listing not found', status: 404 };
    if (l.status !== 'active') return { error: 'listing is no longer available', status: 409 };
    if (l.user_id === buyerId) return { error: 'you cannot buy your own listing', status: 400 };
    const save = loadSave(buyerId);
    if (!save || !Array.isArray(save.bank)) return { error: 'no character save found', status: 400 };
    if (bankCount(save, 'coins') < l.price) {
      return { error: 'not enough coins in your bank', status: 400 };
    }
    bankRemove(save, 'coins', l.price);
    const addErr = bankAdd(save, l.item, l.qty);
    if (addErr) throw { marketReject: { error: addErr, status: 400 } }; // rollback
    writeSave(buyerId, save);
    db.prepare("UPDATE market_listings SET status = 'sold', sold_at = ?, buyer_id = ? WHERE id = ?")
      .run(Date.now(), buyerId, l.id);
    db.prepare(`INSERT INTO market_proceeds (user_id, coins) VALUES (?,?)
                ON CONFLICT(user_id) DO UPDATE SET coins = coins + excluded.coins`)
      .run(l.user_id, l.price);
    // Feed the shared price-history table (per-unit price, like the GE).
    db.prepare('INSERT INTO trades (item, qty, price, created_at) VALUES (?,?,?,?)')
      .run(l.item, l.qty, Math.max(1, Math.round(l.price / l.qty)), Date.now());
    return { listing: db.prepare('SELECT * FROM market_listings WHERE id = ?').get(l.id) as ListingRow };
  });

  app.post('/api/market/buy', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const { id } = req.body ?? {};
    if (!isPosInt(id, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad id' }); return; }
    let out;
    try { out = txBuy(id, user.id); }
    catch (e: any) {
      if (e && e.marketReject) { res.status(e.marketReject.status).json({ error: e.marketReject.error }); return; }
      res.status(500).json({ error: 'purchase failed' }); return;
    }
    if (out.error) { res.status(out.status ?? 400).json({ error: out.error }); return; }
    const l = out.listing!;
    onSavesMutated([user.id]); // buyer's save was rewritten
    searchCache.clear();
    const sellerName = usernameOf(l.user_id);
    if (isOnline(sellerName)) {
      const meta = META[l.item];
      systemMessageTo(sellerName,
        `Your ${meta?.name ?? l.item}${l.qty > 1 ? ` x${fmtCoins(l.qty)}` : ''} sold for ` +
        `${fmtCoins(l.price)} coins — collect on the trade site or at the market clerk.`);
    }
    res.json({ listing: listingJson(l, sellerName) });
  });

  // -------------------------------------------------------------------------
  // CANCEL — item returns to the seller's bank. Fee is not refunded.
  // -------------------------------------------------------------------------

  const txCancel = db.transaction((listingId: number, userId: number):
      { error?: string; status?: number; listing?: ListingRow } => {
    const l = db.prepare('SELECT * FROM market_listings WHERE id = ? AND user_id = ?')
      .get(listingId, userId) as ListingRow | undefined;
    if (!l) return { error: 'listing not found', status: 404 };
    if (l.status !== 'active') return { error: 'listing is not active', status: 409 };
    const save = loadSave(userId);
    if (!save || !Array.isArray(save.bank)) return { error: 'no character save found', status: 400 };
    const addErr = bankAdd(save, l.item, l.qty);
    if (addErr) throw { marketReject: { error: addErr, status: 400 } }; // rollback
    writeSave(userId, save);
    db.prepare("UPDATE market_listings SET status = 'cancelled' WHERE id = ?").run(l.id);
    return { listing: db.prepare('SELECT * FROM market_listings WHERE id = ?').get(l.id) as ListingRow };
  });

  app.post('/api/market/cancel', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const { id } = req.body ?? {};
    if (!isPosInt(id, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad id' }); return; }
    let out;
    try { out = txCancel(id, user.id); }
    catch (e: any) {
      if (e && e.marketReject) { res.status(e.marketReject.status).json({ error: e.marketReject.error }); return; }
      res.status(500).json({ error: 'cancel failed' }); return;
    }
    if (out.error) { res.status(out.status ?? 400).json({ error: out.error }); return; }
    onSavesMutated([user.id]);
    searchCache.clear();
    res.json({ listing: listingJson(out.listing!, user.username) });
  });

  // -------------------------------------------------------------------------
  // COLLECT — move owed coins into the bank (partial if the coin stack caps).
  // -------------------------------------------------------------------------

  const txCollect = db.transaction((userId: number):
      { error?: string; status?: number; collected?: number; remaining?: number } => {
    const row = db.prepare('SELECT coins FROM market_proceeds WHERE user_id = ?')
      .get(userId) as { coins: number } | undefined;
    const owed = row?.coins ?? 0;
    if (owed <= 0) return { collected: 0, remaining: 0 };
    const save = loadSave(userId);
    if (!save || !Array.isArray(save.bank)) return { error: 'no character save found', status: 400 };
    const have = bankCount(save, 'coins');
    const room = Math.max(0, MAX_QTY - have);
    const take = Math.min(owed, room);
    if (take <= 0) return { error: 'your bank coin stack is full', status: 400 };
    const addErr = bankAdd(save, 'coins', take);
    if (addErr) return { error: addErr, status: 400 };
    writeSave(userId, save);
    if (take === owed) db.prepare('DELETE FROM market_proceeds WHERE user_id = ?').run(userId);
    else db.prepare('UPDATE market_proceeds SET coins = coins - ? WHERE user_id = ?').run(take, userId);
    return { collected: take, remaining: owed - take };
  });

  app.post('/api/market/collect', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    let out;
    try { out = txCollect(user.id); }
    catch { res.status(500).json({ error: 'collect failed' }); return; }
    if (out.error) { res.status(out.status ?? 400).json({ error: out.error }); return; }
    if (out.collected! > 0) onSavesMutated([user.id]);
    res.json({ collected: out.collected, remaining: out.remaining });
  });

  // -------------------------------------------------------------------------
  // SEARCH (public, cached 30s)
  // -------------------------------------------------------------------------

  const searchCache = new Map<string, { at: number; body: unknown }>();

  app.get('/api/market/search', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const q = {
      name: typeof req.query.name === 'string' ? req.query.name.slice(0, 48).toLowerCase().trim() : '',
      slot: typeof req.query.slot === 'string' ? req.query.slot.slice(0, 24) : '',
      effect: typeof req.query.effect === 'string' ? req.query.effect.slice(0, 24) : '',
      hasSpec: req.query.hasSpec === '1' || req.query.hasSpec === 'true',
      maxLevelReq: Number.isFinite(Number(req.query.maxLevelReq)) && Number(req.query.maxLevelReq) > 0
        ? Math.floor(Number(req.query.maxLevelReq)) : 0,
      minPrice: Number.isFinite(Number(req.query.minPrice)) && Number(req.query.minPrice) > 0
        ? Math.floor(Number(req.query.minPrice)) : 0,
      maxPrice: Number.isFinite(Number(req.query.maxPrice)) && Number(req.query.maxPrice) > 0
        ? Math.floor(Number(req.query.maxPrice)) : 0,
      sort: req.query.sort === 'age' ? 'age' : 'price',
      page: Number.isInteger(Number(req.query.page)) && Number(req.query.page) >= 1
        ? Number(req.query.page) : 1,
    };
    const key = JSON.stringify(q);
    const hit = searchCache.get(key);
    if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) { res.json(hit.body); return; }

    const rows = db.prepare(
      `SELECT l.*, u.username FROM market_listings l JOIN users u ON u.id = l.user_id
        WHERE l.status = 'active' ORDER BY l.id DESC`
    ).all() as Array<ListingRow & { username: string }>;

    let filtered = rows.filter((l) => {
      const m = META[l.item];
      if (!m) return false;
      if (q.name && !m.nameLower.includes(q.name)) return false;
      if (q.slot && m.slot !== q.slot) return false;
      if (q.effect && !m.effects.includes(q.effect)) return false;
      if (q.hasSpec && !m.spec) return false;
      if (q.maxLevelReq && m.levelReq > q.maxLevelReq) return false;
      if (q.minPrice && l.price < q.minPrice) return false;
      if (q.maxPrice && l.price > q.maxPrice) return false;
      return true;
    });
    if (q.sort === 'price') {
      filtered = filtered.slice().sort((a, b) =>
        Math.ceil(a.price / a.qty) - Math.ceil(b.price / b.qty) || a.id - b.id);
    } // 'age': already newest-first

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(q.page, pages);
    const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const body = {
      total, page, pages, pageSize: PAGE_SIZE,
      listings: slice.map((l) => ({
        ...listingJson(l, l.username),
        sellerOnline: isOnline(l.username),
      })),
    };
    if (searchCache.size > 500) searchCache.clear(); // bound memory
    searchCache.set(key, { at: Date.now(), body });
    res.json(body);
  });

  app.get('/api/market/listing/:id', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const id = Number(req.params.id);
    if (!isPosInt(id, Number.MAX_SAFE_INTEGER)) { res.status(400).json({ error: 'bad id' }); return; }
    const l = db.prepare(
      'SELECT l.*, u.username FROM market_listings l JOIN users u ON u.id = l.user_id WHERE l.id = ?'
    ).get(id) as (ListingRow & { username: string }) | undefined;
    if (!l) { res.status(404).json({ error: 'listing not found' }); return; }
    res.json({ listing: { ...listingJson(l, l.username), sellerOnline: isOnline(l.username) } });
  });

  app.get('/api/market/mine', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const rows = db.prepare(
      'SELECT * FROM market_listings WHERE user_id = ? ORDER BY id DESC LIMIT 50'
    ).all(user.id) as ListingRow[];
    res.json({ listings: rows.map((l) => listingJson(l, user.username)) });
  });

  app.get('/api/market/proceeds', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const row = db.prepare('SELECT coins FROM market_proceeds WHERE user_id = ?')
      .get(user.id) as { coins: number } | undefined;
    res.json({ coins: row?.coins ?? 0 });
  });

  // Item metadata catalogue for the trade site's filter UI (public, static).
  let metaBody: unknown = null;
  app.get('/api/market/items', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (!metaBody) {
      metaBody = {
        items: Object.values(META).map((m) => ({
          id: m.id, name: m.name, slot: m.slot, levelReq: m.levelReq,
          effects: m.effects, spec: m.spec, bonuses: m.bonuses,
          attackSpeed: m.attackSpeed, stackable: m.stackable, value: m.value,
        })),
      };
    }
    res.json(metaBody);
  });
}
