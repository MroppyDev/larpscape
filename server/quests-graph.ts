// server/quests-graph.ts — data-driven quest authority (docs/CONVERSION-CONTRACT.md
// §quest-graph). The server owns quest stage state; the client may REQUEST a
// stage advance or a reward claim, but the server validates every transition
// against this graph and grants rewards ONLY from data/quest-rewards.json.
//
// Trust model (non-negotiable, mirrors ECONOMY-AUTHORITY §2 / the SECURITY RULES):
//   * Stages are MONOTONIC (state.ts setQuestStage never rewinds). A forged
//     "rewind to re-claim" is impossible.
//   * A transition to `toStage` is allowed ONLY if the graph declares it AND
//     every prerequisite holds against SERVER state:
//       - requiredStage:        questStage(state,id) must equal it (the player is
//                               exactly at the from-stage; prevents skipping).
//       - requiredItems[]:      consumed server-side (invRemove) on a valid advance.
//       - requiredQuestStages[]:other quests must be at/past the named stage.
//   * Narrative-only gates (talked-to-NPC) carry no items[]/prereqs and simply
//     advance the stage; NO item/coin/xp is ever granted by an advance — rewards
//     come exclusively from quest-reward (data-defined, idempotent per stage).
//
// If data/quest-graph.json is absent or a quest is unlisted, advancement falls
// back to "monotonic free advance" (advisory narrative gating only) so the
// quest-domain agents can populate the graph incrementally without breaking
// un-migrated quests. Item/coin/xp are STILL never minted by an advance.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AuthState, invHas, invRemove, questStage, isKnownItem } from './state';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- JSON schema (see docs/CONVERSION-CONTRACT.md) -------------------------
// data/quest-graph.json:
// {
//   "<questId>": {
//     "transitions": [
//       {
//         "from": <int>,          // requiredStage: player must be exactly here
//         "to": <int>,            // resulting stage (must be > from)
//         "requiredItems":       [{ "id": "<item>", "qty": <int> }],   // consumed
//         "requiredQuestStages": [{ "id": "<questId>", "stage": <int> }] // gate
//       }
//     ]
//   }
// }
export interface QuestTransition {
  from: number;
  to: number;
  requiredItems?: { id: string; qty: number }[];
  // requiredQuestStages: a numeric `stage` is a >= threshold; an optional `mask`
  // is for BITMASK sub-keys (marks) where the requirement is "these exact bits".
  // A plain >= let a high bit substitute for required low bits and skip mark
  // steps (e.g. the q5 lily bit standing in for crate+revenant). When `mask` is
  // present it is checked as (value & mask) === mask instead of the threshold.
  requiredQuestStages?: { id: string; stage?: number; mask?: number }[];
}
export interface QuestGraphEntry { transitions: QuestTransition[]; }
export type QuestGraph = Record<string, QuestGraphEntry>;

function loadGraph(): QuestGraph {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../data/quest-graph.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const graph: QuestGraph = {};
    for (const [qid, entry] of Object.entries(parsed)) {
      if (qid.startsWith('_')) continue; // allow a leading _comment key
      const transitions = (entry as QuestGraphEntry)?.transitions;
      if (Array.isArray(transitions)) graph[qid] = { transitions };
    }
    return graph;
  } catch { return {}; }
}

const GRAPH: QuestGraph = loadGraph();

export interface AdvanceResult {
  ok: boolean;
  error?: string;
  stage?: number;                       // resulting (monotonic) stage on success
  consumed?: { id: string; qty: number }[]; // items debited by the transition
}

// Validate + apply a stage advance against SERVER state, inside the caller's
// withState transaction. Returns the resulting stage on success. Consumes any
// requiredItems. Never grants value — rewards are a separate claim.
export function advanceQuest(state: AuthState, id: string, toStage: number): AdvanceResult {
  if (typeof id !== 'string' || !/^[a-z0-9_]{1,48}$/.test(id)) return { ok: false, error: 'bad quest id' };
  const to = Math.floor(toStage);
  if (!Number.isFinite(to) || to < 0) return { ok: false, error: 'bad stage' };
  const cur = questStage(state, id);
  if (to < cur) {
    // forged rewind — reject; stage stays monotonic.
    return { ok: false, error: 'cannot rewind quest stage' };
  }
  if (to === cur) {
    return { ok: true, stage: cur, consumed: [] };
  }

  const entry = GRAPH[id];
  if (!entry) {
    // Unlisted quest: advisory narrative gate only. Advance monotonically, mint
    // nothing. (Quest-domain agents add the strict graph entry later.)
    setStageMonotonic(state, id, to);
    return { ok: true, stage: questStage(state, id), consumed: [] };
  }

  const t = entry.transitions.find((tr) => tr.from === cur && tr.to === to);
  if (!t) return { ok: false, error: 'illegal quest transition' };

  // prerequisite quests (numeric threshold) or bitmask sub-keys (exact bits)
  for (const req of t.requiredQuestStages ?? []) {
    const val = questStage(state, req.id);
    if (typeof req.mask === 'number') {
      if ((val & req.mask) !== req.mask) return { ok: false, error: `requires progress in ${req.id}` };
    } else if (val < Math.floor(req.stage ?? 0)) {
      return { ok: false, error: `requires progress in ${req.id}` };
    }
  }
  // required items must all be present BEFORE consuming any
  for (const it of t.requiredItems ?? []) {
    if (!isKnownItem(it.id) || !invHas(state, it.id, Math.max(1, Math.floor(it.qty)))) {
      return { ok: false, error: 'missing a required item' };
    }
  }
  const consumed: { id: string; qty: number }[] = [];
  for (const it of t.requiredItems ?? []) {
    const qty = Math.max(1, Math.floor(it.qty));
    invRemove(state, it.id, qty);
    consumed.push({ id: it.id, qty });
  }
  setStageMonotonic(state, id, to);
  return { ok: true, stage: questStage(state, id), consumed };
}

// Direct monotonic write (used by the fallback path and tests). Mirrors
// state.setQuestStage but kept here so the graph module is the only writer
// callers reach for in the quest domain.
function setStageMonotonic(state: AuthState, id: string, stage: number): void {
  if (!state.quests || typeof state.quests !== 'object') state.quests = {};
  const next = Math.max(0, Math.floor(stage));
  const prev = questStage(state, id);
  state.quests[id] = Math.max(prev, next);
}

// Whether the graph knows this quest (so callers can choose strict vs advisory
// messaging). Exposed for the quest-domain agents + tests.
export function hasQuestGraph(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(GRAPH, id);
}

export function questGraph(): QuestGraph { return GRAPH; }
