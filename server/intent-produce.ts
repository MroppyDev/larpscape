// server/intent-produce.ts — server-authoritative resolution of the
// production/gathering paths that DON'T fit the built-in gather/fish/cook/
// firemake/make intents (docs/CONVERSION-CONTRACT.md §3 registry):
//
//   mine-gem    rocks_gem with a SERVER-rolled weighted gem table
//   thieve      pickpocket (npc-keyed loot from npcs.json) + market stalls
//   port-fish   lobster/swordfish/shark spots with a SERVER-rolled catch table
//   farm-plant  / farm-harvest  seed planting + crop harvest (server level/seed)
//   runecraft   essence -> runes at an altar (server multiplier)
//   tan         cowhide + coins -> leather (wealth-shaped: ECONOMY_FROZEN gate)
//   saw-planks  logs + coins -> planks (wealth-shaped)
//   pick        simple single-item gathers (flax / milk) — server validated
//   snare-check hunter bird-snare loot
//   train       skill-only XP grants (agility obstacles + lap bonus)
//
// Every handler validates INDEPENDENTLY against authoritative `state` (level vs
// SERVER xp, tool/inputs vs SERVER inventory, object@tile + range vs the baked
// map index, ECONOMY_FROZEN where wealth-shaped), rolls any randomness SERVER-
// side, mutates only via state.ts primitives inside ONE withState transaction,
// and returns the same { ok, kind, granted, removed, xp, ... } envelope the
// client applies through applyGrant. The client never authors the values.
//
// Self-registers at import time; imported for its side effect from
// server/index.ts. It does NOT edit intents.ts or intents-wire.ts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { MAP_W, terrain, key, T } from './world';
import { getSimTick, sim } from './sim';
import {
  getFarmPatch, setFarmPatch, getSnare, setSnare, getTrainCd, setTrainCd,
} from './world-progress';
import {
  AuthState, SkillName, isKnownItem,
  invAdd, invRemove, invRemoveItem, invHas, invCount, getCoins, removeCoins,
  addXp, skillLevel, parseInvSlot, maxHpFor, hpHeal,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

// ---------------------------------------------------------------------------
// Catalogue (same data the client reads — rates/levels never diverge).
// ---------------------------------------------------------------------------

interface RawItem { stackable?: boolean; buryXp?: number; edible?: { heals: number }; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');
function isStackable(id: string): boolean { return !!ITEMS[id]?.stackable; }

interface SkillObjData { level: number; xp: number; item: string; depleteChance: number; respawn: number; lowRate: number; highRate: number; }
const SKILL_OBJS = loadJson<{ skillObjs: Record<string, SkillObjData> }>('../data/objects.json').skillObjs;

interface Recipes { seeds: { seed: string; produce: string; level: number; plantXp: number; harvestXp: number; growTicks: number }[]; }
const RECIPES = loadJson<Recipes>('../data/recipes.json');

interface Pickpocket { level: number; xp: number; loot: { item: string; qty: [number, number] }[]; stunDmg: number; }
const NPCS = loadJson<Record<string, { pickpocket?: Pickpocket }>>('../data/npcs.json');

// Static world-object position index (same as intents.ts) so a stall/altar/spot
// intent can be validated against the tile the client named — you cannot steal
// from a stall that does not exist at that tile.
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

function nearNpc(cx: number, cy: number, defId: string, maxDist = 2): boolean {
  for (const n of sim.npcs) {
    if (n.dead || n.def.id !== defId) continue;
    if (chebyshev(cx, cy, n.x, n.y) <= maxDist) return true;
  }
  return false;
}

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

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

// Helper: run a withState mutation and stamp rev. Returns the no-character
// failure when the row is missing.
function tx(ctx: DomainCtx, kind: string, fn: (state: AuthState) => IntentResult): IntentResult {
  const res = ctx.store.withState<IntentResult>(ctx.userId, fn);
  if (!res) return fail(kind, 'no character');
  return stampRev(ctx.store, ctx, res);
}

// ===========================================================================
// MINE-GEM — rocks_gem rolls a weighted gem table (kept server-side so the
// drop can't be forced). { x, y }. Validates rock@tile + range + tool + level.
// ===========================================================================
const GEM_TABLE: { item: string; weight: number }[] = [
  { item: 'uncut_sapphire', weight: 50 },
  { item: 'uncut_emerald', weight: 30 },
  { item: 'uncut_ruby', weight: 20 },
];
function rollGem(): string {
  const total = GEM_TABLE.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * total;
  for (const g of GEM_TABLE) { r -= g.weight; if (r < 0) return g.item; }
  return GEM_TABLE[0].item;
}
registerIntentDomain('mine-gem', (ctx, payload) => {
  if (ctx.dead) return fail('mine-gem', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  const data = SKILL_OBJS.rocks_gem;
  if (!objectTypeAt(ox, oy, 'rocks_gem')) return fail('mine-gem', 'no such object here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('mine-gem', 'out of range');
  return tx(ctx, 'mine-gem', (state) => {
    const lvl = skillLevel(state, 'Mining');
    if (lvl < data.level) return fail('mine-gem', `requires Mining level ${data.level}`);
    if (!hasTool(state, 'bronze_pickaxe')) return fail('mine-gem', 'you need a pickaxe');
    if (freeSlots(state) === 0) return fail('mine-gem', 'inventory full');
    if (!successRoll(lvl, data.level, data.lowRate, data.highRate)) {
      return { ok: true, kind: 'mine-gem', granted: [], xp: [] };
    }
    const gem = rollGem();
    if (!invAdd(state, gem, 1)) return fail('mine-gem', 'inventory full');
    const x = addXp(state, 'Mining', data.xp);
    return {
      ok: true, kind: 'mine-gem', granted: [{ id: gem, qty: 1 }],
      xp: [{ skill: 'Mining' as SkillName, amount: data.xp }],
      leveledUp: x.leveledUp ? [{ skill: 'Mining' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// THIEVE — pickpocket an NPC (npc-keyed loot from npcs.json) or steal from a
// market stall (object@tile). One attempt; server rolls success + loot. On a
// failed roll it returns ok with an EMPTY grant (the client plays the stun
// cosmetic) — but mints nothing. { target, x?, y? }
// target = npc id (man/desert_bandit/...) OR a stall type (bake_stall/gem_stall)
// ===========================================================================
interface StallDef { type: string; level: number; xp: number; lowRate: number; highRate: number; table: { item: string; weight: number }[]; }
const STALLS: Record<string, StallDef> = {
  bake_stall: {
    type: 'bake_stall', level: 5, xp: 16, lowRate: 0.85, highRate: 0.99,
    table: [{ item: 'bread', weight: 90 }, { item: 'cake', weight: 10 }],
  },
  gem_stall: {
    type: 'gem_stall', level: 30, xp: 40, lowRate: 0.55, highRate: 0.95,
    table: [{ item: 'uncut_sapphire', weight: 60 }, { item: 'uncut_emerald', weight: 30 }, { item: 'uncut_ruby', weight: 10 }],
  },
  silk_stall: {
    type: 'silk_stall', level: 20, xp: 28, lowRate: 0.6, highRate: 0.95,
    table: [{ item: 'silk', weight: 80 }, { item: 'bolt_of_cloth', weight: 20 }],
  },
  fruit_stall: {
    type: 'fruit_stall', level: 25, xp: 34, lowRate: 0.65, highRate: 0.97,
    table: [{ item: 'apple', weight: 60 }, { item: 'orange', weight: 40 }],
  },
  coffer_stall: {
    type: 'coffer_stall', level: 55, xp: 84, lowRate: 0.4, highRate: 0.9,
    table: [{ item: 'coin_pouch', weight: 70 }, { item: 'hum_coin', weight: 25 }, { item: 'uncut_ruby', weight: 5 }],
  },
  relic_stall: {
    type: 'relic_stall', level: 75, xp: 145, lowRate: 0.3, highRate: 0.85,
    table: [{ item: 'resonant_shard', weight: 60 }, { item: 'uncut_diamond', weight: 30 }, { item: 'gold_bar', weight: 10 }],
  },
};
function rollTable(table: { item: string; weight: number }[]): string {
  const total = table.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * total;
  for (const g of table) { r -= g.weight; if (r < 0) return g.item; }
  return table[0].item;
}
registerIntentDomain('thieve', (ctx, payload) => {
  if (ctx.dead) return fail('thieve', 'dead');
  const target = String(payload.target ?? '');
  const stall = STALLS[target];
  if (stall) {
    const ox = num(payload.x), oy = num(payload.y);
    if (!objectTypeAt(ox, oy, stall.type)) return fail('thieve', 'no such stall here');
    // Tolerance of 4 (not 2): the client's position is reported on a 600ms
    // heartbeat, so when running (2 tiles/tick) the server view can trail the
    // real position by a tile or two at the moment the intent arrives. handleSwing
    // uses the same cadence slack; without it, valid steals fail 'out of range'.
    if (chebyshev(ctx.x, ctx.y, ox, oy) > 4) return fail('thieve', 'out of range');
    return tx(ctx, 'thieve', (state) => {
      const lvl = skillLevel(state, 'Thieving');
      if (lvl < stall.level) return fail('thieve', `requires Thieving level ${stall.level}`);
      if (freeSlots(state) === 0) return fail('thieve', 'inventory full');
      if (!successRoll(lvl, stall.level, stall.lowRate, stall.highRate)) {
        // miss: ok with an empty grant — the client plays the stun cosmetic.
        return { ok: true, kind: 'thieve', granted: [], xp: [] };
      }
      const item = rollTable(stall.table);
      if (!invAdd(state, item, 1)) return fail('thieve', 'inventory full');
      const x = addXp(state, 'Thieving', stall.xp);
      return {
        ok: true, kind: 'thieve', granted: [{ id: item, qty: 1 }],
        xp: [{ skill: 'Thieving' as SkillName, amount: stall.xp }],
        leveledUp: x.leveledUp ? [{ skill: 'Thieving' as SkillName, level: x.newLevel }] : [],
      };
    });
  }
  // NPC pickpocket — must be adjacent to a live instance of that def.
  const pp = NPCS[target]?.pickpocket;
  if (!pp) return fail('thieve', 'cannot pickpocket that');
  if (!nearNpc(ctx.x, ctx.y, target)) return fail('thieve', 'out of range');
  return tx(ctx, 'thieve', (state) => {
    const lvl = skillLevel(state, 'Thieving');
    if (lvl < pp.level) return fail('thieve', `requires Thieving level ${pp.level}`);
    if (freeSlots(state) === 0 && !pp.loot.every((l) => isStackable(l.item) && invCount(state, l.item) > 0)) {
      return fail('thieve', 'inventory full');
    }
    if (!successRoll(lvl, pp.level, 0.7, 0.95)) {
      const max = skillLevel(state, 'Hitpoints');
      // Apply stun damage to the LIVE combat HP (ctx.hp), not the stale save copy,
      // so a failed pickpocket mid-fight can't snap HP up to the last-flushed value.
      const cur = Math.max(0, Math.min(max, ctx.hp ?? state.curHp ?? max));
      const dmg = Math.max(1, Math.floor(pp.stunDmg));
      state.curHp = Math.max(1, cur - dmg);
      return { ok: true, kind: 'thieve', granted: [], xp: [], hp: state.curHp };
    }
    const granted: { id: string; qty: number }[] = [];
    for (const loot of pp.loot) {
      // each listed loot has a roll: coins always, rares (qty min 1) at 5%.
      const isRare = loot.item !== 'coins' && !isStackable(loot.item);
      if (isRare && Math.random() >= 0.05) continue;
      const qty = randInt(loot.qty[0], loot.qty[1]);
      if (qty <= 0) continue;
      if (invAdd(state, loot.item, qty)) granted.push({ id: loot.item, qty });
    }
    const x = addXp(state, 'Thieving', pp.xp);
    return {
      ok: true, kind: 'thieve', granted,
      xp: [{ skill: 'Thieving' as SkillName, amount: pp.xp }],
      leveledUp: x.leveledUp ? [{ skill: 'Thieving' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// PORT-FISH — high-tier fishing spots with a SERVER-rolled catch table.
// { spot:'lobster'|'harpoon', x, y }. Validates spot@tile + range + tool + level.
// ===========================================================================
registerIntentDomain('port-fish', (ctx, payload) => {
  if (ctx.dead) return fail('port-fish', 'dead');
  const spot = payload.spot === 'harpoon' ? 'harpoon' : 'lobster';
  const objType = spot === 'lobster' ? 'lobster_spot' : 'harpoon_spot';
  const ox = num(payload.x), oy = num(payload.y);
  if (!objectTypeAt(ox, oy, objType)) return fail('port-fish', 'no fishing spot here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('port-fish', 'out of range');
  return tx(ctx, 'port-fish', (state) => {
    const lvl = skillLevel(state, 'Fishing');
    if (spot === 'lobster') {
      if (!hasTool(state, 'lobster_pot')) return fail('port-fish', 'you need a lobster pot');
      if (lvl < 40) return fail('port-fish', 'requires Fishing level 40');
      if (freeSlots(state) === 0) return fail('port-fish', 'inventory full');
      if (!successRoll(lvl, 40, 0.2, 0.75)) return { ok: true, kind: 'port-fish', granted: [], xp: [] };
      invAdd(state, 'raw_lobster', 1);
      const x = addXp(state, 'Fishing', 90);
      return { ok: true, kind: 'port-fish', granted: [{ id: 'raw_lobster', qty: 1 }], xp: [{ skill: 'Fishing' as SkillName, amount: 90 }], leveledUp: x.leveledUp ? [{ skill: 'Fishing' as SkillName, level: x.newLevel }] : [] };
    }
    // harpoon: swordfish at 50; 30% shark at 76+
    if (!hasTool(state, 'harpoon')) return fail('port-fish', 'you need a harpoon');
    if (lvl < 50) return fail('port-fish', 'requires Fishing level 50');
    if (freeSlots(state) === 0) return fail('port-fish', 'inventory full');
    if (!successRoll(lvl, 50, 0.15, 0.7)) return { ok: true, kind: 'port-fish', granted: [], xp: [] };
    if (lvl >= 76 && Math.random() < 0.3) {
      invAdd(state, 'raw_shark', 1);
      const x = addXp(state, 'Fishing', 110);
      return { ok: true, kind: 'port-fish', granted: [{ id: 'raw_shark', qty: 1 }], xp: [{ skill: 'Fishing' as SkillName, amount: 110 }], leveledUp: x.leveledUp ? [{ skill: 'Fishing' as SkillName, level: x.newLevel }] : [] };
    }
    invAdd(state, 'raw_swordfish', 1);
    const x = addXp(state, 'Fishing', 100);
    return { ok: true, kind: 'port-fish', granted: [{ id: 'raw_swordfish', qty: 1 }], xp: [{ skill: 'Fishing' as SkillName, amount: 100 }], leveledUp: x.leveledUp ? [{ skill: 'Fishing' as SkillName, level: x.newLevel }] : [] };
  });
});

// ===========================================================================
// FARM-PLANT / FARM-HARVEST — seed planting + crop harvest. The grow timer is
// world-shared cosmetic state the client tracks; the server validates the seed
// + level on plant (consuming the seed + plant xp) and grants produce + harvest
// xp on harvest. { seed } / { produce }
// ===========================================================================
registerIntentDomain('farm-rake', (ctx, payload) => {
  if (ctx.dead) return fail('farm-rake', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  if (!objectTypeAt(ox, oy, 'farming_patch')) return fail('farm-rake', 'no patch here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('farm-rake', 'out of range');
  return tx(ctx, 'farm-rake', (state) => {
    if (!hasTool(state, 'rake')) return fail('farm-rake', 'you need a rake');
    const patch = getFarmPatch(state, ox, oy);
    if (patch?.stage === 'seedling' || patch?.stage === 'grown') return fail('farm-rake', 'crops growing');
    if (patch?.stage === 'raked') return fail('farm-rake', 'already raked');
    setFarmPatch(state, ox, oy, { stage: 'raked' });
    return { ok: true, kind: 'farm-rake' };
  });
});
registerIntentDomain('farm-plant', (ctx, payload) => {
  if (ctx.dead) return fail('farm-plant', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  const seedId = String(payload.seed ?? '');
  const s = RECIPES.seeds.find((ss) => ss.seed === seedId);
  if (!s) return fail('farm-plant', 'not a seed');
  if (!objectTypeAt(ox, oy, 'farming_patch')) return fail('farm-plant', 'no patch here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('farm-plant', 'out of range');
  return tx(ctx, 'farm-plant', (state) => {
    const patch = getFarmPatch(state, ox, oy);
    if (patch?.stage === 'seedling' || patch?.stage === 'grown') return fail('farm-plant', 'already planted');
    if (patch?.stage !== 'raked') return fail('farm-plant', 'patch needs raking');
    if (!hasTool(state, 'seed_dibber')) return fail('farm-plant', 'you need a seed dibber');
    if (skillLevel(state, 'Farming') < s.level) return fail('farm-plant', `requires Farming level ${s.level}`);
    if (!invRemove(state, s.seed, 1)) return fail('farm-plant', 'no seed');
    setFarmPatch(state, ox, oy, { stage: 'seedling', seed: s.seed, plantedAt: getSimTick() });
    const x = addXp(state, 'Farming', s.plantXp);
    return {
      ok: true, kind: 'farm-plant', removed: [{ id: s.seed, qty: 1 }],
      xp: [{ skill: 'Farming' as SkillName, amount: s.plantXp }],
      leveledUp: x.leveledUp ? [{ skill: 'Farming' as SkillName, level: x.newLevel }] : [],
    };
  });
});
registerIntentDomain('farm-harvest', (ctx, payload) => {
  if (ctx.dead) return fail('farm-harvest', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  const produce = String(payload.produce ?? '');
  const s = RECIPES.seeds.find((ss) => ss.produce === produce);
  if (!s) return fail('farm-harvest', 'not a crop');
  if (!objectTypeAt(ox, oy, 'farming_patch')) return fail('farm-harvest', 'no patch here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('farm-harvest', 'out of range');
  return tx(ctx, 'farm-harvest', (state) => {
    let patch = getFarmPatch(state, ox, oy);
    if (patch?.stage === 'seedling' && patch.plantedAt !== undefined && patch.seed) {
      const seedDef = RECIPES.seeds.find((ss) => ss.seed === patch!.seed);
      if (seedDef && getSimTick() >= patch.plantedAt + seedDef.growTicks) {
        patch = { stage: 'grown', produce: seedDef.produce, plantedAt: patch.plantedAt, seed: patch.seed };
        setFarmPatch(state, ox, oy, patch);
      }
    }
    if (!patch || patch.stage !== 'grown' || patch.produce !== produce) return fail('farm-harvest', 'nothing to harvest');
    if (freeSlots(state) === 0 && invCount(state, produce) === 0) return fail('farm-harvest', 'inventory full');
    const n = randInt(3, 5);
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (freeSlots(state) === 0 && invCount(state, produce) === 0) break;
      if (invAdd(state, produce, 1)) got++;
    }
    if (got <= 0) return fail('farm-harvest', 'inventory full');
    setFarmPatch(state, ox, oy, null);
    const total = s.harvestXp * got;
    const x = addXp(state, 'Farming', total);
    return {
      ok: true, kind: 'farm-harvest', granted: [{ id: produce, qty: got }],
      xp: [{ skill: 'Farming' as SkillName, amount: total }],
      leveledUp: x.leveledUp ? [{ skill: 'Farming' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// RUNECRAFT — bind ALL held rune essence into runes at an altar. The altar's
// rune kind + level + xp-per-essence + multiplier formula are server data.
// { altar:'air'|'fire' }
// ===========================================================================
interface AltarDef {
  rune: string; level: number; xpPer: number; div: number;
  essence: string;
  key?: { talisman: string; tiara: string };
}
const ALTARS: Record<string, AltarDef> = {
  // low tier — rune_essence, no key required
  air:   { rune: 'air_rune',   level: 1,  xpPer: 5,   div: 11, essence: 'rune_essence' },
  mind:  { rune: 'mind_rune',  level: 2,  xpPer: 5.5, div: 11, essence: 'rune_essence' },
  water: { rune: 'water_rune', level: 5,  xpPer: 6,   div: 9,  essence: 'rune_essence' },
  earth: { rune: 'earth_rune', level: 9,  xpPer: 6.5, div: 9,  essence: 'rune_essence' },
  fire:  { rune: 'fire_rune',  level: 14, xpPer: 7,   div: 14, essence: 'rune_essence' },
  // high tier — pure_essence, keyed by a held talisman OR the matching tiara worn
  body:    { rune: 'body_rune',    level: 20, xpPer: 7.5,  div: 14, essence: 'pure_essence', key: { talisman: 'body_talisman',    tiara: 'body_tiara' } },
  cosmic:  { rune: 'cosmic_rune',  level: 27, xpPer: 8,    div: 16, essence: 'pure_essence', key: { talisman: 'cosmic_talisman',  tiara: 'cosmic_tiara' } },
  chord:   { rune: 'chord_rune',   level: 44, xpPer: 9,    div: 20, essence: 'pure_essence', key: { talisman: 'chord_talisman',   tiara: 'chord_tiara' } },
  law:     { rune: 'law_rune',     level: 54, xpPer: 9.5,  div: 22, essence: 'pure_essence', key: { talisman: 'law_talisman',     tiara: 'law_tiara' } },
  death:   { rune: 'death_rune',   level: 65, xpPer: 10,   div: 23, essence: 'pure_essence', key: { talisman: 'death_talisman',   tiara: 'death_tiara' } },
  discord: { rune: 'discord_rune', level: 70, xpPer: 10.5, div: 23, essence: 'pure_essence', key: { talisman: 'discord_talisman', tiara: 'discord_tiara' } },
  blood:   { rune: 'blood_rune',   level: 77, xpPer: 10.5, div: 24, essence: 'pure_essence', key: { talisman: 'blood_talisman',   tiara: 'blood_tiara' } },
  soul:    { rune: 'soul_rune',    level: 90, xpPer: 11,   div: 25, essence: 'pure_essence', key: { talisman: 'soul_talisman',    tiara: 'soul_tiara' } },
};
registerIntentDomain('runecraft', (ctx, payload) => {
  if (ctx.dead) return fail('runecraft', 'dead');
  const altarKey = String(payload.altar ?? '');
  const a = ALTARS[altarKey];
  if (!a) return fail('runecraft', 'unknown altar');
  // each altar key validates against its own object type; 'air' also accepts
  // the legacy plain 'altar' so the original air temple keeps working.
  const atAltar = nearObject(ctx.x, ctx.y, `${altarKey}_altar`)
    || (altarKey === 'air' && nearObject(ctx.x, ctx.y, 'altar'));
  if (!atAltar) return fail('runecraft', 'not near an altar');
  return tx(ctx, 'runecraft', (state) => {
    const lvl = skillLevel(state, 'Runecraft');
    if (lvl < a.level) return fail('runecraft', `requires Runecraft level ${a.level}`);
    if (a.key) {
      const worn = state.equipment?.head?.id === a.key.tiara;
      if (!worn && !invHas(state, a.key.talisman, 1)) {
        return fail('runecraft', 'the altar does not answer without its talisman (held) or tiara (worn)');
      }
    }
    const n = invCount(state, a.essence);
    if (n === 0) return fail('runecraft', a.essence === 'pure_essence' ? 'you need pure essence' : 'you need rune essence');
    const mult = Math.floor(1 + lvl / a.div);
    if (!invRemove(state, a.essence, n)) return fail('runecraft', 'you need essence');
    // Guard the grant: if the rune stack would overflow MAX_QTY, invAdd adds
    // nothing and the consumed essence would be destroyed. Re-add the essence and
    // abort so the player never loses it (mirrors the refund pattern elsewhere).
    if (!invAdd(state, a.rune, n * mult)) {
      invAdd(state, a.essence, n);
      return fail('runecraft', 'you have too many of that rune');
    }
    const xp = n * a.xpPer;
    const x = addXp(state, 'Runecraft', xp);
    return {
      ok: true, kind: 'runecraft',
      removed: [{ id: a.essence, qty: n }],
      granted: [{ id: a.rune, qty: n * mult }],
      xp: [{ skill: 'Runecraft' as SkillName, amount: xp }],
      leveledUp: x.leveledUp ? [{ skill: 'Runecraft' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// TAN — the tanner turns cowhide into leather at one coin per hide. Wealth-
// shaped (spends coins), so gated by ECONOMY_FROZEN. Tans as many as the player
// can pay for (min of hides/coins), one batch.
// ===========================================================================
registerIntentDomain('tan', (ctx) => {
  if (ctx.dead) return fail('tan', 'dead');
  if (ctx.frozen) return fail('tan', 'frozen');
  return tx(ctx, 'tan', (state) => {
    const hides = invCount(state, 'cowhide');
    if (hides === 0) return fail('tan', 'no cowhides');
    const n = Math.min(hides, getCoins(state));
    if (n === 0) return fail('tan', 'not enough coins');
    if (!invRemove(state, 'cowhide', n)) return fail('tan', 'no cowhides');
    if (!removeCoins(state, n)) { invAdd(state, 'cowhide', n); return fail('tan', 'not enough coins'); }
    invAdd(state, 'leather', n);
    return {
      ok: true, kind: 'tan',
      removed: [{ id: 'cowhide', qty: n }, { id: 'coins', qty: n }],
      granted: [{ id: 'leather', qty: n }],
      coins: getCoins(state),
    };
  });
});

// ===========================================================================
// SAW-PLANKS — the carpenter saws logs into planks at 10 coins per log. Wealth-
// shaped (spends coins), gated by ECONOMY_FROZEN. Up to 5 per request.
// ===========================================================================
registerIntentDomain('saw-planks', (ctx) => {
  if (ctx.dead) return fail('saw-planks', 'dead');
  if (ctx.frozen) return fail('saw-planks', 'frozen');
  return tx(ctx, 'saw-planks', (state) => {
    let made = 0, spent = 0;
    for (let i = 0; i < 5; i++) {
      if (!invHas(state, 'logs', 1) || getCoins(state) < 10) break;
      if (!invRemove(state, 'logs', 1)) break;
      if (!removeCoins(state, 10)) { invAdd(state, 'logs', 1); break; }
      invAdd(state, 'plank', 1); made++; spent += 10;
    }
    if (made === 0) return fail('saw-planks', 'no logs or coins');
    return {
      ok: true, kind: 'saw-planks',
      removed: [{ id: 'logs', qty: made }, { id: 'coins', qty: spent }],
      granted: [{ id: 'plank', qty: made }],
      coins: getCoins(state),
    };
  });
});

// ===========================================================================
// PICK — simple single-item gathers with no random table: flax picking and cow
// milking. { what:'flax'|'milk' }. Milk consumes a bucket -> bucket_of_milk.
// ===========================================================================
registerIntentDomain('pick', (ctx, payload) => {
  if (ctx.dead) return fail('pick', 'dead');
  const what = String(payload.what ?? '');
  if (what === 'flax') {
    const ox = num(payload.x), oy = num(payload.y);
    if (!objectTypeAt(ox, oy, 'flax_plant')) return fail('pick', 'no flax here');
    if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('pick', 'out of range');
    return tx(ctx, 'pick', (state) => {
      if (!hasRoomFor(state, 'flax')) return fail('pick', 'inventory full');
      if (!invAdd(state, 'flax', 1)) return fail('pick', 'inventory full');
      return { ok: true, kind: 'pick', granted: [{ id: 'flax', qty: 1 }] };
    });
  }
  if (what === 'milk') {
    if (!nearNpc(ctx.x, ctx.y, 'cow')) return fail('pick', 'out of range');
    return tx(ctx, 'pick', (state) => {
      if (!invHas(state, 'bucket', 1)) return fail('pick', 'you need an empty bucket');
      if (!invRemove(state, 'bucket', 1)) return fail('pick', 'you need an empty bucket');
      invAdd(state, 'bucket_of_milk', 1);
      return { ok: true, kind: 'pick', removed: [{ id: 'bucket', qty: 1 }], granted: [{ id: 'bucket_of_milk', qty: 1 }] };
    });
  }
  return fail('pick', 'cannot pick that');
});

// ===========================================================================
// SNARE-LAY — consume one bird_snare to set a trap. The placed world object is
// cosmetic the client owns; the server just removes the snare item (owned).
// ===========================================================================
registerIntentDomain('snare-lay', (ctx, payload) => {
  if (ctx.dead) return fail('snare-lay', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 1) return fail('snare-lay', 'out of range');
  const t = terrain[key(ox, oy)];
  if (t !== T.GRASS && t !== T.FLOWERS) return fail('snare-lay', 'not open grass');
  return tx(ctx, 'snare-lay', (state) => {
    if (getSnare(state, ox, oy)) return fail('snare-lay', 'snare already here');
    if (!invRemove(state, 'bird_snare', 1)) return fail('snare-lay', 'no snare');
    const tick = getSimTick();
    setSnare(state, ox, oy, { laidAt: tick, catchAt: tick + randInt(15, 40) });
    return { ok: true, kind: 'snare-lay', removed: [{ id: 'bird_snare', qty: 1 }] };
  });
});

// ===========================================================================
// SNARE-CHECK — server-owned snare timer; caught roll is server-side.
// { x, y }
// ===========================================================================
registerIntentDomain('snare-check', (ctx, payload) => {
  if (ctx.dead) return fail('snare-check', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('snare-check', 'out of range');
  return tx(ctx, 'snare-check', (state) => {
    const snare = getSnare(state, ox, oy);
    if (!snare) return fail('snare-check', 'no snare here');
    setSnare(state, ox, oy, null);
    const tick = getSimTick();
    const ready = tick >= snare.catchAt;
    const caught = ready && Math.random() < 0.65;
    if (!caught) {
      invAdd(state, 'bird_snare', 1);
      return { ok: true, kind: 'snare-check', granted: [{ id: 'bird_snare', qty: 1 }] };
    }
    if (freeSlots(state) < 3) return fail('snare-check', 'inventory full');
    invAdd(state, 'bird_snare', 1);
    invAdd(state, 'raw_bird_meat', 1);
    invAdd(state, 'feather', 2);
    const x = addXp(state, 'Hunter', 34);
    return {
      ok: true, kind: 'snare-check',
      granted: [{ id: 'bird_snare', qty: 1 }, { id: 'raw_bird_meat', qty: 1 }, { id: 'feather', qty: 2 }],
      xp: [{ skill: 'Hunter' as SkillName, amount: 34 }],
      leveledUp: x.leveledUp ? [{ skill: 'Hunter' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// TRAIN — skill-only XP grants for actions that grant no item (agility
// obstacles + lap bonus). The server owns the per-obstacle/lap xp from a data
// table; the client supplies only the obstacle key, never the amount.
// { obstacle } where obstacle is a key in AGILITY_XP.
// ===========================================================================
const AGILITY_XP: Record<string, { skill: SkillName; level: number; xp: number }> = {
  // castle course (content.ts)
  agility_log: { skill: 'Agility', level: 1, xp: 12 },
  agility_rope: { skill: 'Agility', level: 5, xp: 15 },
  agility_wall: { skill: 'Agility', level: 10, xp: 18 },
  agility_ledge: { skill: 'Agility', level: 15, xp: 20 },
  agility_lap: { skill: 'Agility', level: 1, xp: 60 },
  // frostpeak course (region_frostpeak.ts)
  ice_ledge: { skill: 'Agility', level: 30, xp: 25 },
  rope_bridge: { skill: 'Agility', level: 30, xp: 28 },
  rock_climb: { skill: 'Agility', level: 30, xp: 32 },
  snow_slope: { skill: 'Agility', level: 30, xp: 35 },
  frost_lap: { skill: 'Agility', level: 30, xp: 150 },
};
const LAP_KEYS = new Set(['agility_lap', 'frost_lap']);
const OBSTACLE_COOLDOWN_MS = 3000;
const LAP_COOLDOWN_MS = 15000;
const trainLastMs = new Map<number, Record<string, number>>();

registerIntentDomain('train', (ctx, payload) => {
  if (ctx.dead) return fail('train', 'dead');
  const obstacle = String(payload.obstacle ?? '');
  const t = AGILITY_XP[obstacle];
  if (!t) return fail('train', 'unknown obstacle');
  const ox = num(payload.x), oy = num(payload.y);
  if (!LAP_KEYS.has(obstacle)) {
    if (!objectTypeAt(ox, oy, obstacle)) return fail('train', 'no such obstacle here');
    if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('train', 'out of range');
  } else if (chebyshev(ctx.x, ctx.y, ox, oy) > 4) {
    return fail('train', 'out of range');
  }
  const cdKey = LAP_KEYS.has(obstacle) ? obstacle : `${obstacle}@${ox},${oy}`;
  const need = LAP_KEYS.has(obstacle) ? LAP_COOLDOWN_MS : OBSTACLE_COOLDOWN_MS;
  const now = Date.now();
  const ram = trainLastMs.get(ctx.userId) ?? {};
  const lastRam = ram[cdKey] ?? 0;
  if (lastRam > 0 && now - lastRam < need) return fail('train', 'too soon');
  return tx(ctx, 'train', (state) => {
    const lastSave = getTrainCd(state, cdKey);
    if (lastSave > 0 && now - lastSave < need) return fail('train', 'too soon');
    if (skillLevel(state, t.skill) < t.level) return fail('train', `requires ${t.skill} level ${t.level}`);
    setTrainCd(state, cdKey, now);
    const nextRam = trainLastMs.get(ctx.userId) ?? {};
    nextRam[cdKey] = now;
    trainLastMs.set(ctx.userId, nextRam);
    const x = addXp(state, t.skill, t.xp);
    return {
      ok: true, kind: 'train',
      xp: [{ skill: t.skill, amount: t.xp }],
      leveledUp: x.leveledUp ? [{ skill: t.skill, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// BURY — bury bones for Prayer XP (data-driven buryXp from items.json).
// { item }. The client never supplies the XP amount.
// ===========================================================================
registerIntentDomain('bury', (ctx, payload) => {
  if (ctx.dead) return fail('bury', 'dead');
  const item = String(payload.item ?? '');
  const buryXp = ITEMS[item]?.buryXp;
  if (!buryXp || buryXp <= 0 || !isKnownItem(item)) return fail('bury', 'not buryable');
  const invSlot = parseInvSlot(payload.invSlot);
  return tx(ctx, 'bury', (state) => {
    const rm = invRemoveItem(state, item, 1, invSlot);
    if (!rm.ok) return fail('bury', 'you have none');
    const amount = buryXp;
    const x = addXp(state, 'Prayer', amount);
    return {
      ok: true, kind: 'bury',
      removed: [{ id: item, qty: 1, ...(rm.slot !== undefined ? { slot: rm.slot } : {}) }],
      xp: [{ skill: 'Prayer' as SkillName, amount }],
      leveledUp: x.leveledUp ? [{ skill: 'Prayer' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// EAT — eat food for HP (data-driven edible.heals from items.json). { item }.
// ===========================================================================
registerIntentDomain('eat', (ctx, payload) => {
  if (ctx.dead) return fail('eat', 'dead');
  const item = String(payload.item ?? '');
  const heals = ITEMS[item]?.edible?.heals;
  if (!heals || heals <= 0 || !isKnownItem(item)) return fail('eat', 'not edible');
  const invSlot = parseInvSlot(payload.invSlot);
  return tx(ctx, 'eat', (state) => {
    const rm = invRemoveItem(state, item, 1, invSlot);
    if (!rm.ok) return fail('eat', 'you have none');
    const max = skillLevel(state, 'Hitpoints');
    // Base the heal on the LIVE combat HP (ctx.hp) when connected, not the lazily
    // flushed save copy (state.curHp) — the latter lags combat damage by up to the
    // flush interval, so eating off it snapped HP back up to a stale value.
    const cur = Math.max(0, Math.min(max, ctx.hp ?? state.curHp ?? max));
    state.curHp = Math.min(max, cur + heals);
    return {
      ok: true, kind: 'eat',
      removed: [{ id: item, qty: 1, ...(rm.slot !== undefined ? { slot: rm.slot } : {}) }],
      hp: state.curHp,
    };
  });
});

// ===========================================================================
// CONSUME — drink a potion: validate it is held, remove ONE, and (data-driven)
// restore prayer for prayer_potion. attack/defence/super potions are flavor-
// only consumables in v1 (no stat boost), but the item is still owned state, so
// the removal MUST be server-authoritative. { item }. Only a fixed allow-list of
// drinkable potions is honoured; the restore amount comes from items.json, never
// the client. The restored prayer arrives via the save_reload push that every
// withState mutation triggers (the client re-syncs authoritative state).
// ===========================================================================
interface DrinkItem { restoresPrayer?: number; }
const DRINK_ITEMS = loadJson<Record<string, DrinkItem>>('../data/items.json');
const DRINKABLE = new Set(['attack_potion', 'defence_potion', 'super_attack', 'prayer_potion', 'strength_potion', 'restore_potion', 'energy_potion', 'steadying_brew', 'antiblight_tonic', 'super_strength', 'prayer_renewal', 'super_defence', 'ranging_potion', 'super_restore', 'extreme_attack', 'extreme_strength', 'truechord_draught']);
registerIntentDomain('consume', (ctx, payload) => {
  if (ctx.dead) return fail('consume', 'dead');
  const item = String(payload.item ?? '');
  if (!DRINKABLE.has(item) || !isKnownItem(item)) return fail('consume', 'not drinkable');
  const invSlot = parseInvSlot(payload.invSlot);
  return tx(ctx, 'consume', (state) => {
    const rm = invRemoveItem(state, item, 1, invSlot);
    if (!rm.ok) return fail('consume', 'you have none');
    const restore = DRINK_ITEMS[item]?.restoresPrayer;
    if (restore && restore > 0) {
      const max = skillLevel(state, 'Prayer');
      const cur = Math.max(0, Math.min(max, state.prayerPoints ?? max));
      state.prayerPoints = Math.min(max, cur + restore);
    }
    return {
      ok: true, kind: 'consume',
      removed: [{ id: item, qty: 1, ...(rm.slot !== undefined ? { slot: rm.slot } : {}) }],
      ...(restore && restore > 0 ? { prayerPoints: state.prayerPoints } : {}),
    };
  });
});

// ===========================================================================
// RECHARGE-PRAYER — restore prayer points to max (altar / recharge action).
// ===========================================================================
registerIntentDomain('recharge-prayer', (ctx) => {
  if (ctx.dead) return fail('recharge-prayer', 'dead');
  if (!nearObject(ctx.x, ctx.y, 'altar')) return fail('recharge-prayer', 'not near an altar');
  return tx(ctx, 'recharge-prayer', (state) => {
    const max = skillLevel(state, 'Prayer');
    state.prayerPoints = max;
    return { ok: true, kind: 'recharge-prayer', prayerPoints: max };
  });
});

// ===========================================================================
// PRAY-TOGGLE — activate/deactivate a prayer (server-owned activePrayers).
// ===========================================================================
interface PrayerDef { id: string; level: number; drain: number; boost: string; }
const PRAYERS: PrayerDef[] = (loadJson<{ prayers?: PrayerDef[] }>('../data/magic.json').prayers ?? []);

function activePrayerList(state: AuthState): string[] {
  const ap = state.activePrayers;
  return Array.isArray(ap) ? ap.filter((id): id is string => typeof id === 'string') : [];
}

registerIntentDomain('pray-toggle', (ctx, payload) => {
  if (ctx.dead) return fail('pray-toggle', 'dead');
  const id = String(payload.id ?? '');
  const def = PRAYERS.find((p) => p.id === id);
  if (!def) return fail('pray-toggle', 'unknown');
  return tx(ctx, 'pray-toggle', (state) => {
    const active = new Set(activePrayerList(state));
    if (active.has(id)) {
      active.delete(id);
    } else {
      if (skillLevel(state, 'Prayer') < def.level) return fail('pray-toggle', 'level');
      const pp = Math.max(0, state.prayerPoints ?? 0);
      if (pp <= 0) return fail('pray-toggle', 'empty');
      for (const other of PRAYERS) {
        if (other.boost === def.boost && other.id !== id) active.delete(other.id);
      }
      active.add(id);
    }
    state.activePrayers = [...active];
    return {
      ok: true, kind: 'pray-toggle',
      prayerPoints: state.prayerPoints ?? 0,
      activePrayers: state.activePrayers,
    };
  });
});

// ===========================================================================
// HEAL — server-owned HP bumps (fountain, clinic chair, tick eater).
// { source: 'fountain' | 'dentist_chair' | 'tick_eater' }
// ===========================================================================
const HEAL_SOURCES: Record<string, { amount: number; chance?: number }> = {
  fountain: { amount: 1 },
  dentist_chair: { amount: 2, chance: 0.35 },
  tick_eater: { amount: 1, chance: 0.4 },
};

registerIntentDomain('heal', (ctx, payload) => {
  if (ctx.dead) return fail('heal', 'dead');
  const source = String(payload.source ?? '');
  const def = HEAL_SOURCES[source];
  if (!def) return fail('heal', 'unknown');
  if (source === 'fountain' && !nearObject(ctx.x, ctx.y, 'fountain')) return fail('heal', 'not near a fountain');
  if (source === 'dentist_chair' && !nearObject(ctx.x, ctx.y, 'dentist_chair')) return fail('heal', 'not near a chair');
  if (source === 'tick_eater' && !nearNpc(ctx.x, ctx.y, 'tick_eater_glen')) return fail('heal', 'not near Glen');
  return tx(ctx, 'heal', (state) => {
    const max = maxHpFor(state);
    // Reconcile the lazily-flushed save HP from the live combat HP before healing,
    // so a heal mid-fight bases off real HP (not a stale higher value) — same
    // near-immortality guard as eat/pickpocket-stun.
    if (typeof ctx.hp === 'number') state.curHp = Math.max(0, Math.min(max, ctx.hp));
    const cur = typeof state.curHp === 'number' ? state.curHp : max;
    if (cur >= max) return { ok: true, kind: 'heal', hp: cur, healed: false };
    if (def.chance !== undefined && Math.random() >= def.chance) {
      return { ok: true, kind: 'heal', hp: cur, healed: false };
    }
    const hp = hpHeal(state, def.amount);
    return { ok: true, kind: 'heal', hp, healed: true };
  });
});

// ===========================================================================
// MINE-VEIN — Untuned Mine ringing veins (rocks_ringing). Server rolls the
// level-scaled ore mix + resonant_shard bonus; tuned_pickaxe grants +10% success.
// { x, y }. Cosmetic depletion stays client-side.
// ===========================================================================
const VEIN_LEVEL = 10;
const VEIN_XP = 40;
const SHARD_CHANCE = 0.06;

function veinSuccess(state: AuthState): boolean {
  const lvl = skillLevel(state, 'Mining');
  let chance = 0.25 + Math.min(1, Math.max(0, (lvl - VEIN_LEVEL) / 30)) * 0.65;
  if (hasTool(state, 'tuned_pickaxe')) chance *= 1.1;
  return Math.random() < Math.min(0.95, chance);
}

function veinOre(lvl: number): string {
  const r = Math.random();
  if (lvl >= 20 && r < 0.3) return 'coal';
  if (r < 0.6) return 'iron_ore';
  if (r < 0.8) return 'copper_ore';
  return 'tin_ore';
}

registerIntentDomain('mine-vein', (ctx, payload) => {
  if (ctx.dead) return fail('mine-vein', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  if (!objectTypeAt(ox, oy, 'rocks_ringing')) return fail('mine-vein', 'no such object here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('mine-vein', 'out of range');
  return tx(ctx, 'mine-vein', (state) => {
    const lvl = skillLevel(state, 'Mining');
    if (lvl < VEIN_LEVEL) return fail('mine-vein', `requires Mining level ${VEIN_LEVEL}`);
    if (!hasTool(state, 'bronze_pickaxe') && !hasTool(state, 'tuned_pickaxe')) {
      return fail('mine-vein', 'you need a pickaxe');
    }
    if (freeSlots(state) === 0) return fail('mine-vein', 'inventory full');
    if (!veinSuccess(state)) {
      return { ok: true, kind: 'mine-vein', granted: [], xp: [] };
    }
    const ore = veinOre(lvl);
    const granted: { id: string; qty: number }[] = [];
    if (!invAdd(state, ore, 1)) return fail('mine-vein', 'inventory full');
    granted.push({ id: ore, qty: 1 });
    const x = addXp(state, 'Mining', VEIN_XP);
    if (Math.random() < SHARD_CHANCE && hasRoomFor(state, 'resonant_shard')) {
      if (invAdd(state, 'resonant_shard', 1)) granted.push({ id: 'resonant_shard', qty: 1 });
    }
    return {
      ok: true, kind: 'mine-vein', granted,
      xp: [{ skill: 'Mining' as SkillName, amount: VEIN_XP }],
      leveledUp: x.leveledUp ? [{ skill: 'Mining' as SkillName, level: x.newLevel }] : [],
    };
  });
});

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : -1;
}
