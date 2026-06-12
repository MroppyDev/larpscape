// server/intent-knell.ts — The Knell (Order of the Last Verse) prayer hub,
// server-authoritative (docs/CONVERSION-CONTRACT.md §3 registry). This module
// owns the 'bone-offering' intent domain and self-registers it at import time
// (server/index.ts: `import './intent-knell';`).
//
// It NEVER trusts a client-supplied XP amount, token count or price: every op
// independently validates against the authoritative state inside ONE withState
// transaction, reads buryXp/tiers from data, and computes the outcome itself.
//
// Ops (payload.op):
//   'offer'      { item, invSlot? } — burn a bone at a bone_offering_brazier:
//                consumes the bone, grants its buryXp as Prayer XP and awards
//                bone tokens by tier (the Knell reward-shop currency).
//   'bury'       { item, invSlot? } — bury a bone at the consecrated_altar:
//                consumes the bone, grants floor(buryXp * 1.20) Prayer XP
//                (resonant_bones 210 -> 252 per the spec).
//   'recharge'   — restore prayer points to max at the consecrated_altar
//                (the plain-altar recharge-prayer intent stays untouched).
//   'buy'        { item } — bone-token reward shop (holy_censer, unsung_helm).
//   'light-censer' — consume one censer_incense for +100 censer charges
//                (requires owning or wearing the holy_censer).
//   'read-dirge' — consume one tome_of_dirges for 5000 Slayer XP (mirrors the
//                slayer 'read-tome' op at a higher tier).
//   'turn-in-dust' { } — near Cantor Veil: 25 choir_dust -> 1 censer_incense
//                (pure material sink; no coins minted).
//
// Owned state fields (new, persisted on AuthState as extension fields):
//   state.boneTokens    : number — offering-shop currency.
//   state.censerCharges : number — holy_censer charges; while the censer is
//                         equipped (shield slot) and charges remain, 'offer'
//                         and 'bury' grant +25% Prayer XP and burn 1 charge.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { MAP_W } from './world';
import { sim } from './sim';
import {
  AuthState, SkillName, isKnownItem,
  invAdd, invRemove, invRemoveItem, invHas,
  addXp, skillLevel, parseInvSlot,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

interface RawItem { buryXp?: number; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');

// Static world-object position index (same pattern as intent-produce.ts) so a
// brazier/altar op can be validated against the baked map — you cannot offer
// bones at a brazier that does not exist near you.
interface MapJson { objects: { type: string; x: number; y: number }[]; }
const MAP = loadJson<MapJson>('../data/map.json');
const objTypeAt = new Map<number, Set<string>>();
for (const o of MAP.objects) {
  const k = o.y * MAP_W + o.x;
  let s = objTypeAt.get(k);
  if (!s) { s = new Set(); objTypeAt.set(k, s); }
  s.add(o.type);
}
function nearObject(cx: number, cy: number, type: string, maxDist = 2): boolean {
  for (let dx = -maxDist; dx <= maxDist; dx++) {
    for (let dy = -maxDist; dy <= maxDist; dy++) {
      if (objTypeAt.get((cy + dy) * MAP_W + (cx + dx))?.has(type)) return true;
    }
  }
  return false;
}
function nearNpc(cx: number, cy: number, defId: string, maxDist = 3): boolean {
  for (const n of sim.npcs) {
    if (n.dead || n.def.id !== defId) continue;
    if (Math.max(Math.abs(cx - n.x), Math.abs(cy - n.y)) <= maxDist) return true;
  }
  return false;
}

function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
}

function fail(kind: string, error: string): IntentResult { return { ok: false, kind, error }; }
function tx(ctx: DomainCtx, kind: string, fn: (state: AuthState) => IntentResult): IntentResult {
  const res = ctx.store.withState<IntentResult>(ctx.userId, fn);
  if (!res) return fail(kind, 'no character');
  return stampRev(ctx.store, ctx, res);
}

// ---------------------------------------------------------------------------
// Data tables — all server-side; the client only names an op + item id.
// ---------------------------------------------------------------------------

// Offering tokens by bone tier (the Knell reward-shop currency).
const BONE_TOKENS: Record<string, number> = {
  bones: 1,
  big_bones: 3,
  ranged_bones: 6,
  dragon_bones: 12,
  ourg_bones: 24,
  resonant_bones: 36,
};

// Bone-token reward shop (Sister Plainsong). NOT coin-purchasable anywhere.
const TOKEN_SHOP: Record<string, { id: string; cost: number }> = {
  holy_censer: { id: 'holy_censer', cost: 250 },
  unsung_helm: { id: 'unsung_helm', cost: 750 },
};

const ALTAR_MULT = 1.20;        // consecrated_altar bury bonus
const CENSER_MULT = 1.25;       // holy_censer (equipped, charged) bonus
const CENSER_CHARGES_PER_INCENSE = 100;
const CENSER_CHARGE_CAP = 2500;
const DIRGE_XP = 5000;          // tome_of_dirges Slayer XP
const DUST_PER_INCENSE = 25;    // choir_dust turn-in rate

// ---------------------------------------------------------------------------
// Owned-field accessors (extension fields on AuthState, like state.slayer).
// ---------------------------------------------------------------------------
function boneTokens(state: AuthState): number {
  const v = (state as Record<string, unknown>).boneTokens;
  return typeof v === 'number' && v >= 0 ? Math.floor(v) : 0;
}
function setBoneTokens(state: AuthState, v: number) {
  (state as Record<string, unknown>).boneTokens = Math.max(0, Math.floor(v));
}
function censerCharges(state: AuthState): number {
  const v = (state as Record<string, unknown>).censerCharges;
  return typeof v === 'number' && v >= 0 ? Math.floor(v) : 0;
}
function setCenserCharges(state: AuthState, v: number) {
  (state as Record<string, unknown>).censerCharges = Math.max(0, Math.min(CENSER_CHARGE_CAP, Math.floor(v)));
}
function censerEquipped(state: AuthState): boolean {
  const eq = state.equipment as Record<string, { id: string } | null> | undefined;
  return eq?.shield?.id === 'holy_censer';
}

// The authoritative Knell snapshot the client mirrors into its UI.
function knellSnapshot(state: AuthState): Record<string, unknown> {
  return { tokens: boneTokens(state), censerCharges: censerCharges(state) };
}
function withSnap(state: AuthState, res: IntentResult): IntentResult {
  return { ...res, ...({ knell: knellSnapshot(state) } as Record<string, unknown>) } as IntentResult;
}

// Apply the censer bonus (if worn + charged) to a Prayer XP amount, burning a
// charge. Returns the (possibly boosted) amount.
function applyCenser(state: AuthState, amount: number): number {
  if (!censerEquipped(state)) return amount;
  const charges = censerCharges(state);
  if (charges <= 0) return amount;
  setCenserCharges(state, charges - 1);
  return Math.floor(amount * CENSER_MULT);
}

// ---------------------------------------------------------------------------
// The domain handler.
// ---------------------------------------------------------------------------
function boneOffering(ctx: DomainCtx, payload: Record<string, unknown>): IntentResult {
  const kind = 'bone-offering';
  if (ctx.dead) return fail(kind, 'dead');
  const op = String(payload.op ?? '');

  // ---- offer: bone -> Prayer XP + tokens, at a bone_offering_brazier ----
  if (op === 'offer') {
    const item = String(payload.item ?? '');
    const buryXp = ITEMS[item]?.buryXp;
    const tier = BONE_TOKENS[item];
    if (!buryXp || buryXp <= 0 || !tier || !isKnownItem(item)) return fail(kind, 'the flame only takes bones');
    if (!nearObject(ctx.x, ctx.y, 'bone_offering_brazier')) return fail(kind, 'not near an offering brazier');
    const invSlot = parseInvSlot(payload.invSlot);
    return tx(ctx, kind, (state) => {
      const rm = invRemoveItem(state, item, 1, invSlot);
      if (!rm.ok) return fail(kind, 'you have none');
      const amount = applyCenser(state, buryXp);
      const x = addXp(state, 'Prayer', amount);
      setBoneTokens(state, boneTokens(state) + tier);
      return withSnap(state, {
        ok: true, kind,
        removed: [{ id: item, qty: 1, ...(rm.slot !== undefined ? { slot: rm.slot } : {}) }],
        xp: [{ skill: 'Prayer' as SkillName, amount }],
        leveledUp: x.leveledUp ? [{ skill: 'Prayer' as SkillName, level: x.newLevel }] : [],
      } as IntentResult);
    });
  }

  // ---- bury: bone -> boosted Prayer XP, at the consecrated_altar ----
  if (op === 'bury') {
    const item = String(payload.item ?? '');
    const buryXp = ITEMS[item]?.buryXp;
    if (!buryXp || buryXp <= 0 || !isKnownItem(item)) return fail(kind, 'not buryable');
    if (!nearObject(ctx.x, ctx.y, 'consecrated_altar')) return fail(kind, 'not near the consecrated altar');
    const invSlot = parseInvSlot(payload.invSlot);
    return tx(ctx, kind, (state) => {
      const rm = invRemoveItem(state, item, 1, invSlot);
      if (!rm.ok) return fail(kind, 'you have none');
      const amount = applyCenser(state, Math.floor(buryXp * ALTAR_MULT));
      const x = addXp(state, 'Prayer', amount);
      return withSnap(state, {
        ok: true, kind,
        removed: [{ id: item, qty: 1, ...(rm.slot !== undefined ? { slot: rm.slot } : {}) }],
        xp: [{ skill: 'Prayer' as SkillName, amount }],
        leveledUp: x.leveledUp ? [{ skill: 'Prayer' as SkillName, level: x.newLevel }] : [],
      } as IntentResult);
    });
  }

  // ---- recharge: prayer points to max at the consecrated_altar ----
  if (op === 'recharge') {
    if (!nearObject(ctx.x, ctx.y, 'consecrated_altar')) return fail(kind, 'not near the consecrated altar');
    return tx(ctx, kind, (state) => {
      const max = skillLevel(state, 'Prayer');
      state.prayerPoints = max;
      return withSnap(state, { ok: true, kind, prayerPoints: max } as IntentResult);
    });
  }

  // ---- buy: bone-token reward shop (Sister Plainsong) ----
  if (op === 'buy') {
    const deal = TOKEN_SHOP[String(payload.item ?? '')];
    if (!deal) return fail(kind, 'unknown reward');
    if (!nearNpc(ctx.x, ctx.y, 'sister_plainsong')) return fail(kind, 'not near Sister Plainsong');
    return tx(ctx, kind, (state) => {
      if (boneTokens(state) < deal.cost) return fail(kind, 'not enough offerings');
      if (freeSlots(state) <= 0) return fail(kind, 'inventory full');
      if (!invAdd(state, deal.id, 1)) return fail(kind, 'inventory full');
      setBoneTokens(state, boneTokens(state) - deal.cost);
      return withSnap(state, { ok: true, kind, granted: [{ id: deal.id, qty: 1 }] } as IntentResult);
    });
  }

  // ---- light-censer: incense -> +100 censer charges ----
  if (op === 'light-censer') {
    return tx(ctx, kind, (state) => {
      const owns = censerEquipped(state) || invHas(state, 'holy_censer', 1);
      if (!owns) return fail(kind, 'you have no holy censer to feed');
      if (censerCharges(state) >= CENSER_CHARGE_CAP) return fail(kind, 'the censer is already full');
      if (!invRemove(state, 'censer_incense', 1)) return fail(kind, 'you have no incense');
      setCenserCharges(state, censerCharges(state) + CENSER_CHARGES_PER_INCENSE);
      return withSnap(state, {
        ok: true, kind,
        removed: [{ id: 'censer_incense', qty: 1 }],
      } as IntentResult);
    });
  }

  // ---- read-dirge: tome_of_dirges -> 5000 Slayer XP ----
  if (op === 'read-dirge') {
    return tx(ctx, kind, (state) => {
      if (!invRemove(state, 'tome_of_dirges', 1)) return fail(kind, 'you have no tome of dirges');
      const x = addXp(state, 'Slayer', DIRGE_XP);
      return withSnap(state, {
        ok: true, kind,
        removed: [{ id: 'tome_of_dirges', qty: 1 }],
        xp: [{ skill: 'Slayer' as SkillName, amount: DIRGE_XP }],
        leveledUp: x.leveledUp ? [{ skill: 'Slayer' as SkillName, level: x.newLevel }] : [],
      } as IntentResult);
    });
  }

  // ---- turn-in-dust: 25 choir_dust -> 1 censer_incense (near Cantor Veil) ----
  if (op === 'turn-in-dust') {
    if (!nearNpc(ctx.x, ctx.y, 'cantor_veil')) return fail(kind, 'not near Cantor Veil');
    return tx(ctx, kind, (state) => {
      if (!invHas(state, 'choir_dust', DUST_PER_INCENSE)) return fail(kind, `Cantor Veil takes dust in lots of ${DUST_PER_INCENSE}`);
      if (!invRemove(state, 'choir_dust', DUST_PER_INCENSE)) return fail(kind, 'not enough dust');
      if (!invAdd(state, 'censer_incense', 1)) {
        // refund — incense is stackable so this only happens with a full inv
        invAdd(state, 'choir_dust', DUST_PER_INCENSE);
        return fail(kind, 'inventory full');
      }
      return withSnap(state, {
        ok: true, kind,
        removed: [{ id: 'choir_dust', qty: DUST_PER_INCENSE }],
        granted: [{ id: 'censer_incense', qty: 1 }],
      } as IntentResult);
    });
  }

  return fail(kind, 'unknown knell op');
}

registerIntentDomain('bone-offering', boneOffering);
