// server/intent-misc.ts — gambling + slayer + miscellaneous one-off grants,
// server-authoritative (docs/CONVERSION-CONTRACT.md §3 registry; ECONOMY-AUTHORITY
// §2). This module owns the intent kinds for the gambling/slayer/misc domain and
// self-registers them at import time. It NEVER trusts a client-supplied
// quantity/item/coin/payout/points: every handler INDEPENDENTLY validates against
// the authoritative `state` it is handed inside ONE withState transaction, rolls
// any randomness server-side, and computes the outcome itself.
//
// Registered kinds:
//   - 'gamble'         — casino house games (slots / blackjack / roulette).
//                        Server rolls the outcome and settles carried coins.
//                        Wealth-shaped → gated by ECONOMY_FROZEN.
//   - 'slayer'         — the Brogan task loop: assign / reroll / skip / kill /
//                        buy(reward). Server owns slayerTask + slayerPoints +
//                        streak; per-kill credit + completion bonus are computed
//                        and applied here (idempotent per completion).
//   - 'shard-exchange' — Untuned Mine resonant_shard → gear/coins (data table).
//   - 'load-rounds'    — Gun Guild powder+casing → loaded rounds (data tiers).
//
// Imported once for side effect by server/index.ts (`import './intent-misc';`).

import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import {
  AuthState, SkillName, isKnownItem, StateStore,
  invAdd, invRemove, invCount, invHas,
  getCoins, addCoins, removeCoins,
  bankAdd, addXp, skillLevel,
} from './state';
import { deriveCombatLevel } from './combat';
import { npcDeathHooks, SNpc, PlayerView } from './sim';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

interface RawNpc { combatLevel?: number; hitpoints?: number; }
const NPCS: Record<string, RawNpc> = loadJson('../data/npcs.json');

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

// Count free inventory slots in the authoritative state (mirrors intents.ts).
function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
}

// ===========================================================================
// GAMBLE — casino house games. The server rolls the result and settles coins.
// A forged result/payout is impossible: the client may only name the game + bet
// (+ a roulette bet selection); the server derives every coin movement.
// ===========================================================================

const SLOT_SYM = ['cherry', 'bell', 'bar', 'seven'] as const;
const SLOT_PAY: Record<string, number> = { cherry: 2, bell: 5, bar: 10, seven: 25 };

const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const RANK_VALS: Record<string, number> = {
  A: 11, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 10, Q: 10, K: 10,
};
const RANKS = Object.keys(RANK_VALS);
function drawCard(): { rank: string; value: number } {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  return { rank, value: RANK_VALS[rank] };
}
function handValue(cards: { rank: string; value: number }[]): number {
  let total = cards.reduce((s, c) => s + c.value, 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

const MAX_BET = 10_000_000;

function gamble(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'gamble';
  if (ctx.frozen) return { ok: false, kind, error: 'frozen' };
  const game = String(payload.game ?? '');
  const bet = Math.floor(Number(payload.bet));
  if (!Number.isInteger(bet) || bet < 1 || bet > MAX_BET) return { ok: false, kind, error: 'invalid bet' };

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (getCoins(state) < bet) return { ok: false, kind, error: 'not enough coins' };
    // Debit the stake up front (validates possession); the win is credited back.
    if (!removeCoins(state, bet)) return { ok: false, kind, error: 'not enough coins' };

    let win = 0;
    const detail: Record<string, unknown> = {};

    if (game === 'slots') {
      const reels = [0, 1, 2].map(() => SLOT_SYM[Math.floor(Math.random() * SLOT_SYM.length)]);
      detail.reels = reels;
      if (reels[0] === reels[1] && reels[1] === reels[2]) win = bet * (SLOT_PAY[reels[0]] ?? 0);
    } else if (game === 'roulette') {
      const sel = payload.bet_kind;
      const selKind = String(sel ?? '');
      const selValue = Math.max(0, Math.min(36, Math.floor(Number(payload.bet_value))));
      const result = Math.floor(Math.random() * 37);
      detail.result = result;
      if (selKind === 'number' && Number.isInteger(Number(payload.bet_value)) && selValue === result) win = bet * 36;
      else if (selKind === 'red' && ROULETTE_RED.has(result)) win = bet * 2;
      else if (selKind === 'black' && result > 0 && !ROULETTE_RED.has(result)) win = bet * 2;
      else if (selKind === 'odd' && result > 0 && result % 2 === 1) win = bet * 2;
      else if (selKind === 'even' && result > 0 && result % 2 === 0) win = bet * 2;
      else if (selKind !== 'number' && selKind !== 'red' && selKind !== 'black'
        && selKind !== 'odd' && selKind !== 'even') {
        // unknown selection: refund the stake, no game played
        addCoins(state, bet);
        return { ok: false, kind, error: 'pick a bet first' };
      }
    } else if (game === 'blackjack') {
      // Single-shot resolution: server deals both hands, dealer hits to 17.
      const player = [drawCard(), drawCard()];
      const dealer = [drawCard(), drawCard()];
      let guard = 0;
      while (handValue(dealer) < 17 && guard++ < 16) dealer.push(drawCard());
      const pv = handValue(player);
      const dv = handValue(dealer);
      detail.player = player.map((c) => c.rank);
      detail.dealer = dealer.map((c) => c.rank);
      detail.pv = pv; detail.dv = dv;
      if (pv > 21) win = 0;
      else if (dv > 21 || pv > dv) win = bet * 2;
      else if (pv === dv) win = bet; // push: stake returned
      else win = 0;
    } else {
      // unknown game: refund and fail
      addCoins(state, bet);
      return { ok: false, kind, error: 'unknown game' };
    }

    const granted: { id: string; qty: number }[] = [];
    if (win > 0) { addCoins(state, win); granted.push({ id: 'coins', qty: win }); }
    return {
      ok: true, kind,
      removed: [{ id: 'coins', qty: bet }],
      granted,
      coins: getCoins(state),
      // path-specific result detail rides on `message` channel via extras; the
      // client reflects coins authoritatively and renders flavour from `win`.
      ...({ win, game, detail } as Record<string, unknown>),
    } as IntentResult;
  });
  if (!res) return { ok: false, kind, error: 'no character' };
  return stampRev(ctx.store, ctx, res);
}

