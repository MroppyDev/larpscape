// server/intent-forestry.ts — Resin Hollow forestry domain, server-authoritative
// (docs/CONVERSION-CONTRACT.md §3 registry). Owns the Emberyard mechanics for
// the woodcutting-firemaking expansion and self-registers at import time — it
// does NOT edit intents.ts or intents-wire.ts (the wire default case dispatches
// registered domains).
//
// Registered kinds:
//   - 'bonfire'      — burn one log on the shared Emberyard bonfire object.
//                      Firemaking xp * 1.25 (the bonfire bonus) + 1 chorale_token
//                      per burn; chordwood logs have a 1/8 chance of a second
//                      token. Validated by nearObject(x,y,'bonfire') against the
//                      baked map index — the bonfire is a permanent map object.
//   - 'quench'       — bank 2 logs (one named tier) into 1 charcoal at the
//                      Emberyard charcoal_pit, for a small fixed Firemaking xp.
//   - 'forestry-buy' — Cinder-Warden Ysolde's reward shop. chorale_token is the
//                      currency (the coin shop() can't price in tokens); the
//                      cost table is server-owned, the client only names an id.
//
// Every handler validates INDEPENDENTLY against authoritative `state` (level vs
// server xp, logs/tokens vs server inventory, station@tile vs the baked map
// index), rolls randomness server-side, and mutates only via state.ts
// primitives inside ONE withState transaction. The client never authors values.
//
// Imported once for side effect by server/index.ts (`import './intent-forestry';`).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { MAP_W } from './world';
import {
  AuthState, SkillName, invAdd, invRemove, invHas, invCount, addXp, skillLevel,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

// Static world-object position index (same pattern as intent-produce.ts) so the
// bonfire/charcoal_pit intents can be validated against the baked map — you
// cannot feed a bonfire that does not exist.
interface MapJson { objects: { type: string; x: number; y: number }[]; }
const MAP = loadJson<MapJson>('../data/map.json');
const objTypeAt = new Map<number, Set<string>>();
for (const o of MAP.objects) {
  const k = o.y * MAP_W + o.x;
  let s = objTypeAt.get(k);
  if (!s) { s = new Set(); objTypeAt.set(k, s); }
  s.add(o.type);
}
function objectTypeAt(x: number, y: number, type: string): boolean {
  return objTypeAt.get(y * MAP_W + x)?.has(type) ?? false;
}
function nearObject(cx: number, cy: number, type: string, maxDist = 2): boolean {
  for (let dx = -maxDist; dx <= maxDist; dx++) {
    for (let dy = -maxDist; dy <= maxDist; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= maxDist && objectTypeAt(cx + dx, cy + dy, type)) {
        return true;
      }
    }
  }
  return false;
}

function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
}

const fail = (kind: string, error: string): IntentResult => ({ ok: false, kind, error });

function tx(ctx: DomainCtx, kind: string, fn: (state: AuthState) => IntentResult): IntentResult {
  const res = ctx.store.withState<IntentResult>(ctx.userId, fn);
  if (!res) return fail(kind, 'no character');
  return stampRev(ctx.store, ctx, res);
}

// ---------------------------------------------------------------------------
// Burn table — the full log ladder. MUST stay 1:1 with the FIREMAKING arrays
// in server/intents.ts and src/content.ts (xp here is the BASE personal-fire
// xp; the bonfire handler applies the 1.25x bonus).
// ---------------------------------------------------------------------------
const BURNS: Record<string, { level: number; xp: number }> = {
  logs: { level: 1, xp: 40 },
  oak_logs: { level: 15, xp: 60 },
  willow_logs: { level: 30, xp: 90 },
  maple_logs: { level: 45, xp: 135 },
  yew_logs: { level: 60, xp: 202.5 },
  chordwood_logs: { level: 65, xp: 240 },
  magic_logs: { level: 75, xp: 303.75 },
};

const BONFIRE_MULT = 1.25;
const CHORDWOOD_BONUS_TOKEN_CHANCE = 0.125; // 1/8 second token from chordwood

