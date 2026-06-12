// server/intent-ranged.ts — Quillrook (the Tinnitus Range) server-authoritative
// intents (docs/CONVERSION-CONTRACT.md §3 registry; ECONOMY-AUTHORITY §2). This
// module owns the intent kinds for the ranged/gun training domain and
// self-registers them at import time. It NEVER trusts a client-supplied
// quantity/item/xp/token amount: every handler INDEPENDENTLY validates against
// the authoritative state inside ONE withState transaction, rolls all
// randomness server-side, and computes the outcome itself.
//
// Registered kinds:
//   - 'range-shot'    — shoot an echo target on the Quillrook firing line.
//                       Validates the target object exists on the map at the
//                       named tile, range, a rate-limit, the equipped weapon's
//                       mode (bow→Ranged / pistol|rifle→Gun), matching ammo in
//                       the ammo slot, and the tier's level gate. Consumes 1
//                       ammo (Quillrook quiver passive honoured), rolls the
//                       hit + token/shard bonus, grants tier xp.
//   - 'quill-load'    — Quillrook ammo benchwork that does NOT fit the Gun
//                       Guild loadRounds 1:1 powder:casing shape:
//                       longshot (1 powder + 1 longshot_bullet_casing) and
//                       resonant (2 powder + 1 echo_stone_shard).
//   - 'quill-rewards' — Quartermaster Sable's echo_tokens reward shop. The
//                       cost table is server-owned; the client only names the
//                       reward id.
//
// Imported once for side effect by server/index.ts (`import './intent-ranged';`).

import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import {
  AuthState, SkillName,
  invAdd, invRemove, invCount, invHas,
  addXp, skillLevel,
} from './state';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

// ---------------------------------------------------------------------------
// Map lookup — the firing line is validated against data/map.json (the same
// authority the gather intent uses): a player cannot shoot a target that does
// not exist at the named tile.
// ---------------------------------------------------------------------------

interface MapJson { objects: { type: string; x: number; y: number }[]; }
const TARGET_AT = new Map<string, string>(); // "x,y" -> echo_target_* type
{
  const MAP = loadJson<MapJson>('../data/map.json');
  for (const o of MAP.objects) {
    if (o.type.startsWith('echo_target_')) TARGET_AT.set(`${o.x},${o.y}`, o.type);
  }
}

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));

function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
}

type Stack = { id: string; qty: number } | null;
function equipped(state: AuthState, slot: string): Stack {
  const eq = state.equipment as Record<string, Stack> | undefined;
  return eq?.[slot] ?? null;
}

// Mirrors the (rifle/longbow-aware) weaponMode in server/combat.ts — the shot
// trains the skill the weapon would train in real combat.
function shotMode(weaponId: string): 'ranged' | 'gun' | null {
  if (weaponId.includes('pistol') || weaponId.includes('rifle') || weaponId === 'glock_18') return 'gun';
  if (weaponId.includes('shortbow') || weaponId.includes('longbow') || weaponId === 'shortbow') return 'ranged';
  return null;
}

// ===========================================================================
// RANGE-SHOT — the echo-target firing line. Server owns the tier table
// (mirror of ROUND_TIERS in intent-misc.ts): level gate + xp + bonus rolls.
// Deliberately a touch below same-level live-mob xp (this is the AFK lane).
// ===========================================================================

interface TargetTier {
  level: number;        // required Ranged (bow) or Gun (firearm) level
  xp: number;           // xp per successful shot
  tokenChance: number;  // chance of an echo_tokens bonus on a hit
  tokenMax: number;     // 1..tokenMax tokens when the bonus lands
  shardChance: number;  // chance of an echo_stone_shard on a hit
}
const TARGET_TIERS: Record<string, TargetTier> = {
  echo_target_novice: { level: 1, xp: 8, tokenChance: 0.05, tokenMax: 1, shardChance: 0.01 },
  echo_target_keen: { level: 30, xp: 22, tokenChance: 0.07, tokenMax: 2, shardChance: 0.02 },
  echo_target_master: { level: 60, xp: 40, tokenChance: 0.09, tokenMax: 2, shardChance: 0.03 },
  echo_target_perfect: { level: 80, xp: 62, tokenChance: 0.14, tokenMax: 3, shardChance: 0.05 },
};

// Light per-player rate limit so a scripted client cannot fire faster than the
// action loop (one shot per ~2 ticks). In-memory: a restart only resets it.
const SHOT_COOLDOWN_MS = 1100;
const lastShotAt = new Map<number, number>();