// ===========================================================================
// SLAYER — Brogan's task loop. Server owns slayerTask + slayerPoints + streak.
// Loop bookkeeping lives in dedicated owned fields:
//   state.slayerTask   : { npc, remaining } | null     (existing field)
//   state.slayerPoints : number                         (existing field)
//   state.slayer       : { streak, size, npc }          (loop metadata)
// 'size' > 0 marks a points-eligible loop task (legacy/quest tasks have size 0).
// ===========================================================================

const TASK_POOL: string[] = [
  'chicken', 'cow', 'giant_rat', 'goblin', 'scorpion', 'forest_spider',
  'ice_wolf', 'dire_wolf', 'bear', 'desert_bandit', 'pirate', 'ice_troll',
  'magma_crawler', 'ash_fiend', 'ruin_wraith', 'discord_wisp',
  'hollow_miner', 'manor_revenant',
];
const TASK_SET = new Set(TASK_POOL);

interface RewardEntry { id: string; cost: number; }
const REWARDS: Record<string, RewardEntry> = {
  dirge_blade: { id: 'dirge_blade', cost: 120 },
  cull_band: { id: 'cull_band', cost: 60 },
  wardens_visor: { id: 'wardens_visor', cost: 50 },
  tome_of_grudges: { id: 'tome_of_grudges', cost: 25 },
};

const REROLL_COST = 1;
const SKIP_COST = 3;
const BASE_POINTS = 3;
const POINTS_5TH = 15;
const POINTS_10TH = 40;

interface SlayerMeta { streak: number; size: number; npc: string; }
function slayerMeta(state: AuthState): SlayerMeta {
  const raw = (state as any).slayer;
  return {
    streak: typeof raw?.streak === 'number' ? raw.streak : 0,
    size: typeof raw?.size === 'number' ? raw.size : 0,
    npc: typeof raw?.npc === 'string' ? raw.npc : '',
  };
}
function setSlayerMeta(state: AuthState, m: SlayerMeta) { (state as any).slayer = m; }
function slayerPoints(state: AuthState): number {
  return typeof state.slayerPoints === 'number' ? state.slayerPoints : 0;
}

// The authoritative slayer snapshot the client mirrors into its UI (read-only on
// the client side — it is computed and persisted here).
function slayerSnapshot(state: AuthState): Record<string, unknown> {
  const m = slayerMeta(state);
  return {
    task: state.slayerTask ?? null,
    points: slayerPoints(state),
    streak: m.streak,
    size: m.size,
  };
}

