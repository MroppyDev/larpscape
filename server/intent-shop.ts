// server/intent-shop.ts — Shops + bank domain (docs/CONVERSION-CONTRACT.md §3).
//
// The built-in spine already exposes `shop`/`bank`/`equip` over HTTP
// (POST /api/intent/{shop,bank,equip}) and `equip` over WS. This module adds the
// WS transport for `shop` and `bank` by self-registering them in the domain
// registry, so the client can drive buy/sell and deposit/withdraw through
// `requestIntent(...)` (the single content entry point) exactly like every other
// owned-state mutation — no HTTP plumbing required on the client.
//
// Security (non-negotiable, per CONVERSION-CONTRACT §security invariant):
//   * the server NEVER trusts a client-supplied quantity/price/coin/item;
//   * every handler INDEPENDENTLY validates (shop stock+price from data/shops.json
//     and data/items.json, authoritative coins/inventory/bank possession) and
//     computes the outcome itself, then mutates ONLY through state.ts primitives
//     inside ONE ctx.store.withState transaction (rev bump + fence + save_reload);
//   * shop buy/sell is WEALTH-SHAPED → gated behind ECONOMY_FROZEN (ctx.frozen),
//     the kill-switch. Bank deposit/withdraw is single-owner value movement (not
//     cross-account), so it is SAFE while frozen but still server-authoritative
//     because the bank is owned state.
//
// The data sources are the SAME files the client reads, so the catalogue can
// never diverge. A forged intent FAILS or grants only the data-defined result.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AuthState, isKnownItem,
  invAdd, invRemoveItem, invCount, getCoins, addCoins, removeCoins,
  bankAdd, bankRemove, bankCount, parseInvSlot,
} from './state';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

interface RawItem { id: string; stackable?: boolean; value?: number; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');
const SHOPS: Record<string, { name: string; stock: { item: string; qty: number }[] }> =
  loadJson('../data/shops.json');

function isStackable(id: string): boolean { return !!ITEMS[id]?.stackable; }
function itemValue(id: string): number { return Math.max(1, Math.ceil(ITEMS[id]?.value ?? 1)); }

// Count empty inventory slots in authoritative state (mirrors intents.ts).
function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
}
function hasRoomFor(state: AuthState, id: string): boolean {
  if (isStackable(id) && invCount(state, id) > 0) return true;
  return freeSlots(state) > 0;
}

function fail(kind: string, error: string): IntentResult { return { ok: false, kind, error }; }

// ---- SHOP (buy / sell) — wealth-shaped: gated by ECONOMY_FROZEN -------------
// Buy: debit carried coins at the catalogue value, grant 1 item (validated
// against the shop's declared stock list). Sell: remove 1 item (or the whole
// stack for stackables) and credit coins at 40% of catalogue value. Quantities,
// prices, stock membership are ALL recomputed server-side; the client's only
// inputs are the shop id, the item id, and the op.
registerIntentDomain('shop', (ctx: DomainCtx, payload): IntentResult => {
  if (ctx.dead) return fail('shop', 'dead');
  if (ctx.frozen) return fail('shop', 'frozen');
  const op = payload.op === 'sell' ? 'sell' : payload.op === 'buy' ? 'buy' : null;
  if (!op) return fail('shop', 'bad op');
  const shopId = String(payload.shop ?? '');
  const itemId = String(payload.item ?? '');
  const def = SHOPS[shopId];
  if (!def) return fail('shop', 'unknown shop');
  if (!isKnownItem(itemId)) return fail('shop', 'unknown item');

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (op === 'buy') {
      const inStock = def.stock.some((s) => s.item === itemId);
      if (!inStock) return fail('shop', 'not stocked');
      const price = itemValue(itemId);
      if (getCoins(state) < price) return fail('shop', 'not enough coins');
      if (!hasRoomFor(state, itemId)) return fail('shop', 'inventory full');
      if (!removeCoins(state, price)) return fail('shop', 'not enough coins');
      invAdd(state, itemId, 1);
      return {
        ok: true, kind: 'shop',
        granted: [{ id: itemId, qty: 1 }],
        removed: [{ id: 'coins', qty: price }],
        coins: getCoins(state),
      };
    }
    // sell — debit the clicked inventory slot when invSlot is supplied.
    if (itemId === 'coins') return fail('shop', 'cannot sell coins');
    const invSlot = parseInvSlot(payload.invSlot);
    const stackable = isStackable(itemId);
    let qty = 1;
    if (invSlot >= 0) {
      const s = state.inventory?.[invSlot];
      if (!s || s.id !== itemId) return fail('shop', 'you have none');
      qty = stackable ? s.qty : 1;
    } else {
      const have = invCount(state, itemId);
      if (have <= 0) return fail('shop', 'you have none');
      qty = stackable ? have : 1;
    }
    // mirror the legacy client: a stackable stack sells for a single unit price.
    const proceeds = Math.max(1, Math.floor(itemValue(itemId) * 0.4));
    const rm = invRemoveItem(state, itemId, qty, invSlot);
    if (!rm.ok) return fail('shop', 'you have none');
    addCoins(state, proceeds);
    return {
      ok: true, kind: 'shop',
      removed: [{ id: itemId, qty: rm.qty, ...(rm.slot !== undefined ? { slot: rm.slot } : {}) }],
      granted: [{ id: 'coins', qty: proceeds }],
      coins: getCoins(state),
    };
  });
  if (!res) return fail('shop', 'no character');
  return stampRev(ctx.store, ctx, res);
});

