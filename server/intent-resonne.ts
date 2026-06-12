// server/intent-resonne.ts — Resonne (the Singing City) Magic/Runecraft hub:
// the mechanics that DON'T fit the existing data-driven intents
// (docs/CONVERSION-CONTRACT.md §3 registry). Plain altar runecrafting lives in
// the ALTARS table in server/intent-produce.ts — NOT here.
//
// Registered kinds:
//   - 'enchant-tiara'        — at a keyed altar, consume chant_tiara + the
//                              matching talisman, grant the element tiara
//                              (+ flat Runecraft xp). The altar keeps the
//                              talisman; the wearer keeps their hands free.
//   - 'grind-runes'          — the Conservatory rune mill: remove a whole held
//                              stack of one rune kind, grant floor(value/3)
//                              rune_dust per rune. Pure item->item loop, no
//                              coins, no RNG (so no ECONOMY_FROZEN gate).
//   - 'conservatory-reward'  — Quartermaster Sella's reward exchange: a fixed
//                              deal table (rune_dust / resonant_shard /
//                              resonant_staff costs -> talismans, robes,
//                              staves). The client names ONLY a deal index.
//
// Every handler validates INDEPENDENTLY against the authoritative state inside
// ONE withState transaction; the client never authors quantities or items.
// Imported once for side effect by server/index.ts (`import './intent-resonne';`).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { MAP_W } from './world';
import {
  AuthState, SkillName,
  invAdd, invRemove, invHas, invCount,
  addXp, skillLevel,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

interface RawItem { value?: number; stackable?: boolean; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');

// Static world-object position index (mirrors intent-produce.ts): proximity is
// validated against the baked map, so a player can't enchant at a tiara from
// across the city.
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

function fail(kind: string, error: string): IntentResult {
  return { ok: false, kind, error };
}
function tx(ctx: DomainCtx, kind: string, fn: (state: AuthState) => IntentResult): IntentResult {
  const res = ctx.store.withState<IntentResult>(ctx.userId, fn);
  if (!res) return fail(kind, 'no character');
  return stampRev(ctx.store, ctx, res);
}
function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
}

// ===========================================================================
// ENCHANT-TIARA — { altar: <element> }. Near the element's altar, consume a
// chant_tiara + the matching talisman (the altar keeps it), grant the element
// tiara + a flat 25 Runecraft xp. Level req mirrors the ALTARS ladder in
// intent-produce.ts so a tiara can't outrun the altar it keys.
// ===========================================================================

const ENCHANTS: Record<string, { tiara: string; talisman: string; level: number }> = {
  body: { tiara: 'body_tiara', talisman: 'body_talisman', level: 20 },
  cosmic: { tiara: 'cosmic_tiara', talisman: 'cosmic_talisman', level: 27 },
  chord: { tiara: 'chord_tiara', talisman: 'chord_talisman', level: 44 },
  law: { tiara: 'law_tiara', talisman: 'law_talisman', level: 54 },
  death: { tiara: 'death_tiara', talisman: 'death_talisman', level: 65 },
  discord: { tiara: 'discord_tiara', talisman: 'discord_talisman', level: 70 },
  blood: { tiara: 'blood_tiara', talisman: 'blood_talisman', level: 77 },
  soul: { tiara: 'soul_tiara', talisman: 'soul_talisman', level: 90 },
};
const ENCHANT_XP = 25;

registerIntentDomain('enchant-tiara', (ctx, payload) => {
  const kind = 'enchant-tiara';
  if (ctx.dead) return fail(kind, 'dead');
  const altarKey = String(payload.altar ?? '');
  const e = ENCHANTS[altarKey];
  if (!e) return fail(kind, 'unknown altar');
  if (!nearObject(ctx.x, ctx.y, `${altarKey}_altar`)) return fail(kind, 'not near the altar');
  return tx(ctx, kind, (state) => {
    if (skillLevel(state, 'Runecraft') < e.level) return fail(kind, `requires Runecraft level ${e.level}`);
    if (!invHas(state, 'chant_tiara', 1)) return fail(kind, 'you need a blank chant tiara');
    if (!invHas(state, e.talisman, 1)) return fail(kind, `you need a ${e.talisman.replace('_', ' ')}`);
    invRemove(state, 'chant_tiara', 1);
    invRemove(state, e.talisman, 1);
    // two slots just opened; the tiara always fits
    invAdd(state, e.tiara, 1);
    const x = addXp(state, 'Runecraft', ENCHANT_XP);
    return {
      ok: true, kind,
      removed: [{ id: 'chant_tiara', qty: 1 }, { id: e.talisman, qty: 1 }],
      granted: [{ id: e.tiara, qty: 1 }],
      xp: [{ skill: 'Runecraft' as SkillName, amount: ENCHANT_XP }],
      leveledUp: x.leveledUp ? [{ skill: 'Runecraft' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// GRIND-RUNES — { rune: <id> }. Near the rune_mill, remove the player's WHOLE
// held stack of one whitelisted rune, grant floor(value/3) rune_dust per rune
// (min 1 — elemental runes are value 3-4). Deterministic, coin-free sink.
// ===========================================================================

const GRINDABLE = new Set([
  'air_rune', 'mind_rune', 'water_rune', 'earth_rune', 'fire_rune', 'chaos_rune',
  'body_rune', 'cosmic_rune', 'chord_rune', 'law_rune', 'death_rune',
  'blood_rune', 'soul_rune', 'discord_rune',
]);

registerIntentDomain('grind-runes', (ctx, payload) => {
  const kind = 'grind-runes';
  if (ctx.dead) return fail(kind, 'dead');
  const rune = String(payload.rune ?? '');
  if (!GRINDABLE.has(rune)) return fail(kind, 'the mill refuses that');
  if (!nearObject(ctx.x, ctx.y, 'rune_mill')) return fail(kind, 'not near the rune mill');
  const dustPer = Math.max(1, Math.floor((ITEMS[rune]?.value ?? 1) / 3));
  return tx(ctx, kind, (state) => {
    const n = invCount(state, rune);
    if (n === 0) return fail(kind, 'you have none of those runes');
    if (!invRemove(state, rune, n)) return fail(kind, 'you have none of those runes');
    const dust = n * dustPer;
    if (!invAdd(state, 'rune_dust', dust)) {
      invAdd(state, rune, n); // refund: never destroy on a full dust stack
      return fail(kind, 'you have too much rune dust');
    }
    return {
      ok: true, kind,
      removed: [{ id: rune, qty: n }],
      granted: [{ id: 'rune_dust', qty: dust }],
    };
  });
});

// ===========================================================================
// CONSERVATORY-REWARD — { deal: <index> }. Quartermaster Sella's exchange:
// fixed costs in rune_dust / resonant_shard / resonant_staff, fixed item out.
// No coins move, so no ECONOMY_FROZEN gate (mirrors shard-exchange). Indices
// MUST match REWARD_DEALS in src/packs/resonne.ts.
// ===========================================================================

interface RewardDeal { costs: { item: string; qty: number }[]; grant: { item: string; qty: number }; }
const CONSERVATORY_DEALS: RewardDeal[] = [
  { costs: [{ item: 'rune_dust', qty: 20 }], grant: { item: 'body_talisman', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 30 }], grant: { item: 'cosmic_talisman', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 60 }], grant: { item: 'chord_talisman', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 80 }], grant: { item: 'law_talisman', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 110 }], grant: { item: 'death_talisman', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 160 }], grant: { item: 'discord_talisman', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 150 }], grant: { item: 'blood_talisman', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 200 }], grant: { item: 'soul_talisman', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 60 }], grant: { item: 'wizard_robe_resonne', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 50 }], grant: { item: 'wizard_skirt_resonne', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 90 }], grant: { item: 'diapason_hat', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 40 }, { item: 'resonant_shard', qty: 8 }], grant: { item: 'resonant_staff', qty: 1 } },
  { costs: [{ item: 'rune_dust', qty: 200 }, { item: 'resonant_shard', qty: 25 }, { item: 'resonant_staff', qty: 1 }], grant: { item: 'chord_staff', qty: 1 } },
];

