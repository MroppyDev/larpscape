# Conversion Contract — finishing the server-authoritative flip

This is the binding interface the **domain agents** code against to complete
`docs/ECONOMY-AUTHORITY.md` Phase 2: removing every client-authored owned-state
mutation so the client is a pure replica of server state (like OSRS). The
**authority spine** (this document's subject) is now in place; domains plug into
it without editing the spine files.

Read alongside `docs/STATE-CONTRACT.md` (owned vs presentation fields,
`server/state.ts` primitives, the locked `PUT /api/character` merge) and
`docs/ECONOMY-AUTHORITY.md` §2 (the intent catalogue).

> **Security invariant (non-negotiable).** The server NEVER trusts a
> client-supplied quantity/item/xp/coin/reward. Every handler INDEPENDENTLY
> validates (level, tool, inputs, proximity, shop stock+price, recipe, quest
> prerequisite stage, item requirements) against the authoritative `state` it is
> handed and computes the outcome itself, then mutates only through
> `server/state.ts` primitives inside ONE `stateStore.withState` transaction. A
> forged intent must FAIL or grant only the data-defined result. `ECONOMY_FROZEN`
> gates stay intact as the kill-switch on every wealth-shaped path.

---

## 1. Client apply-boundary (`src/game.ts`)

Owned state is server-authoritative. The internal mutators
`_applyXp / _applyItem / _applyRemove / _applyRemoveFromSlot` are the ONLY code
that writes owned fields, and they run ONLY on the server-apply path. They are
funnelled through a single sink:

```ts
applyGrant(echo: IntentEcho): void
```

`applyGrant` is called by `netIntent` (the `{t:'intent'}` WS reply) and
`netGranted` (the `{t:'granted'}` pickup echo). It applies, in order: `removed`,
`granted` (coins play the coin sfx), `xp` (so level-up messages fire with the
new inventory), then `equip` slot deltas. `coins`/`stage` ride along as
authoritative confirmations.

`addXp` / `addItem` / `removeItem` / `removeFromSlot` remain exported as **thin
aliases** of the `_apply*` mutators. They are reserved for `game.ts`'s own
combat-echo handlers (`netYouHit`, `netGot`, …). **Content code must never
reference them** — the lint (§4) enforces this.

### 1.1 `requestIntent` — the one entry point content uses

```ts
requestIntent(kind: string, payload?: Record<string, unknown>): Promise<IntentEcho>
```

Sends `{ t:'intent', kind, id, ...payload }` over the websocket and resolves with
the authoritative echo (correlated by `id`), or resolves `{ ok:false, error }` on
offline/timeout/refusal. Fire-and-forget callers may ignore the promise — the
echo is still applied centrally by `applyGrant`. `IntentEcho`:

```ts
interface IntentEcho {
  ok: boolean; kind: string; error?: string; id?: number;
  granted?: { id: string; qty: number }[];
  removed?: { id: string; qty: number }[];
  xp?: { skill: SkillName; amount: number }[];
  coins?: number; stage?: number;
  equip?: Record<string, { id: string; qty: number } | null>;
  burned?: boolean;
}
```

### 1.2 Migration helper (mechanical conversion)

```ts
// BEFORE (client-authored — now forbidden in content/packs/quests):
removeItem('logs', 1); addXp('Firemaking', 40);

// AFTER (server-validated):
requestIntent('firemake', { log: 'logs' });
```

```ts
// BEFORE: local quest write + handout
state.player.quests[id] = 2; addItem('cake', 1); addXp('Cooking', 100);

// AFTER: advance the stage (graph-validated), then claim the data-defined reward
await requestIntent('quest-stage', { id, stage: 2 });
requestIntent('quest-reward', { id, stage: 2 });   // grants from data/quest-rewards.json
```

Read-only helpers stay client-side and are **allowed**: `invCount`, `hasItem`,
`hasTool`, `freeSlots`, `level`, `combatLevel`, dialogue/UI, `requestIntent`,
`sendIntent`.

---

## 2. Intent vocabulary

Built-in kinds are dispatched in `server/intents-wire.ts`; everything else routes
through the **domain registry** (§3). All replies are the same
`{ t:'intent', ...IntentResult }` envelope (`server/intents.ts IntentResult`,
structurally identical to `IntentEcho`).

| kind | transport | payload | result fields | validation |
|---|---|---|---|---|
| `gather` | WS | `{ obj, x, y }` | `granted, xp, leveledUp` | object@tile, range≤2, tool, level, room |
| `fish` | WS | `{ spot:'net'\|'bait', x, y }` | `granted, removed, xp` | spot@tile, range, tool/bait, level |
| `cook` | WS | `{ raw }` | `granted, removed, xp, burned` | recipe, level, has raw, burn roll |
| `firemake` | WS | `{ log }` | `removed, xp` | tinderbox, level, has log |
| `make` / `produce` | WS | `{ recipe, output }` | `granted, removed, xp, burned` | recipe-class+output, level, station/tool, inputs |
| `equip` | WS + `POST /api/intent/equip` | `{ op:'equip'\|'unequip', slot, item, source:'inventory'\|'bank' }` | `removed/granted, equip` | levelReq vs server xp, source possession, room |
| `shop` | `POST /api/intent/shop` | `{ op:'buy'\|'sell', shop, item }` | `granted, removed, coins` | `ECONOMY_FROZEN`, stock, price, coins, room |
| `bank` | `POST /api/intent/bank` | `{ op:'deposit'\|'withdraw', item, qty:number\|'all' }` | `granted/removed` | possession, room |
| `quest-stage` | WS + `POST /api/intent/quest/advance` | `{ id, stage }` | `stage, removed` | **quest graph** (§5): from-stage, prereq quests, required items consumed |
| `quest-reward` | WS + `POST /api/intent/quest/claim` | `{ id, stage }` | `granted, xp, coins` | data-defined reward, stage reached, **idempotent** per (quest,stage) |
| `scripted-grant` | WS + `POST /api/intent/quest/grant` | `{ id, stage }` | `granted, xp, coins` | same gate as `quest-reward` (dialogue handout from the reward registry) |
| `gamble` | registry — `POST /api/intent/gamble` | domain-defined | domain-defined | `ECONOMY_FROZEN`, server-escrow both stakes |
| `slayer` | registry — `POST /api/intent/slayer` | domain-defined (`assign`/`complete`/`spend`) | domain-defined | server assigns/counts/awards from data |

`produce` is an alias of `make` (recipe-class driven). Domain agents add new
producible recipes in `data/recipes.json` — **not** code — and the existing
`RECIPE_INDEX` resolves them. Genuinely new producing classes (thieving rolls,
farming harvest with grow timers) register their own kind via §3.

### 2.1 Equip semantics

`setEquip` (state.ts) validates `levelReq` against server xp. The `equip` handler
moves the item out of the chosen `source`, swaps in, and returns the
previously-worn item to the inventory (overflow → bank). Stackable ammo equips
the whole owned amount. On a failed level check the item is returned to source
and the intent fails. `equip.<slot>` in the echo is the authoritative new slot
contents.

---

## 3. Domain registry — add kinds in SEPARATE files

To avoid collisions, a domain implements its server handlers in its **own**
module `server/intent-<domain>.ts` and self-registers at import time. **No domain
edits `intents.ts` or `intents-wire.ts`.**

```ts
// server/intent-slayer.ts
import { registerIntentDomain, DomainCtx, IntentResult, stampRev } from './intents';
import { withState helpers from './state' } ...

registerIntentDomain('slayer', (ctx: DomainCtx, payload): IntentResult => {
  // ctx: { userId, x, y, dead, store, frozen, revOf }
  if (payload.op === 'spend' && ctx.frozen) return { ok:false, kind:'slayer', error:'frozen' };
  const res = ctx.store.withState<IntentResult>(ctx.userId, (state) => {
    // INDEPENDENTLY validate against `state`; mutate via state.ts primitives.
    return { ok:true, kind:'slayer', /* granted/xp/... */ };
  });
  if (!res) return { ok:false, kind:'slayer', error:'no character' };
  return stampRev(ctx.store, ctx, res);
});
```

Then import the module once for its side effect from `server/index.ts`
(`import './intent-slayer';`). The wire dispatches:
- **WS**: any `{t:'intent', kind}` not in the built-in switch → registered handler.
- **HTTP**: `POST /api/intent/:kind` with body `{ ...payload }` → registered
  handler (explicit routes above take precedence).

Registry surface (`server/intents.ts`):

```ts
registerIntentDomain(kind: string, handler: DomainHandler): void   // throws on dup
getIntentDomain(kind): DomainHandler | undefined
hasIntentDomain(kind): boolean
registeredDomainKinds(): string[]
stampRev(store, ctx, result): IntentResult                          // sets result.rev
interface DomainCtx extends IntentCtx { store: StateStore; frozen: boolean; revOf(userId): number }
type DomainHandler = (ctx: DomainCtx, payload: Record<string, unknown>) => IntentResult
```

Position/`dead` in `DomainCtx` come from the live `PlayerView` on the WS path and
are sentinels (`-999`) on the HTTP path — handlers that need proximity must be WS.

---

## 4. Lint — `npm run lint:grants` (`scripts/lint-no-client-grants.ts`)

Scans `src/content.ts`, `src/quests.ts`, `src/packs/**` and **exits 1** if any of
them reference an owned-state mutator directly. This is the objective proof of
zero client-authored owned data; the gate phase requires it GREEN.

Forbidden in those files:
- mutator calls: `addXp`, `addItem`, `removeItem`, `removeFromSlot`,
  `_applyXp`, `_applyItem`, `_applyRemove`, `_applyRemoveFromSlot`,
  `applyGrant`, `applyIntentEcho`;
- legacy owned-state UI mutators: `bankDeposit`, `bankWithdraw`, `shopBuy`,
  `shopSell`, `equipItem`, `unequip`, `setEquip`;
- direct owned-field writes on the player doc: `player.quests[...] =`,
  `player.collectionLog[...] =`, `player.slayerTask =`, `player.slayerPoints`,
  `player.specEnergy`, `player.curHp`, `player.prayerPoints`, `player.xp[...] =`,
  `player.bank.push/splice/...`.

Allowed: `requestIntent`, `sendIntent`, all read-only helpers, UI/dialogue. The
scanner strips comments and string literals before matching, so docstrings that
name a forbidden function never trip it — only real code references count.

> The lint FAILS today (≈400 references) — that is the expected pre-migration
> state. Each domain drives its owned files to zero; the gate runs the lint once
> all domains land.

---

## 5. Quest framework (`server/quests-graph.ts` + data)

### 5.1 `data/quest-graph.json`

```jsonc
{
  "<questId>": {
    "transitions": [
      {
        "from": <int>,                 // requiredStage — player must be exactly here
        "to":   <int>,                 // resulting stage (> from; monotonic)
        "requiredItems":       [{ "id": "<item>", "qty": <int> }],   // consumed server-side
        "requiredQuestStages": [{ "id": "<questId>", "stage": <int> }] // gate on other quests
      }
    ]
  }
}
```

`advanceQuest(state, id, toStage)` (called by the `quest-stage` handler inside
`withState`) validates: `from === current stage`, all `requiredQuestStages`
satisfied, all `requiredItems` present (then consumed). It returns the resulting
stage + `consumed[]`. **An advance grants no item/coin/xp.** A quest absent from
the graph falls back to advisory monotonic advance (narrative gating) and still
mints nothing — so un-migrated quests keep working while agents populate the
graph. Stages never rewind (`state.ts setQuestStage` is monotonic).

### 5.2 `data/quest-rewards.json`

Keyed `"<questId>:<stage>"` → `{ items?: [{id,qty}], xp?: [{skill,amount}], coins? }`.
The `quest-reward` / `scripted-grant` handlers grant EXACTLY this, ONCE per
(quest,stage) — idempotency marker `__claim_<id>_<stage>` in the quests map — and
only if the player has legitimately reached the stage (`questStage(state,id) >=
stage`). The client never supplies an amount. Item overflow goes to the bank.

Populating a quest is therefore: add its `transitions` to `data/quest-graph.json`,
add its per-stage rewards to `data/quest-rewards.json`, and convert the client
quest pack to `requestIntent('quest-stage', …)` / `requestIntent('quest-reward', …)`.

---

## 6. Client file ownership (DISJOINT — avoid collisions)

Each domain agent owns ONLY the listed client files (and its own
`server/intent-<domain>.ts`). The spine owns `src/game.ts`, `src/net.ts`,
`server/intents.ts`, `server/intents-wire.ts`, `server/state.ts`,
`server/quests-graph.ts`, `scripts/lint-no-client-grants.ts`, this doc, and the
two quest JSON data files' SCHEMAS (agents append entries; they do not restructure).

| Domain | Owns (client) | Server module |
|---|---|---|
| **Skilling/gathering** | `src/content.ts`, `src/packs/skills_gathering.ts`, `src/packs/skills_production.ts`, `src/packs/wildlife.ts` | extends `make`/`gather`; new producing kinds via registry (e.g. `intent-thieving.ts`, `intent-farming.ts`) |
| **Shops/bank/market UI** | `src/packs/market_clerk.ts`, `src/packs/city.ts`, `src/packs/hub_eldermere.ts`, `src/packs/hub_gullswreck.ts`, `src/packs/hub_stonewatch.ts`, `src/packs/region_port.ts` | `shop`/`bank`/`equip` (built-in) |
| **Quests A** | `src/quests.ts`, `src/packs/quest_city.ts`, `src/packs/quest_bog.ts`, `src/packs/quest_drake.ts`, `src/packs/quest_warlord.ts`, `src/packs/quest6_a.ts`, `src/packs/quest6_b.ts`, `src/packs/quest6_c.ts` | `quest-stage`/`quest-reward`/`scripted-grant` + data |
| **Quests B (guild/discord arc)** | `src/packs/gd1_sour_notes.ts`, `gd2_quarrel_of_wizards.ts`, `gd3_sealed_wing.ts`, `gd4_gathering_discord.ts`, `cold_comfort.ts`, `against_the_grain.ts`, `keep_the_light.ts`, `thunder_on_the_tide.ts`, `warlords_banner` content | `quest-stage`/`quest-reward`/`scripted-grant` + data |
| **Quests C (lore one-offs)** | `src/packs/hush_of_ravenmoor.ts`, `hymn_for_the_hollow.ts`, `gun_guild.ts`, `starter_south.ts`, `region_desert.ts`, `region_frostpeak.ts`, `region_depths.ts` | as above |
| **Bosses/dungeon/slayer** | `src/packs/boss_bog.ts`, `boss_drake.ts`, `boss_warlord.ts`, `untuned_mine.ts`, `slayer_tasks.ts` | `intent-slayer.ts` (registry); loot already server-side |
| **Gambling** | `src/packs/gambling.ts` | `intent-gamble.ts` (registry; stays behind `ECONOMY_FROZEN`) |

If two agents need the same shared pack (`src/packs/index.ts`, `hub_*` shared by
shops and quests), coordinate: the shop agent owns the buy/sell wiring, the quest
agent owns the dialogue branches; they edit disjoint functions.

---

## 7. What the spine guarantees (do not break)

- `applyGrant` is the single owned-state apply sink on the client; `requestIntent`
  is the single content entry point. `_apply*` mutators write owned state nowhere
  else.
- `registerIntentDomain` lets domains add kinds without touching spine files; the
  WS switch + `POST /api/intent/:kind` both dispatch the registry.
- `quest-stage` is graph-validated and monotonic; `quest-reward`/`scripted-grant`
  are data-defined and idempotent; an advance mints nothing.
- `npm run lint:grants` is the objective zero-client-grant gate.
- `npx tsc --noEmit` is green in both trees (root + `admin/`) with the spine in
  place.
