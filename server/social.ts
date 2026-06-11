// Friends list + P2P coinflip (server-authoritative flip, client-trusted coin balances)
// + face-to-face player trading (two-phase accept, atomic save swap)
// + guilds (roster, ranks, guild chat tags, shared vault).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Response } from 'express';
import type Database from 'better-sqlite3';
import { ECONOMY_FROZEN, FREEZE_MSG } from './econ-freeze';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Item defs (stackable flags) — needed to mutate character saves server-side.
const ITEMS: Record<string, { id: string; stackable?: boolean }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/items.json'), 'utf8'),
);

const ITEM_RE = /^[a-z][a-z0-9_]{0,47}$/;
const MAX_QTY = 2_000_000_000;
const GUILD_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 ']{2,23}$/;
const GUILD_TAG_RE = /^[A-Za-z0-9]{3,5}$/;
const GUILD_COST = 5000;

// ---------------------------------------------------------------------------
// Character-save inventory helpers (operate on the parsed save JSON)
// ---------------------------------------------------------------------------

interface ItemStack { id: string; qty: number }
type Inv = (ItemStack | null)[];

function invOf(save: any): Inv {
  if (!Array.isArray(save?.inventory)) throw new Error('bad save');
  return save.inventory as Inv;
}

function countInSave(save: any, id: string): number {
  let n = 0;
  for (const s of invOf(save)) if (s && s.id === id) n += s.qty;
  return n;
}

