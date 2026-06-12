// server/intent-saltsong.ts — Saltsong Harbour fishing/cooking expansion
// (docs/specs/fishing-cooking.json). Server-authoritative resolution of the
// content that does NOT fit the built-in fish/cook/make intents, modeled on
// the port-fish pattern in server/intent-produce.ts. It does NOT edit the
// shared fish()/cook()/make() handlers — every new spot/recipe/exchange lives
// in its own domain here:
//
//   salt-fish      tiered fishing spots (shoal net / deep bait / reef cage /
//                  deep harpoon / tide-bell) with tool-tier gating and a
//                  SERVER-rolled weighted catch table
//   salt-bell      pull the bell_lever -> opens the shared 30s Tide-Bell
//                  window during which tidebell_spot yields chimefin
//   salt-scoop     salt_pan -> salt_pinch (small Cooking xp)
//   salt-prep      composite cooking (chopped_onion / fish_stew /
//                  seasoned_shark) — multi-input, validated vs server state
//   salt-exchange  hand raw fish to Harbourmaster Sella -> tide_token scrip
//   salt-redeem    spend tide_token at Broker Vey for gear/outfits/cape
//
// Every handler validates INDEPENDENTLY against authoritative `state` (level
// vs SERVER xp, tools/inputs vs SERVER inventory+equipment, object@tile +
// range vs the baked map index), rolls all randomness SERVER-side, mutates
// only via state.ts primitives inside ONE withState transaction, and returns
// the standard { ok, kind, granted, removed, xp } envelope. Token exchange and
// redemption move items only (never coins), so they are not ECONOMY_FROZEN
// gated — same shape as runecraft.
//
// Self-registers at import time; imported for its side effect from
// server/index.ts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { MAP_W } from './world';
import { sim } from './sim';
import {
  AuthState, SkillName,
  invAdd, invRemove, invHas, invCount,
  addXp, skillLevel,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

interface RawItem { stackable?: boolean; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');
function isStackable(id: string): boolean { return !!ITEMS[id]?.stackable; }

// Static world-object position index (mirrors intent-produce.ts) — a spot
// intent is only honoured against a tile that actually holds that object.
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
      if (objectTypeAt(cx + dx, cy + dy, type)) return true;
    }
  }
  return false;
}
function nearNpc(cx: number, cy: number, defId: string, maxDist = 2): boolean {
  for (const n of sim.npcs) {
    if (n.dead || n.def.id !== defId) continue;
    if (chebyshev(cx, cy, n.x, n.y) <= maxDist) return true;
  }
  return false;
}

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

function successRoll(lvl: number, reqLevel: number, low: number, high: number): boolean {
  const t = Math.min(1, Math.max(0, (lvl - reqLevel) / Math.max(1, 99 - reqLevel)));
  return Math.random() < low + (high - low) * t;
}

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
function hasTool(state: AuthState, id: string): boolean {
  if (invHas(state, id, 1)) return true;
  const eq = state.equipment;
  if (eq && typeof eq === 'object') {
    for (const slot of Object.keys(eq)) if ((eq as any)[slot]?.id === id) return true;
  }
  return false;
}

const fail = (kind: string, error: string): IntentResult => ({ ok: false, kind, error });

function tx(ctx: DomainCtx, kind: string, fn: (state: AuthState) => IntentResult): IntentResult {
  const res = ctx.store.withState<IntentResult>(ctx.userId, fn);
  if (!res) return fail(kind, 'no character');
  return stampRev(ctx.store, ctx, res);
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : -1;
}

function grantFish(state: AuthState, kind: string, item: string, xpAmt: number, alsoRemoved?: { id: string; qty: number }[]): IntentResult {
  invAdd(state, item, 1);
  const x = addXp(state, 'Fishing', xpAmt);
  return {
    ok: true, kind, granted: [{ id: item, qty: 1 }],
    ...(alsoRemoved && alsoRemoved.length ? { removed: alsoRemoved } : {}),
    xp: [{ skill: 'Fishing' as SkillName, amount: xpAmt }],
    leveledUp: x.leveledUp ? [{ skill: 'Fishing' as SkillName, level: x.newLevel }] : [],
  };
}

