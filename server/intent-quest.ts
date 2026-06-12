// server/intent-quest.ts — Quest sub-progress domain (docs/CONVERSION-CONTRACT.md
// §3 registry + §5 quest framework). The built-in spine already owns the LINEAR
// quest spine: `quest-stage` (graph-validated advance, server/quests-graph.ts),
// `quest-reward` and `scripted-grant` (data-defined idempotent grants,
// data/quest-rewards.json). This module adds the NON-linear sub-progress those
// can't express, all SERVER-authoritative and data-driven (data/quest-progress.json):
//
//   * quest-mark   (WS) — set a bit in a sounding/diplomacy bitmask, gated by the
//                  parent quest being at the right stage. Order-independent
//                  soundings (tuning fork at altar/willow/waystones), brazier
//                  stoking, the gd4 wizard accord shuttle. Optionally auto-advances
//                  the parent quest when the bitmask completes.
//   * quest-turnin (WS) — flexible OR/counted item turn-in the AND-only graph
//                  can't model (a shark OR raw_shark; any 3 of three gem kinds).
//                  Consumes the items and advances the parent stage.
//   * quest-craft  (WS) — a quest-gated fabrication/purchase: consume inputs
//                  (coins allowed → wealth-shaped, gated by ECONOMY_FROZEN) and
//                  grant an output, gated by the parent quest stage.
//   * a kill hook (npcDeathHooks) — server-credited kill counters: when the
//                  KILLER's parent quest is at the right stage, the kill bumps a
//                  counter sub-key. Fully authoritative — the client cannot forge
//                  a kill — and the killer gets a {t:'intent', questSet} echo so
//                  the client mirrors the counter.
//
// Security (non-negotiable, CONVERSION-CONTRACT §security invariant): the server
// NEVER trusts a client-supplied count/item/bit/quest/stage. Every handler
// INDEPENDENTLY validates the parent quest stage against SERVER state and mutates
// ONLY through state.ts primitives inside ONE withState transaction (rev bump +
// fence + save_reload). A forged request FAILS or sets only the data-defined
// bit/grant for a stage the player has legitimately reached. Sub-progress lives
// in the owned `quests` map and is monotonic (counters/bitmasks only grow).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  StateStore, AuthState, isKnownItem,
  invAdd, invRemove, invCount, invHas, removeCoins, getCoins,
  questStage,
} from './state';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { npcDeathHooks, SNpc, PlayerView } from './sim';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

interface RawItem { id: string; stackable?: boolean; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');
function isStackable(id: string): boolean { return !!ITEMS[id]?.stackable; }

// ---- config (data/quest-progress.json) -------------------------------------

interface MarkDef {
  parentQuest: string;
  requireStage: number;
  subKey: string;
  bit: number;
  completeMask?: number;   // when (bitmask & completeMask) === completeMask…
  completeStage?: number;  // …advance parentQuest to here.
}
interface KillDef {
  npc: string;
  parentQuest: string;
  requireStage: number;
  subKey: string;
  target: number;
  completeStage?: number;  // optional: advance parentQuest when counter hits target.
}
interface TurninDef {
  parentQuest: string;
  requireStage: number;
  toStage: number;
  anyOf: string[];
  count: number;
}
interface CraftDef {
  parentQuest: string;
  requireStage: number;
  inputs: { id: string; qty: number }[];
  output: { id: string; qty: number };
}
interface ProgressConfig {
  marks: Record<string, MarkDef>;
  kills: Record<string, KillDef>;
  turnins: Record<string, TurninDef>;
  crafts: Record<string, CraftDef>;
}

function loadConfig(): ProgressConfig {
  try {
    const raw = loadJson<Record<string, unknown>>('../data/quest-progress.json');
    const pick = <T>(o: unknown): Record<string, T> => {
      const out: Record<string, T> = {};
      if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
          if (k.startsWith('_')) continue; // skip _comment
          out[k] = v as T;
        }
      }
      return out;
    };
    return {
      marks: pick<MarkDef>(raw.marks),
      kills: pick<KillDef>(raw.kills),
      turnins: pick<TurninDef>(raw.turnins),
      crafts: pick<CraftDef>(raw.crafts),
    };
  } catch {
    return { marks: {}, kills: {}, turnins: {}, crafts: {} };
  }
}
const CFG = loadConfig();

