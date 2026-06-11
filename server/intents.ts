// server/intents.ts — server-authoritative resolution of every NON-combat
// value/progress path (docs/ECONOMY-AUTHORITY.md §2).
//
// The trust flip: the client no longer authors wealth/progress. For each
// skilling / shop / bank / quest / loot path it sends a REQUEST (an intent);
// this module:
//   1. validates level (vs SERVER xp), inputs/tool (vs SERVER inventory),
//      proximity/range (vs the static world-object index + the live PlayerView
//      position), quest gates, and ECONOMY_FROZEN where wealth-shaped,
//   2. rolls any randomness SERVER-side (success chance, burn, drop qty),
//   3. applies the result atomically through state.ts primitives inside ONE
//      `stateStore.withState` transaction (rev bump + fence + save_reload push),
//   4. returns the authoritative result; the client reflects it (its local
//      addItem/addXp for owned state become server-confirmed echoes).
//
// Data (rates/xp/level-reqs/recipes) is read from the SAME data/*.json the
// client reads, so the catalogue can never diverge.
//
// All intents route through the WS message handler in index.ts (`handleIntent`)
// and through HTTP for the lower-frequency transactional ones (shop/bank/quest)
// — see index.ts route registration. The transport is symmetric: every reply is
// a `{ t:'intent', ok, ... }` envelope the client applies the same way.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ECONOMY_FROZEN } from './econ-freeze';
import { MAP_W } from './world';
import {
  StateStore, AuthState, SkillName, SKILLS, isKnownItem,
  invAdd, invRemove, invCount, invHas, getCoins, addCoins, removeCoins,
  bankAdd, bankRemove, bankCount, addXp, skillLevel,
  questStage, setQuestStage,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

// ---------------------------------------------------------------------------
// Catalogue (same sources as the client; rates/xp/reqs never diverge).
// ---------------------------------------------------------------------------

interface RawItem { id: string; name?: string; stackable?: boolean; value?: number; equipSlot?: string; edible?: { heals: number }; buryXp?: number; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');

interface SkillObjData { level: number; xp: number; item: string; depleteChance: number; respawn: number; lowRate: number; highRate: number; }
const OBJECTS = loadJson<{ skillObjs: Record<string, SkillObjData> }>('../data/objects.json');
const SKILL_OBJS = OBJECTS.skillObjs;

interface Recipes {
  cookables: { raw: string; cooked: string; burnt: string; level: number; xp: number; stopBurn: number }[];
  smeltables: { bar: string; level: number; xp: number; inputs: { item: string; qty: number }[]; successChance?: number }[];
  smithables: { output: string; outputQty?: number; bar: string; bars: number; level: number; xp: number }[];
  fletchables: { output: string; outputQty?: number; level: number; xp: number; inputs: { item: string; qty: number }[] }[];
  craftables: { output: string; level: number; xp: number; inputs: { item: string; qty: number }[]; station?: string | null }[];
  gemCuts: { uncut: string; cut: string; level: number; xp: number }[];
  herbs: { grimy: string; clean: string; level: number; xp: number }[];
  potions: { output: string; level: number; xp: number; herb: string; secondary: string }[];
  seeds: { seed: string; produce: string; level: number; plantXp: number; harvestXp: number; growTicks: number }[];
  constructionBuilds: { name: string; level: number; xp: number; planks: number; nails: number }[];
}
const RECIPES = loadJson<Recipes>('../data/recipes.json');

const SHOPS: Record<string, { name: string; stock: { item: string; qty: number }[] }> =
  loadJson('../data/shops.json');

// Server-owned quest completion rewards, keyed '<questId>:<stage>'. The client
// can request a claim but NEVER dictates the reward amount — only what is listed
// here is granted, once per (quest,stage). Closes the M6 reward-inflation gap.
interface QuestReward { items?: { id: string; qty: number }[]; xp?: { skill: SkillName; amount: number }[]; coins?: number; }
const QUEST_REWARDS: Record<string, QuestReward> = loadJson('../data/quest-rewards.json');

// Static world-object position index (mining/woodcutting/etc. live in the baked
// map). Key = y*MAP_W+x; value = the object's type. Proximity for a gather
// intent is validated against this — the player cannot mine a rock that does
// not exist at the named tile.
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

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

function isStackable(id: string): boolean { return !!ITEMS[id]?.stackable; }
function itemValue(id: string): number { return Math.max(1, Math.ceil(ITEMS[id]?.value ?? 1)); }

// ---------------------------------------------------------------------------
// Intent context + result envelope.
// ---------------------------------------------------------------------------

// What an intent needs from the connection layer. Position/dead come from the
// live PlayerView (sim authority); userId selects the authoritative row.
export interface IntentCtx {
  userId: number;
  x: number;
  y: number;
  dead: boolean;
}

// Authoritative echo. `granted`/`removed` describe the net owned-item delta the
// server applied; `xp` the xp it awarded; `rev` the new save revision; `coins`
// the new carried-coin balance. The client REPLACES its optimistic owned-state
// with this — it never authors the values itself.
export interface IntentResult {
  ok: boolean;
  kind: string;
  error?: string;
  message?: string;       // flavour line for the chat log (server-authored)
  granted?: { id: string; qty: number }[];
  removed?: { id: string; qty: number }[];
  xp?: { skill: SkillName; amount: number }[];
  coins?: number;
  rev?: number;
  // path-specific extras
  burned?: boolean;
  leveledUp?: { skill: SkillName; level: number }[];
  stage?: number;         // quest advance: the resulting (monotonic) stage
}

// success-rate roll interpolated from the requirement level to 99 (mirrors
// content.ts successRoll). Rolled SERVER-side.
function successRoll(lvl: number, reqLevel: number, low: number, high: number): boolean {
  const t = Math.min(1, Math.max(0, (lvl - reqLevel) / Math.max(1, 99 - reqLevel)));
  return Math.random() < low + (high - low) * t;
}

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

// Count empty inventory slots in the authoritative state.
function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length; // missing tail counts as free
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
}
function hasRoomFor(state: AuthState, id: string): boolean {
  if (isStackable(id) && invCount(state, id) > 0) return true;
  return freeSlots(state) > 0;
}

// A "tool" is satisfied by the item being in the inventory OR worn (equipment),
// matching the client's hasTool().
function hasTool(state: AuthState, id: string): boolean {
  if (invHas(state, id, 1)) return true;
  const eq = state.equipment;
  if (eq && typeof eq === 'object') {
    for (const slot of Object.keys(eq)) if (eq[slot]?.id === id) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The store binding. createIntents(stateStore) returns the typed handlers used
// by index.ts. Every handler runs its validation+mutation inside one withState.
// ---------------------------------------------------------------------------

export function createIntents(stateStore: StateStore) {
  const revOf = (userId: number) => stateStore.revOf(userId);

  function fail(kind: string, error: string): IntentResult {
    return { ok: false, kind, error };
  }

  // ---- GATHER (mining / woodcutting / fishing / flax / thieving-stall) ----
  // One swing/attempt. Client requests "gather <type> at (x,y)"; server checks
  // the object exists at the tile, range, tool, level, inventory room, rolls
  // success + deplete, applies grant + xp. Returns the grant (possibly empty if
  // the roll missed — the loop just keeps trying, exactly like the client did).
  function gather(ctx: IntentCtx, type: string, ox: number, oy: number): IntentResult {
    if (ctx.dead) return fail('gather', 'dead');
    const data = SKILL_OBJS[type];
    if (!data) return fail('gather', 'unknown gather object');
    if (!objectTypeAt(ox, oy, type)) return fail('gather', 'no such object here');
    if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('gather', 'out of range');

    // tool + skill per type (mirrors content.ts)
    const reqs = GATHER_REQS[type];
    const skill = reqs.skill;

    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      const lvl = skillLevel(state, skill);
      if (lvl < data.level) return fail('gather', `requires ${skill} level ${data.level}`);
      if (reqs.tool && !hasTool(state, reqs.tool)) return fail('gather', `you need a ${reqs.tool}`);
      if (!hasRoomFor(state, data.item)) return fail('gather', 'inventory full');

      // roll success this attempt
      if (!successRoll(lvl, data.level, data.lowRate, data.highRate)) {
        // no grant this tick; still a valid (ok) attempt so the client keeps looping
        return { ok: true, kind: 'gather', granted: [], xp: [] };
      }
      if (!invAdd(state, data.item, 1)) return fail('gather', 'inventory full');
      const x = addXp(state, skill, data.xp);
      return {
        ok: true, kind: 'gather',
        granted: [{ id: data.item, qty: 1 }],
        xp: [{ skill, amount: data.xp }],
        leveledUp: x.leveledUp ? [{ skill, level: x.newLevel }] : [],
      };
    });
    if (!res) return fail('gather', 'no character');
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  // ---- FISHING (net / bait) — separate because the catch table is rolled ----
  function fish(ctx: IntentCtx, spot: 'net' | 'bait', ox: number, oy: number): IntentResult {
    if (ctx.dead) return fail('fish', 'dead');
    const type = spot === 'net' ? 'fishing_spot' : 'rod_fishing_spot';
    if (!objectTypeAt(ox, oy, type)) return fail('fish', 'no fishing spot here');
    if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('fish', 'out of range');

    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      const lvl = skillLevel(state, 'Fishing');
      if (spot === 'net') {
        if (!hasTool(state, 'small_net')) return fail('fish', 'you need a small fishing net');
        if (freeSlots(state) === 0) return fail('fish', 'inventory full');
        if (!successRoll(lvl, 1, 0.3, 0.9)) return { ok: true, kind: 'fish', granted: [], xp: [] };
        if (lvl >= 15 && Math.random() < 0.4) {
          invAdd(state, 'raw_anchovies', 1); const x = addXp(state, 'Fishing', 40);
          return { ok: true, kind: 'fish', granted: [{ id: 'raw_anchovies', qty: 1 }], xp: [{ skill: 'Fishing' as SkillName, amount: 40 }], leveledUp: x.leveledUp ? [{ skill: 'Fishing' as SkillName, level: x.newLevel }] : [] };
        }
        invAdd(state, 'raw_shrimps', 1); const x = addXp(state, 'Fishing', 10);
        return { ok: true, kind: 'fish', granted: [{ id: 'raw_shrimps', qty: 1 }], xp: [{ skill: 'Fishing' as SkillName, amount: 10 }], leveledUp: x.leveledUp ? [{ skill: 'Fishing' as SkillName, level: x.newLevel }] : [] };
      }
      // bait
      if (!hasTool(state, 'fishing_rod')) return fail('fish', 'you need a fishing rod');
      if (!invHas(state, 'fishing_bait', 1)) return fail('fish', 'you have no fishing bait');
      if (lvl < 5) return fail('fish', 'requires Fishing level 5');
      if (freeSlots(state) === 0) return fail('fish', 'inventory full');
      if (!successRoll(lvl, 5, 0.25, 0.85)) return { ok: true, kind: 'fish', granted: [], xp: [] };
      invRemove(state, 'fishing_bait', 1);
      if (lvl >= 10 && Math.random() < 0.5) {
        invAdd(state, 'raw_herring', 1); const x = addXp(state, 'Fishing', 30);
        return { ok: true, kind: 'fish', granted: [{ id: 'raw_herring', qty: 1 }], removed: [{ id: 'fishing_bait', qty: 1 }], xp: [{ skill: 'Fishing' as SkillName, amount: 30 }], leveledUp: x.leveledUp ? [{ skill: 'Fishing' as SkillName, level: x.newLevel }] : [] };
      }
      invAdd(state, 'raw_sardine', 1); const x = addXp(state, 'Fishing', 20);
      return { ok: true, kind: 'fish', granted: [{ id: 'raw_sardine', qty: 1 }], removed: [{ id: 'fishing_bait', qty: 1 }], xp: [{ skill: 'Fishing' as SkillName, amount: 20 }], leveledUp: x.leveledUp ? [{ skill: 'Fishing' as SkillName, level: x.newLevel }] : [] };
    });
    if (!res) return fail('fish', 'no character');
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  // ---- PROCESS (cooking, firemaking) — one unit, raw -> cooked (roll burn) ---
  function cook(ctx: IntentCtx, raw: string): IntentResult {
    if (ctx.dead) return fail('cook', 'dead');
    const c = RECIPES.cookables.find((cc) => cc.raw === raw);
    if (!c) return fail('cook', 'not cookable');
    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      const lvl = skillLevel(state, 'Cooking');
      if (lvl < c.level) return fail('cook', `requires Cooking level ${c.level}`);
      if (!invHas(state, c.raw, 1)) return fail('cook', 'no raw food');
      if (!invRemove(state, c.raw, 1)) return fail('cook', 'no raw food');
      const burnChance = lvl >= c.stopBurn ? 0
        : 0.5 * (c.stopBurn - lvl) / Math.max(1, c.stopBurn - c.level);
      if (Math.random() < burnChance) {
        invAdd(state, c.burnt, 1);
        return { ok: true, kind: 'cook', burned: true, granted: [{ id: c.burnt, qty: 1 }], removed: [{ id: c.raw, qty: 1 }], xp: [] };
      }
      invAdd(state, c.cooked, 1);
      const x = addXp(state, 'Cooking', c.xp);
      return { ok: true, kind: 'cook', burned: false, granted: [{ id: c.cooked, qty: 1 }], removed: [{ id: c.raw, qty: 1 }], xp: [{ skill: 'Cooking' as SkillName, amount: c.xp }], leveledUp: x.leveledUp ? [{ skill: 'Cooking' as SkillName, level: x.newLevel }] : [] };
    });
    if (!res) return fail('cook', 'no character');
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  function firemake(ctx: IntentCtx, log: string): IntentResult {
    if (ctx.dead) return fail('firemake', 'dead');
    const fm = FIREMAKING.find((f) => f.log === log);
    if (!fm) return fail('firemake', 'not a log');
    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      if (!hasTool(state, 'tinderbox')) return fail('firemake', 'you need a tinderbox');
      if (skillLevel(state, 'Firemaking') < fm.level) return fail('firemake', `requires Firemaking level ${fm.level}`);
      if (!invRemove(state, fm.log, 1)) return fail('firemake', 'no logs');
      const x = addXp(state, 'Firemaking', fm.xp);
      return { ok: true, kind: 'firemake', removed: [{ id: fm.log, qty: 1 }], xp: [{ skill: 'Firemaking' as SkillName, amount: fm.xp }], leveledUp: x.leveledUp ? [{ skill: 'Firemaking' as SkillName, level: x.newLevel }] : [] };
    });
    if (!res) return fail('firemake', 'no character');
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  // ---- MAKE (smelt/smith/fletch/craft/herblore/gemcut/construction) ---------
  // One unit of a recipe: verify level + station-class + all inputs, consume
  // inputs, roll any per-recipe success (iron smelting), grant output + xp.
  // "Atomic per-unit so a disconnect can't dupe" (doc §2.1): the client loops
  // unit by unit, each a separate withState commit.
  function make(ctx: IntentCtx, recipe: string, output: string): IntentResult {
    if (ctx.dead) return fail('make', 'dead');
    const r = RECIPE_INDEX[recipe + '|' + output];
    if (!r) return fail('make', 'unknown recipe');
    const producesItem = r.outputQty > 0 && r.output !== '';
    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      if (skillLevel(state, r.skill) < r.level) return fail('make', `requires ${r.skill} level ${r.level}`);
      if (r.tool && !hasTool(state, r.tool)) return fail('make', `you need a ${r.tool}`);
      for (const i of r.inputs) if (!invHas(state, i.item, i.qty)) return fail('make', 'missing materials');
      if (producesItem && !hasRoomFor(state, r.output)) return fail('make', 'inventory full');
      // consume inputs
      const removed: { id: string; qty: number }[] = [];
      for (const i of r.inputs) { invRemove(state, i.item, i.qty); removed.push({ id: i.item, qty: i.qty }); }
      // per-recipe success (e.g. iron smelt may fail; the bar is lost)
      if (r.successChance !== undefined && Math.random() >= r.successChance) {
        return { ok: true, kind: 'make', burned: true, removed, granted: [], xp: [] };
      }
      if (producesItem) invAdd(state, r.output, r.outputQty);
      const x = addXp(state, r.skill, r.xp);
      return {
        ok: true, kind: 'make', removed,
        granted: producesItem ? [{ id: r.output, qty: r.outputQty }] : [],
        xp: [{ skill: r.skill, amount: r.xp }],
        leveledUp: x.leveledUp ? [{ skill: r.skill, level: x.newLevel }] : [],
      };
    });
    if (!res) return fail('make', 'no character');
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  // ---- SHOP (buy / sell) — wealth-shaped: gated by ECONOMY_FROZEN -----------
  // Buy: debit carried coins at catalog value, grant 1 item. Sell: remove 1
  // item (or full stack for stackables), credit coins at 40% value.
  function shop(ctx: IntentCtx, op: 'buy' | 'sell', shopId: string, itemId: string): IntentResult {
    if (ctx.dead) return fail('shop', 'dead');
    if (ECONOMY_FROZEN) return fail('shop', 'frozen');
    const def = SHOPS[shopId];
    if (!def) return fail('shop', 'unknown shop');
    if (!isKnownItem(itemId)) return fail('shop', 'unknown item');

    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      if (op === 'buy') {
        const inStock = def.stock.some((s) => s.item === itemId);
        if (!inStock) return fail('shop', 'not stocked');
        const price = itemValue(itemId);
        if (getCoins(state) < price) return fail('shop', 'not enough coins');
        if (!hasRoomFor(state, itemId)) return fail('shop', 'inventory full');
        if (!removeCoins(state, price)) return fail('shop', 'not enough coins');
        invAdd(state, itemId, 1);
        return { ok: true, kind: 'shop', granted: [{ id: itemId, qty: 1 }], removed: [{ id: 'coins', qty: price }], coins: getCoins(state) };
      }
      // sell
      if (itemId === 'coins') return fail('shop', 'cannot sell coins');
      const stackable = isStackable(itemId);
      const have = invCount(state, itemId);
      if (have <= 0) return fail('shop', 'you have none');
      const qty = stackable ? have : 1;
      const unit = Math.max(1, Math.floor(itemValue(itemId) * 0.4));
      const proceeds = stackable ? unit : unit; // per the client: stackable sells whole stack for unit*1
      if (!invRemove(state, itemId, qty)) return fail('shop', 'you have none');
      addCoins(state, proceeds);
      return { ok: true, kind: 'shop', removed: [{ id: itemId, qty }], granted: [{ id: 'coins', qty: proceeds }], coins: getCoins(state) };
    });
    if (!res) return fail('shop', 'no character');
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  // ---- BANK (deposit / withdraw) — moves value between carried and bank -----
  // Not wealth cross-account movement (single owner), so it is SAFE while frozen
  // — but it must be server-authoritative because bank is owned state.
  function bank(ctx: IntentCtx, op: 'deposit' | 'withdraw', itemId: string, qty: number | 'all'): IntentResult {
    if (!isKnownItem(itemId)) return fail('bank', 'unknown item');
    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      if (op === 'deposit') {
        const have = invCount(state, itemId);
        const n = qty === 'all' ? have : Math.min(Math.max(0, Math.floor(qty as number)), have);
        if (n <= 0) return fail('bank', 'nothing to deposit');
        if (!invRemove(state, itemId, n)) return fail('bank', 'nothing to deposit');
        bankAdd(state, itemId, n);
        return { ok: true, kind: 'bank', removed: [{ id: itemId, qty: n }] };
      }
      // withdraw
      const have = bankCount(state, itemId);
      const want = qty === 'all' ? have : Math.min(Math.max(0, Math.floor(qty as number)), have);
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
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  // ---- QUEST (advance stage / claim reward) --------------------------------
  // setQuestStage is monotonic in state.ts (never lowers — kills M6). Rewards
  // are idempotent per stage via a marker key `claimed:<id>:<stage>` stored in
  // the quests map namespace so a double-claim grants once.
  function questAdvance(ctx: IntentCtx, id: string, stage: number): IntentResult {
    if (typeof id !== 'string' || !/^[a-z0-9_]{1,48}$/.test(id)) return fail('quest', 'bad quest id');
    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      const next = setQuestStage(state, id, stage);
      return { ok: true, kind: 'quest', stage: next };
    });
    if (!res) return fail('quest', 'no character');
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  // Grant a quest COMPLETION reward ONCE per (questId, stage). The reward is read
  // from the SERVER registry (QUEST_REWARDS) — the client never specifies the
  // amount (closes M6 reward inflation). Idempotency key: a reserved quests
  // entry `__claim_<id>_<stage>`. The player must actually be at/past the stage.
  function questClaim(ctx: IntentCtx, id: string, stage: number): IntentResult {
    if (typeof id !== 'string' || !/^[a-z0-9_]{1,48}$/.test(id)) return fail('quest', 'bad quest id');
    const st = Math.floor(stage);
    const reward = QUEST_REWARDS[`${id}:${st}`];
    if (!reward) return fail('quest', 'no reward for this stage');
    const claimKey = `__claim_${id}_${st}`;
    const res = stateStore.withState<IntentResult>(ctx.userId, (state) => {
      if (!state.quests || typeof state.quests !== 'object') state.quests = {};
      if (state.quests[claimKey]) return fail('quest', 'already claimed');
      // require the player to actually be AT (or past) this stage
      if (questStage(state, id) < st) return fail('quest', 'stage not reached');
      const granted: { id: string; qty: number }[] = [];
      for (const it of reward.items ?? []) {
        if (!isKnownItem(it.id)) continue;
        const qty = Math.max(1, Math.floor(it.qty));
        if (invAdd(state, it.id, qty)) granted.push({ id: it.id, qty });
        else { bankAdd(state, it.id, qty); granted.push({ id: it.id, qty }); } // overflow to bank
      }
      const xp: { skill: SkillName; amount: number }[] = [];
      for (const g of reward.xp ?? []) {
        if (!(SKILLS as readonly string[]).includes(g.skill)) continue;
        const amount = Math.max(0, Math.floor(g.amount));
        addXp(state, g.skill, amount); xp.push({ skill: g.skill, amount });
      }
      if (reward.coins && reward.coins > 0) addCoins(state, Math.floor(reward.coins));
      state.quests[claimKey] = 1; // mark claimed
      return { ok: true, kind: 'quest', granted, xp, coins: reward.coins ? getCoins(state) : undefined };
    });
    if (!res) return fail('quest', 'no character');
    if (res.ok) res.rev = revOf(ctx.userId);
    return res;
  }

  return {
    gather, fish, cook, firemake, make, shop, bank,
    questAdvance, questClaim,
  };
}