function removeFromSave(save: any, id: string, qty: number): boolean {
  const inv = invOf(save);
  if (countInSave(save, id) < qty) return false;
  let left = qty;
  for (let i = 0; i < inv.length && left > 0; i++) {
    const s = inv[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take; left -= take;
    if (s.qty <= 0) inv[i] = null;
  }
  return left === 0;
}

function addToSave(save: any, id: string, qty: number): boolean {
  const inv = invOf(save);
  const def = ITEMS[id];
  if (!def) return false;
  if (def.stackable) {
    const slot = inv.find((s) => s && s.id === id);
    if (slot) { slot.qty += qty; return true; }
    const i = inv.indexOf(null);
    if (i < 0) return false;
    inv[i] = { id, qty };
    return true;
  }
  for (let n = 0; n < qty; n++) {
    const i = inv.indexOf(null);
    if (i < 0) return false;
    inv[i] = { id, qty: 1 };
  }
  return true;
}

export interface SocialClient {
  userId: number;
  name: string;
  send: (msg: unknown) => void;
}

export interface SocialDeps {
  db: Database.Database;
  getClients: () => SocialClient[];
  usernameRe: RegExp;
  isPosInt: (n: unknown, max: number) => n is number;
  // Called after a trade mutates character saves server-side, so the
  // connection layer can fence client PUT /api/character writes that are
  // already in flight with pre-trade inventory (anti-dupe).
  onSavesMutated?: (userIds: number[]) => void;
}

export function initSocial(deps: SocialDeps) {
  const { db, getClients, usernameRe, isPosInt, onSavesMutated } = deps;

  db.exec(`
CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
  leader INTEGER NOT NULL REFERENCES users(id),
  member_deposit_only INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS guild_members (
  guild_id INTEGER NOT NULL REFERENCES guilds(id),
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  rank TEXT NOT NULL CHECK (rank IN ('leader','officer','member')),
  joined_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members (guild_id);
CREATE TABLE IF NOT EXISTS guild_vault (
  guild_id INTEGER NOT NULL REFERENCES guilds(id),
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  PRIMARY KEY (guild_id, item)
);
`);

  // ---- character save access (same storage the GE trusts) ----
  function loadSaveRow(userId: number): any | null {
    const row = db.prepare('SELECT save FROM characters WHERE user_id = ?')
      .get(userId) as { save: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.save); } catch { return null; }
  }
  function writeSaveRow(userId: number, save: any) {
    db.prepare(`INSERT INTO characters (user_id, save, updated_at) VALUES (?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET save = excluded.save, updated_at = excluded.updated_at`)
      .run(userId, JSON.stringify(save), Date.now());
  }

  interface CfOffer {
    id: string;
    fromId: number;
    fromName: string;
    toId: number;
    toName: string;
    amount: number;
    createdAt: number;
  }
  const cfOffers = new Map<string, CfOffer>();

  function userIdForName(name: string): number | null {
    const row = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
      .get(name) as { id: number } | undefined;
    return row?.id ?? null;
  }

  function clientForUser(userId: number): SocialClient | null {
    for (const c of getClients()) if (c.userId === userId) return c;
    return null;
  }

  function onlineUserIds(): Set<number> {
    const s = new Set<number>();
    for (const c of getClients()) s.add(c.userId);
    return s;
  }

  function listFriends(userId: number) {
    const online = onlineUserIds();
    const rows = db.prepare(
      `SELECT u.username, f.friend_id, f.created_at
         FROM friends f JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ?
        ORDER BY u.username COLLATE NOCASE`
    ).all(userId) as { username: string; friend_id: number; created_at: number }[];
    return rows.map((r) => ({
      username: r.username,
      online: online.has(r.friend_id),
      addedAt: r.created_at,
    }));
  }

  function notifyFriendsOnline(userId: number, username: string, online: boolean) {
    const friendRows = db.prepare('SELECT friend_id FROM friends WHERE user_id = ?').all(userId) as { friend_id: number }[];
    const payload = { t: 'friend_status', username, online };
    for (const f of friendRows) {
      const c = clientForUser(f.friend_id);
      if (c) c.send(payload);
    }
  }

  // -------------------------------------------------------------------------
  // Player trading (face-to-face). Two-phase accept; the swap itself runs in
  // one SQLite transaction against both character saves, revalidating that
  // each side actually holds what it offered at execution time.
  // -------------------------------------------------------------------------

  interface TradeOffer { items: ItemStack[]; coins: number }
  interface TradeSide extends TradeOffer { userId: number; name: string; accepted: boolean }
  interface TradeSession { a: TradeSide; b: TradeSide; screen: 1 | 2 }
  interface TradeReq { id: string; fromId: number; fromName: string; toId: number; createdAt: number }

  const tradeReqs = new Map<string, TradeReq>();
  const trades = new Map<number, TradeSession>(); // keyed by BOTH userIds

  function sendTo(userId: number, msg: unknown) { clientForUser(userId)?.send(msg); }

  function sideOf(s: TradeSession, userId: number): TradeSide { return s.a.userId === userId ? s.a : s.b; }
  function otherOf(s: TradeSession, userId: number): TradeSide { return s.a.userId === userId ? s.b : s.a; }

  function sendTradeState(s: TradeSession) {
    for (const [me, them] of [[s.a, s.b], [s.b, s.a]] as const) {
      sendTo(me.userId, {
        t: 'trade_state',
        screen: s.screen,
        you: { items: me.items, coins: me.coins, accepted: me.accepted },
        them: { items: them.items, coins: them.coins, accepted: them.accepted, name: them.name },
      });
    }
  }

  function cancelTrade(s: TradeSession, reason: string) {
    trades.delete(s.a.userId);
    trades.delete(s.b.userId);
    const payload = { t: 'trade_cancelled', reason };
    sendTo(s.a.userId, payload);
    sendTo(s.b.userId, payload);
  }

  // Sanitize a client-sent offer; null on malformed input.
  function parseOffer(msg: any): TradeOffer | null {
    const coins = msg?.coins ?? 0;
    if (typeof coins !== 'number' || !Number.isInteger(coins) || coins < 0 || coins > MAX_QTY) return null;
    const raw = Array.isArray(msg?.items) ? msg.items : [];
    if (raw.length > 28) return null;
    const merged = new Map<string, number>();
    for (const it of raw) {
      if (!it || typeof it.id !== 'string' || !ITEM_RE.test(it.id) || !ITEMS[it.id]) return null;
      if (it.id === 'coins') return null; // coins travel via the coins field
      if (!isPosInt(it.qty, MAX_QTY)) return null;
      const total = (merged.get(it.id) ?? 0) + it.qty;
      if (total > MAX_QTY) return null; // merged stacks must respect the qty cap too
      merged.set(it.id, total);
    }
    return { items: [...merged].map(([id, qty]) => ({ id, qty })), coins };
  }

  // Atomic swap: validate both sides hold their offers, then exchange.
  const execTrade = db.transaction((s: TradeSession): string | null => {
    const saveA = loadSaveRow(s.a.userId);
    const saveB = loadSaveRow(s.b.userId);
    if (!saveA || !saveB) return 'missing character save';
    const sides: [TradeSide, any, any][] = [[s.a, saveA, saveB], [s.b, saveB, saveA]];
    // 1) remove every offered item/coin from its owner (validates possession)
    for (const [side, own] of sides) {
      for (const it of side.items) {
        if (!removeFromSave(own, it.id, it.qty)) return `${side.name} no longer has the offered items`;
      }
      if (side.coins > 0 && !removeFromSave(own, 'coins', side.coins)) {
        return `${side.name} no longer has the offered coins`;
      }
    }
    // 2) deliver to the opposite side (validates space)
    for (const [side, , other] of sides) {
      for (const it of side.items) {
        if (!addToSave(other, it.id, it.qty)) return 'not enough inventory space';
      }
      if (side.coins > 0 && !addToSave(other, 'coins', side.coins)) return 'not enough inventory space';
    }
    writeSaveRow(s.a.userId, saveA);
    writeSaveRow(s.b.userId, saveB);
    return null;
  });

  function finishTrade(s: TradeSession) {
    trades.delete(s.a.userId);
    trades.delete(s.b.userId);
    // EMERGENCY: P2P trade validates possession against the client-forgeable
    // save. Frozen until inventory is server-owned. (server/econ-freeze.ts)
    if (ECONOMY_FROZEN) {
      const payload = { t: 'trade_cancelled', reason: FREEZE_MSG };
      sendTo(s.a.userId, payload);
      sendTo(s.b.userId, payload);
      return;
    }
    let err: string | null;
    try { err = execTrade(s); } catch { err = 'trade failed'; }
    if (!err) onSavesMutated?.([s.a.userId, s.b.userId]);
    if (err) {
      const payload = { t: 'trade_cancelled', reason: err };
      sendTo(s.a.userId, payload);
      sendTo(s.b.userId, payload);
      return;
    }
    for (const [me, them] of [[s.a, s.b], [s.b, s.a]] as const) {
      sendTo(me.userId, {
        t: 'trade_complete',
        lose: { items: me.items, coins: me.coins },
        gain: { items: them.items, coins: them.coins },
        with: them.name,
      });
    }
  }

  // Handle a trade_* websocket message. Returns true when consumed.
  function handleTradeWs(client: SocialClient, msg: any): boolean {
    const t = msg?.t;
    if (t === 'trade_req') {
      if (trades.has(client.userId)) return true;
      const toName = typeof msg.to === 'string' ? msg.to.trim() : '';
      if (!usernameRe.test(toName) || toName.toLowerCase() === client.name.toLowerCase()) return true;
      const toId = userIdForName(toName);
      const target = toId ? clientForUser(toId) : null;
      if (!toId || !target) { client.send({ t: 'system', text: 'That player is not online.' }); return true; }
      if (trades.has(toId)) { client.send({ t: 'system', text: 'They are already trading.' }); return true; }
      const id = crypto.randomBytes(8).toString('hex');
      tradeReqs.set(id, { id, fromId: client.userId, fromName: client.name, toId, createdAt: Date.now() });
      setTimeout(() => tradeReqs.delete(id), 60_000);
      target.send({ t: 'trade_req', id, from: client.name });
      client.send({ t: 'system', text: 'Sending trade offer...' });
      return true;
    }
    if (t === 'trade_req_accept' || t === 'trade_req_decline') {
      const req = typeof msg.id === 'string' ? tradeReqs.get(msg.id) : undefined;
      if (!req || req.toId !== client.userId) return true;
      tradeReqs.delete(req.id);
      if (t === 'trade_req_decline') {
        sendTo(req.fromId, { t: 'trade_req_declined', from: client.name });
        return true;
      }
      const challenger = clientForUser(req.fromId);
      if (!challenger) { client.send({ t: 'system', text: 'They are no longer online.' }); return true; }
      if (trades.has(req.fromId) || trades.has(client.userId)) return true;
      const session: TradeSession = {
        a: { userId: req.fromId, name: req.fromName, items: [], coins: 0, accepted: false },
        b: { userId: client.userId, name: client.name, items: [], coins: 0, accepted: false },
        screen: 1,
      };
      trades.set(req.fromId, session);
      trades.set(client.userId, session);
      challenger.send({ t: 'trade_open', with: client.name });
      client.send({ t: 'trade_open', with: req.fromName });
      sendTradeState(session);
      return true;
    }
    const session = trades.get(client.userId);
    if (t === 'trade_set') {
      if (!session || session.screen !== 1) return true;
      const offer = parseOffer(msg);
      if (!offer) return true;
      const me = sideOf(session, client.userId);
      me.items = offer.items;
      me.coins = offer.coins;
      // any modification un-accepts BOTH sides (anti-scam)
      session.a.accepted = false;
      session.b.accepted = false;
      sendTradeState(session);
      return true;
    }
    if (t === 'trade_accept') {
      if (!session) return true;
      sideOf(session, client.userId).accepted = true;
      if (session.a.accepted && session.b.accepted) {
        if (session.screen === 1) {
          session.screen = 2;
          session.a.accepted = false;
          session.b.accepted = false;
          sendTradeState(session);
        } else {
          finishTrade(session);
        }
      } else {
        sendTradeState(session);
      }
      return true;
    }
    if (t === 'trade_decline') {
      if (session) cancelTrade(session, `${client.name} declined the trade.`);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Guilds
  // -------------------------------------------------------------------------

  interface GuildRow {
    id: number; name: string; tag: string; leader: number;
    member_deposit_only: number; created_at: number;
  }
  interface MemberRow { guild_id: number; user_id: number; rank: 'leader' | 'officer' | 'member'; joined_at: number }

  interface GuildInvite { id: string; guildId: number; fromName: string; toId: number; createdAt: number }
  const guildInvites = new Map<string, GuildInvite>();

  // userId -> tag (or null) cache for hot paths (presence snapshot, chat)
  const tagCache = new Map<number, string | null>();
  function invalidateTag(userId: number) { tagCache.delete(userId); }

  function membershipOf(userId: number): (MemberRow & GuildRow) | null {
    const row = db.prepare(
      `SELECT m.guild_id, m.user_id, m.rank, m.joined_at,
              g.id, g.name, g.tag, g.leader, g.member_deposit_only, g.created_at
         FROM guild_members m JOIN guilds g ON g.id = m.guild_id
        WHERE m.user_id = ?`
    ).get(userId) as (MemberRow & GuildRow) | undefined;
    return row ?? null;
  }

  function getGuildTag(userId: number): string | null {
    if (tagCache.has(userId)) return tagCache.get(userId)!;
    const tag = membershipOf(userId)?.tag ?? null;
    tagCache.set(userId, tag);
    return tag;
  }

  function guildMemberIds(guildId: number): number[] {
    return (db.prepare('SELECT user_id FROM guild_members WHERE guild_id = ?')
      .all(guildId) as { user_id: number }[]).map((r) => r.user_id);
  }

  function notifyGuild(guildId: number, msg: unknown) {
    const ids = new Set(guildMemberIds(guildId));
    for (const c of getClients()) if (ids.has(c.userId)) c.send(msg);
  }

  function guildJson(userId: number) {
    const m = membershipOf(userId);
    if (!m) return null;
    const online = onlineUserIds();
    const roster = (db.prepare(
      `SELECT u.id, u.username, gm.rank, gm.joined_at
         FROM guild_members gm JOIN users u ON u.id = gm.user_id
        WHERE gm.guild_id = ?
        ORDER BY CASE gm.rank WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,
                 u.username COLLATE NOCASE`
    ).all(m.guild_id) as { id: number; username: string; rank: string; joined_at: number }[])
      .map((r) => ({ username: r.username, rank: r.rank, online: online.has(r.id), joinedAt: r.joined_at }));
    return {
      id: m.guild_id, name: m.name, tag: m.tag, rank: m.rank,
      memberDepositOnly: !!m.member_deposit_only,
      roster,
    };
  }

  // Route a '/g ' chat line to online guildmates. Returns true when handled.
  function guildChat(client: SocialClient, text: string): boolean {
    const m = membershipOf(client.userId);
    if (!m) { client.send({ t: 'system', text: 'You are not in a guild.' }); return true; }
    notifyGuild(m.guild_id, { t: 'gchat', from: client.name, tag: m.tag, text });
    return true;
  }

  function onDisconnect(userId: number) {
    const s = trades.get(userId);
    if (s) cancelTrade(s, `${sideOf(s, userId).name} has gone offline.`);
  }

  function registerRoutes(app: import('express').Express, requireAuth: any) {
    app.get('/api/friends', requireAuth, (req: any, res: Response) => {
      res.json({ friends: listFriends(req.userId!) });
    });

    app.post('/api/friends/add', requireAuth, (req: any, res: Response) => {
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      if (!usernameRe.test(username)) { res.status(400).json({ error: 'invalid username' }); return; }
      if (username.toLowerCase() === req.username!.toLowerCase()) {
        res.status(400).json({ error: 'cannot add yourself' }); return;
      }
      const friendId = userIdForName(username);
      if (!friendId) { res.status(404).json({ error: 'user not found' }); return; }
      db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?,?,?)')
        .run(req.userId, friendId, Date.now());
      db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?,?,?)')
        .run(friendId, req.userId, Date.now());
      res.json({ ok: true, friends: listFriends(req.userId!) });
    });

    app.delete('/api/friends/:username', requireAuth, (req: any, res: Response) => {
      const username = String(req.params.username ?? '').slice(0, 12);
      const friendId = userIdForName(username);
      if (!friendId) { res.status(404).json({ error: 'user not found' }); return; }
      db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(req.userId, friendId);
      db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(friendId, req.userId);
      res.json({ ok: true, friends: listFriends(req.userId!) });
    });

    app.post('/api/coinflip/offer', requireAuth, (req: any, res: Response) => {
      const to = typeof req.body?.to === 'string' ? req.body.to.trim() : '';
      const amount = req.body?.amount;
      if (!usernameRe.test(to)) { res.status(400).json({ error: 'invalid target' }); return; }
      if (!isPosInt(amount, 10_000_000)) { res.status(400).json({ error: 'invalid amount' }); return; }
      if (to.toLowerCase() === req.username!.toLowerCase()) {
        res.status(400).json({ error: 'cannot challenge yourself' }); return;
      }
      const toId = userIdForName(to);
      if (!toId) { res.status(404).json({ error: 'player not found' }); return; }
      const target = clientForUser(toId);
      if (!target) { res.status(400).json({ error: 'player is offline' }); return; }
      const id = crypto.randomBytes(8).toString('hex');
      const offer: CfOffer = {
        id, fromId: req.userId!, fromName: req.username!, toId, toName: to, amount, createdAt: Date.now(),
      };
      cfOffers.set(id, offer);
      target.send({ t: 'cf_offer', id, from: req.username, amount });
      setTimeout(() => cfOffers.delete(id), 60_000);
      res.json({ ok: true, id });
    });

    app.post('/api/coinflip/accept', requireAuth, (req: any, res: Response) => {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      const offer = cfOffers.get(id);
      if (!offer || offer.toId !== req.userId) { res.status(404).json({ error: 'offer not found' }); return; }
      cfOffers.delete(id);
      const challenger = clientForUser(offer.fromId);
      if (!challenger) { res.status(400).json({ error: 'challenger went offline' }); return; }
      const flip: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';
      const winnerId = Math.random() < 0.5 ? offer.fromId : offer.toId;
      const loserId = winnerId === offer.fromId ? offer.toId : offer.fromId;
      const winnerName = winnerId === offer.fromId ? offer.fromName : offer.toName;
      const loserName = loserId === offer.fromId ? offer.fromName : offer.toName;
      const result = { t: 'cf_result', winner: winnerName, loser: loserName, amount: offer.amount, flip };
      challenger.send(result);
      const acceptor = clientForUser(offer.toId);
      if (acceptor) acceptor.send(result);
      res.json({ ok: true, ...result });
    });

    app.post('/api/coinflip/decline', requireAuth, (req: any, res: Response) => {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      const offer = cfOffers.get(id);
      if (!offer || offer.toId !== req.userId) { res.status(404).json({ error: 'offer not found' }); return; }
      cfOffers.delete(id);
      const challenger = clientForUser(offer.fromId);
      if (challenger) challenger.send({ t: 'cf_declined', from: req.username });
      res.json({ ok: true });
    });

    // ---------------- Guilds ----------------

    // Creation costs 5000 coins — same client-trusted escrow model as the GE:
    // the client removes the coins from its inventory before calling this.
    app.post('/api/guild/create', requireAuth, (req: any, res: Response) => {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const tag = typeof req.body?.tag === 'string' ? req.body.tag.trim().toUpperCase() : '';
      if (!GUILD_NAME_RE.test(name)) { res.status(400).json({ error: 'guild name must be 3-24 letters/numbers/spaces' }); return; }
      if (!GUILD_TAG_RE.test(tag)) { res.status(400).json({ error: 'tag must be 3-5 letters/numbers' }); return; }
      if (membershipOf(req.userId)) { res.status(400).json({ error: 'you are already in a guild' }); return; }
      if (db.prepare('SELECT 1 FROM guilds WHERE name = ?').get(name)) { res.status(409).json({ error: 'guild name taken' }); return; }
      if (db.prepare('SELECT 1 FROM guilds WHERE tag = ?').get(tag)) { res.status(409).json({ error: 'tag taken' }); return; }
      const create = db.transaction(() => {
        const info = db.prepare('INSERT INTO guilds (name, tag, leader, created_at) VALUES (?,?,?,?)')
          .run(name, tag, req.userId, Date.now());
        db.prepare('INSERT INTO guild_members (guild_id, user_id, rank, joined_at) VALUES (?,?,?,?)')
          .run(Number(info.lastInsertRowid), req.userId, 'leader', Date.now());
      });
      create();
      invalidateTag(req.userId);
      res.json({ ok: true, guild: guildJson(req.userId) });
    });

    app.get('/api/guild', requireAuth, (req: any, res: Response) => {
      res.json({ guild: guildJson(req.userId) });
    });

    app.post('/api/guild/invite', requireAuth, (req: any, res: Response) => {
      const m = membershipOf(req.userId);
      if (!m) { res.status(400).json({ error: 'you are not in a guild' }); return; }
      if (m.rank === 'member') { res.status(403).json({ error: 'only officers can invite' }); return; }
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      if (!usernameRe.test(username)) { res.status(400).json({ error: 'invalid username' }); return; }
      const toId = userIdForName(username);
      if (!toId) { res.status(404).json({ error: 'player not found' }); return; }
      if (membershipOf(toId)) { res.status(400).json({ error: 'they are already in a guild' }); return; }
      const target = clientForUser(toId);
      if (!target) { res.status(400).json({ error: 'player is offline' }); return; }
      const id = crypto.randomBytes(8).toString('hex');
      guildInvites.set(id, { id, guildId: m.guild_id, fromName: req.username, toId, createdAt: Date.now() });
      setTimeout(() => guildInvites.delete(id), 120_000);
      target.send({ t: 'guild_invite', id, from: req.username, guild: m.name, tag: m.tag });
      res.json({ ok: true });
    });

    app.post('/api/guild/invite/accept', requireAuth, (req: any, res: Response) => {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      const inv = guildInvites.get(id);
      if (!inv || inv.toId !== req.userId) { res.status(404).json({ error: 'invite expired' }); return; }
      guildInvites.delete(id);
      if (membershipOf(req.userId)) { res.status(400).json({ error: 'you are already in a guild' }); return; }
      const g = db.prepare('SELECT * FROM guilds WHERE id = ?').get(inv.guildId) as GuildRow | undefined;
      if (!g) { res.status(404).json({ error: 'guild no longer exists' }); return; }
      db.prepare('INSERT INTO guild_members (guild_id, user_id, rank, joined_at) VALUES (?,?,?,?)')
        .run(g.id, req.userId, 'member', Date.now());
      invalidateTag(req.userId);
      notifyGuild(g.id, { t: 'guild_update', text: `${req.username} has joined the guild.` });
      res.json({ ok: true, guild: guildJson(req.userId) });
    });

    app.post('/api/guild/invite/decline', requireAuth, (req: any, res: Response) => {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      const inv = guildInvites.get(id);
      if (inv && inv.toId === req.userId) guildInvites.delete(id);
      res.json({ ok: true });
    });

    app.post('/api/guild/leave', requireAuth, (req: any, res: Response) => {
      const m = membershipOf(req.userId);
      if (!m) { res.status(400).json({ error: 'you are not in a guild' }); return; }
      const memberCount = guildMemberIds(m.guild_id).length;
      if (m.rank === 'leader' && memberCount > 1) {
        res.status(400).json({ error: 'promote a new leader before leaving' }); return;
      }
      const leave = db.transaction(() => {
        db.prepare('DELETE FROM guild_members WHERE user_id = ?').run(req.userId);
        if (memberCount === 1) {
          db.prepare('DELETE FROM guild_vault WHERE guild_id = ?').run(m.guild_id);
          db.prepare('DELETE FROM guilds WHERE id = ?').run(m.guild_id);
        }
      });
      leave();
      invalidateTag(req.userId);
      if (memberCount > 1) notifyGuild(m.guild_id, { t: 'guild_update', text: `${req.username} has left the guild.` });
      res.json({ ok: true, disbanded: memberCount === 1 });
    });

    app.post('/api/guild/kick', requireAuth, (req: any, res: Response) => {
      const m = membershipOf(req.userId);
      if (!m) { res.status(400).json({ error: 'you are not in a guild' }); return; }
      if (m.rank === 'member') { res.status(403).json({ error: 'only officers can kick' }); return; }
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      const targetId = userIdForName(username);
      const tm = targetId ? membershipOf(targetId) : null;
      if (!targetId || !tm || tm.guild_id !== m.guild_id) { res.status(404).json({ error: 'they are not in your guild' }); return; }
      if (targetId === req.userId) { res.status(400).json({ error: 'use Leave instead' }); return; }
      if (tm.rank === 'leader' || (tm.rank === 'officer' && m.rank !== 'leader')) {
        res.status(403).json({ error: 'you cannot kick that rank' }); return;
      }
      db.prepare('DELETE FROM guild_members WHERE user_id = ?').run(targetId);
      invalidateTag(targetId);
      clientForUser(targetId)?.send({ t: 'guild_kicked', guild: m.name });
      notifyGuild(m.guild_id, { t: 'guild_update', text: `${username} was removed from the guild.` });
      res.json({ ok: true });
    });

    app.post('/api/guild/promote', requireAuth, (req: any, res: Response) => {
      const m = membershipOf(req.userId);
      if (!m || m.rank !== 'leader') { res.status(403).json({ error: 'only the leader can change ranks' }); return; }
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      const rank = req.body?.rank;
      if (rank !== 'officer' && rank !== 'member' && rank !== 'leader') { res.status(400).json({ error: 'bad rank' }); return; }
      const targetId = userIdForName(username);
      const tm = targetId ? membershipOf(targetId) : null;
      if (!targetId || !tm || tm.guild_id !== m.guild_id) { res.status(404).json({ error: 'they are not in your guild' }); return; }
      if (targetId === req.userId) { res.status(400).json({ error: 'you cannot change your own rank' }); return; }
      const apply = db.transaction(() => {
        if (rank === 'leader') {
          // leadership transfer: old leader steps down to officer
          db.prepare('UPDATE guild_members SET rank = ? WHERE user_id = ?').run('officer', req.userId);
          db.prepare('UPDATE guilds SET leader = ? WHERE id = ?').run(targetId, m.guild_id);
        }
        db.prepare('UPDATE guild_members SET rank = ? WHERE user_id = ?').run(rank, targetId);
      });
      apply();
      notifyGuild(m.guild_id, { t: 'guild_update', text: `${username} is now ${rank === 'leader' ? 'the guild leader' : `a ${rank}`}.` });
      res.json({ ok: true, guild: guildJson(req.userId) });
    });

    app.post('/api/guild/settings', requireAuth, (req: any, res: Response) => {
      const m = membershipOf(req.userId);
      if (!m || m.rank !== 'leader') { res.status(403).json({ error: 'only the leader can change settings' }); return; }
      const v = req.body?.memberDepositOnly;
      if (typeof v !== 'boolean') { res.status(400).json({ error: 'bad value' }); return; }
      db.prepare('UPDATE guilds SET member_deposit_only = ? WHERE id = ?').run(v ? 1 : 0, m.guild_id);
      res.json({ ok: true });
    });

    // ---------------- Guild vault ----------------
    // Server-atomic deposits/withdrawals. Membership revalidated on every op;
    // withdraw quantities are clamped to what the vault actually holds.

    app.get('/api/guild/vault', requireAuth, (req: any, res: Response) => {
      const m = membershipOf(req.userId);
      if (!m) { res.status(403).json({ error: 'you are not in a guild' }); return; }
      const items = db.prepare('SELECT item, qty FROM guild_vault WHERE guild_id = ? ORDER BY item')
        .all(m.guild_id) as { item: string; qty: number }[];
      const canWithdraw = m.rank !== 'member' || !m.member_deposit_only;
      res.json({ items, canWithdraw, memberDepositOnly: !!m.member_deposit_only, rank: m.rank });
    });

    // Deposit: client removed the items from its inventory first (GE trust model).
    app.post('/api/guild/vault/deposit', requireAuth, (req: any, res: Response) => {
      const m = membershipOf(req.userId);
      if (!m) { res.status(403).json({ error: 'you are not in a guild' }); return; }
      const item = typeof req.body?.item === 'string' ? req.body.item : '';
      const qty = req.body?.qty;
      if (!ITEM_RE.test(item) || !ITEMS[item]) { res.status(400).json({ error: 'invalid item' }); return; }
      if (!isPosInt(qty, MAX_QTY)) { res.status(400).json({ error: 'invalid qty' }); return; }
      let overflow = false;
      const deposit = db.transaction(() => {
        const cur = (db.prepare('SELECT qty FROM guild_vault WHERE guild_id = ? AND item = ?')
          .get(m.guild_id, item) as { qty: number } | undefined)?.qty ?? 0;
        if (cur + qty > MAX_QTY) { overflow = true; return; } // stack cap: keep qty a safe integer
        db.prepare(`INSERT INTO guild_vault (guild_id, item, qty) VALUES (?,?,?)
                    ON CONFLICT(guild_id, item) DO UPDATE SET qty = qty + excluded.qty`)
          .run(m.guild_id, item, qty);
      });
      deposit();
      if (overflow) { res.status(400).json({ error: 'the vault cannot hold that many' }); return; }
      notifyGuild(m.guild_id, { t: 'guild_vault_change' });
      res.json({ ok: true });
    });

    app.post('/api/guild/vault/withdraw', requireAuth, (req: any, res: Response) => {
      const m = membershipOf(req.userId);
      if (!m) { res.status(403).json({ error: 'you are not in a guild' }); return; }
      if (m.rank === 'member' && m.member_deposit_only) {
        res.status(403).json({ error: 'members of this guild may only deposit' }); return;
      }
      const item = typeof req.body?.item === 'string' ? req.body.item : '';
      const qty = req.body?.qty;
      if (!ITEM_RE.test(item)) { res.status(400).json({ error: 'invalid item' }); return; }
      if (!isPosInt(qty, MAX_QTY)) { res.status(400).json({ error: 'invalid qty' }); return; }
      let granted = 0;
      const withdraw = db.transaction(() => {
        const row = db.prepare('SELECT qty FROM guild_vault WHERE guild_id = ? AND item = ?')
          .get(m.guild_id, item) as { qty: number } | undefined;
        if (!row || row.qty <= 0) return;
        granted = Math.min(qty, row.qty); // never trust the client: clamp to stock
        if (granted === row.qty) {
          db.prepare('DELETE FROM guild_vault WHERE guild_id = ? AND item = ?').run(m.guild_id, item);
        } else {
          db.prepare('UPDATE guild_vault SET qty = qty - ? WHERE guild_id = ? AND item = ?')
            .run(granted, m.guild_id, item);
        }
      });
      withdraw();
      if (granted > 0) notifyGuild(m.guild_id, { t: 'guild_vault_change' });
      res.json({ ok: true, granted, item });
    });
  }

  return {
    registerRoutes, notifyFriendsOnline, listFriends,
    handleTradeWs, onDisconnect, getGuildTag, guildChat,
  };
}