// Kill defs indexed by npc def id (multiple quests may watch the same npc).
const KILLS_BY_NPC = new Map<string, KillDef[]>();
for (const def of Object.values(CFG.kills)) {
  let arr = KILLS_BY_NPC.get(def.npc);
  if (!arr) { arr = []; KILLS_BY_NPC.set(def.npc, arr); }
  arr.push(def);
}

function fail(kind: string, error: string): IntentResult { return { ok: false, kind, error }; }

// Read a quests-map sub-key as a plain number (counters/bitmasks live alongside
// stages; questStage() already coerces to a number, default 0).
function subVal(state: AuthState, key: string): number { return questStage(state, key); }

// Monotonic write of a sub-key (counters/bitmasks only grow). Never lowers.
function setSub(state: AuthState, key: string, value: number): number {
  if (!state.quests || typeof state.quests !== 'object') state.quests = {};
  const next = Math.max(0, Math.floor(value));
  const prev = subVal(state, key);
  state.quests[key] = Math.max(prev, next);
  return state.quests[key];
}

// Monotonic stage write (mirrors state.ts setQuestStage; kept local so this
// module is the only quest-domain writer callers reach for here).
function setStageMonotonic(state: AuthState, id: string, stage: number): number {
  if (!state.quests || typeof state.quests !== 'object') state.quests = {};
  const next = Math.max(0, Math.floor(stage));
  const prev = questStage(state, id);
  state.quests[id] = Math.max(prev, next);
  return state.quests[id];
}

function hasRoomFor(state: AuthState, id: string): boolean {
  if (isStackable(id) && invCount(state, id) > 0) return true;
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return free > 0;
}

// ---- quest-mark -------------------------------------------------------------
// payload: { mark: <markId> }. Sets the data-defined bit on the sub-key IFF the
// parent quest is exactly at requireStage. Echoes the new bitmask via questSet,
// and (if the bitmask now completes) advances the parent stage too.
registerIntentDomain('quest-mark', (ctx: DomainCtx, payload): IntentResult => {
  const markId = String(payload.mark ?? '');
  const def = CFG.marks[markId];
  if (!def) return fail('quest', 'unknown mark');

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (questStage(state, def.parentQuest) !== def.requireStage) {
      return fail('quest', 'not at the right stage for this');
    }
    const before = subVal(state, def.subKey);
    const after = before | def.bit;
    const questSet: Record<string, number> = {};
    if (after !== before) setSub(state, def.subKey, after);
    questSet[def.subKey] = subVal(state, def.subKey);

    const result: IntentResult = { ok: true, kind: 'quest', questSet };
    // Auto-advance the parent quest when the bitmask completes.
    if (def.completeMask !== undefined && def.completeStage !== undefined
        && (subVal(state, def.subKey) & def.completeMask) === def.completeMask
        && questStage(state, def.parentQuest) === def.requireStage) {
      const st = setStageMonotonic(state, def.parentQuest, def.completeStage);
      result.quest = def.parentQuest;
      result.stage = st;
    }
    return result;
  });
  if (!res) return fail('quest', 'no character');
  return stampRev(ctx.store, ctx, res);
});

// ---- quest-turnin -----------------------------------------------------------
// payload: { turnin: <turninId> }. Consumes `count` items drawn (in listed
// priority order) from `anyOf`, then advances the parent quest requireStage ->
// toStage. The reward for toStage is claimed separately (quest-reward). The
// quantities/items are recomputed server-side; a forged turnin without the
// goods FAILS.
registerIntentDomain('quest-turnin', (ctx: DomainCtx, payload): IntentResult => {
  if (ctx.dead) return fail('quest', 'dead');
  const turninId = String(payload.turnin ?? '');
  const def = CFG.turnins[turninId];
  if (!def) return fail('quest', 'unknown turn-in');

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (questStage(state, def.parentQuest) !== def.requireStage) {
      return fail('quest', 'not at the right stage for this');
    }
    // total held across the accepted kinds must cover the count.
    let held = 0;
    for (const id of def.anyOf) held += invCount(state, id);
    if (held < def.count) return fail('quest', 'you do not have the items');
    // consume `count`, in listed priority.
    let remaining = def.count;
    const removed: { id: string; qty: number }[] = [];
    for (const id of def.anyOf) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, invCount(state, id));
      if (take > 0 && invRemove(state, id, take)) {
        removed.push({ id, qty: take });
        remaining -= take;
      }
    }
    if (remaining > 0) return fail('quest', 'you do not have the items'); // shouldn't happen
    const st = setStageMonotonic(state, def.parentQuest, def.toStage);
    return { ok: true, kind: 'quest', removed, quest: def.parentQuest, stage: st };
  });
  if (!res) return fail('quest', 'no character');
  return stampRev(ctx.store, ctx, res);
});