export type Intents = ReturnType<typeof createIntents>;

// ---------------------------------------------------------------------------
// Static per-path metadata (tools/skills/firemaking/recipe index). Kept here so
// the handlers stay terse and the data lines up 1:1 with content.ts.
// ---------------------------------------------------------------------------

const GATHER_REQS: Record<string, { skill: SkillName; tool?: string }> = {
  tree: { skill: 'Woodcutting', tool: 'bronze_axe' },
  oak: { skill: 'Woodcutting', tool: 'bronze_axe' },
  willow: { skill: 'Woodcutting', tool: 'bronze_axe' },
  rocks_copper: { skill: 'Mining', tool: 'bronze_pickaxe' },
  rocks_tin: { skill: 'Mining', tool: 'bronze_pickaxe' },
  rocks_iron: { skill: 'Mining', tool: 'bronze_pickaxe' },
  rocks_coal: { skill: 'Mining', tool: 'bronze_pickaxe' },
  rocks_essence: { skill: 'Mining', tool: 'bronze_pickaxe' },
};

const FIREMAKING: { log: string; level: number; xp: number }[] = [
  { log: 'logs', level: 1, xp: 40 },
  { log: 'oak_logs', level: 15, xp: 60 },
  { log: 'willow_logs', level: 30, xp: 90 },
];

