# State Contract — server-authoritative character state

This is the contract every later economy-authority agent codes against. It is the
realisation of `docs/ECONOMY-AUTHORITY.md` §1.2 and §1.3. Phase 1 (this work)
stands up the authoritative mutation layer and flips `PUT /api/character` to a
merge that ignores client-supplied owned fields.

## 1. Storage

`characters` table (migrated, idempotent at boot in `server/index.ts`):

```
characters(
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  save       TEXT    NOT NULL,            -- AUTHORITATIVE server-owned JSON document
  rev        INTEGER NOT NULL DEFAULT 0,  -- bumped on every server-side mutation (added this phase)
  updated_at INTEGER NOT NULL
)
```

`rev` is the optimistic-concurrency counter + client cache key. It is bumped by
`UPDATE characters SET save=?, rev=rev+1, updated_at=?` inside every `withState`
transaction. The client uses `rev` only to know its mirror is stale; it never
authors state. Migration is `ALTER TABLE characters ADD COLUMN rev INTEGER NOT
NULL DEFAULT 0`, guarded by a `PRAGMA table_info` check; existing rows backfill
to `0` via the column default.

The `save` document is byte-shape-identical to the client save produced by
`src/game.ts saveGame()` — ownership transferred, data not transformed.

## 2. Owned vs presentation fields — `shared/save-schema.ts`

The single source of truth for which save keys the server owns vs which the
client may supply. Imported by both client and server.

- `OWNED_FIELDS` (server-owned, client may NOT author):
  `xp`, `coins`, `bank`, `inventory`, `equipment`, `quests`, `collectionLog`,
  `specEnergy`, `curHp`, `prayerPoints`, `slayerTask`, `slayerPoints`.
- `PRESENTATION_FIELDS` (client-owned, cosmetic/UX only):
  `name`, `x`, `y`, `run`, `energy`, `combatStyle`, `autocastSpell`, `music`.

> `combatStyle` / `autocastSpell` are SELECTION-only. The *effect* of a style or
> autocast is server-applied in combat (Phase 3); the client value is a request.

Exports:

```ts
OWNED_FIELDS: readonly string[]
PRESENTATION_FIELDS: readonly string[]
isOwnedField(key: string): boolean
isPresentationField(key: string): boolean
pickPresentation(clientSave): Record<string, unknown>   // only presentation keys survive
mergeSave(authoritative, clientSave): Record<string, unknown>
    // = { ...authoritative (owned source of truth), ...pickPresentation(clientSave) }
```

## 3. `PUT /api/character` behaviour (reworked this phase)

`server/index.ts`, route at the same place as before. Pipeline:

1. Save fence check (unchanged) → 409 `save_fenced` if fenced.
2. Body validation: `save` must be an object (unchanged).
3. Size cap on the client payload (512 KiB, unchanged).
4. **Merge**: load the server's authoritative row; `merged =
   mergeSave(authoritative, clientPayload)`. Owned fields come ONLY from the
   server document; presentation fields are overlaid from the client.
5. Size cap on the merged doc; write with the existing
   INSERT…ON CONFLICT; respond `{ ok: true }`.

Consequences:
- A forged PUT with inflated `xp`/`coins`/`bank`/`inventory`/`equipment`/`quests`
  has **zero** effect on value or progress (closes G5/H1/M6 for the save-edit
  master key).
- **First-save seeding**: if there is no existing `characters` row for the user,
  the PUT accepts the full payload to seed the document (a fresh player created
  with starter gear client-side is not wiped). Once a row exists, every
  subsequent PUT takes the merge path. Phase 2 narrows creation server-side.
- **Phase boundary (expected gap)**: until Phase 2's skilling/loot intents land,
  the client has no server-validated path to gain owned items/xp, so legitimate
  gains made after the first save are not persisted. This is intentional — do not
  half-route gains through this route.

The save fence + `{t:'save_reload'}` push + rate limit are all preserved.

## 4. `server/state.ts` — authoritative mutation layer

Import the catalogue/curve constants directly; obtain the DB-bound store from
`server/index.ts`'s exported `stateStore` (created via `createStateStore(db,
onSavesMutated)` where `onSavesMutated` = `fenceSaves + requestSaveReload`).

### 4.1 DB-bound store (the surface intents use)

```ts
import { stateStore } from './index';   // or pass the StateStore in