// ---- quest-craft ------------------------------------------------------------
// payload: { craft: <craftId> }. Consume `inputs` (coins allowed) and grant
// `output`, gated by the parent quest stage. Wealth-shaped (coins in inputs) →
// gated by ECONOMY_FROZEN. NOT idempotent (repeatable while inputs last) — these
// are mid-quest fabrications, not one-shot rewards.
registerIntentDomain('quest-craft', (ctx: DomainCtx, payload): IntentResult => {
  if (ctx.dead) return fail('quest', 'dead');
  const craftId = String(payload.craft ?? '');
  const def = CFG.crafts[craftId];
  if (!def) return fail('quest', 'unknown craft');
  const spendsCoins = def.inputs.some((i) => i.id === 'coins');
  if (spendsCoins && ctx.frozen) return fail('quest', 'frozen');
  if (!isKnownItem(def.output.id)) return fail('quest', 'unknown output');

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (questStage(state, def.parentQuest) !== def.requireStage) {
      return fail('quest', 'not at the right stage for this');
    }
    // verify ALL inputs before consuming any.
    for (const i of def.inputs) {
      const qty = Math.max(1, Math.floor(i.qty));
      if (i.id === 'coins') { if (getCoins(state) < qty) return fail('quest', 'not enough coins'); }
      else if (!invHas(state, i.id, qty)) return fail('quest', 'missing materials');
    }
    if (!hasRoomFor(state, def.output.id)) return fail('quest', 'inventory full');
    // consume.
    const removed: { id: string; qty: number }[] = [];
    for (const i of def.inputs) {
      const qty = Math.max(1, Math.floor(i.qty));
      if (i.id === 'coins') { if (!removeCoins(state, qty)) return fail('quest', 'not enough coins'); }
      else if (!invRemove(state, i.id, qty)) return fail('quest', 'missing materials');
      removed.push({ id: i.id, qty });
    }
    const oqty = Math.max(1, Math.floor(def.output.qty));
    if (!invAdd(state, def.output.id, oqty)) return fail('quest', 'inventory full');
    return {
      ok: true, kind: 'quest',
      removed,
      granted: [{ id: def.output.id, qty: oqty }],
      coins: spendsCoins ? getCoins(state) : undefined,
    };
  });
  if (!res) return fail('quest', 'no character');
  return stampRev(ctx.store, ctx, res);
});

// ---- kill hook --------------------------------------------------------------
// Installed from index.ts with the bound store. When a player lands the killing
// blow on a watched npc, and their parent quest is at the right stage with the
// counter below target, bump the counter server-side and echo it to the killer.
export function installQuestKillHook(store: StateStore): void {
  npcDeathHooks.push((n: SNpc, by: PlayerView) => {
    const defs = KILLS_BY_NPC.get(n.def.id);
    if (!defs || defs.length === 0) return;
    const questSet: Record<string, number> = {};
    let stageAdvance: { quest: string; stage: number } | undefined;
    store.withState(by.userId, (state) => {
      for (const def of defs) {
        if (questStage(state, def.parentQuest) !== def.requireStage) continue;
        if (subVal(state, def.subKey) >= def.target) continue;
        const next = setSub(state, def.subKey, subVal(state, def.subKey) + 1);
        questSet[def.subKey] = next;
        if (def.completeStage !== undefined && next >= def.target
            && questStage(state, def.parentQuest) === def.requireStage) {
          const st = setStageMonotonic(state, def.parentQuest, def.completeStage);
          stageAdvance = { quest: def.parentQuest, stage: st };
        }
      }
    });
    if (Object.keys(questSet).length === 0) return;
    const echo: Record<string, unknown> = { t: 'intent', ok: true, kind: 'quest', questSet };
    if (stageAdvance) { echo.quest = stageAdvance.quest; echo.stage = stageAdvance.stage; }
    by.send(echo);
  });
}