// ---- BANK (deposit / withdraw) — single-owner value movement ---------------
// Moves owned items between the carried inventory and the bank. Not wealth
// cross-account movement, so it is SAFE while frozen — but the bank is owned
// state, so it MUST be server-authoritative. The qty is clamped server-side to
// what the player actually possesses ('all' resolves against authoritative
// counts); a forged qty can never withdraw items that are not banked.
registerIntentDomain('bank', (ctx: DomainCtx, payload): IntentResult => {
  const op = payload.op === 'withdraw' ? 'withdraw' : payload.op === 'deposit' ? 'deposit' : null;
  if (!op) return fail('bank', 'bad op');
  const itemId = String(payload.item ?? '');
  if (!isKnownItem(itemId)) return fail('bank', 'unknown item');
  const rawQty = payload.qty;
  const qty: number | 'all' = rawQty === 'all'
    ? 'all'
    : Math.max(0, Math.floor(Number(rawQty)));

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (op === 'deposit') {
      const invSlot = parseInvSlot(payload.invSlot);
      let n = 0;
      let fromSlot: number | undefined;
      if (qty === 'all') {
        // Deposit EVERY copy of the item across the whole inventory. A
        // non-stackable item sits one-per-slot, so the clicked slot holds only a
        // single item — 'all' must sweep them all, not just that one slot (this
        // was the "deposit all doesn't work" bug). Sweep with no slot constraint.
        n = invCount(state, itemId);
        fromSlot = undefined;
      } else if (invSlot >= 0) {
        const s = state.inventory?.[invSlot];
        if (!s || s.id !== itemId) return fail('bank', 'nothing to deposit');
        n = Math.min(qty as number, s.qty);
        fromSlot = invSlot;
      } else {
        n = Math.min(qty as number, invCount(state, itemId));
        fromSlot = undefined;
      }
      if (n <= 0) return fail('bank', 'nothing to deposit');
      const rm = invRemoveItem(state, itemId, n, fromSlot);
      if (!rm.ok) return fail('bank', 'nothing to deposit');
      bankAdd(state, itemId, rm.qty);
      return {
        ok: true, kind: 'bank',
        removed: [{ id: itemId, qty: rm.qty, ...(rm.slot !== undefined ? { slot: rm.slot } : {}) }],
      };
    }
    // withdraw
    const have = bankCount(state, itemId);
    const want = qty === 'all' ? have : Math.min(qty as number, have);
    if (want <= 0) return fail('bank', 'nothing to withdraw');
    const stackable = isStackable(itemId);
    let took = 0;
    if (stackable) {
      if (invAdd(state, itemId, want)) took = want;
    } else {
      for (let i = 0; i < want; i++) { if (freeSlots(state) === 0) break; invAdd(state, itemId, 1); took++; }
    }
    if (took <= 0) return fail('bank', 'inventory full');
    bankRemove(state, itemId, took);
    return { ok: true, kind: 'bank', granted: [{ id: itemId, qty: took }] };
  });
  if (!res) return fail('bank', 'no character');
  return stampRev(ctx.store, ctx, res);
});
