// server/intent-verdancourt.ts — server-authoritative intents for Verdancourt
// (herblore-farming expansion) that don't fit the built-in paths:
//
//   verd-pick     secondary gather nodes (limpwurt_plant / white_berry_bush /
//                 snape_grass_clump). These are NOT in intents.ts GATHER_REQS,
//                 so they get their own domain rather than editing core files;
//                 level/xp/rates come from objects.json skillObjs, same table
//                 the client reads.
//   verd-compost  compost bins: 5 crops -> 1 compost (Farming 20) or
//                 1 compost + 2 grimy herbs -> 1 supercompost (Farming 50).
//   verd-extreme  resonant_dust stirred into a finished super potion ->
//                 extreme potion. The 'potion|' make recipe hardcodes
//                 vial+herb+secondary (intents.ts), so the extreme tier rides
//                 a dedicated domain (spec verdict correction #3).
//
// Every handler validates against authoritative state (level vs SERVER xp,
// inputs vs SERVER inventory, object@tile + range vs the baked map index),
// rolls randomness SERVER-side, mutates only via state.ts primitives inside
// one withState transaction, and returns the standard envelope.
//
// Self-registers at import time; imported for its side effect from
// server/index.ts. It does NOT edit intents.ts or intents-wire.ts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIntentDomain, DomainCtx, IntentResult, stampRev } from './intents';
import { MAP_W } from './world';
import {
  AuthState, SkillName, isKnownItem,
  invAdd, invRemoveItem, invHas, invCount,
  addXp, skillLevel,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

interface RawItem { stackable?: boolean; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');

interface SkillObjData { level: number; xp: number; item: string; depleteChance: number; respawn: number; lowRate: number; highRate: number; }
const SKILL_OBJS = loadJson<{ skillObjs: Record<string, SkillObjData> }>('../data/objects.json').skillObjs;

interface MapJson { objects: { type: string; x: number; y: number }[]; }
const MAP = loadJson<MapJson>('../data/map.json');
const objTypeAt = new Map<number, Set<string>>();
for (const o of MAP.objects) {
  const k = o.y * MAP_W + o.x;
  let s = objTypeAt.get(k);
  if (!s) { s = new Set(); objTypeAt.set(k, s); }
  s.add(o.type);
}
const objectTypeAt = (x: number, y: number, type: string) =>
  objTypeAt.get(y * MAP_W + x)?.has(type) ?? false;
function nearObject(cx: number, cy: number, type: string, maxDist = 2): boolean {
  for (let dx = -maxDist; dx <= maxDist; dx++) {
    for (let dy = -maxDist; dy <= maxDist; dy++) {
      if (objectTypeAt(cx + dx, cy + dy, type)) return true;
    }
  }
  return false;
}

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : -1);
const fail = (kind: string, error: string): IntentResult => ({ ok: false, kind, error });

function tx(ctx: DomainCtx, kind: string, fn: (state: AuthState) => IntentResult): IntentResult {
  const res = ctx.store.withState<IntentResult>(ctx.userId, fn);
  if (!res) return fail(kind, 'no character');
  return stampRev(ctx.store, ctx, res);
}

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
  if (ITEMS[id]?.stackable && invCount(state, id) > 0) return true;
  return freeSlots(state) > 0;
}

// ===========================================================================
// VERD-PICK — one gather attempt at a Verdancourt secondary node.
// { obj, x, y }. Data from objects.json skillObjs; Farming-skilled, no tool.
// ===========================================================================
const PICK_TYPES = new Set(['limpwurt_plant', 'white_berry_bush', 'snape_grass_clump']);

