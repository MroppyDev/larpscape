// server/state.ts — the single authoritative mutation layer over the
// `characters.save` JSON column (docs/ECONOMY-AUTHORITY.md §1.3 / §1.2).
//
// Every server-side change to a player's value/progress (xp, coins, bank,
// inventory, equipment, quests, hp, spec, slayer) flows through the primitives
// here. They are ALL wrapped in `withState`, which is a synchronous
// better-sqlite3 transaction that:
//   1. loads + parses the row,
//   2. runs the caller's mutation on the in-memory state,
//   3. writes the doc back and bumps `rev` (optimistic concurrency + client
//      cache key),
//   4. calls the injected `onSavesMutated` fence (which the index wires to
//      fenceSaves + the {t:'save_reload'} push), so an in-flight client PUT
//      carrying stale state is 409'd and the online client re-snapshots.
//
// This generalises the proven market.ts pattern (loadSave/writeSave/bankAdd/
// bankRemove inside db.transaction + onSavesMutated). better-sqlite3 is blocking
// and single-threaded, so no two transactions interleave within the process: a
// player's intents are serialised, which is why a per-user JSON document is safe
// without normalising inventory/bank/skills into their own tables.
//
// INVARIANTS enforced here (do not regress):
//   * item ids are validated against data/items.json; unknown ids are rejected.
//   * quantities are clamped to safe positive integers; balances never go
//     negative; coin/bank stacks capped at MAX_QTY (< 2^31).
//   * quest stages are MONOTONIC — setQuestStage never lowers a stage (kills the
//     M6 forgery of "rewind a quest to re-claim").
//   * xpAdd uses the real XP curve ported from src/game.ts (XP_TABLE / levelForXp).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Item catalogue (validation surface) — same source the client + market read.
// ---------------------------------------------------------------------------

interface RawItem {
  id: string;
  name?: string;
  stackable?: boolean;
  equipSlot?: string;
  levelReq?: Array<{ skill: string; level: number }>;
}
const ITEMS: Record<string, RawItem> = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/items.json'), 'utf8'),
);
export function isKnownItem(id: string): boolean {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, id);
}
function isStackable(id: string): boolean { return !!ITEMS[id]?.stackable; }

// ---------------------------------------------------------------------------
// Skills + XP curve — ported verbatim from src/game.ts / src/defs.ts so the
// server computes identical levels (drives combat profile + hiscores).
// ---------------------------------------------------------------------------

export const SKILLS = [
  'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing',
  'Defence', 'Herblore', 'Fishing', 'Ranged', 'Thieving', 'Cooking',
  'Prayer', 'Crafting', 'Firemaking', 'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming', 'Construction', 'Hunter', 'Gun',
] as const;
export type SkillName = (typeof SKILLS)[number];

// Cumulative XP required for each level 1..99 (classic curve). Identical to
// src/defs.ts XP_TABLE.
export const XP_TABLE: number[] = (() => {
  const t = [0, 0];
  let points = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 99; i >= 1; i--) {
    if (xp >= XP_TABLE[i]) { lvl = i; break; }
  }
  return Math.min(99, lvl);
}

const MAX_XP = 200_000_000;        // per-skill xp cap (matches src/game.ts addXp)
const MAX_QTY = 2_000_000_000;     // per-stack cap, safe integer, < 2^31 (matches market.ts)
const COIN_CAP = MAX_QTY;          // coins/bank capped well under 2^31

function clampQty(qty: number): number {
  if (typeof qty !== 'number' || !Number.isFinite(qty)) return 0;
  return Math.max(0, Math.min(MAX_QTY, Math.floor(qty)));
}

// ---------------------------------------------------------------------------
// Authoritative state shape. This is the parsed `characters.save` document; the
// owned fields are the server's source of truth. We keep it permissive (the
// presentation fields ride along untouched) and operate only on owned fields.
// ---------------------------------------------------------------------------

export interface ItemStack { id: string; qty: number; }

export interface AuthState {
  xp?: number[];
  bank?: ItemStack[];
  inventory?: (ItemStack | null)[];
  equipment?: Record<string, ItemStack | null>;
  quests?: Record<string, number>;
  collectionLog?: Record<string, number>;
  curHp?: number;
  prayerPoints?: number;
  specEnergy?: number;
  slayerTask?: { npc: string; remaining: number } | null;
  slayerPoints?: number;
  [k: string]: unknown;
}

