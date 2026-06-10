// Friends list + P2P coinflip (server-authoritative flip, client-trusted coin balances).
import crypto from 'crypto';
import type { Response } from 'express';
import type Database from 'better-sqlite3';

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
}

export function initSocial(deps: SocialDeps) {
  const { db, getClients, usernameRe, isPosInt } = deps;

  db.exec(`
CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
`);

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
  }

  return { registerRoutes, notifyFriendsOnline, listFriends };
}