registerIntentDomain('conservatory-reward', (ctx, payload) => {
  const kind = 'conservatory-reward';
  if (ctx.dead) return fail(kind, 'dead');
  const idx = Math.floor(Number(payload.deal));
  const deal = CONSERVATORY_DEALS[idx];
  if (!deal) return fail(kind, 'unknown deal');
  return tx(ctx, kind, (state) => {
    for (const c of deal.costs) {
      if (!invHas(state, c.item, c.qty)) return fail(kind, 'not enough to cover that');
    }
    // costs free at least one slot only when a non-stackable (resonant_staff)
    // is consumed; otherwise require room for the grant up front.
    const consumesSlot = deal.costs.some((c) => !ITEMS[c.item]?.stackable);
    if (!consumesSlot && freeSlots(state) <= 0 && invCount(state, deal.grant.item) === 0) {
      return fail(kind, 'inventory full');
    }
    const removed: { id: string; qty: number }[] = [];
    for (const c of deal.costs) {
      invRemove(state, c.item, c.qty);
      removed.push({ id: c.item, qty: c.qty });
    }
    invAdd(state, deal.grant.item, deal.grant.qty);
    return {
      ok: true, kind,
      removed,
      granted: [{ id: deal.grant.item, qty: deal.grant.qty }],
    };
  });
});

export {};