function rangeShot(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'range-shot';
  if (ctx.dead) return { ok: false, kind, error: 'dead' };

  const tx = Math.floor(Number(payload.x));
  const ty = Math.floor(Number(payload.y));
  const type = TARGET_AT.get(`${tx},${ty}`);
  if (!type) return { ok: false, kind, error: 'no target there' };
  const tier = TARGET_TIERS[type];
  if (!tier) return { ok: false, kind, error: 'no target there' };
  if (chebyshev(ctx.x, ctx.y, tx, ty) > 3) return { ok: false, kind, error: 'out of range' };

  const now = Date.now();
  const last = lastShotAt.get(ctx.userId) ?? 0;
  if (now - last < SHOT_COOLDOWN_MS) return { ok: false, kind, error: 'cooldown' };

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    const weapon = equipped(state, 'weapon');
    const mode = weapon ? shotMode(weapon.id) : null;
    if (!mode) return { ok: false, kind, error: 'you need a bow, pistol or rifle equipped' };
    const skill: SkillName = (mode === 'ranged' ? 'Ranged' : 'Gun') as SkillName;

    const lvl = skillLevel(state, skill);
    if (lvl < tier.level) return { ok: false, kind, error: `requires ${skill} level ${tier.level}` };

    const suffix = mode === 'ranged' ? '_arrow' : '_round';
    const eq = state.equipment as Record<string, Stack>;
    const ammo = eq?.ammo;
    if (!ammo || !ammo.id.endsWith(suffix) || ammo.qty <= 0) {
      return { ok: false, kind, error: mode === 'ranged' ? 'you have no arrows equipped' : 'you have no rounds equipped' };
    }

    // Consume the shot (Quillrook quiver passive: 20% chance the echo-stone
    // hands the shot back — mirrors the combat ammo-consumption hook).
    const saved = equipped(state, 'neck')?.id === 'quillrook_quiver' && Math.random() < 0.2;
    const removed: { id: string; qty: number }[] = [];
    let equipEcho: Record<string, Stack> | undefined;
    if (!saved) {
      ammo.qty -= 1;
      removed.push({ id: ammo.id, qty: 1 });
      if (ammo.qty <= 0) eq.ammo = null;
      equipEcho = { ammo: eq.ammo ?? null };
    }

    // Roll the shot vs the target tier — being over-levelled rings truer.
    const hitChance = Math.min(0.95, Math.max(0.5, 0.55 + (lvl - tier.level) * 0.012));
    if (Math.random() >= hitChance) {
      return {
        ok: true, kind, removed, granted: [], xp: [],
        ...(equipEcho ? { equip: equipEcho } : {}),
        ...({ hit: false, target: type, saved } as Record<string, unknown>),
      } as IntentResult;
    }

    const granted: { id: string; qty: number }[] = [];
    // tokens/shards are stackable: only need a slot if we hold none yet.
    if (Math.random() < tier.tokenChance) {
      const qty = 1 + Math.floor(Math.random() * tier.tokenMax);
      if (invCount(state, 'echo_tokens') > 0 || freeSlots(state) > 0) {
        if (invAdd(state, 'echo_tokens', qty)) granted.push({ id: 'echo_tokens', qty });
      }
    }
    if (Math.random() < tier.shardChance) {
      if (invCount(state, 'echo_stone_shard') > 0 || freeSlots(state) > 0) {
        if (invAdd(state, 'echo_stone_shard', 1)) granted.push({ id: 'echo_stone_shard', qty: 1 });
      }
    }
    const x = addXp(state, skill, tier.xp);
    return {
      ok: true, kind, removed, granted,
      xp: [{ skill, amount: tier.xp }],
      leveledUp: x.leveledUp ? [{ skill, level: x.newLevel }] : [],
      ...(equipEcho ? { equip: equipEcho } : {}),
      ...({ hit: true, target: type, saved } as Record<string, unknown>),
    } as IntentResult;
  });
  if (!res) return { ok: false, kind, error: 'no character' };
  if (res.ok) lastShotAt.set(ctx.userId, now);
  return stampRev(ctx.store, ctx, res);
}

// ===========================================================================
// QUILL-LOAD — Quillrook benchwork the Gun Guild loadRounds table cannot
// express (it is hardcoded to 1 powder + 1 casing). Server owns the recipes;
// batches up to 15 like loadRounds, refunds on inventory overflow.
// ===========================================================================

