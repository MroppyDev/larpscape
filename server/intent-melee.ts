// server/intent-melee.ts — Drummar's Hold (the Concord Lists) melee domain,
// server-authoritative (docs/CONVERSION-CONTRACT.md §3 registry). Self-registers
// at import time; imported once for side effect by server/index.ts
// (`import './intent-melee';`).
//
// Registered kinds:
//   - 'spar-dummy' — style-routed, flat-rate melee XP from the Hold's training
//                    dummies (metronome / reinforced / cadence pillar). Modelled
//                    on the 'train' intent in intent-produce.ts (object@tile +
//                    range<=2 + per-tile RAM+save cooldown + level gate), with
//                    NEW routing logic: accurate->Attack, aggressive->Strength,
//                    defensive->Defence, controlled->even three-way split, plus
//                    Hitpoints at the standard combat ratio (1.33/4 of the melee
//                    xp, i.e. xp/3-ish — same proportion combatXpForHit grants).
//                    The live combat style is not reachable from DomainCtx (the
//                    combatProfiles map is private to server/index.ts), so the
//                    client names its style in the payload; it is VALIDATED
//                    against the four legal styles and only ROUTES the xp — the
//                    amounts come from the server table, never the wire.
//   - 'valour-buy'  — the Valour Steward's reward shop: valour_token -> Concord
//                    set / cadence gauntlets / true-note blade. Costs are
//                    server-defined; the client only names the reward id. The
//                    Cape of Concord additionally requires owning the other
//                    three set pieces (inventory, bank, or equipped).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { MAP_W } from './world';
import { getTrainCd, setTrainCd } from './world-progress';
import {
  AuthState, SkillName,
  invAdd, invRemove, invCount, bankCount,
  addXp, skillLevel,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

// Static world-object position index (mirrors intent-produce.ts) so a dummy
// intent is validated against the tile the client named — you cannot spar a
// dummy that does not exist at that tile.
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
const fail = (kind: string, error: string): IntentResult => ({ ok: false, kind, error });
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : -1;
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
// SPAR-DUMMY — { dummy, x, y, style }. Server owns grade levels + xp amounts;
// the dummy must exist at the named tile; gate is max(Attack,Strength,Defence)
// so any melee build qualifies; per-tile ~2400ms cooldown (RAM + save-backed,
// same double-check as the 'train' intent so a reconnect can't reset it).
// ===========================================================================

const DUMMY_GRADES: Record<string, { level: number; xp: number }> = {
  metronome_dummy: { level: 1, xp: 16 },
  reinforced_dummy: { level: 30, xp: 32 },
  cadence_pillar: { level: 50, xp: 48 },
};

const STYLES = ['accurate', 'aggressive', 'defensive', 'controlled'] as const;
type SparStyle = (typeof STYLES)[number];
function isSparStyle(v: unknown): v is SparStyle {
  return typeof v === 'string' && (STYLES as readonly string[]).includes(v);
}

const SPAR_COOLDOWN_MS = 2400;
// Hitpoints rides along at the same proportion real combat grants it:
// combatXpForHit gives melee 4*dmg and Hitpoints 1.33*dmg => HP = melee * 1.33/4.
const HP_RATIO = 1.33 / 4;

const sparLastMs = new Map<number, Record<string, number>>();

registerIntentDomain('spar-dummy', (ctx, payload) => {
  const kind = 'spar-dummy';
  if (ctx.dead) return fail(kind, 'dead');
  const dummy = String(payload.dummy ?? '');
  const grade = DUMMY_GRADES[dummy];
  if (!grade) return fail(kind, 'unknown dummy');
  const style = payload.style;
  if (!isSparStyle(style)) return fail(kind, 'pick a combat style');
  const ox = num(payload.x), oy = num(payload.y);
  if (!objectTypeAt(ox, oy, dummy)) return fail(kind, 'no such dummy here');
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail(kind, 'out of range');

  const cdKey = `spar:${dummy}@${ox},${oy}`;
  const now = Date.now();
  const ram = sparLastMs.get(ctx.userId) ?? {};
  const lastRam = ram[cdKey] ?? 0;
  if (lastRam > 0 && now - lastRam < SPAR_COOLDOWN_MS) return fail(kind, 'too soon');

  return tx(ctx, kind, (state) => {
    const lastSave = getTrainCd(state, cdKey);
    if (lastSave > 0 && now - lastSave < SPAR_COOLDOWN_MS) return fail(kind, 'too soon');
    const meleeBest = Math.max(
      skillLevel(state, 'Attack'),
      skillLevel(state, 'Strength'),
      skillLevel(state, 'Defence'),
    );
    if (meleeBest < grade.level) {
      return fail(kind, `requires Attack, Strength or Defence level ${grade.level}`);
    }
    setTrainCd(state, cdKey, now);
    const nextRam = sparLastMs.get(ctx.userId) ?? {};
    nextRam[cdKey] = now;
    sparLastMs.set(ctx.userId, nextRam);

    // Style routes WHICH skill earns the (server-owned) xp; controlled splits
    // it evenly three ways. Hitpoints always rides along at the combat ratio.
    const routed: { skill: SkillName; amount: number }[] = [];
    if (style === 'accurate') routed.push({ skill: 'Attack', amount: grade.xp });
    else if (style === 'aggressive') routed.push({ skill: 'Strength', amount: grade.xp });
    else if (style === 'defensive') routed.push({ skill: 'Defence', amount: grade.xp });
    else {
      const each = Math.round((grade.xp / 3) * 100) / 100;
      routed.push(
        { skill: 'Attack', amount: each },
        { skill: 'Strength', amount: each },
        { skill: 'Defence', amount: each },
      );
    }
    routed.push({ skill: 'Hitpoints', amount: Math.round(grade.xp * HP_RATIO * 100) / 100 });

    const leveledUp: { skill: SkillName; level: number }[] = [];
    for (const r of routed) {
      const x = addXp(state, r.skill, r.amount);
      if (x.leveledUp) leveledUp.push({ skill: r.skill, level: x.newLevel });
    }
    return { ok: true, kind, xp: routed, leveledUp };
  });
});

// ===========================================================================
// VALOUR-BUY — { item }. The Valour Steward's reward shop. Token costs are
// server-defined; tokens must be CARRIED (the steward does not take IOUs).
// The cape is the capstone: it requires owning the other three set pieces.
// ===========================================================================

interface ValourReward { id: string; cost: number; requiresOwned?: string[]; }
const VALOUR_REWARDS: Record<string, ValourReward> = {
  cadence_gauntlets: { id: 'cadence_gauntlets', cost: 200 },
  concord_helm: { id: 'concord_helm', cost: 350 },
  concord_platelegs: { id: 'concord_platelegs', cost: 550 },
  concord_platebody: { id: 'concord_platebody', cost: 900 },
  concord_cape: {
    id: 'concord_cape', cost: 1200,
    requiresOwned: ['concord_helm', 'concord_platebody', 'concord_platelegs'],
  },
  true_note_blade: { id: 'true_note_blade', cost: 1500 },
};

function ownsItem(state: AuthState, id: string): boolean {
  if (invCount(state, id) > 0 || bankCount(state, id) > 0) return true;
  const eq = state.equipment ?? {};
  for (const slot of Object.keys(eq)) if (eq[slot]?.id === id) return true;
  return false;
}

registerIntentDomain('valour-buy', (ctx, payload) => {
  const kind = 'valour-buy';
  if (ctx.dead) return fail(kind, 'dead');
  const r = VALOUR_REWARDS[String(payload.item ?? '')];
  if (!r) return fail(kind, 'unknown reward');

  return tx(ctx, kind, (state) => {
    if (invCount(state, 'valour_token') < r.cost) return fail(kind, 'not enough valour tokens');
    if (r.requiresOwned) {
      for (const id of r.requiresOwned) {
        if (!ownsItem(state, id)) return fail(kind, 'the cape is earned last: own the helm, platebody and platelegs first');
      }
    }
    if (freeSlots(state) <= 0) return fail(kind, 'inventory full');
    if (!invRemove(state, 'valour_token', r.cost)) return fail(kind, 'not enough valour tokens');
    if (!invAdd(state, r.id, 1)) {
      invAdd(state, 'valour_token', r.cost); // refund on overflow
      return fail(kind, 'inventory full');
    }
    return {
      ok: true, kind,
      removed: [{ id: 'valour_token', qty: r.cost }],
      granted: [{ id: r.id, qty: 1 }],
    };
  });
});

export {};