registerIntentDomain('verd-pick', (ctx, payload) => {
  if (ctx.dead) return fail('verd-pick', 'dead');
  const type = String(payload.obj ?? '');
  if (!PICK_TYPES.has(type)) return fail('verd-pick', 'unknown gather object');
  const data = SKILL_OBJS[type];
  if (!data || !isKnownItem(data.item)) return fail('verd-pick', 'unknown gather object');
  const ox = num(payload.x), oy = num(payload.y);
  if (!objectTypeAt(ox, oy, type)) return fail('verd-pick', 'no such object here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('verd-pick', 'out of range');
  return tx(ctx, 'verd-pick', (state) => {
    const lvl = skillLevel(state, 'Farming');
    if (lvl < data.level) return fail('verd-pick', `requires Farming level ${data.level}`);
    if (!hasRoomFor(state, data.item)) return fail('verd-pick', 'inventory full');
    if (!successRoll(lvl, data.level, data.lowRate, data.highRate)) {
      // valid attempt, empty hand — the client just clicks again
      return { ok: true, kind: 'verd-pick', granted: [], xp: [] };
    }
    if (!invAdd(state, data.item, 1)) return fail('verd-pick', 'inventory full');
    const x = addXp(state, 'Farming', data.xp);
    return {
      ok: true, kind: 'verd-pick',
      granted: [{ id: data.item, qty: 1 }],
      xp: [{ skill: 'Farming' as SkillName, amount: data.xp }],
      leveledUp: x.leveledUp ? [{ skill: 'Farming' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// VERD-COMPOST — at a compost_bin (<=2 tiles):
//   compost:      Farming 20, consumes 5 crops (any mix), grants 1 compost
//   supercompost: Farming 50, consumes 1 compost + 2 grimy herbs (any mix),
//                 grants 1 supercompost
// { what: 'compost' | 'supercompost' }. Small Farming xp, mirrors farm-rake.
// ===========================================================================
const COMPOST_CROPS = ['potato', 'cabbage', 'onion', 'sweetcorn', 'strawberry', 'watermelon'];
const GRIMY_HERBS = [
  'grimy_guam', 'grimy_marrentill', 'grimy_ranarr', 'grimy_irit',
  'grimy_harralander', 'grimy_toadflax', 'grimy_avantoe', 'grimy_kwuarm',
  'grimy_cadantine', 'grimy_dwarf_weed', 'grimy_truechord_bloom',
];

// Remove `need` items total drawn from `pool` ids (greedy). Returns the
// removed [{id, qty}] list, or null (state untouched logically — callers only
// invoke inside withState and bail by returning fail, discarding partials is
// prevented by checking availability FIRST).
function takeFromPool(state: AuthState, pool: string[], need: number): { id: string; qty: number }[] | null {
  const have = pool.reduce((n, id) => n + invCount(state, id), 0);
  if (have < need) return null;
  const removed: { id: string; qty: number }[] = [];
  let left = need;
  for (const id of pool) {
    if (left <= 0) break;
    const take = Math.min(left, invCount(state, id));
    if (take <= 0) continue;
    const rm = invRemoveItem(state, id, take);
    if (!rm.ok) return null; // should not happen after the count check
    removed.push({ id, qty: take });
    left -= take;
  }
  return left <= 0 ? removed : null;
}

registerIntentDomain('verd-compost', (ctx, payload) => {
  if (ctx.dead) return fail('verd-compost', 'dead');
  const what = String(payload.what ?? '');
  if (what !== 'compost' && what !== 'supercompost') return fail('verd-compost', 'unknown compost type');
  if (!nearObject(ctx.x, ctx.y, 'compost_bin')) return fail('verd-compost', 'not near a compost bin');
  return tx(ctx, 'verd-compost', (state) => {
    const lvl = skillLevel(state, 'Farming');
    if (what === 'compost') {
      if (lvl < 20) return fail('verd-compost', 'requires Farming level 20');
      const removed = takeFromPool(state, COMPOST_CROPS, 5);
      if (!removed) return fail('verd-compost', 'you need 5 crops');
      if (!invAdd(state, 'compost', 1)) return fail('verd-compost', 'inventory full');
      const x = addXp(state, 'Farming', 4.5);
      return {
        ok: true, kind: 'verd-compost',
        granted: [{ id: 'compost', qty: 1 }], removed,
        xp: [{ skill: 'Farming' as SkillName, amount: 4.5 }],
        leveledUp: x.leveledUp ? [{ skill: 'Farming' as SkillName, level: x.newLevel }] : [],
      };
    }
    // supercompost
    if (lvl < 50) return fail('verd-compost', 'requires Farming level 50');
    if (!invHas(state, 'compost', 1)) return fail('verd-compost', 'you need compost');
    // availability check BEFORE any removal so a fail leaves nothing half-eaten
    const grimyHave = GRIMY_HERBS.reduce((n, id) => n + invCount(state, id), 0);
    if (grimyHave < 2) return fail('verd-compost', 'you need 2 grimy herbs');
    const rmCompost = invRemoveItem(state, 'compost', 1);
    if (!rmCompost.ok) return fail('verd-compost', 'you need compost');
    const removedHerbs = takeFromPool(state, GRIMY_HERBS, 2)!;
    if (!invAdd(state, 'supercompost', 1)) return fail('verd-compost', 'inventory full');
    const x = addXp(state, 'Farming', 8.5);
    return {
      ok: true, kind: 'verd-compost',
      granted: [{ id: 'supercompost', qty: 1 }],
      removed: [{ id: 'compost', qty: 1 }, ...removedHerbs],
      xp: [{ skill: 'Farming' as SkillName, amount: 8.5 }],
      leveledUp: x.leveledUp ? [{ skill: 'Farming' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// VERD-EXTREME — stir resonant_dust into a finished super potion.
// { output }. Consumes base potion + 1 resonant_dust, grants the extreme
// potion + Herblore xp. Levels/xp continue the spec's brew curve.
// ===========================================================================
const EXTREMES: Record<string, { base: string; level: number; xp: number }> = {
  extreme_attack: { base: 'super_attack', level: 88, xp: 175 },
  extreme_strength: { base: 'super_strength', level: 90, xp: 180 },
};

registerIntentDomain('verd-extreme', (ctx, payload) => {
  if (ctx.dead) return fail('verd-extreme', 'dead');
  const output = String(payload.output ?? '');
  const def = EXTREMES[output];
  if (!def || !isKnownItem(output)) return fail('verd-extreme', 'unknown extreme potion');
  return tx(ctx, 'verd-extreme', (state) => {
    const lvl = skillLevel(state, 'Herblore');
    if (lvl < def.level) return fail('verd-extreme', `requires Herblore level ${def.level}`);
    if (!invHas(state, def.base, 1) || !invHas(state, 'resonant_dust', 1)) {
      return fail('verd-extreme', 'missing ingredients');
    }
    const rmBase = invRemoveItem(state, def.base, 1);
    if (!rmBase.ok) return fail('verd-extreme', 'missing ingredients');
    const rmDust = invRemoveItem(state, 'resonant_dust', 1);
    if (!rmDust.ok) return fail('verd-extreme', 'missing ingredients');
    if (!invAdd(state, output, 1)) return fail('verd-extreme', 'inventory full');
    const x = addXp(state, 'Herblore', def.xp);
    return {
      ok: true, kind: 'verd-extreme',
      granted: [{ id: output, qty: 1 }],
      removed: [{ id: def.base, qty: 1 }, { id: 'resonant_dust', qty: 1 }],
      xp: [{ skill: 'Herblore' as SkillName, amount: def.xp }],
      leveledUp: x.leveledUp ? [{ skill: 'Herblore' as SkillName, level: x.newLevel }] : [],
    };
  });
});

export {};