// ---------------------------------------------------------------------------
// Tide-Bell window — a shared server timestamp. The lever opens a 30s window
// for EVERYONE (lore: the bell calls the catch for the whole harbour). Pure
// server state; the client can only ask, never set.
// ---------------------------------------------------------------------------
const BELL_WINDOW_MS = 30_000;
let bellUntilMs = 0;
const bellActive = () => Date.now() < bellUntilMs;

// Oilskin set (hat+coat+waders, held or worn) = a small flat catch-rate bump
// inside THIS domain only — the reward shop's QoL promise, server-enforced.
const OILSKIN_BONUS = 0.04;
function oilskinBonus(state: AuthState): number {
  return hasTool(state, 'oilskin_hat') && hasTool(state, 'oilskin_coat') && hasTool(state, 'oilskin_waders')
    ? OILSKIN_BONUS : 0;
}

// ===========================================================================
// SALT-FISH — Saltsong's tiered fishing spots. { spot, x, y }.
// Tool tiers raise the success high-bound; higher fish are gated on BOTH a
// Fishing level and the tier-2+ tool, all checked against server state.
// ===========================================================================
interface ToolTier { id: string; high: number; }
interface SpotDef {
  objType: string;
  reqLevel: number;
  low: number;
  tools: ToolTier[];      // any one qualifies; best held sets the high-bound
  toolError: string;
}
const SPOTS: Record<string, SpotDef> = {
  shoalnet: {
    objType: 'shoal_net_spot', reqLevel: 1, low: 0.25,
    tools: [
      { id: 'weighted_seine', high: 0.85 },
      { id: 'bronze_net', high: 0.8 },
      { id: 'small_net', high: 0.75 },
    ],
    toolError: 'you need a fishing net',
  },
  deepbait: {
    objType: 'deepbait_spot', reqLevel: 1, low: 0.2,
    tools: [
      { id: 'resonant_rod', high: 0.8 },
      { id: 'feather_rod', high: 0.75 },
      { id: 'fishing_rod', high: 0.7 },
    ],
    toolError: 'you need a fishing rod',
  },
  reefcage: {
    objType: 'reef_cage_spot', reqLevel: 33, low: 0.2,
    tools: [
      { id: 'brass_cage', high: 0.85 },
      { id: 'wicker_cage', high: 0.8 },
      { id: 'lobster_pot', high: 0.75 },
    ],
    toolError: 'you need a cage or lobster pot',
  },
  deepharpoon: {
    objType: 'deep_harpoon_spot', reqLevel: 50, low: 0.15,
    tools: [
      { id: 'tidesong_harpoon', high: 0.8 },
      { id: 'iron_harpoon', high: 0.75 },
      { id: 'harpoon', high: 0.7 },
    ],
    toolError: 'you need a harpoon',
  },
  tidebell: {
    objType: 'tidebell_spot', reqLevel: 86, low: 0.15,
    tools: [{ id: 'tidesong_harpoon', high: 0.6 }],
    toolError: 'only a tidesong harpoon can land what answers the bell',
  },
};

function bestTool(state: AuthState, tools: ToolTier[]): ToolTier | null {
  for (const t of tools) if (hasTool(state, t.id)) return t;
  return null;
}