// Pick a task weighted toward the player's combat level (mirrors the old client
// pickTaskIdx, now rolled server-side against the server's combat level).
function pickTask(state: AuthState): { npc: string; count: number } {
  const cb = deriveCombatLevel(state);
  const entries = TASK_POOL
    .map((npc) => ({ npc, lvl: NPCS[npc]?.combatLevel ?? 1 }))
    .filter((e) => NPCS[e.npc]);
  let pool = entries.filter((e) => e.lvl <= cb + 2 && e.lvl >= cb / 5);
  if (pool.length === 0) {
    pool = entries.filter((e) => e.lvl <= cb + 2);
    if (pool.length === 0) pool = [entries.reduce((a, b) => (a.lvl <= b.lvl ? a : b))];
  }
  const total = pool.reduce((s, e) => s + e.lvl + 1, 0);
  let roll = Math.random() * total;
  let chosen = pool[pool.length - 1];
  for (const e of pool) { roll -= e.lvl + 1; if (roll <= 0) { chosen = e; break; } }
  return { npc: chosen.npc, count: randInt(15, 40) };
}

function slayer(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'slayer';
  const op = String(payload.op ?? '');

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    const meta = slayerMeta(state);
    const task = state.slayerTask ?? null;
    const hasLoopTask = !!task && task.remaining > 0 && meta.size > 0;

    if (op === 'assign') {
      // A points-eligible loop task already in progress cannot be replaced for free.
      if (hasLoopTask) return { ok: false, kind, error: 'finish your current task first', ...({ slayer: slayerSnapshot(state) } as Record<string, unknown>) } as IntentResult;
      const { npc, count } = pickTask(state);
      state.slayerTask = { npc, remaining: count };
      setSlayerMeta(state, { streak: meta.streak, size: count, npc });
      return { ok: true, kind, ...({ slayer: slayerSnapshot(state) } as Record<string, unknown>) } as IntentResult;
    }

    if (op === 'reroll') {
      // Reroll an offered/active loop task for a point. Only valid with a task.
      if (!hasLoopTask) return { ok: false, kind, error: 'no task to reroll' };
      if (slayerPoints(state) < REROLL_COST) return { ok: false, kind, error: 'not enough points' };
      state.slayerPoints = slayerPoints(state) - REROLL_COST;
      const { npc, count } = pickTask(state);
      state.slayerTask = { npc, remaining: count };
      setSlayerMeta(state, { streak: meta.streak, size: count, npc });
      return { ok: true, kind, ...({ slayer: slayerSnapshot(state) } as Record<string, unknown>) } as IntentResult;
    }

    if (op === 'skip') {
      if (!hasLoopTask) return { ok: false, kind, error: 'no task to skip' };
      if (slayerPoints(state) < SKIP_COST) return { ok: false, kind, error: 'not enough points' };
      state.slayerPoints = slayerPoints(state) - SKIP_COST;
      state.slayerTask = null;
      setSlayerMeta(state, { streak: meta.streak, size: 0, npc: '' });
      return { ok: true, kind, ...({ slayer: slayerSnapshot(state) } as Record<string, unknown>) } as IntentResult;
    }

    if (op === 'trade-legacy') {
      // Legacy/quest task (size 0) swapped for a proper assignment, free, once.
      if (!task || task.remaining <= 0 || meta.size > 0) {
        return { ok: false, kind, error: 'no legacy task' };
      }
      const { npc, count } = pickTask(state);
      state.slayerTask = { npc, remaining: count };
      setSlayerMeta(state, { streak: meta.streak, size: count, npc });
      return { ok: true, kind, ...({ slayer: slayerSnapshot(state) } as Record<string, unknown>) } as IntentResult;
    }

    if (op === 'kill') {
      // Slayer kill credit is authoritative-only: it is granted by the NPC death
      // hook (npcDeathHooks) when the SERVER confirms a kill, never on client
      // request. A client-reachable 'kill' op was a free Slayer XP/points mint
      // (creditSlayerKill grants xp=hp + completion bonus + points with no kill).
      return { ok: false, kind, error: 'unknown slayer op' };
    }

    if (op === 'read-tome') {
      // Tome of grudges: consume one tome for a fixed Slayer XP dose. The item +
      // xp amount are server-defined; the client may only request the read.
      if (!invHas(state, 'tome_of_grudges', 1)) return { ok: false, kind, error: 'you have no tome of grudges' };
      if (!invRemove(state, 'tome_of_grudges', 1)) return { ok: false, kind, error: 'you have no tome of grudges' };
      const amount = 1500;
      addXp(state, 'Slayer', amount);
      return {
        ok: true, kind,
        removed: [{ id: 'tome_of_grudges', qty: 1 }],
        xp: [{ skill: 'Slayer' as SkillName, amount }],
      } as IntentResult;
    }

    if (op === 'buy') {
      // Points shop. Reward + cost are server-defined; the client only names the id.
      const r = REWARDS[String(payload.item ?? '')];
      if (!r) return { ok: false, kind, error: 'unknown reward' };
      if (slayerPoints(state) < r.cost) return { ok: false, kind, error: 'not enough points' };
      if (freeSlots(state) <= 0 && !(invCount(state, r.id) > 0)) {
        return { ok: false, kind, error: 'inventory full' };
      }
      if (!invAdd(state, r.id, 1)) return { ok: false, kind, error: 'inventory full' };
      state.slayerPoints = slayerPoints(state) - r.cost;
      return {
        ok: true, kind, granted: [{ id: r.id, qty: 1 }],
        ...({ slayer: slayerSnapshot(state) } as Record<string, unknown>),
      } as IntentResult;
    }

    return { ok: false, kind, error: 'unknown slayer op' };
  });
  if (!res) return { ok: false, kind, error: 'no character' };
  return stampRev(ctx.store, ctx, res);
}