// ===========================================================================
// BONFIRE — one log onto the shared Emberyard bonfire. Removing the log frees
// a slot, and chorale_token is stackable, so the token grant can never overflow.
// ===========================================================================
function bonfire(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'bonfire';
  if (ctx.dead) return fail(kind, 'dead');
  const log = String(payload.log ?? '');
  const fm = BURNS[log];
  if (!fm) return fail(kind, 'not a log');
  if (!nearObject(ctx.x, ctx.y, 'bonfire')) return fail(kind, 'not near a bonfire');

  return tx(ctx, kind, (state) => {
    if (skillLevel(state, 'Firemaking') < fm.level) {
      return fail(kind, `requires Firemaking level ${fm.level}`);
    }
    if (!invRemove(state, log, 1)) return fail(kind, 'no logs');
    const amount = Math.round(fm.xp * BONFIRE_MULT * 100) / 100;
    const x = addXp(state, 'Firemaking', amount);
    let tokens = 1;
    if (log === 'chordwood_logs' && Math.random() < CHORDWOOD_BONUS_TOKEN_CHANCE) tokens += 1;
    invAdd(state, 'chorale_token', tokens);
    return {
      ok: true, kind,
      removed: [{ id: log, qty: 1 }],
      granted: [{ id: 'chorale_token', qty: tokens }],
      xp: [{ skill: 'Firemaking' as SkillName, amount }],
      leveledUp: x.leveledUp ? [{ skill: 'Firemaking' as SkillName, level: x.newLevel }] : [],
    };
  });
}

// ===========================================================================
// QUENCH — 2 logs of one named tier -> 1 charcoal at the charcoal_pit. Small
// flat Firemaking xp (it is a sink, not a training method).
// ===========================================================================
const QUENCH_LOGS_IN = 2;
const QUENCH_XP = 10;

function quench(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'quench';
  if (ctx.dead) return fail(kind, 'dead');
  const log = String(payload.log ?? '');
  if (!BURNS[log]) return fail(kind, 'not a log');
  if (!nearObject(ctx.x, ctx.y, 'charcoal_pit')) return fail(kind, 'not near a charcoal pit');

  return tx(ctx, kind, (state) => {
    if (!invHas(state, log, QUENCH_LOGS_IN)) return fail(kind, `you need ${QUENCH_LOGS_IN} logs`);
    if (!invRemove(state, log, QUENCH_LOGS_IN)) return fail(kind, `you need ${QUENCH_LOGS_IN} logs`);
    // 2 non-stackable logs out, 1 charcoal in: a slot is always free.
    invAdd(state, 'charcoal', 1);
    const x = addXp(state, 'Firemaking', QUENCH_XP);
    return {
      ok: true, kind,
      removed: [{ id: log, qty: QUENCH_LOGS_IN }],
      granted: [{ id: 'charcoal', qty: 1 }],
      xp: [{ skill: 'Firemaking' as SkillName, amount: QUENCH_XP }],
      leveledUp: x.leveledUp ? [{ skill: 'Firemaking' as SkillName, level: x.newLevel }] : [],
    };
  });
}

// ===========================================================================
// FORESTRY-BUY — Ysolde's chorale-token reward shop. Server-owned cost table;
// the client names an item id only. Requires standing at the Emberyard bonfire
// (Ysolde tends it) so the shop can't be used from anywhere.
// ===========================================================================
export const FORESTRY_REWARDS: Record<string, number> = {
  resonant_axe: 300,
  sapglass_lantern: 120,
  hollow_forester_hat: 90,
  hollow_forester_top: 90,
  hollow_forester_legs: 90,
  ashen_brand_hood: 80,
  ashen_brand_top: 80,
};

function forestryBuy(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'forestry-buy';
  if (ctx.dead) return fail(kind, 'dead');
  const item = String(payload.item ?? '');
  const cost = FORESTRY_REWARDS[item];
  if (!cost) return fail(kind, 'unknown reward');
  if (!nearObject(ctx.x, ctx.y, 'bonfire', 4)) return fail(kind, 'not at the Emberyard');

  return tx(ctx, kind, (state) => {
    if (invCount(state, 'chorale_token') < cost) return fail(kind, 'not enough chorale tokens');
    if (freeSlots(state) <= 0) return fail(kind, 'inventory full');
    if (!invRemove(state, 'chorale_token', cost)) return fail(kind, 'not enough chorale tokens');
    if (!invAdd(state, item, 1)) {
      invAdd(state, 'chorale_token', cost); // refund on overflow
      return fail(kind, 'inventory full');
    }
    return {
      ok: true, kind,
      removed: [{ id: 'chorale_token', qty: cost }],
      granted: [{ id: item, qty: 1 }],
    };
  });
}

registerIntentDomain('bonfire', bonfire);
registerIntentDomain('quench', quench);
registerIntentDomain('forestry-buy', forestryBuy);

export {};