interface QuillLoad {
  round: string;
  level: number;
  xpPer: number; // Gun xp per round loaded
  powder: number; // gunpowder per round
  casing?: string; // 1 per round when set
  shard?: number;  // echo_stone_shard per round when set
}
const QUILL_LOADS: Record<string, QuillLoad> = {
  longshot: { round: 'longshot_round', level: 60, xpPer: 6, powder: 1, casing: 'longshot_bullet_casing' },
  resonant: { round: 'resonant_round', level: 75, xpPer: 8, powder: 2, shard: 1 },
};

function quillLoad(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'quill-load';
  const recipe = QUILL_LOADS[String(payload.what ?? '')];
  if (!recipe) return { ok: false, kind, error: 'unknown round' };

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (skillLevel(state, 'Gun') < recipe.level) {
      return { ok: false, kind, error: `requires Gun level ${recipe.level}` };
    }
    let max = Math.floor(invCount(state, 'gunpowder') / recipe.powder);
    if (recipe.casing) max = Math.min(max, invCount(state, recipe.casing));
    if (recipe.shard) max = Math.min(max, Math.floor(invCount(state, 'echo_stone_shard') / recipe.shard));
    if (max <= 0) return { ok: false, kind, error: 'you are missing materials' };
    const batch = Math.min(max, 15);

    const inputs: { id: string; qty: number }[] = [{ id: 'gunpowder', qty: recipe.powder * batch }];
    if (recipe.casing) inputs.push({ id: recipe.casing, qty: batch });
    if (recipe.shard) inputs.push({ id: 'echo_stone_shard', qty: recipe.shard * batch });
    for (const i of inputs) {
      if (!invHas(state, i.id, i.qty)) return { ok: false, kind, error: 'missing materials' };
    }
    for (const i of inputs) invRemove(state, i.id, i.qty);
    if (!invAdd(state, recipe.round, batch)) {
      for (const i of inputs) invAdd(state, i.id, i.qty); // refund on overflow
      return { ok: false, kind, error: 'inventory full' };
    }
    const amount = recipe.xpPer * batch;
    addXp(state, 'Gun', amount);
    return {
      ok: true, kind,
      removed: inputs,
      granted: [{ id: recipe.round, qty: batch }],
      xp: [{ skill: 'Gun' as SkillName, amount }],
      ...({ batch } as Record<string, unknown>),
    } as IntentResult;
  });
  if (!res) return { ok: false, kind, error: 'no character' };
  return stampRev(ctx.store, ctx, res);
}

// ===========================================================================
// QUILL-REWARDS — Quartermaster Sable's echo_tokens shop. Costs are server-
// owned; the client only names the reward id (mirrors the slayer points shop).
// ===========================================================================

interface QuillReward { id: string; qty: number; cost: number; }
const QUILL_REWARDS: Record<string, QuillReward> = {
  quillrook_quiver: { id: 'quillrook_quiver', qty: 1, cost: 400 },
  marksmans_earmuffs: { id: 'marksmans_earmuffs', qty: 1, cost: 180 },
  resonance_gloves: { id: 'resonance_gloves', qty: 1, cost: 180 },
  resonant_arrow: { id: 'resonant_arrow', qty: 50, cost: 30 },
  resonant_round: { id: 'resonant_round', qty: 50, cost: 35 },
};

function quillRewards(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'quill-rewards';
  const r = QUILL_REWARDS[String(payload.item ?? '')];
  if (!r) return { ok: false, kind, error: 'unknown reward' };

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    if (invCount(state, 'echo_tokens') < r.cost) return { ok: false, kind, error: 'not enough echo tokens' };
    if (freeSlots(state) <= 0 && !(invCount(state, r.id) > 0)) {
      return { ok: false, kind, error: 'inventory full' };
    }
    if (!invRemove(state, 'echo_tokens', r.cost)) return { ok: false, kind, error: 'not enough echo tokens' };
    if (!invAdd(state, r.id, r.qty)) {
      invAdd(state, 'echo_tokens', r.cost); // refund on overflow
      return { ok: false, kind, error: 'inventory full' };
    }
    return {
      ok: true, kind,
      removed: [{ id: 'echo_tokens', qty: r.cost }],
      granted: [{ id: r.id, qty: r.qty }],
    } as IntentResult;
  });
  if (!res) return { ok: false, kind, error: 'no character' };
  return stampRev(ctx.store, ctx, res);
}

registerIntentDomain('range-shot', rangeShot);
registerIntentDomain('quill-load', quillLoad);
registerIntentDomain('quill-rewards', quillRewards);

export {};
