// server/intent-quaverside.ts — server-authoritative resolution of the
// Quaverside District (agility-thieving-hunter-construction expansion) paths
// that the existing handlers cannot express (per the spec verdict):
//
//   qv-train       rooftop/weir course obstacles + lap bonuses. Unlike the
//                  generic 'train' handler this one supports a per-obstacle
//                  TOOL gate (silk_climbing_rope on the zipline) and mints
//                  wrightsong_mark on lap keys (data-keyed, server-owned).
//   qv-trap-lay    box / pitfall / high-box hunter traps (tier-2/3 of the
//   qv-trap-check  bird snare). Own tile-keyed trap store (state.qvTraps,
//                  same shape discipline as world-progress snares) because
//                  the snare store carries no trap kind. Catch roll, timer
//                  and loot are all server-side, mirroring snare-check.
//   qv-saw         teak/mahogany logs + coins -> planks. The existing
//                  saw-planks handler is hardcoded to logs->plank@10c, so
//                  the higher tiers live here (wealth-shaped, frozen-gated).
//   qv-build       Wrightsong Yard builds. constructionBuilds' resolver
//                  hardcodes plank+hammer, so teak/mahogany builds with
//                  extra inputs (chime_moth) + the tuned_hammer gate live
//                  here. Builds are donated; they pay Construction xp AND
//                  wrightsong_mark (this IS the contract system — the
//                  contract_board is the in-world face of it).
//   qv-launder     Sly Maren's fence: 5 off-key coins -> clean coins, at a
//                  cut. Mints coins => wealth-shaped, ECONOMY_FROZEN-gated.
//   qv-redeem      reward vendors: spend wrightsong_mark on the Graceful
//                  set / Cutpurse gloves / Hunter's horn / tuned_hammer /
//                  Wrightsong robe / Cape of the Quaver. Prices and level
//                  gates are server data; the client only names the item.
//
// Every handler validates against authoritative state (level vs SERVER xp,
// tools/inputs vs SERVER inventory, object@tile + range vs the baked map
// index), rolls randomness SERVER-side, mutates only via state.ts primitives
// inside one withState transaction, and returns the standard envelope.
// Self-registers at import time; imported for side effect from server/index.ts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import { MAP_W, terrain, key, T } from './world';
import { getSimTick, sim } from './sim';
import { getTrainCd, setTrainCd } from './world-progress';
import {
  AuthState, SkillName,
  invAdd, invRemove, invHas, invCount, getCoins, addCoins, removeCoins,
  addXp, skillLevel,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8')) as T;
}

interface RawItem { stackable?: boolean; }
const ITEMS: Record<string, RawItem> = loadJson('../data/items.json');
function isStackable(id: string): boolean { return !!ITEMS[id]?.stackable; }

// Static world-object position index (same as intent-produce.ts) so obstacle/
// station intents validate against the tile the client named.
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
function nearNpc(cx: number, cy: number, defId: string, maxDist = 3): boolean {
  for (const n of sim.npcs) {
    if (n.dead || n.def.id !== defId) continue;
    if (chebyshev(cx, cy, n.x, n.y) <= maxDist) return true;
  }
  return false;
}

const chebyshev = (ax: number, ay: number, bx: number, by: number) =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
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

// ===========================================================================
// QV-TRAIN — Quaverside rooftop/weir course. Same shape as the generic
// 'train' handler (object@tile, range, RAM + save cooldowns, server-owned xp)
// plus: an optional tool gate per obstacle, and a wrightsong_mark grant on the
// lap keys (the ONE place Agility mints an item — data-keyed, never client-
// named). { obstacle, x, y }
// ===========================================================================
interface QvObstacle { level: number; xp: number; tool?: string; marks?: number; lap?: boolean; }
const QV_COURSE: Record<string, QvObstacle> = {
  qv_beam: { level: 1, xp: 14 },
  qv_lock_jump: { level: 8, xp: 18 },
  qv_rooftop: { level: 20, xp: 24 },
  qv_zipline: { level: 30, xp: 30, tool: 'silk_climbing_rope' },
  qv_chimney: { level: 40, xp: 36 },
  qv_gap_vault: { level: 52, xp: 44 },
  qv_spire_run: { level: 65, xp: 55 },
  quaver_lap: { level: 1, xp: 220, marks: 5, lap: true },
  spire_lap: { level: 60, xp: 480, marks: 12, lap: true },
};
const OBSTACLE_COOLDOWN_MS = 3000;
const LAP_COOLDOWN_MS = 15000;
const qvTrainLastMs = new Map<number, Record<string, number>>();

