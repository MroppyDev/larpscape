// server/intents-wire.ts — transport wiring for the progression intents
// (docs/ECONOMY-AUTHORITY.md §2). Keeps index.ts's footprint tiny: it owns the
// WS dispatch for `{t:'intent'}` messages and registers the HTTP intent routes,
// and installs the authoritative inventory hooks the sim uses for pickup/drop.
//
// Design: the WS path carries high-frequency skilling/gather/process/make
// intents (extends the handleSwing/handlePickup pattern); the HTTP path carries
// the transactional shop/bank/quest intents. Every reply is the same
// `{t:'intent', ...IntentResult}` envelope so the client applies them uniformly.

import type { Request, Response, NextFunction } from 'express';
import type { Express } from 'express';
import { StateStore, invAdd, invRemove } from './state';
import { setInventoryHooks } from './sim';
import { createIntents, Intents, IntentCtx, IntentResult } from './intents';

// Minimal structural view of a connected player (matches sim.PlayerView).
interface ViewLike {
  userId: number;
  x: number;
  y: number;
  dead: boolean;
  send: (msg: unknown) => void;
}

interface AuthedReq extends Request { userId?: number; }
type AuthMw = (req: AuthedReq, res: Response, next: NextFunction) => void;

// Build the intents instance and install the sim's authoritative inventory
// hooks (pickup grants / drop debits run through state.ts withState so they bump
// rev + fence + push, closing G2/G3 and the pickup-dupe vector). Returns the
// intents instance for the WS dispatch + HTTP routes.
export function makeIntents(stateStore: StateStore): Intents {
  const intents = createIntents(stateStore);
  setInventoryHooks(
    (userId, id, qty) => stateStore.withState(userId, (s) => invAdd(s, id, qty)) === true,
    (userId, id, qty) => stateStore.withState(userId, (s) => invRemove(s, id, qty)) === true,
  );
  return intents;
}

const ctxOf = (v: ViewLike): IntentCtx => ({ userId: v.userId, x: v.x, y: v.y, dead: v.dead });

// Dispatch a WS `{t:'intent', kind, ...}` message. Returns true if it was an
// intent (so index.ts's handler can stop), false otherwise. The reply is the
// authoritative IntentResult tagged back onto the same socket.
export function dispatchIntentWs(intents: Intents, view: ViewLike, msg: any): boolean {
  if (!msg || msg.t !== 'intent' || typeof msg.kind !== 'string') return false;
  const ctx = ctxOf(view);
  let res: IntentResult;
  switch (msg.kind) {
    case 'gather':
      res = intents.gather(ctx, String(msg.obj ?? ''), num(msg.x), num(msg.y));
      break;
    case 'fish':
      res = intents.fish(ctx, msg.spot === 'bait' ? 'bait' : 'net', num(msg.x), num(msg.y));
      break;
    case 'cook':
      res = intents.cook(ctx, String(msg.raw ?? ''));
      break;
    case 'firemake':
      res = intents.firemake(ctx, String(msg.log ?? ''));
      break;
    case 'make':
      res = intents.make(ctx, String(msg.recipe ?? ''), String(msg.output ?? ''));
      break;
    default:
      res = { ok: false, kind: msg.kind, error: 'unknown intent' };
  }
  // echo the client's correlation id so it can resolve the optimistic action
  const reqId = typeof msg.id === 'number' ? msg.id : undefined;
  view.send({ t: 'intent', ...res, ...(reqId !== undefined ? { id: reqId } : {}) });
  return true;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : -1;
}

// Register the HTTP intent routes (shop/bank/quest). `requireAuth` is index.ts's
// own middleware (sets req.userId). These are transactional + lower-frequency,
// so HTTP (not WS) is the right transport. They do NOT need a live PlayerView —
// position is irrelevant for shop/bank/quest — so ctx position is passed as the
// sentinel (the handlers that care about range are WS-only).
export function registerIntentRoutes(app: Express, intents: Intents, requireAuth: AuthMw): void {
  const httpCtx = (userId: number): IntentCtx => ({ userId, x: -999, y: -999, dead: false });

  app.post('/api/intent/shop', requireAuth, (req: AuthedReq, res: Response) => {
    const { op, shop, item } = req.body ?? {};
    if (op !== 'buy' && op !== 'sell') { res.status(400).json({ error: 'bad op' }); return; }
    const r = intents.shop(httpCtx(req.userId!), op, String(shop ?? ''), String(item ?? ''));
    res.json(r);
  });

  app.post('/api/intent/bank', requireAuth, (req: AuthedReq, res: Response) => {
    const { op, item, qty } = req.body ?? {};
    if (op !== 'deposit' && op !== 'withdraw') { res.status(400).json({ error: 'bad op' }); return; }
    const q = qty === 'all' ? 'all' : Math.max(0, Math.floor(Number(qty)));
    const r = intents.bank(httpCtx(req.userId!), op, String(item ?? ''), q as number | 'all');
    res.json(r);
  });

  app.post('/api/intent/quest/advance', requireAuth, (req: AuthedReq, res: Response) => {
    const { id, stage } = req.body ?? {};
    const r = intents.questAdvance(httpCtx(req.userId!), String(id ?? ''), Math.max(0, Math.floor(Number(stage))));
    res.json(r);
  });

  // The reward is read from the SERVER registry (data/quest-rewards.json) — the
  // client never specifies the amount, so this body needs only the quest+stage.
  app.post('/api/intent/quest/claim', requireAuth, (req: AuthedReq, res: Response) => {
    const { id, stage } = req.body ?? {};
    const r = intents.questClaim(httpCtx(req.userId!), String(id ?? ''), Math.max(0, Math.floor(Number(stage))));
    res.json(r);
  });
}