const EQUIP_SLOTS = ['head', 'body', 'legs', 'weapon', 'shield', 'gloves', 'boots', 'ammo', 'neck', 'ring'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];
function isEquipSlot(s: string): s is EquipSlot { return (EQUIP_SLOTS as readonly string[]).includes(s); }

// Canonical server-defined starting owned-state for a brand-new character.
// The server — NOT the client — defines what a fresh player owns, so a new
// account's first PUT can never seed forged wealth/levels (closes the
// first-save bypass). Mirrors src/game.ts freshPlayer() owned fields.
export function serverStarterOwned(): AuthState {
  const xp = new Array(SKILLS.length).fill(0);
  xp[SKILLS.indexOf('Hitpoints')] = XP_TABLE[10]; // Hitpoints starts at level 10
  const equipment: Record<string, ItemStack | null> = {};
  for (const s of EQUIP_SLOTS) equipment[s] = null;
  return {
    xp,
    bank: [{ id: 'coins', qty: 25 }],
    inventory: new Array(28).fill(null),
    equipment,
    quests: {},
    collectionLog: {},
    curHp: 10,
    prayerPoints: 1,
    specEnergy: 100,
    slayerTask: null,
    slayerPoints: 0,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers over an AuthState (no DB). Callers inside `withState` mutate the
// passed-in state object; the transaction persists it.
// ---------------------------------------------------------------------------

function invArr(state: AuthState): (ItemStack | null)[] {
  if (!Array.isArray(state.inventory)) state.inventory = new Array(28).fill(null);
  return state.inventory;
}
function bankArr(state: AuthState): ItemStack[] {
  if (!Array.isArray(state.bank)) state.bank = [];
  return state.bank;
}
function xpArr(state: AuthState): number[] {
  if (!Array.isArray(state.xp) || state.xp.length !== SKILLS.length) {
    const xp = new Array(SKILLS.length).fill(0);
    if (Array.isArray(state.xp)) for (let i = 0; i < Math.min(state.xp.length, xp.length); i++) {
      xp[i] = clampQty(state.xp[i]);
    }
    state.xp = xp;
  }
  return state.xp;
}

// ---- inventory ----

export function invCount(state: AuthState, id: string): number {
  let n = 0;
  for (const s of invArr(state)) if (s && s.id === id) n += s.qty;
  return n;
}
export function invHas(state: AuthState, id: string, qty = 1): boolean {
  return invCount(state, id) >= qty;
}
// Adds qty of `id` to the inventory. Returns true on success, false if the item
// is unknown or there isn't room (non-stackables fill empty slots; stackables
// merge). Partial non-stackable adds are NOT performed — all-or-nothing.
export function invAdd(state: AuthState, id: string, qty = 1): boolean {
  if (!isKnownItem(id)) return false;
  const q = clampQty(qty);
  if (q <= 0) return false;
  const inv = invArr(state);
  if (isStackable(id)) {
    const slot = inv.find((s) => s && s.id === id);
    if (slot) {
      if (slot.qty + q > MAX_QTY) return false;
      slot.qty += q;
      return true;
    }
    const i = inv.indexOf(null);
    if (i < 0) return false;
    inv[i] = { id, qty: q };
    return true;
  }
  // non-stackable: need q empty slots
  const free = inv.reduce((n, s) => n + (s === null ? 1 : 0), 0);
  if (free < q) return false;
  for (let n = 0; n < q; n++) {
    const i = inv.indexOf(null);
    inv[i] = { id, qty: 1 };
  }
  return true;
}
export function invRemove(state: AuthState, id: string, qty = 1): boolean {
  const q = clampQty(qty);
  if (q <= 0) return false;
  const inv = invArr(state);
  if (invCount(state, id) < q) return false;
  let left = q;
  for (let i = 0; i < inv.length && left > 0; i++) {
    const s = inv[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take; left -= take;
    if (s.qty <= 0) inv[i] = null;
  }
  return left === 0;
}

// ---- coins (carried/spendable coins live in the inventory as a stack) ----

export function getCoins(state: AuthState): number {
  return invCount(state, 'coins');
}
export function addCoins(state: AuthState, amount: number): boolean {
  const a = clampQty(amount);
  if (a <= 0) return false;
  if (getCoins(state) + a > COIN_CAP) return false;
  return invAdd(state, 'coins', a);
}
export function removeCoins(state: AuthState, amount: number): boolean {
  const a = clampQty(amount);
  if (a <= 0) return false;
  return invRemove(state, 'coins', a);
}

// ---- bank ----

export function bankCount(state: AuthState, id: string): number {
  let n = 0;
  for (const s of bankArr(state)) if (s && s.id === id) n += s.qty;
  return n;
}
// Returns true on success, false on overflow/unknown item.
export function bankAdd(state: AuthState, id: string, qty: number): boolean {
  if (!isKnownItem(id)) return false;
  const q = clampQty(qty);
  if (q <= 0) return false;
  const bank = bankArr(state);
  const slot = bank.find((s) => s && s.id === id);
  if (slot) {
    if (slot.qty + q > MAX_QTY) return false;
    slot.qty += q;
    return true;
  }
  bank.push({ id, qty: q });
  return true;
}
export function bankRemove(state: AuthState, id: string, qty: number): boolean {
  const q = clampQty(qty);
  if (q <= 0) return false;
  const bank = bankArr(state);
  if (bankCount(state, id) < q) return false;
  let left = q;
  for (let i = bank.length - 1; i >= 0 && left > 0; i--) {
    const s = bank[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take; left -= take;
    if (s.qty <= 0) bank.splice(i, 1);
  }
  return left === 0;
}

// ---- equipment ----

export function skillLevel(state: AuthState, skill: SkillName): number {
  const i = SKILLS.indexOf(skill);
  if (i < 0) return 1;
  return levelForXp(xpArr(state)[i] ?? 0);
}
// Validates levelReq against server xp before equipping. Returns null on
// success, or an error string. Does NOT move the item in/out of inventory —
// callers that take the item from the inventory must do so within the same
// withState transaction (see future equip intent in Phase 3).
export function setEquip(state: AuthState, slot: string, id: string | null): string | null {
  if (!isEquipSlot(slot)) return 'invalid equip slot';
  if (!state.equipment || typeof state.equipment !== 'object') state.equipment = {};
  if (id === null) { state.equipment[slot] = null; return null; }
  if (!isKnownItem(id)) return 'unknown item';
  const def = ITEMS[id];
  if (def.equipSlot !== slot) return 'item does not fit that slot';
  for (const req of def.levelReq ?? []) {
    if (skillLevel(state, req.skill as SkillName) < req.level) {
      return `requires ${req.skill} level ${req.level}`;
    }
  }
  state.equipment[slot] = { id, qty: 1 };
  return null;
}

// ---- xp ----

// Adds xp to a skill using the real curve. Hitpoints/Prayer level-ups bump the
// live pools exactly as src/game.ts addXp does. Returns the new total + whether
// a level was gained (and the new level), so intents can echo a level-up.
export function addXp(state: AuthState, skill: SkillName, amount: number): {
  newXp: number; leveledUp: boolean; newLevel: number;
} {
  const i = SKILLS.indexOf(skill);
  if (i < 0) return { newXp: 0, leveledUp: false, newLevel: 1 };
  const xp = xpArr(state);
  const a = clampQty(amount);
  const before = levelForXp(xp[i]);
  xp[i] = Math.min(MAX_XP, xp[i] + a);
  const after = levelForXp(xp[i]);
  if (after > before) {
    if (skill === 'Hitpoints') {
      const cur = typeof state.curHp === 'number' ? state.curHp : after;
      state.curHp = cur + (after - before);
    }
    if (skill === 'Prayer') {
      const cur = typeof state.prayerPoints === 'number' ? state.prayerPoints : 0;
      state.prayerPoints = Math.min(after, cur + (after - before));
    }
  }
  return { newXp: xp[i], leveledUp: after > before, newLevel: after };
}

// ---- quests (monotonic) ----

export function questStage(state: AuthState, id: string): number {
  return (state.quests && typeof state.quests === 'object' && typeof state.quests[id] === 'number')
    ? state.quests[id] : 0;
}
// Monotonic: never lowers an existing stage. Returns the resulting stage.
export function setQuestStage(state: AuthState, id: string, stage: number): number {
  if (!state.quests || typeof state.quests !== 'object') state.quests = {};
  const next = Math.max(0, Math.floor(typeof stage === 'number' ? stage : 0));
  const cur = questStage(state, id);
  state.quests[id] = Math.max(cur, next);
  return state.quests[id];
}

// ---- live combat pools ----

export function maxHpFor(state: AuthState): number {
  return levelForXp(xpArr(state)[SKILLS.indexOf('Hitpoints')] ?? 0);
}
export function hpDamage(state: AuthState, dmg: number): number {
  const cur = typeof state.curHp === 'number' ? state.curHp : maxHpFor(state);
  state.curHp = Math.max(0, cur - Math.max(0, Math.floor(dmg)));
  return state.curHp;
}
export function hpHeal(state: AuthState, n: number): number {
  const max = maxHpFor(state);
  const cur = typeof state.curHp === 'number' ? state.curHp : max;
  state.curHp = Math.min(max, cur + Math.max(0, Math.floor(n)));
  return state.curHp;
}
export function specSpend(state: AuthState, n: number): boolean {
  const cur = typeof state.specEnergy === 'number' ? state.specEnergy : 100;
  const cost = Math.max(0, Math.floor(n));
  if (cur < cost) return false;
  state.specEnergy = cur - cost;
  return true;
}

// ---------------------------------------------------------------------------
// DB-bound surface: loadState + withState. Created by `createStateStore(db,
// onSavesMutated)` so the index can inject the same fence/save_reload plumbing
// the market uses, keeping this module self-contained and testable.
// ---------------------------------------------------------------------------

export interface StateStore {
  loadState(userId: number): AuthState | null;
  // Run `fn` against the user's authoritative state inside ONE transaction.
  // Reads the row, applies fn, writes back, bumps rev, fires the fence. Returns
  // fn's result. If the character row is missing, returns undefined without
  // calling fn. fn may throw to roll the transaction back.
  withState<T>(userId: number, fn: (state: AuthState) => T): T | undefined;
  // current rev (client cache key); -1 if no row.
  revOf(userId: number): number;
}

export function createStateStore(
  db: Database.Database,
  onSavesMutated: (userIds: number[]) => void,
): StateStore {
  const selSave = db.prepare('SELECT save FROM characters WHERE user_id = ?');
  const selRev = db.prepare('SELECT rev FROM characters WHERE user_id = ?');
  const upd = db.prepare(
    'UPDATE characters SET save = ?, rev = rev + 1, updated_at = ? WHERE user_id = ?',
  );

  function loadState(userId: number): AuthState | null {
    const row = selSave.get(userId) as { save: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.save) as AuthState; }
    catch { throw new Error(`corrupt save for user ${userId}`); }
  }

  function revOf(userId: number): number {
    const row = selRev.get(userId) as { rev: number } | undefined;
    return row ? row.rev : -1;
  }

  // The transaction body. Note: onSavesMutated is invoked AFTER the transaction
  // commits (it pushes to live sockets / sets the fence — side effects that must
  // not run if the tx rolls back), so withState collects the dirty id and fires
  // the fence once the better-sqlite3 transaction returns.
  const tx = db.transaction((userId: number, fn: (s: AuthState) => unknown): { ok: boolean; val?: unknown } => {
    const row = selSave.get(userId) as { save: string } | undefined;
    if (!row) return { ok: false };
    let state: AuthState;
    try { state = JSON.parse(row.save) as AuthState; }
    catch { throw new Error(`corrupt save for user ${userId}`); }
    const val = fn(state);
    upd.run(JSON.stringify(state), Date.now(), userId);
    return { ok: true, val };
  });

  function withState<T>(userId: number, fn: (state: AuthState) => T): T | undefined {
    const res = tx(userId, fn);
    if (!res.ok) return undefined;
    onSavesMutated([userId]);
    return res.val as T;
  }

  return { loadState, withState, revOf };
}