registerIntentDomain('salt-fish', (ctx, payload) => {
  if (ctx.dead) return fail('salt-fish', 'dead');
  const spotKey = String(payload.spot ?? '');
  const def = SPOTS[spotKey];
  if (!def) return fail('salt-fish', 'unknown spot');
  const ox = num(payload.x), oy = num(payload.y);
  if (!objectTypeAt(ox, oy, def.objType)) return fail('salt-fish', 'no fishing spot here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('salt-fish', 'out of range');
  return tx(ctx, 'salt-fish', (state) => {
    const lvl = skillLevel(state, 'Fishing');
    const tool = bestTool(state, def.tools);
    if (!tool) return fail('salt-fish', def.toolError);
    if (lvl < def.reqLevel) return fail('salt-fish', `requires Fishing level ${def.reqLevel}`);
    if (spotKey === 'deepbait' && !invHas(state, 'fishing_bait', 1)) {
      return fail('salt-fish', 'you need fishing bait');
    }
    if (spotKey === 'tidebell' && !bellActive()) {
      return fail('salt-fish', 'the water is still — the Tide-Bell is silent');
    }
    if (freeSlots(state) === 0) return fail('salt-fish', 'inventory full');
    const bonus = oilskinBonus(state);
    const high = Math.min(0.95, tool.high + bonus);
    if (!successRoll(lvl, def.reqLevel, def.low + bonus, high)) {
      return { ok: true, kind: 'salt-fish', granted: [], xp: [] };
    }
    const hasNetTier2 = hasTool(state, 'bronze_net') || hasTool(state, 'weighted_seine');
    const hasRodTier2 = hasTool(state, 'feather_rod') || hasTool(state, 'resonant_rod');
    const hasCageTier2 = hasTool(state, 'wicker_cage') || hasTool(state, 'brass_cage');
    const hasHarpTier2 = hasTool(state, 'iron_harpoon') || hasTool(state, 'tidesong_harpoon');
    switch (spotKey) {
      case 'shoalnet': {
        // weighted catch: mackerel L16 w/ tier-2 net, else anchovy from L5, else shrimp
        if (lvl >= 16 && hasNetTier2 && Math.random() < 0.45) return grantFish(state, 'salt-fish', 'raw_mackerel', 55);
        if (lvl >= 5 && Math.random() < 0.45) return grantFish(state, 'salt-fish', 'raw_anchovies', 40);
        return grantFish(state, 'salt-fish', 'raw_shrimps', 10);
      }
      case 'deepbait': {
        if (!invRemove(state, 'fishing_bait', 1)) return fail('salt-fish', 'you need fishing bait');
        const bait = [{ id: 'fishing_bait', qty: 1 }];
        if (lvl >= 25 && hasRodTier2 && Math.random() < 0.45) return grantFish(state, 'salt-fish', 'raw_pike', 65, bait);
        if (lvl >= 5 && Math.random() < 0.5) return grantFish(state, 'salt-fish', 'raw_herring', 30, bait);
        return grantFish(state, 'salt-fish', 'raw_sardine', 20, bait);
      }
      case 'reefcage': {
        const canBass = lvl >= 33 && hasCageTier2;
        const canLobster = lvl >= 40; // any cage tier holds a lobster
        if (!canBass && !canLobster) return fail('salt-fish', 'requires Fishing level 33 and a wicker or brass cage');
        if (canBass && (!canLobster || Math.random() < 0.5)) return grantFish(state, 'salt-fish', 'raw_bass', 80);
        return grantFish(state, 'salt-fish', 'raw_lobster', 90);
      }
      case 'deepharpoon': {
        if (lvl >= 76 && Math.random() < 0.3) return grantFish(state, 'salt-fish', 'raw_shark', 110);
        if (lvl >= 62 && hasHarpTier2 && Math.random() < 0.35) return grantFish(state, 'salt-fish', 'raw_tunaling', 130);
        return grantFish(state, 'salt-fish', 'raw_swordfish', 100);
      }
      case 'tidebell':
        return grantFish(state, 'salt-fish', 'raw_chimefin', 175);
    }
    return fail('salt-fish', 'unknown spot');
  });
});

// ===========================================================================
// SALT-BELL — pull the bell_lever; opens the shared Tide-Bell window. { x, y }.
// A short cooldown stops lever-mashing from being a free metronome.
// ===========================================================================
const BELL_COOLDOWN_MS = 10_000;
let bellLastPullMs = 0;
registerIntentDomain('salt-bell', (ctx, payload) => {
  if (ctx.dead) return fail('salt-bell', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  if (!objectTypeAt(ox, oy, 'bell_lever')) return fail('salt-bell', 'no lever here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('salt-bell', 'out of range');
  const now = Date.now();
  if (now - bellLastPullMs < BELL_COOLDOWN_MS && bellActive()) {
    return { ok: true, kind: 'salt-bell', bellMsLeft: bellUntilMs - now } as IntentResult;
  }
  bellLastPullMs = now;
  bellUntilMs = now + BELL_WINDOW_MS;
  return { ok: true, kind: 'salt-bell', bellMsLeft: BELL_WINDOW_MS } as IntentResult;
});

// ===========================================================================
// SALT-SCOOP — scoop the Galley salt pans for a pinch of sea salt. { x, y }.
// Gather-shaped: flat-ish roll, tiny Cooking xp, stackable grant.
// ===========================================================================
registerIntentDomain('salt-scoop', (ctx, payload) => {
  if (ctx.dead) return fail('salt-scoop', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  if (!objectTypeAt(ox, oy, 'salt_pan')) return fail('salt-scoop', 'no salt pan here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('salt-scoop', 'out of range');
  return tx(ctx, 'salt-scoop', (state) => {
    if (!hasRoomFor(state, 'salt_pinch')) return fail('salt-scoop', 'inventory full');
    const lvl = skillLevel(state, 'Cooking');
    if (!successRoll(lvl, 1, 0.5, 0.9)) return { ok: true, kind: 'salt-scoop', granted: [], xp: [] };
    if (!invAdd(state, 'salt_pinch', 1)) return fail('salt-scoop', 'inventory full');
    const x = addXp(state, 'Cooking', 5);
    return {
      ok: true, kind: 'salt-scoop', granted: [{ id: 'salt_pinch', qty: 1 }],
      xp: [{ skill: 'Cooking' as SkillName, amount: 5 }],
      leveledUp: x.leveledUp ? [{ skill: 'Cooking' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// SALT-PREP — composite cooking the fixed make() classes can't express.
// { dish }. Multi-input recipes validated wholly against server inventory;
// the stew/seasoning dishes additionally require standing at a range.
// Composites never burn — the tuning is in the recipe, not the roll.
// ===========================================================================
interface DishDef {
  inputs: { id: string; qty: number }[];
  tool?: string;            // required but not consumed
  out: string;
  level: number;
  xp: number;
  needsRange: boolean;
}
const DISHES: Record<string, DishDef> = {
  chopped_onion: {
    inputs: [{ id: 'onion', qty: 1 }], tool: 'knife',
    out: 'chopped_onion', level: 20, xp: 5, needsRange: false,
  },
  fish_stew: {
    inputs: [{ id: 'bowl_of_water', qty: 1 }, { id: 'bass', qty: 1 }, { id: 'chopped_onion', qty: 1 }],
    out: 'fish_stew', level: 45, xp: 130, needsRange: true,
  },
  seasoned_shark: {
    inputs: [{ id: 'shark', qty: 1 }, { id: 'salt_pinch', qty: 1 }],
    out: 'seasoned_shark', level: 84, xp: 230, needsRange: true,
  },
};
registerIntentDomain('salt-prep', (ctx, payload) => {
  if (ctx.dead) return fail('salt-prep', 'dead');
  const dishKey = String(payload.dish ?? '');
  const d = DISHES[dishKey];
  if (!d) return fail('salt-prep', 'unknown dish');
  if (d.needsRange && !nearObject(ctx.x, ctx.y, 'range')) return fail('salt-prep', 'you need to be at a cooking range');
  return tx(ctx, 'salt-prep', (state) => {
    const lvl = skillLevel(state, 'Cooking');
    if (lvl < d.level) return fail('salt-prep', `requires Cooking level ${d.level}`);
    if (d.tool && !hasTool(state, d.tool)) return fail('salt-prep', `you need a ${d.tool}`);
    for (const inp of d.inputs) {
      if (!invHas(state, inp.id, inp.qty)) return fail('salt-prep', `you need ${inp.id.replace(/_/g, ' ')}`);
    }
    // remove all inputs; refund on any failure so nothing is half-eaten
    const taken: { id: string; qty: number }[] = [];
    for (const inp of d.inputs) {
      if (!invRemove(state, inp.id, inp.qty)) {
        for (const t of taken) invAdd(state, t.id, t.qty);
        return fail('salt-prep', `you need ${inp.id.replace(/_/g, ' ')}`);
      }
      taken.push(inp);
    }
    if (!invAdd(state, d.out, 1)) {
      for (const t of taken) invAdd(state, t.id, t.qty);
      return fail('salt-prep', 'inventory full');
    }
    const x = addXp(state, 'Cooking', d.xp);
    return {
      ok: true, kind: 'salt-prep',
      removed: taken.map((t) => ({ ...t })),
      granted: [{ id: d.out, qty: 1 }],
      xp: [{ skill: 'Cooking' as SkillName, amount: d.xp }],
      leveledUp: x.leveledUp ? [{ skill: 'Cooking' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// SALT-EXCHANGE — hand raw fish to Harbourmaster Sella for tide_token scrip.
// { item }. Exchanges the player's WHOLE holding of that fish (turn-in desk,
// not a market). Item->item only: no coins move, so not ECONOMY_FROZEN gated.
// Rates scale by fish tier; the client never supplies a rate.
// ===========================================================================
const TOKEN_RATES: Record<string, number> = {
  raw_mackerel: 1,
  raw_pike: 2,
  raw_bass: 3,
  raw_lobster: 4,
  raw_swordfish: 5,
  raw_tunaling: 8,
  raw_shark: 12,
  raw_chimefin: 25,
};
registerIntentDomain('salt-exchange', (ctx, payload) => {
  if (ctx.dead) return fail('salt-exchange', 'dead');
  const item = String(payload.item ?? '');
  const rate = TOKEN_RATES[item];
  if (!rate) return fail('salt-exchange', 'Sella has no use for that');
  if (!nearNpc(ctx.x, ctx.y, 'harbourmaster_sella')) return fail('salt-exchange', 'out of range');
  return tx(ctx, 'salt-exchange', (state) => {
    const n = invCount(state, item);
    if (n === 0) return fail('salt-exchange', 'you have none of those');
    if (!invRemove(state, item, n)) return fail('salt-exchange', 'you have none of those');
    const tokens = n * rate;
    if (!invAdd(state, 'tide_token', tokens)) {
      invAdd(state, item, n);
      return fail('salt-exchange', 'you cannot carry more tokens');
    }
    return {
      ok: true, kind: 'salt-exchange',
      removed: [{ id: item, qty: n }],
      granted: [{ id: 'tide_token', qty: tokens }],
    };
  });
});

// ===========================================================================
// SALT-REDEEM — spend tide_token at Broker Vey. { item }. Prices and level
// requirements are server data; the cape additionally requires Fishing 90 AND
// Cooking 90. Item->item only (token sink), so not ECONOMY_FROZEN gated.
// ===========================================================================
interface RewardDef { cost: number; reqs?: { skill: SkillName; level: number }[]; }
const REWARDS: Record<string, RewardDef> = {
  weighted_seine: { cost: 30, reqs: [{ skill: 'Fishing', level: 16 }] },
  resonant_rod: { cost: 80, reqs: [{ skill: 'Fishing', level: 50 }] },
  brass_cage: { cost: 100, reqs: [{ skill: 'Fishing', level: 55 }] },
  tidesong_harpoon: { cost: 200, reqs: [{ skill: 'Fishing', level: 76 }] },
  oilskin_hat: { cost: 40, reqs: [{ skill: 'Fishing', level: 40 }] },
  oilskin_coat: { cost: 40, reqs: [{ skill: 'Fishing', level: 40 }] },
  oilskin_waders: { cost: 60, reqs: [{ skill: 'Fishing', level: 50 }] },
  galley_toque: { cost: 40, reqs: [{ skill: 'Cooking', level: 40 }] },
  galley_apron: { cost: 40, reqs: [{ skill: 'Cooking', level: 40 }] },
  galley_mitts: { cost: 60, reqs: [{ skill: 'Cooking', level: 50 }] },
  tideturner_cape: { cost: 500, reqs: [{ skill: 'Fishing', level: 90 }, { skill: 'Cooking', level: 90 }] },
};
registerIntentDomain('salt-redeem', (ctx, payload) => {
  if (ctx.dead) return fail('salt-redeem', 'dead');
  const item = String(payload.item ?? '');
  const r = REWARDS[item];
  if (!r) return fail('salt-redeem', 'Vey does not stock that');
  if (!nearNpc(ctx.x, ctx.y, 'tide_token_broker_vey')) return fail('salt-redeem', 'out of range');
  return tx(ctx, 'salt-redeem', (state) => {
    for (const req of r.reqs ?? []) {
      if (skillLevel(state, req.skill) < req.level) {
        return fail('salt-redeem', `requires ${req.skill} level ${req.level}`);
      }
    }
    if (invCount(state, 'tide_token') < r.cost) return fail('salt-redeem', `that costs ${r.cost} Tide-Tokens`);
    if (!hasRoomFor(state, item)) return fail('salt-redeem', 'inventory full');
    if (!invRemove(state, 'tide_token', r.cost)) return fail('salt-redeem', `that costs ${r.cost} Tide-Tokens`);
    if (!invAdd(state, item, 1)) {
      invAdd(state, 'tide_token', r.cost);
      return fail('salt-redeem', 'inventory full');
    }
    return {
      ok: true, kind: 'salt-redeem',
      removed: [{ id: 'tide_token', qty: r.cost }],
      granted: [{ id: item, qty: 1 }],
    };
  });
});