registerIntentDomain('qv-train', (ctx, payload) => {
  if (ctx.dead) return fail('qv-train', 'dead');
  const obstacle = String(payload.obstacle ?? '');
  const t = QV_COURSE[obstacle];
  if (!t) return fail('qv-train', 'unknown obstacle');
  const ox = num(payload.x), oy = num(payload.y);
  if (!t.lap) {
    if (!objectTypeAt(ox, oy, obstacle)) return fail('qv-train', 'no such obstacle here');
    if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('qv-train', 'out of range');
  } else if (chebyshev(ctx.x, ctx.y, ox, oy) > 4) {
    return fail('qv-train', 'out of range');
  }
  const cdKey = t.lap ? obstacle : `${obstacle}@${ox},${oy}`;
  const need = t.lap ? LAP_COOLDOWN_MS : OBSTACLE_COOLDOWN_MS;
  const now = Date.now();
  const ram = qvTrainLastMs.get(ctx.userId) ?? {};
  const lastRam = ram[cdKey] ?? 0;
  if (lastRam > 0 && now - lastRam < need) return fail('qv-train', 'too soon');
  return tx(ctx, 'qv-train', (state) => {
    const lastSave = getTrainCd(state, cdKey);
    if (lastSave > 0 && now - lastSave < need) return fail('qv-train', 'too soon');
    if (skillLevel(state, 'Agility') < t.level) return fail('qv-train', `requires Agility level ${t.level}`);
    if (t.tool && !hasTool(state, t.tool)) return fail('qv-train', 'you need a silk climbing rope');
    setTrainCd(state, cdKey, now);
    const nextRam = qvTrainLastMs.get(ctx.userId) ?? {};
    nextRam[cdKey] = now;
    qvTrainLastMs.set(ctx.userId, nextRam);
    const granted: { id: string; qty: number }[] = [];
    if (t.marks && t.marks > 0 && invAdd(state, 'wrightsong_mark', t.marks)) {
      granted.push({ id: 'wrightsong_mark', qty: t.marks });
    }
    const x = addXp(state, 'Agility', t.xp);
    return {
      ok: true, kind: 'qv-train', granted,
      xp: [{ skill: 'Agility' as SkillName, amount: t.xp }],
      leveledUp: x.leveledUp ? [{ skill: 'Agility' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// QV-TRAP-LAY / QV-TRAP-CHECK — Reedmarsh hunter traps, tiers above the bird
// snare. Own server-owned tile store (state.qvTraps) carrying the trap KIND;
// timer + 65% catch roll + level-tiered loot all server-side (snare-check
// pattern). All three kinds consume/return ONE box_trap item (the pitfall is
// dug with the box kit per the spec). { kind, x, y } / { x, y }
// ===========================================================================
type TrapKind = 'box' | 'pitfall' | 'highbox';
interface QvTrap { kind: TrapKind; laidAt: number; catchAt: number; }
const TRAP_DEFS: Record<TrapKind, { level: number }> = {
  box: { level: 20 },
  pitfall: { level: 45 },
  highbox: { level: 63 },
};

function trapMap(state: AuthState): Record<string, QvTrap> {
  const t = state.qvTraps;
  return t && typeof t === 'object' ? t as Record<string, QvTrap> : {};
}
function getTrap(state: AuthState, x: number, y: number): QvTrap | undefined {
  return trapMap(state)[`${x},${y}`];
}
function setTrap(state: AuthState, x: number, y: number, trap: QvTrap | null): void {
  const k = `${x},${y}`;
  const map = { ...trapMap(state) };
  if (trap === null) delete map[k];
  else map[k] = trap;
  state.qvTraps = map;
}

registerIntentDomain('qv-trap-lay', (ctx, payload) => {
  if (ctx.dead) return fail('qv-trap-lay', 'dead');
  const kind = String(payload.kind ?? '') as TrapKind;
  const def = TRAP_DEFS[kind];
  if (!def) return fail('qv-trap-lay', 'unknown trap');
  const ox = num(payload.x), oy = num(payload.y);
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 1) return fail('qv-trap-lay', 'out of range');
  const t = terrain[key(ox, oy)];
  if (t !== T.GRASS && t !== T.FLOWERS) return fail('qv-trap-lay', 'not open grass');
  return tx(ctx, 'qv-trap-lay', (state) => {
    if (skillLevel(state, 'Hunter') < def.level) return fail('qv-trap-lay', `requires Hunter level ${def.level}`);
    if (getTrap(state, ox, oy)) return fail('qv-trap-lay', 'trap already here');
    if (!invRemove(state, 'box_trap', 1)) return fail('qv-trap-lay', 'no box trap');
    const tick = getSimTick();
    setTrap(state, ox, oy, { kind, laidAt: tick, catchAt: tick + randInt(15, 40) });
    return { ok: true, kind: 'qv-trap-lay', removed: [{ id: 'box_trap', qty: 1 }] };
  });
});

registerIntentDomain('qv-trap-check', (ctx, payload) => {
  if (ctx.dead) return fail('qv-trap-check', 'dead');
  const ox = num(payload.x), oy = num(payload.y);
  if (chebyshev(ctx.x, ctx.y, ox, oy) > 2) return fail('qv-trap-check', 'out of range');
  return tx(ctx, 'qv-trap-check', (state) => {
    const trap = getTrap(state, ox, oy);
    if (!trap) return fail('qv-trap-check', 'no trap here');
    if (freeSlots(state) < 3) return fail('qv-trap-check', 'inventory full');
    setTrap(state, ox, oy, null);
    const tick = getSimTick();
    const ready = tick >= trap.catchAt;
    const caught = ready && Math.random() < 0.65;
    invAdd(state, 'box_trap', 1);
    if (!caught) {
      return { ok: true, kind: 'qv-trap-check', granted: [{ id: 'box_trap', qty: 1 }] };
    }
    const lvl = skillLevel(state, 'Hunter');
    const granted: { id: string; qty: number }[] = [{ id: 'box_trap', qty: 1 }];
    let xpAmt: number;
    if (trap.kind === 'box') {
      // L20 base: chime-moth. From L33, half the catches are resonant fowl
      // (meat + feathers) at higher xp — the spec's level-tiered variants.
      if (lvl >= 33 && Math.random() < 0.5) {
        invAdd(state, 'resonant_fowl_meat', 1); granted.push({ id: 'resonant_fowl_meat', qty: 1 });
        invAdd(state, 'feather', 2); granted.push({ id: 'feather', qty: 2 });
        xpAmt = 68;
      } else {
        invAdd(state, 'chime_moth', 1); granted.push({ id: 'chime_moth', qty: 1 });
        xpAmt = lvl >= 27 ? 58 : 50;
      }
    } else if (trap.kind === 'pitfall') {
      if (Math.random() < 0.6) {
        invAdd(state, 'larupia_fur', 1); granted.push({ id: 'larupia_fur', qty: 1 });
      } else {
        invAdd(state, 'resonant_fowl_meat', 1); granted.push({ id: 'resonant_fowl_meat', qty: 1 });
      }
      xpAmt = 110;
    } else {
      invAdd(state, 'chincrest', 1); granted.push({ id: 'chincrest', qty: 1 });
      xpAmt = 198;
    }
    const x = addXp(state, 'Hunter', xpAmt);
    return {
      ok: true, kind: 'qv-trap-check', granted,
      xp: [{ skill: 'Hunter' as SkillName, amount: xpAmt }],
      leveledUp: x.leveledUp ? [{ skill: 'Hunter' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// QV-SAW — teak/mahogany logs + coins -> planks at the Wrightsong sawmill.
// Wealth-shaped (spends coins), ECONOMY_FROZEN-gated, up to 5 per request
// (mirrors the carpenter's saw-planks, which is hardcoded to plain logs).
// { log: 'teak' | 'mahogany' }
// ===========================================================================
const SAW_ROWS: Record<string, { log: string; plank: string; cost: number }> = {
  teak: { log: 'teak_logs', plank: 'teak_plank', cost: 15 },
  mahogany: { log: 'mahogany_logs', plank: 'mahogany_plank', cost: 25 },
};
registerIntentDomain('qv-saw', (ctx, payload) => {
  if (ctx.dead) return fail('qv-saw', 'dead');
  if (ctx.frozen) return fail('qv-saw', 'frozen');
  const row = SAW_ROWS[String(payload.log ?? '')];
  if (!row) return fail('qv-saw', 'cannot saw that');
  if (!nearObject(ctx.x, ctx.y, 'qv_sawmill')) return fail('qv-saw', 'not near the sawmill');
  return tx(ctx, 'qv-saw', (state) => {
    let made = 0, spent = 0;
    for (let i = 0; i < 5; i++) {
      if (!invHas(state, row.log, 1) || getCoins(state) < row.cost) break;
      if (!invRemove(state, row.log, 1)) break;
      if (!removeCoins(state, row.cost)) { invAdd(state, row.log, 1); break; }
      invAdd(state, row.plank, 1); made++; spent += row.cost;
    }
    if (made === 0) return fail('qv-saw', 'no logs or coins');
    return {
      ok: true, kind: 'qv-saw',
      removed: [{ id: row.log, qty: made }, { id: 'coins', qty: spent }],
      granted: [{ id: row.plank, qty: made }],
      coins: getCoins(state),
    };
  });
});

// ===========================================================================
// QV-BUILD — Wrightsong Yard donated builds (teak/mahogany tier). The build
// consumes the listed inputs, grants Construction xp and the contract's
// wrightsong_mark payout (this is the repeatable contract loop — no quest
// stage needed because nothing here is monotonic). Tuning builds (chiming
// furniture) require the tuned_hammer. { output }
// ===========================================================================
interface QvBuild {
  level: number; xp: number; marks: number; tool: string;
  inputs: { item: string; qty: number }[];
}
const QV_BUILDS: Record<string, QvBuild> = {
  teak_chair: {
    level: 28, xp: 200, marks: 2, tool: 'hammer',
    inputs: [{ item: 'teak_plank', qty: 3 }, { item: 'nails', qty: 3 }],
  },
  teak_bookcase: {
    level: 36, xp: 260, marks: 3, tool: 'hammer',
    inputs: [{ item: 'teak_plank', qty: 4 }, { item: 'nails', qty: 4 }],
  },
  mahogany_table: {
    level: 50, xp: 360, marks: 5, tool: 'hammer',
    inputs: [{ item: 'mahogany_plank', qty: 4 }, { item: 'nails', qty: 4 }],
  },
  chiming_wardrobe: {
    level: 58, xp: 440, marks: 8, tool: 'tuned_hammer',
    inputs: [{ item: 'mahogany_plank', qty: 5 }, { item: 'nails', qty: 5 }, { item: 'chime_moth', qty: 1 }],
  },
  wrightsong_lectern: {
    level: 70, xp: 580, marks: 12, tool: 'tuned_hammer',
    inputs: [{ item: 'mahogany_plank', qty: 6 }, { item: 'nails', qty: 6 }, { item: 'chime_moth', qty: 2 }],
  },
};
registerIntentDomain('qv-build', (ctx, payload) => {
  if (ctx.dead) return fail('qv-build', 'dead');
  const b = QV_BUILDS[String(payload.output ?? '')];
  if (!b) return fail('qv-build', 'unknown build');
  if (!nearObject(ctx.x, ctx.y, 'qv_workbench')) return fail('qv-build', 'not near a guild workbench');
  return tx(ctx, 'qv-build', (state) => {
    if (skillLevel(state, 'Construction') < b.level) return fail('qv-build', `requires Construction level ${b.level}`);
    if (!hasTool(state, b.tool)) {
      return fail('qv-build', b.tool === 'tuned_hammer' ? 'you need a tuned hammer' : 'you need a hammer');
    }
    for (const inp of b.inputs) {
      if (!invHas(state, inp.item, inp.qty)) return fail('qv-build', 'missing materials');
    }
    const removed: { id: string; qty: number }[] = [];
    for (const inp of b.inputs) {
      if (!invRemove(state, inp.item, inp.qty)) {
        // refund anything already taken (shouldn't happen after invHas, but safe)
        for (const r of removed) invAdd(state, r.id, r.qty);
        return fail('qv-build', 'missing materials');
      }
      removed.push({ id: inp.item, qty: inp.qty });
    }
    const granted: { id: string; qty: number }[] = [];
    if (invAdd(state, 'wrightsong_mark', b.marks)) granted.push({ id: 'wrightsong_mark', qty: b.marks });
    const x = addXp(state, 'Construction', b.xp);
    return {
      ok: true, kind: 'qv-build', removed, granted,
      xp: [{ skill: 'Construction' as SkillName, amount: b.xp }],
      leveledUp: x.leveledUp ? [{ skill: 'Construction' as SkillName, level: x.newLevel }] : [],
    };
  });
});

// ===========================================================================
// QV-LAUNDER — Sly Maren's fence: 5 off-key coins -> 1000 clean coins (the
// coins' face value is 1250; the fence keeps a fifth, as fences do). Mints
// coins => wealth-shaped, ECONOMY_FROZEN-gated. Must stand at the fence table.
// ===========================================================================
const LAUNDER_IN = 5;
const LAUNDER_OUT = 1000;
registerIntentDomain('qv-launder', (ctx) => {
  if (ctx.dead) return fail('qv-launder', 'dead');
  if (ctx.frozen) return fail('qv-launder', 'frozen');
  if (!nearObject(ctx.x, ctx.y, 'fence_table')) return fail('qv-launder', 'not at the fence table');
  return tx(ctx, 'qv-launder', (state) => {
    if (invCount(state, 'hum_coin') < LAUNDER_IN) return fail('qv-launder', `you need ${LAUNDER_IN} off-key coins`);
    let taken = 0;
    for (let i = 0; i < LAUNDER_IN; i++) {
      if (invRemove(state, 'hum_coin', 1)) taken++;
    }
    if (taken < LAUNDER_IN) {
      for (let i = 0; i < taken; i++) invAdd(state, 'hum_coin', 1);
      return fail('qv-launder', `you need ${LAUNDER_IN} off-key coins`);
    }
    addCoins(state, LAUNDER_OUT);
    return {
      ok: true, kind: 'qv-launder',
      removed: [{ id: 'hum_coin', qty: LAUNDER_IN }],
      granted: [{ id: 'coins', qty: LAUNDER_OUT }],
      coins: getCoins(state),
    };
  });
});

// ===========================================================================
// QV-REDEEM — the four reward vendors. Spend wrightsong_mark on the district
// rewards; price + vendor + extra level gate are server data. The marks are
// the SINK the whole district feeds. { item }
// ===========================================================================
interface RedeemRow { price: number; vendor: string; reqSkill?: SkillName; reqLevel?: number; }
const REDEEM: Record<string, RedeemRow> = {
  // Pell the Quick — Agility
  quaver_boots: { price: 120, vendor: 'qv_agility_master', reqSkill: 'Agility', reqLevel: 40 },
  graceful_hood: { price: 90, vendor: 'qv_agility_master', reqSkill: 'Agility', reqLevel: 50 },
  graceful_jerkin: { price: 140, vendor: 'qv_agility_master', reqSkill: 'Agility', reqLevel: 50 },
  graceful_leggings: { price: 120, vendor: 'qv_agility_master', reqSkill: 'Agility', reqLevel: 50 },
  graceful_gloves: { price: 70, vendor: 'qv_agility_master', reqSkill: 'Agility', reqLevel: 50 },
  graceful_boots: { price: 80, vendor: 'qv_agility_master', reqSkill: 'Agility', reqLevel: 50 },
  silk_climbing_rope: { price: 10, vendor: 'qv_agility_master', reqSkill: 'Agility', reqLevel: 30 },
  skill_cape_agility: { price: 990, vendor: 'qv_agility_master', reqSkill: 'Agility', reqLevel: 99 },
  // Sly Maren — Thieving
  cutpurse_gloves: { price: 110, vendor: 'qv_thieving_master', reqSkill: 'Thieving', reqLevel: 45 },
  // Brackle the Trapper — Hunter
  hunters_horn: { price: 120, vendor: 'qv_hunter_master', reqSkill: 'Hunter', reqLevel: 50 },
  // Foreward Oss — Construction
  tuned_hammer: { price: 35, vendor: 'qv_construction_master', reqSkill: 'Construction', reqLevel: 40 },
  wrightsong_robe: { price: 150, vendor: 'qv_construction_master', reqSkill: 'Construction', reqLevel: 55 },
};
registerIntentDomain('qv-redeem', (ctx, payload) => {
  if (ctx.dead) return fail('qv-redeem', 'dead');
  const item = String(payload.item ?? '');
  const row = REDEEM[item];
  if (!row) return fail('qv-redeem', 'not a reward');
  if (!nearNpc(ctx.x, ctx.y, row.vendor)) return fail('qv-redeem', 'not near the vendor');
  return tx(ctx, 'qv-redeem', (state) => {
    if (row.reqSkill && row.reqLevel && skillLevel(state, row.reqSkill) < row.reqLevel) {
      return fail('qv-redeem', `requires ${row.reqSkill} level ${row.reqLevel}`);
    }
    if (invCount(state, 'wrightsong_mark') < row.price) return fail('qv-redeem', 'not enough marks');
    if (!isStackable(item) && freeSlots(state) === 0) return fail('qv-redeem', 'inventory full');
    if (!invRemove(state, 'wrightsong_mark', row.price)) return fail('qv-redeem', 'not enough marks');
    if (!invAdd(state, item, 1)) {
      invAdd(state, 'wrightsong_mark', row.price);
      return fail('qv-redeem', 'inventory full');
    }
    return {
      ok: true, kind: 'qv-redeem',
      removed: [{ id: 'wrightsong_mark', qty: row.price }],
      granted: [{ id: item, qty: 1 }],
    };
  });
});