// ===========================================================================
// SHARD-EXCHANGE — Untuned Mine resonant_shard → gear/coins. Server owns the
// exchange table; the client names an index, the server validates shard cost +
// room and grants exactly the data-defined output.
// ===========================================================================

interface ShardDeal { cost: number; item?: string; qty?: number; coins?: number; }
const SHARD_DEALS: ShardDeal[] = [
  { cost: 2, coins: 60 },
  { cost: 2, item: 'attack_potion', qty: 3 },
  { cost: 4, item: 'iron_scimitar', qty: 1 },
  { cost: 12, item: 'steel_scimitar', qty: 1 },
  { cost: 18, item: 'steel_platebody', qty: 1 },
];

function shardExchange(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'shard-exchange';
  const idx = Math.floor(Number(payload.deal));
  const deal = SHARD_DEALS[idx];
  if (!deal) return { ok: false, kind, error: 'unknown deal' };

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (invCount(state, 'resonant_shard') < deal.cost) return { ok: false, kind, error: 'not enough shards' };
    const granted: { id: string; qty: number }[] = [];
    if (deal.item) {
      if (freeSlots(state) <= 0 && !(invCount(state, deal.item) > 0)) {
        return { ok: false, kind, error: 'inventory full' };
      }
    }
    if (!invRemove(state, 'resonant_shard', deal.cost)) return { ok: false, kind, error: 'not enough shards' };
    if (deal.item) {
      const qty = Math.max(1, Math.floor(deal.qty ?? 1));
      if (!invAdd(state, deal.item, qty)) {
        invAdd(state, 'resonant_shard', deal.cost); // refund on overflow
        return { ok: false, kind, error: 'inventory full' };
      }
      granted.push({ id: deal.item, qty });
    }
    if (deal.coins && deal.coins > 0) {
      addCoins(state, deal.coins);
      granted.push({ id: 'coins', qty: deal.coins });
    }
    return {
      ok: true, kind,
      removed: [{ id: 'resonant_shard', qty: deal.cost }],
      granted,
    } as IntentResult;
  });
  if (!res) return { ok: false, kind, error: 'no character' };
  return stampRev(ctx.store, ctx, res);
}

// ===========================================================================
// LOAD-ROUNDS — Gun Guild: gunpowder + casing → loaded rounds. Server owns the
// tier table (level req + xp + casing→round map) and validates Gun level +
// inventory holdings, batching up to 15 per call (mirrors the old client loop).
// ===========================================================================

interface RoundTier { casing: string; round: string; level: number; xp: number; }
const ROUND_TIERS: Record<string, RoundTier> = {
  bronze_bullet_casing: { casing: 'bronze_bullet_casing', round: 'bronze_round', level: 1, xp: 15 },
  iron_bullet_casing: { casing: 'iron_bullet_casing', round: 'iron_round', level: 5, xp: 25 },
  steel_bullet_casing: { casing: 'steel_bullet_casing', round: 'steel_round', level: 20, xp: 37.5 },
  mithril_bullet_casing: { casing: 'mithril_bullet_casing', round: 'mithril_round', level: 40, xp: 50 },
  adamant_bullet_casing: { casing: 'adamant_bullet_casing', round: 'adamant_round', level: 55, xp: 62.5 },
  rune_bullet_casing: { casing: 'rune_bullet_casing', round: 'rune_round', level: 60, xp: 75 },
};