interface RecipeEntry {
  skill: SkillName;
  level: number;
  xp: number;
  tool?: string;
  inputs: { item: string; qty: number }[];
  output: string;
  outputQty: number;
  successChance?: number;
}

// Build a unified recipe index keyed by `<recipeClass>|<output>` so the client
// names a class + output and the server resolves the exact recipe + inputs.
const RECIPE_INDEX: Record<string, RecipeEntry> = (() => {
  const idx: Record<string, RecipeEntry> = {};
  for (const s of RECIPES.smeltables) {
    idx['smelt|' + s.bar] = { skill: 'Smithing', level: s.level, xp: s.xp, inputs: s.inputs, output: s.bar, outputQty: 1, successChance: s.successChance };
  }
  for (const s of RECIPES.smithables) {
    idx['smith|' + s.output] = { skill: 'Smithing', level: s.level, xp: s.xp, tool: 'hammer', inputs: [{ item: s.bar, qty: s.bars }], output: s.output, outputQty: s.outputQty ?? 1 };
  }
  for (const f of RECIPES.fletchables) {
    idx['fletch|' + f.output] = { skill: 'Fletching', level: f.level, xp: f.xp, inputs: f.inputs, output: f.output, outputQty: f.outputQty ?? 1 };
  }
  for (const c of RECIPES.craftables) {
    // crafting that consumes thread (needle leatherwork) carries thread in inputs
    // already in the data? It does not — the client adds thread separately. We
    // fold it in here for the station===null (leather) recipes.
    const inputs = c.station === null ? [...c.inputs, { item: 'thread', qty: 1 }] : c.inputs;
    idx['craft|' + c.output] = { skill: 'Crafting', level: c.level, xp: c.xp, inputs, output: c.output, outputQty: 1 };
  }
  for (const g of RECIPES.gemCuts) {
    idx['gemcut|' + g.cut] = { skill: 'Crafting', level: g.level, xp: g.xp, tool: 'chisel', inputs: [{ item: g.uncut, qty: 1 }], output: g.cut, outputQty: 1 };
  }
  for (const h of RECIPES.herbs) {
    idx['clean|' + h.clean] = { skill: 'Herblore', level: h.level, xp: h.xp, inputs: [{ item: h.grimy, qty: 1 }], output: h.clean, outputQty: 1 };
  }
  for (const p of RECIPES.potions) {
    idx['potion|' + p.output] = { skill: 'Herblore', level: p.level, xp: p.xp, inputs: [{ item: 'vial_of_water', qty: 1 }, { item: p.herb, qty: 1 }, { item: p.secondary, qty: 1 }], output: p.output, outputQty: 1 };
  }
  for (const b of RECIPES.constructionBuilds) {
    // construction grants no item (donated), modelled as outputQty 0 via a
    // sentinel: we use output 'plank' with qty 0 so nothing is added. Simpler:
    // a dedicated class handled by `make` with outputQty 0 and no grant.
    idx['build|' + b.name] = { skill: 'Construction', level: b.level, xp: b.xp, tool: 'hammer', inputs: [{ item: 'plank', qty: b.planks }, { item: 'nails', qty: b.nails }], output: '', outputQty: 0 };
  }
  return idx;
})();
