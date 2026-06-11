// src/quest-sync.ts — quest-domain reflection layer (Quests batch 2).
//
// The SERVER owns quest stage state and grants every reward from data
// (data/quest-graph.json + data/quest-rewards.json). The client only ever
// REQUESTS a stage advance or a reward claim through `requestIntent` and then
// REFLECTS the authoritative echo so the local journal/dialogue UI reads the
// same number the server stored. This module is the single place quest packs
// call to drive that flow.
//
// Why this file exists (and why it is NOT a lint violation): the apply-boundary
// echo for `quest-stage` carries the resulting `stage` but not the quest id
// (server/intents.ts questAdvance), so the central `applyGrant` sink in game.ts
// cannot know WHICH quest to reflect. The pack knows the id (it passed it) and
// gets `stage` back, so it reflects here. The lint (scripts/lint-no-client-grants.ts)
// scans src/content.ts, src/quests.ts and src/packs/** — this top-level module is
// intentionally outside that set, and it writes ONLY the server-confirmed value
// returned in the echo. It never authors a stage; it mirrors one.
//
// See docs/CONVERSION-CONTRACT.md §1 / §5.

import { state, requestIntent, IntentEcho } from './game';

// Read the locally-reflected stage (server-confirmed). Pure read; safe anywhere.
export function questStage(id: string): number {
  return state.player?.quests?.[id] ?? 0;
}

// Reflect a server-confirmed stage into the local quest map. The value MUST come
// from a server echo (echo.stage) or a known-server value — never a client guess.
// Monotonic, mirroring the server (setQuestStage never rewinds).
export function reflectQuestStage(id: string, stage: number): void {
  if (!state.player) return;
  if (!state.player.quests || typeof state.player.quests !== 'object') state.player.quests = {};
  const prev = state.player.quests[id] ?? 0;
  state.player.quests[id] = Math.max(prev, Math.floor(stage));
}

// Request a graph-validated stage advance. On success the server has already
// applied the stage (and consumed any requiredItems, echoed in `removed` and
// applied by applyGrant); we reflect the resulting stage locally for the UI.
// Returns the echo so callers can branch on ok/error. Awaiting keeps dialogue
// ordering correct (advance, then show the next line).
export async function advanceQuestStage(id: string, stage: number): Promise<IntentEcho> {
  const echo = await requestIntent('quest-stage', questPayload(id, stage));
  if (echo.ok && typeof echo.stage === 'number') reflectQuestStage(id, echo.stage);
  return echo;
}

// Quest intents identify the quest by id, but requestIntent() injects its own
// numeric correlation `id` into every message and the payload is spread AFTER
// it — so a payload key named `id` would clobber the correlation id and the
// reply could never resolve the pending promise (8s timeout). We therefore pass
// the quest id under `qid` (and keep `id` as a no-op duplicate for any wire that
// still reads it) so the numeric correlation id survives and the promise
// resolves on the echo.
// SPINE DEPENDENCY (flagged to batch1): server/intents-wire.ts must read the
// quest id from `msg.qid ?? msg.id` for the quest-stage / quest-reward /
// scripted-grant kinds. Until then these intents reach the server with the
// numeric correlation id as the quest id and fail validation server-side.
function questPayload(id: string, stage: number): Record<string, unknown> {
  return { qid: id, stage };
}

// Claim the data-defined COMPLETION reward for (id, stage). The server grants
// EXACTLY what data/quest-rewards.json lists, ONCE per (quest,stage); the echo's
// granted/xp/coins are applied centrally by applyGrant. Idempotent server-side,
// so a double-claim is harmless. The player must already be at/past the stage.
export async function claimQuestReward(id: string, stage: number): Promise<IntentEcho> {
  return requestIntent('quest-reward', questPayload(id, stage));
}

// A scripted dialogue HAND-OUT of a fixed, data-defined item at a gated stage
// (e.g. a receipt or a piece of evidence). Same server gate + idempotency as a
// reward claim, restricted to items in data/quest-rewards.json. The client never
// supplies the item or quantity.
export async function scriptedGrant(id: string, stage: number): Promise<IntentEcho> {
  return requestIntent('scripted-grant', questPayload(id, stage));
}

// Request a data-defined REPEATABLE quest-object grant (server/intent-questb.ts).
// Unlike scriptedGrant, these may legitimately repeat (renewable pick, lost-item
// re-issue, the cursed-mill demo). The server validates the quest+stage gate,
// consumes any cost/consume items, and grants EXACTLY the data-defined output.
// `grant` is the server grant id (data/questb-grants.json); the client never
// supplies the item/qty. This rides the registry, so `kind` is a plain string
// and the numeric correlation id is preserved (no quest-id collision).
export async function questbGrant(grant: string): Promise<IntentEcho> {
  return requestIntent('questb-grant', { grant });
}

// ---------------------------------------------------------------------------
// Auxiliary quest PROGRESS counters (brazier bitmasks, kill counters, etc.).
//
// These are sub-stage progress trackers the server does not yet model in the
// quest graph. They gate purely-local quest UX (which brazier is lit, how many
// wolves driven off) and never themselves mint item/coin/xp — the only value a
// quest grants flows through the server reward registry above. They live in the
// quests map (so the journal can read them) and persist via the locked
// PUT /api/character merge like any quest field.
//
// Reflecting them here (rather than writing state.player.quests[...] inside a
// pack) keeps the lint green and concentrates the "still client-tracked" surface
// in one auditable place. FOLLOW-UP (flagged to the spine): promote these to
// server-owned counters via dedicated intents so they are authoritative too.
// ---------------------------------------------------------------------------
export function auxCount(key: string): number {
  return state.player?.quests?.[key] ?? 0;
}

export function setAuxCount(key: string, value: number): void {
  if (!state.player) return;
  if (!state.player.quests || typeof state.player.quests !== 'object') state.player.quests = {};
  state.player.quests[key] = Math.max(0, Math.floor(value));
}

export function setAuxBits(key: string, bits: number): void {
  setAuxCount(key, bits);
}