function loadRounds(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'load-rounds';
  const tier = ROUND_TIERS[String(payload.casing ?? '')];
  if (!tier || !isKnownItem(tier.round)) return { ok: false, kind, error: 'unknown round' };

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (skillLevel(state, 'Gun') < tier.level) return { ok: false, kind, error: `requires Gun level ${tier.level}` };
    const max = Math.min(invCount(state, 'gunpowder'), invCount(state, tier.casing));
    if (max <= 0) return { ok: false, kind, error: 'you need casings and gunpowder' };
    const batch = Math.min(max, 15);
    if (!invHas(state, 'gunpowder', batch) || !invHas(state, tier.casing, batch)) {
      return { ok: false, kind, error: 'missing materials' };
    }
    invRemove(state, 'gunpowder', batch);
    invRemove(state, tier.casing, batch);
    if (!invAdd(state, tier.round, batch)) {
      invAdd(state, 'gunpowder', batch); // refund on overflow
      invAdd(state, tier.casing, batch);
      return { ok: false, kind, error: 'inventory full' };
    }
    const amount = (tier.xp / 15) * batch;
    addXp(state, 'Gun', amount);
    return {
      ok: true, kind,
      removed: [{ id: 'gunpowder', qty: batch }, { id: tier.casing, qty: batch }],
      granted: [{ id: tier.round, qty: batch }],
      xp: [{ skill: 'Gun' as SkillName, amount }],
      ...({ batch } as Record<string, unknown>),
    } as IntentResult;
  });
  if (!res) return { ok: false, kind, error: 'no character' };
  return stampRev(ctx.store, ctx, res);
}

function creditSlayerKill(state: AuthState, npc: string): IntentResult {
  const kind = 'slayer';
  const task = state.slayerTask ?? null;
  const meta = slayerMeta(state);
  if (!task || task.npc !== npc || task.remaining <= 0) {
    return { ok: true, kind, xp: [], ...({ slayer: slayerSnapshot(state) } as Record<string, unknown>) } as IntentResult;
  }
  const hp = Math.max(1, Math.floor(NPCS[npc]?.hitpoints ?? 1));
  const xp: { skill: SkillName; amount: number }[] = [];
  task.remaining -= 1;
  state.slayerTask = task;
  addXp(state, 'Slayer', hp); xp.push({ skill: 'Slayer' as SkillName, amount: hp });

  if (task.remaining === 0) {
    const completionXp = 20;
    addXp(state, 'Slayer', completionXp);
    xp.push({ skill: 'Slayer' as SkillName, amount: completionXp });
    if (meta.size > 0) {
      const streak = meta.streak + 1;
      const pts = streak % 10 === 0 ? POINTS_10TH : streak % 5 === 0 ? POINTS_5TH : BASE_POINTS;
      state.slayerPoints = slayerPoints(state) + pts;
      const bonus = meta.size * 5;
      addXp(state, 'Slayer', bonus);
      xp.push({ skill: 'Slayer' as SkillName, amount: bonus });
      setSlayerMeta(state, { streak, size: 0, npc: '' });
    }
    state.slayerTask = null;
  }
  return { ok: true, kind, xp, ...({ slayer: slayerSnapshot(state) } as Record<string, unknown>) } as IntentResult;
}

// Server credits slayer kills on the killing blow (no client round-trip).
export function installSlayerKillHook(store: StateStore): void {
  npcDeathHooks.push((n: SNpc, by: PlayerView) => {
    const res = store.withState(by.userId, (state) => creditSlayerKill(state, n.def.id));
    if (!res || !res.ok) return;
    if ((res.xp?.length ?? 0) === 0 && !res.slayer) return;
    by.send({ t: 'intent', ok: true, kind: 'slayer', xp: res.xp, slayer: (res as Record<string, unknown>).slayer });
  });
}

registerIntentDomain('gamble', gamble);
registerIntentDomain('slayer', slayer);
registerIntentDomain('shard-exchange', shardExchange);
registerIntentDomain('load-rounds', loadRounds);

export {};
