// server/intent-questb.ts — Quests batch-2 REPEATABLE quest-object grants.
//
// Registry domain `questb-grant` (docs/CONVERSION-CONTRACT.md §registry). The
// idempotent ONCE-per-stage completion rewards live in data/quest-rewards.json
// (the quest-reward / scripted-grant kinds in intents.ts). THIS module covers
// the quest-flow grants that may legitimately REPEAT — picking a renewable
// wheat sheaf, buying a wheat for coins, running the cursed-mill demo, re-issuing
// a lost receipt — which an idempotent claim cannot express.
//
// Trust model (mirrors the SECURITY RULES / ECONOMY-AUTHORITY §2): the client
// sends ONLY { grant:'<id>' }. The server looks the grant up in the data table,
// INDEPENDENTLY validates the quest+stage gate against SERVER state, consumes any
// declared cost (coins/items) and `consume` transform inputs, checks inventory
// room, then grants EXACTLY the data-defined `out`. A forged payload can only
// ever yield a data-defined grant the player is actually gated for, or fail. No
// quantity/item/cost is ever trusted from the client. questb-grant NEVER advances
// a quest stage and NEVER mints anything not in the table.
//
// This module self-registers at import time; server/index.ts imports it once for
// the side effect (alongside the other intent-<domain> modules).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ECONOMY_FROZEN } from './econ-freeze';
import {
  registerIntentDomain, DomainCtx, IntentResult, stampRev,
} from './intents';
import {
  AuthState, isKnownItem, invAdd, invRemove, invCount, invHas,
  getCoins, removeCoins, questStage,
} from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface GrantDef {
  quest: string;                              // quest this grant belongs to
  stageMin?: number;                          // player stage must be >= (default 0)
  stageMax?: number;                          // player stage must be <= (default Inf)
  cost?: { coins?: number; items?: { id: string; qty: number }[] }; // consumed first
  consume?: { id: string; qty: number }[];    // transform inputs (e.g. 1 wheat -> 2)
  out: { id: string; qty: number }[];         // exactly what is granted
  once?: boolean;                             // collapse to one grant per (quest,stage)
  frozen?: boolean;                           // gate on ECONOMY_FROZEN (coin-shaped)
}

function loadGrants(): Record<string, GrantDef> {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../data/questb-grants.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, GrantDef> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('_')) continue;
      const d = v as GrantDef;
      if (d && typeof d.quest === 'string' && Array.isArray(d.out)) out[k] = d;
    }
    return out;
  } catch { return {}; }
}

const GRANTS = loadGrants();

const fail = (error: string): IntentResult => ({ ok: false, kind: 'questb-grant', error });

// Empty inventory slots in the authoritative state (mirrors intents.ts).
function freeSlots(state: AuthState): number {
  const inv = Array.isArray(state.inventory) ? state.inventory : [];
  let free = 28 - inv.length;
  for (const s of inv) if (s === null) free++;
  return Math.max(0, free);
}

registerIntentDomain('questb-grant', (ctx: DomainCtx, payload): IntentResult => {
  const grantId = typeof payload.grant === 'string' ? payload.grant : '';
  const def = GRANTS[grantId];
  if (!def) return fail('unknown grant');
  if (def.frozen && (ECONOMY_FROZEN || ctx.frozen)) return fail('frozen');

  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    // ---- quest-stage gate (server-authoritative) ----
    const cur = questStage(state, def.quest);
    if (cur < (def.stageMin ?? 0)) return fail('not available yet');
    if (def.stageMax !== undefined && cur > def.stageMax) return fail('no longer available');

    // ---- once-per-(quest,stage) idempotency (optional) ----
    let claimKey = '';
    if (def.once) {
      if (!state.quests || typeof state.quests !== 'object') state.quests = {};
      claimKey = `__qbg_${grantId}_${cur}`;
      if (state.quests[claimKey]) return fail('already taken');
    }

    // ---- validate ALL inputs present BEFORE consuming anything ----
    if (def.cost?.coins && getCoins(state) < def.cost.coins) return fail('not enough coins');
    for (const c of def.cost?.items ?? []) {
      if (!isKnownItem(c.id) || !invHas(state, c.id, Math.max(1, Math.floor(c.qty)))) return fail('missing a required item');
    }
    for (const c of def.consume ?? []) {
      if (!isKnownItem(c.id) || !invHas(state, c.id, Math.max(1, Math.floor(c.qty)))) return fail('missing a required item');
    }

    // ---- inventory room: net new non-stackable items must fit ----
    // Account for slots freed by `consume` of a held item (the transform case).
    const consumedIds = new Set((def.consume ?? []).map((c) => c.id));
    let needSlots = 0;
    for (const o of def.out) {
      const stackable = invCount(state, o.id) > 0; // already holding => stacks/uses a slot
      // a brand-new non-stackable each needs a slot; stackables/owned share one
      if (!stackable && !consumedIds.has(o.id)) needSlots += 1;
    }
    if (needSlots > freeSlots(state)) return fail('inventory full');

    // ---- consume cost + transform inputs ----
    const removed: { id: string; qty: number }[] = [];
    if (def.cost?.coins) { removeCoins(state, def.cost.coins); removed.push({ id: 'coins', qty: def.cost.coins }); }
    for (const c of def.cost?.items ?? []) {
      const qty = Math.max(1, Math.floor(c.qty));
      invRemove(state, c.id, qty); removed.push({ id: c.id, qty });
    }
    for (const c of def.consume ?? []) {
      const qty = Math.max(1, Math.floor(c.qty));
      invRemove(state, c.id, qty); removed.push({ id: c.id, qty });
    }

    // ---- grant exactly the data-defined output ----
    const granted: { id: string; qty: number }[] = [];
    for (const o of def.out) {
      if (!isKnownItem(o.id)) continue;
      const qty = Math.max(1, Math.floor(o.qty));
      if (invAdd(state, o.id, qty)) granted.push({ id: o.id, qty });
    }
    if (def.once && claimKey) state.quests[claimKey] = 1;

    return {
      ok: true, kind: 'questb-grant',
      granted: granted.length ? granted : undefined,
      removed: removed.length ? removed : undefined,
    };
  });
  if (!res) return fail('no character');
  return stampRev(ctx.store, ctx, res);
});
