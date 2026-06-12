// server/intent-forgekeep.ts — Forgekeep Concord's two non-pure-data paths
// (docs/specs/smithing-crafting-fletching.json, verdict §mechanicFit):
//
//   forgekeep { op:'tan-hard' }          cowhide + 3 coins/hide -> hardleather
//                                        at the Concord tanning_vat. Wealth-
//                                        shaped (spends coins) so it is gated
//                                        by ECONOMY_FROZEN, like 'tan'.
//   forgekeep { op:'reward', deal:N }    Quartermaster Doram's reward exchange:
//                                        resonant_shard + makers_mark -> the
//                                        Tuner's Apron / master toolset /
//                                        uncut dragonstone / mark stamping.
//                                        The deal table is SERVER data; the
//                                        client names only the index.
//
// Everything else in the expansion (orikon/dawnsteel smelt+smith, longbows,
// crossbows, javelins/darts/bolts, loom leatherwork, jewelry, gem cuts,
// resonance thread) routes through the existing produce(make)/gemcut/tan
// domains as pure recipe data — no code here.
//
// Every handler validates against authoritative state (server inventory,
// map-baked tanning_vat tile, ECONOMY_FROZEN), mutates only via state.ts
// primitives inside ONE withState transaction, and returns the standard
// { ok, kind, granted, removed, ... } envelope (docs/CONVERSION-CONTRACT.md).
//
// Self-registers at import time; imported for its side effect from
// server/index.ts. It does NOT edit intents.ts or intents-wire.ts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { MAP_W } from './world';
import {
  AuthState,
  invAdd, invRemove, invCount,
  getCoins, removeCoins,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

// Static world-object position index (same pattern as intent-produce.ts) so
// the hard-tan can be validated against a real tanning_vat tile.
interface MapJson { objects: { type: string; x: number; y: number }[]; }
const MAP = loadJson<MapJson>('../data/map.json');
const vatTiles = new Set<number>();
for (const o of MAP.objects) {
  if (o.type === 'tanning_vat') vatTiles.add(o.y * MAP_W + o.x);
}
function nearVat(cx: number, cy: number, maxDist = 2): boolean {
  for (let dx = -maxDist; dx <= maxDist; dx++) {
    for (let dy = -maxDist; dy <= maxDist; dy++) {
      if (vatTiles.has((cy + dy) * MAP_W + (cx + dx))) return true;
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

const fail = (error: string): IntentResult => ({ ok: false, kind: 'forgekeep', error });

function tx(ctx: DomainCtx, fn: (state: AuthState) => IntentResult): IntentResult {
  const res = ctx.store.withState<IntentResult>(ctx.userId, fn);
  if (!res) return fail('no character');
  return stampRev(ctx.store, ctx, res);
}

// ---------------------------------------------------------------------------
// Doram's reward exchange — costs in resonant_shard (the Untuned Mine token)
// and makers_mark (the Concord token; deal 0 mints marks FROM shards, so marks
// are obtainable until the commission board ships). Indices are the contract
// with src/packs/forgekeep.ts REWARD_MENU — append only, never reorder.
// NOTE: master_chisel / true_hammer ship as prestige tools; their 10% perks
// need hooks in make()'s gemcut/smith paths (engine work, out of scope here).
// ---------------------------------------------------------------------------
interface RewardDeal {
  costs: { item: string; qty: number }[];
  give: { item: string; qty: number };
}
const REWARD_DEALS: RewardDeal[] = [
  { costs: [{ item: 'resonant_shard', qty: 5 }], give: { item: 'makers_mark', qty: 1 } },
  { costs: [{ item: 'resonant_shard', qty: 8 }, { item: 'makers_mark', qty: 2 }], give: { item: 'uncut_dragonstone', qty: 1 } },
  { costs: [{ item: 'resonant_shard', qty: 10 }, { item: 'makers_mark', qty: 3 }], give: { item: 'tuners_apron', qty: 1 } },
  { costs: [{ item: 'resonant_shard', qty: 15 }, { item: 'makers_mark', qty: 5 }], give: { item: 'master_chisel', qty: 1 } },
  { costs: [{ item: 'resonant_shard', qty: 15 }, { item: 'makers_mark', qty: 5 }], give: { item: 'true_hammer', qty: 1 } },
];

const HARD_TAN_FEE = 3; // coins per hide
const HARD_TAN_BATCH = 28; // safety cap per request

registerIntentDomain('forgekeep', (ctx, payload) => {
  if (ctx.dead) return fail('dead');
  const op = String(payload.op ?? '');

  // ----- hard-leather tanning at the vat ----------------------------------
  if (op === 'tan-hard') {
    if (ctx.frozen) return fail('frozen');
    if (!nearVat(ctx.x, ctx.y)) return fail('not near a tanning vat');
    return tx(ctx, (state) => {
      const hides = invCount(state, 'cowhide');
      if (hides === 0) return fail('no cowhides');
      const affordable = Math.floor(getCoins(state) / HARD_TAN_FEE);
      const n = Math.min(hides, affordable, HARD_TAN_BATCH);
      if (n === 0) return fail('not enough coins');
      if (!invRemove(state, 'cowhide', n)) return fail('no cowhides');
      if (!removeCoins(state, n * HARD_TAN_FEE)) {
        invAdd(state, 'cowhide', n);
        return fail('not enough coins');
      }
      invAdd(state, 'hardleather', n);
      return {
        ok: true, kind: 'forgekeep',
        removed: [{ id: 'cowhide', qty: n }, { id: 'coins', qty: n * HARD_TAN_FEE }],
        granted: [{ id: 'hardleather', qty: n }],
        coins: getCoins(state),
      };
    });
  }

  // ----- Doram's reward exchange ------------------------------------------
  if (op === 'reward') {
    const idx = Math.floor(Number(payload.deal));
    const deal = REWARD_DEALS[idx];
    if (!deal) return fail('unknown deal');
    return tx(ctx, (state) => {
      for (const c of deal.costs) {
        if (invCount(state, c.item) < c.qty) return fail('not enough tokens');
      }
      // non-stackable prizes need a slot (stackable tokens free theirs only
      // after removal, so check up front against the worst case)
      if (freeSlots(state) <= 0 && invCount(state, deal.give.item) === 0) {
        return fail('inventory full');
      }
      const removed: { id: string; qty: number }[] = [];
      for (const c of deal.costs) {
        if (!invRemove(state, c.item, c.qty)) {
          // roll back anything already taken
          for (const r of removed) invAdd(state, r.id, r.qty);
          return fail('not enough tokens');
        }
        removed.push({ id: c.item, qty: c.qty });
      }
      if (!invAdd(state, deal.give.item, deal.give.qty)) {
        for (const r of removed) invAdd(state, r.id, r.qty); // refund
        return fail('inventory full');
      }
      return {
        ok: true, kind: 'forgekeep',
        removed,
        granted: [{ id: deal.give.item, qty: deal.give.qty }],
      };
    });
  }

  return fail('unknown op');
});