stateStore.loadState(userId: number): AuthState | null     // parse row; throws on corrupt JSON
stateStore.revOf(userId: number): number                   // current rev, -1 if no row
stateStore.withState<T>(userId: number, fn: (state: AuthState) => T): T | undefined
```

`withState` is the workhorse compound-op wrapper: it opens ONE better-sqlite3
transaction, loads + parses the row, runs `fn(state)` (which mutates the passed
`state` in place using the pure primitives below), writes the doc back, bumps
`rev`, and — **after commit** — fires `onSavesMutated([userId])` (the fence +
`save_reload` push). Returns `fn`'s result, or `undefined` if the row is missing.
`fn` may `throw` to roll the transaction back (no write, no fence). Because
better-sqlite3 is synchronous and single-threaded, a user's intents serialise;
there is no interleave within the process.

**Rule for intent authors:** never write `characters.save` directly. Do every
owned mutation inside a single `withState` so the rev bump + fence + push stay
coherent. Validate level/inputs/range against the `state` you are handed, not
against client-asserted values.

### 4.2 Pure primitives (operate on the `AuthState` handed to `fn`)

All quantities are clamped to safe positive integers; balances never go negative;
stacks cap at 2_000_000_000 (< 2^31). Item ids validated against
`data/items.json` (`isKnownItem`).

```ts
// item catalogue / curve
isKnownItem(id: string): boolean
SKILLS: readonly SkillName[]            // 24 skills, same order as src/defs.ts
XP_TABLE: number[]                      // cumulative xp per level 1..99
levelForXp(xp: number): number          // ported from src/game.ts

// inventory (carried)
invCount(state, id): number
invHas(state, id, qty=1): boolean
invAdd(state, id, qty=1): boolean       // false if unknown id or no room; non-stackable is all-or-nothing
invRemove(state, id, qty=1): boolean    // false if not enough held

// coins (carried coins live in the inventory as a stack)
getCoins(state): number
addCoins(state, amount): boolean        // false on overflow (cap 2^31-ish)
removeCoins(state, amount): boolean     // false if insufficient

// bank
bankCount(state, id): number
bankAdd(state, id, qty): boolean        // false on unknown id / overflow
bankRemove(state, id, qty): boolean     // false if insufficient

// equipment (validates levelReq vs server xp)
skillLevel(state, skill): number
setEquip(state, slot, id|null): string|null   // null = success; error string otherwise.
                                              // does NOT move the item in/out of inventory —
                                              // do that in the same withState tx.

// xp (real curve; HP/Prayer pools bumped on level like src/game.ts addXp)
addXp(state, skill, amount): { newXp, leveledUp, newLevel }

// quests (MONOTONIC — never lowers a stage)
questStage(state, id): number
setQuestStage(state, id, stage): number       // returns max(current, stage)

// live combat pools
maxHpFor(state): number                 // = Hitpoints level
hpDamage(state, dmg): number            // clamps at 0, returns new curHp
hpHeal(state, n): number                // clamps at maxHp, returns new curHp
specSpend(state, n): boolean            // false if insufficient spec energy
```

### 4.3 `AuthState`

The parsed `characters.save`. Owned fields are the typed ones below; the
permissive index signature carries the presentation fields through untouched.

```ts
interface ItemStack { id: string; qty: number }
interface AuthState {
  xp?: number[]; bank?: ItemStack[]; inventory?: (ItemStack|null)[];
  equipment?: Record<string, ItemStack|null>; quests?: Record<string, number>;
  collectionLog?: Record<string, number>;
  curHp?: number; prayerPoints?: number; specEnergy?: number;
  slayerTask?: { npc: string; remaining: number } | null; slayerPoints?: number;
  [k: string]: unknown;   // presentation fields ride along
}
```

## 5. What later phases depend on (do not break)

- `stateStore` is exported from `server/index.ts`; combat (`sim.ts`), skilling,
  GE, trade, social intents import it (or receive a `StateStore`) and mutate only
  through `withState`.
- `mergeSave` / `OWNED_FIELDS` define the trust boundary; adding a new owned
  value field means adding it to `OWNED_FIELDS` so the PUT merge protects it.
- `onSavesMutated` semantics: fence + `save_reload`. Any new server writer of
  `characters.save` must route through `withState` to keep the anti-dupe fence
  intact (the market is the other compliant writer; its helpers are now
  duplicated-but-equivalent in `state.ts`).
- Coins convention: **carried** coins are an `inventory` stack (`getCoins`/
  `addCoins`/`removeCoins`); **banked** coins are a `bank` stack id `coins`
  (`bankCount/bankAdd/bankRemove(state,'coins',…)`). GE/shop intents must pick
  the right pool to match the in-game UX (`src/game.ts` buys spend inventory
  coins).
