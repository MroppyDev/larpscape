# Economy & Progression Authority — Design Plan

Status: **DESIGN ONLY. Not yet implemented.** `ECONOMY_FROZEN` stays ON
(`server/econ-freeze.ts`) until the final phase of this plan ships and passes the
go/no-go checklist at the end of this document. A botched live-economy rewrite is
worse than the freeze; this plan is executed deliberately, phase by phase.

Authors' note: this supersedes nothing already shipped. Every "confirmed-good"
item in `docs/SEC-AUDIT-game.md` (GE self-match exclusion, 90-day session TTL,
SHA-256 admin compare, rate limits, CSRF/Origin guards, freeze refusals) is a
regression-watch invariant — do not undo any of it while executing this.

---

## 0. The problem this closes

Today the character **save is the source of truth for everything of value** and
the client owns it: `PUT /api/character` stores the client's JSON verbatim
(`server/index.ts:458-474`, size-capped only). The client mutates its own
`xp[]`, `coins`, `bank[]`, `inventory[28]`, `equipment{}`, `quests{}` locally
via `addXp`/`addItem`/`removeItem` (`src/game.ts:270,299,371`,
`src/content.ts`) and persists with `saveGame()` (`src/game.ts:439`). The server
reads that forgeable document for hiscores, profiles, dungeon gates, market and
GE possession checks.

Root findings this plan resolves (from the three audits):

- **G5 / H1 / M6** — save is the forgery master key (wealth, levels, quest
  gates, hiscore rank, dungeon access).
- **G1 / M4** — combat godmode: every input to the hit roll (`eff`, `bonus`,
  `maxHit`, `speed`, `gear[]`, `spec`) and every defensive value (`effDef`,
  `defBonus`, `hp`, `maxHp`) is client-reported and only clamped
  (`server/sim.ts:584-610`, `server/index.ts:1160-1167`). Player HP lives in the
  client; `damagePlayer` only *suggests* damage (`server/sim.ts:216-218`).
- **G2 / G3 / G4 / M1 / M5** — item/coin minting via drops, GE escrow with no
  backing, pickup that only hints the client, free ammo recovery.
- **H2 / H3 / H4** — unbacked coinflip stake, guild vault deposit, guild-create
  cost.

**Target end-state:** the server owns every quantity that has value or gates
progress. The client save becomes **presentation/UX-only** (camera, last
position, music unlocked, UI prefs). Every gain or loss of value/progress flows
through a **server-validated intent**: client requests, server checks
requirements, rolls outcomes, applies to authoritative state, pushes the result.
This is strictly larger than "the economy" — it is server-owned **skills +
equipment + inventory + quests + HP**, because combat authority (G1) depends on
all of them.

---

## 1. Authoritative state

### 1.1 What the server must own

| Domain | Fields | Audit driver |
|---|---|---|
| Wealth | `coins`, `bank[]` | G4, G5, market/GE |
| Carried items | `inventory[28]`, `equipment{10 slots}` | G2, G3, M4 |
| Skills | `xp[24]` (per `SKILL_NAMES`), derived levels | G1, G5, H1 |
| Combat live | `curHp`, `maxHp` (derived from Hitpoints xp), `prayerPoints`, `specEnergy` | G1 |
| Progress | `quests{id→stage}`, `collectionLog{}`, `slayerTask`, slayer points | M6, D1 |
| Shared pools | `guild_vault` (already a table), GE escrow ledger, market proceeds | H3, G4 |

Presentation-only (stays client-owned, never trusted for anything authoritative):
`x`, `y` (position is already reconciled by sim range checks; cosmetic only),
`run`, `energy` (run energy — cosmetic, not wealth), `combatStyle` *selection*
(but the **effect** of style is server-applied), `autocastSpell` *selection*,
`music[]` unlocked tracks, camera/UI prefs.

> Note on `combatStyle`/`autocastSpell`/`slayerTask`: the client may *choose*
> these, but the choice is validated and stored server-side and the server uses
> the server copy when resolving combat/slayer. The client value is a request,
> not a fact.

### 1.2 Schema decision — **server-validated save column with mutation-only-via-intents** (recommended)

Two options were considered:

- **(A) Full normalization** — tables for `inventory`, `bank`, `equipment`,
  `skills`, `quests`, `collection_log`, etc.
- **(B) A single server-owned JSON save column** (`characters.save`) that the
  client **can no longer write directly**; it is mutated *only* by server-side
  intent handlers inside DB transactions, exactly like the market already does
  (`server/market.ts` `loadSave`/`writeSave`/`bankAdd`/`bankRemove`,
  `:216-293`).

**Recommendation: (B), evolving toward (A) only where contention demands it.**

Rationale:

1. **The migration is near-zero.** The authoritative document is *byte-identical*
   to today's save shape (`src/game.ts:442-452`). We do not transform data; we
   transfer *ownership*. Existing rows in `characters.save` become the seed of
   the authoritative state on day one.
2. **The pattern already exists and is audited-good.** `market.ts` already does
   server-authoritative escrow against this column inside `db.transaction`, with
   the dupe fence + `save_reload` push (`server/index.ts:1079-1094`). We
   generalize that machinery instead of inventing storage.
3. **Normalization can be introduced surgically later** for the few tables that
   actually need concurrent multi-writer access (GE escrow ledger, guild vault —
   *already* separate tables). Player-private state (inventory/skills/quests) has
   exactly one writer (that player's intents, serialized) so a JSON column under
   a per-user transaction is sufficient and far less code to get right under a
   freeze deadline.

Concrete shape:

```
characters(
  user_id INTEGER PRIMARY KEY,
  save    TEXT NOT NULL,   -- AUTHORITATIVE server-owned JSON (was client-written)
  rev     INTEGER NOT NULL DEFAULT 0,  -- bumped every server mutation (optimistic concurrency + client cache key)
  updated_at INTEGER NOT NULL
)
```

Add a `rev` column (new). Every intent that mutates authoritative state runs in a
`db.transaction`, reads the row, applies the change via the shared helpers,
writes back, and `rev = rev + 1`. The client receives `rev` and uses it only to
know its mirror is stale (request a fresh snapshot), never to author state.

Already-normalized side tables stay as-is: `offers`, `trades`,
`market_listings`, `market_proceeds`, `guild_vault`, `sessions`, `users`.

### 1.3 Server-side state module (`server/state.ts`, new)

Centralize the mutation primitives so intents (combat in `sim.ts`, skilling, GE,
market, social) all go through one audited surface. Promote the market helpers to
a shared module:

```
loadState(userId): AuthState            // parse characters.save, throw on corrupt
withState(userId, fn): T                // db.transaction wrapper: load, fn(state), write, rev++
// inventory/bank/equipment primitives (generalize market.ts bankAdd/bankRemove/bankCount):
invCount(state, id), invAdd(state, id, qty), invRemove(state, id, qty)
bankCount/bankAdd/bankRemove   (already exist in market.ts — move here)
equip(state, slot, id) / unequip(state, slot)   // validates levelReq vs server xp
xpAdd(state, skill, amount)             // returns {newXp, leveledUp}
questStage(state, id) / setQuestStage(state, id, n)  // monotonic: never decrease
hpDamage(state, dmg) / hpHeal(state, n) / specSpend(state, n)
```

`withState` also calls the existing `onSavesMutated` so the fence +
`save_reload` push keep working. Combat (sim.ts) is the one hot path — see §3 for
how it caches a derived combat profile per connected player instead of hitting
the DB every swing.

---

## 2. Intent protocol

The trust flip: **the client stops being trusted for wealth/progress.** Every
value/progress change is a request the server validates, rolls, applies, and
echoes. Two transports already exist and we reuse both:

- **WebSocket intents** (`server/sim.ts` / `server/index.ts:1146-1167`) for
  real-time, high-frequency actions (combat swings, gathering, pickup) — extends
  the existing `handleSwing`/`handlePickup`/`handleInteract` pattern.
- **HTTP POST intents** (`/api/...`) for transactional, lower-frequency actions
  (GE offer/collect, market, shop, trade, bank, quest reward claim) — extends
  the existing GE/market routes.

General intent contract:

1. Client sends a *request* (e.g. "I want to mine rock #G at (x,y)"), never an
   outcome.
2. Server validates: position/range, cooldown, level requirement (against
   **server** xp), tool/ammo possession (against **server** inventory),
   quest/stage gate (against **server** quests), `ECONOMY_FROZEN` if
   wealth-shaped.
3. Server rolls any randomness (success chance, drop table, gem cut, burn).
4. Server applies to authoritative state inside `withState`.
5. Server pushes the **result** (`{t:'granted', xp, items, removed, rev}`); the
   client mirror is updated from the push, not from local optimism.

The client retains an **optimistic mirror** for responsiveness (show the log,
animate the swing) but reconciles to server pushes; on mismatch it requests a
fresh snapshot via `rev`. This keeps the game feeling instant while making the
server the only writer.

### 2.1 Catalogue — every value/progress path and its intent

Source of the current client logic is noted so the implementer ports the roll to
the server (the *data* — rates, xp, level reqs — already lives in
`data/*.json`, validated by `shared/schema.ts`, so the server reads the same
catalog the client does).

| Path | Today (client) | Becomes (server intent) |
|---|---|---|
| **Mine / Chop / Fish** | `src/content.ts:70-150` local `addItem`+`addXp`+depleteChance | WS `gather` intent: server checks level vs `SkillObjSchema.level`, range to the object, rolls `depleteChance`/rates, `invAdd` + `xpAdd`, manages respawn server-side (sim already owns world objects' positions). Push `{granted}`. |
| **Cook / Firemaking** | `src/content.ts:177-204` removeItem raw, roll burn | HTTP/WS `process` intent: server verifies raw in inventory + level, rolls burn vs `stopBurn`, `invRemove`+`invAdd`+`xpAdd`. |
| **Smith / Smelt / Fletch / Craft / Gem-cut / Herblore / Cooking** | `requestMake` callbacks `src/content.ts:221-457` | HTTP `make` intent `{recipe, qty}`: server looks up recipe in `recipes.json`, verifies all `inputs` present + level + station, loops qty, `invRemove(inputs)`+`invAdd(output)`+`xpAdd`. Atomic per-unit so a disconnect can't dupe. |
| **Loot drop (NPC kill)** | sim rolls drop, `addGroundItem` (already server) | Already server-authoritative for the *roll*. Change: on a **player kill**, grant directly to the killer's server inventory (or owner-tagged ground item, G2) via `invAdd` instead of public hint. Closes the "client adds `got` to its own inv" gap (G2). |
| **Pickup** | `handlePickup` sends `{got}`, client adds (G2) | `invAdd` server-side inside the pickup handler; push `{granted, rev}` instead of `{got}`. Ground item is debited from the world; no client-trust. |
| **Quest reward** | client sets `quests{}` + `addItem`/`addXp` | HTTP `quest/advance` + `quest/claim` intents: server owns `setQuestStage` (monotonic — never decreases, killing M6 forgery) and grants the reward once per stage (idempotency key = `quest:stage`), guarding double-claim. Dungeon gate (D1) then reads **server** `quests.gd3_sealed_wing` (`server/index.ts:686-699`). |
| **Shop buy/sell** | client-side coin/item swap | HTTP `shop` intent: server reads `shops.json` stock, debits/credits server `coins` + inventory at catalog value. Wealth-shaped → behind `ECONOMY_FROZEN` until phase that re-opens shops. |
| **GE offer/collect/abort** | escrow assumes client moved coins/items (G4) | See §4.1 — server debits coins (buy) / items (sell) into escrow on offer, credits on collect, all against server ledger. Stays frozen until §4. |
| **P2P trade** | validates possession vs forgeable save (`social.ts`) | See §4.3 — both sides' items/coins escrowed server-side, atomic swap. Frozen until §4. |
| **Market list/buy/cancel/collect** | already server-side vs `characters.save` (`market.ts`) | Smallest change: it *already* mutates the server save in a transaction. Once that save is authoritative, market is correct as-written. Stays frozen only because its `coins`/`bank` source becomes trustworthy only after §1 ships; re-open in §4. |
| **Drop (handleDrop)** | spawns unowned item (G3) | `invRemove` first; only spawn the ground item if the debit succeeds. Frozen until inventory is server-owned. |
| **Death** | client decides it died / keeps items | Server owns HP (§3); on server-side death, server moves items to a gravestone/bank per rules and respawns. No client say. |
| **Gambling (coinflip)** | stake never moved (H2) | HTTP `coinflip` intent: server escrows both stakes from server `coins` before the flip, pays winner from ledger. Behind `ECONOMY_FROZEN`. |
| **Guild create / vault** | cost never charged (H4), deposit unbacked (H3) | Charge `coins` server-side on create; vault deposit `invRemove` inside the same tx that increments `guild_vault`. Behind `ECONOMY_FROZEN`. |
| **Slayer** | client tracks task/points | Server assigns task, counts kills (sim already sees kills), awards points + grants on completion. |
| **Ammo recovery** | disabled (M5) | Re-enable only tied to a server-side ammo debit on fire: server decrements equipped ammo on each ranged/gun swing, and recovery returns a fraction of *actually-consumed* ammo. |

### 2.2 Reuse the sim.ts intent pattern

`handleSwing`/`handlePickup`/`handleInteract` already are server intents (validate
target, range, cooldown; server rolls; server owns world). The new gathering and
combat-grant intents slot into the same `switch` in `index.ts`'s WS message
handler. The difference is they now also call `withState` to mutate the player's
authoritative inventory/xp, and they read the player's server combat profile
(§3) instead of trusting `msg.eff/bonus/maxHit`.

---

## 3. Combat authority (closes G1 / M4 godmode)

Once skills + equipment + inventory are server-owned, derive every combat input
server-side; stop reading them from the wire.

### 3.1 Server-derived combat profile

On connect (and whenever the player's equipment/xp change), compute and cache a
`CombatProfile` per `userId` in the connection layer:

```
attackLvl, strengthLvl, defenceLvl, rangedLvl, magicLvl, hitpointsLvl  // from server xp via the level table
maxHit        // from str/ranged/magic level + equipped weapon strBonus/styles (item catalog)
attackSpeed   // from equipped weapon attackSpeed (item catalog, NOT msg.speed)
accBonus      // sum of equipped attBonus/rangedBonus per style
defBonus      // sum of equipped defBonus
effDef        // from defenceLvl + style
maxHp, curHp  // maxHp from Hitpoints level; curHp is authoritative server HP
prayerPoints, specEnergy  // server-owned
equippedEffectIds, equippedSpecId  // ONLY items actually in server equipment
```

The profile is derived from `equip()`-validated equipment (which already enforces
`levelReq` against server xp via `shared/schema.ts` `ItemDefSchema.levelReq`) and
server xp. **`handleSwing` ignores `msg.eff/bonus/maxHit/speed/gear/spec` and
reads the profile instead** (`server/sim.ts:584-610`). The clamps stay as
defense-in-depth but are no longer the only barrier.

- `speed` → `profile.attackSpeed` (weapon-derived) governs `nextSwingAt`.
- `gear[]`/`spec` → only effects/specs of items in `profile.equipped*` are
  honored. Closes M4 (no unowned best-in-slot specs).
- `mode` is still client-chosen but validated against the equipped weapon class
  (a sword can't `mode:'gun'`).

### 3.2 Authoritative player HP and death

Today `damagePlayer` only sends `{t:'npcHitYou', dmg}` (`server/sim.ts:216-218`)
and the client owns HP. Change:

- NPC→player damage decrements **server** `curHp` (via `hpDamage` in `withState`,
  or an in-memory profile field flushed periodically to avoid per-hit DB writes —
  see §3.3).
- At `curHp <= 0` the **server** resolves death: applies item-loss rules, moves
  kept items, restores `curHp = maxHp`, repositions to respawn, pushes the result.
- Eating/healing (`edible.heals`) and prayer restore become server intents that
  bound `curHp <= maxHp` and consume the food from server inventory.

This closes the "unkillable PvE" half of G1: HP is no longer a client mirror.

### 3.3 Performance note

Combat is the hot path. Do **not** open a DB transaction per swing/hit. Keep the
live `CombatProfile` (including `curHp`, `specEnergy`, `prayerPoints`) in memory
in the connection/sim layer, mutate it in RAM during combat, and **flush to the
authoritative save** on a cadence (every N ticks, on inventory/xp change, on
disconnect, and immediately before any wealth-moving intent reads it). XP and
loot grants from kills go through `withState` (they're lower frequency than
hit-resolution). This mirrors how sim already holds NPC state in RAM and persists
the world lazily.

---

## 4. Re-opening the economy

Only after §1–§3 are live and verified. Each path is rebuilt against the
authoritative ledger; the freeze lifts per-path only when its adversarial suite
(below) passes.

### 4.1 Grand Exchange (rebuild `matchOffer`, `server/index.ts:478-599`)

- **Offer creation** debits real value into escrow inside the offer transaction:
  buy offer → `inv/bankRemove(coins, qty*price)`; sell offer →
  `inv/bankRemove(item, qty)`. No offer exists without backing. (Today it
  assumes the client already removed them — G4.)
- **`matchOffer`** keeps price-time priority and the **self-match exclusion**
  (`user_id != ?`, `server/index.ts:509` — regression-watch, keep). On a fill it
  moves escrowed coins/items between the two offers' owed columns — but now those
  columns are backed by real escrow taken at offer time.
- **Collect** credits the authoritative ledger (`invAdd`/`bankAdd`) from
  `coins_owed`/`items_owed`, then zeroes them. **Abort** returns the *escrowed*
  remainder (which really left the player at offer time), fixing M1 (abort/collect
  is no longer an unbacked credit).
- **Price oracle** (M2): once trades cost real escrowed coins, wash trading costs
  real value; additionally make `/api/ge/prices|history` resist tiny-volume
  prints (volume-weighted, ignore sub-threshold volume).

### 4.2 Market (`server/market.ts`)

Already escrows against `characters.save` in a single transaction
(`txCreate`/`txBuy`, `:280-346`). Once that column is authoritative (§1), market
is correct **as written** — it is the reference implementation for the rest. Lift
its freeze (`market.ts:296,349`) in this phase after its suite passes.

### 4.3 P2P trade (`server/social.ts`)

Replace possession-check-against-forgeable-save with a server-escrowed two-phase
swap: both parties' offered items/coins are `invRemove`'d into a trade-escrow
record at "accept", and atomically credited to the *other* party in one
transaction at "confirm". Either party aborting returns escrow. Reuses the
fence/`save_reload` machinery already wired for trade (`social.ts:288`).

### 4.4 Drop / pickup (`server/sim.ts:725-748`)

`handleDrop`: `invRemove` first; spawn the ground item only on a successful debit.
`handlePickup`: `invAdd` server-side; remove the ground item; push `{granted}`.
Owner-tag player-kill drops for a protection window (G2).

### 4.5 Adversarial test suite — must pass before un-freezing each path

A scripted malicious client (raw WS + HTTP, not the game client) must **fail** to:

1. **Save forgery** — `PUT /api/character` with inflated `xp`/`coins`/`bank`/
   `inventory` has no effect on authoritative state (route is removed or accepts
   only presentation fields). Hiscores/profiles reflect server xp only.
2. **Combat godmode** — swinging with `eff:200,bonus:200,maxHit:60,speed:2` and
   an unowned spec id deals only damage consistent with the *server* profile;
   reporting `hp:999,maxHp:999` does not prevent server-side death.
3. **GE mint** — placing a sell offer for an item not owned is rejected at offer
   time; collecting never yields unbacked coins/items; self-match still excluded;
   abort+collect nets zero.
4. **Drop injection (G3)** — dropping an unowned item id spawns nothing; a second
   account cannot receive conjured items.
5. **Pickup dupe** — picking the same `gid` twice grants once; ground item is
   gone after the first grant.
6. **Trade dupe** — trading away items not owned fails; concurrent
   accept/confirm/abort never duplicates or destroys value (run under
   interleaving/fuzzing).
7. **Skilling forgery** — `make`/`gather`/`process` intents below the level req,
   without inputs/tool, or out of range are rejected; no client-asserted xp is
   ever accepted.
8. **Quest/dungeon gate (M6/D1)** — forged `quests{}` cannot open the dungeon or
   claim a reward twice; stage is monotonic.
9. **Gambling/guild (H2/H3/H4)** — coinflip without coins, vault deposit without
   the item, guild create without 5000 coins all fail.
10. **Concurrency/idempotency** — replayed intents, duplicate WS sockets
    (existing one-socket-per-user close, `index.ts:1121`), and `rev` races never
    dupe value; the fence + `save_reload` still hold under load.

Each suite item maps to a finding (G1–G5, M1–M6, H1–H4). The freeze does not lift
globally until **all** pass on the integration build.

---

## 5. Phased rollout

Least-risk-first. **The game stays playable and `ECONOMY_FROZEN` stays ON through
Phases 1–5; it lifts only at the end of Phase 6**, per-path, as each suite passes.
Each phase is independently shippable and verifiable on the live game.

### Phase 0 — Cheap insurance & independent fixes (no refactor) — ~0.5 day
Ship the audit's "independently fixable now" set so nothing leaks the moment a
coin path becomes server-backed:
- Gate **coinflip, guild vault deposit/withdraw, guild create** behind
  `ECONOMY_FROZEN` (H2/H3/H4 — currently *not* gated).
- Per-IP WS-upgrade rate limit + per-connection inbound message-rate cap (M3).
- `crypto.timingSafeEqual` for the inter-service admin token (L1 / infra #4).
- Owner-tag player-kill drops for a loot-protection window (G2 partial).
- Make the price oracle resist tiny-volume wash prints (M2 partial).
- Web/infra headers (web #1–#3, infra #1): `X-Frame-Options`, nosniff,
  `Cache-Control: private, no-store` on authed HTML, nginx security-headers block.
- Add the `rev` column to `characters` (no behavior change yet).

*Verify:* freeze still ON, game plays identically, new gates 503 correctly.

### Phase 1 — Server-owned read model (shadow) — ~2–3 days
Stand up `server/state.ts` (`loadState`/`withState`/inventory-bank-xp-quest
primitives, promoting market's helpers). **Do not** change who writes yet:
`PUT /api/character` still accepts the save, but the server now *also* validates
it against a shadow copy and **logs divergences** (impossible xp jumps, item
appearance) without rejecting. This calibrates the validators against real play
before they become authoritative.

*Verify:* divergence logs on a normal play session are empty/benign; the shadow
model round-trips every existing save without data loss.

### Phase 2 — Server-authoritative skilling & inventory — ~1 week
Flip gathering/processing/making to server intents (§2.1). The server becomes the
writer for `inventory`, `bank`, `xp`, `quests`. `PUT /api/character` is reduced to
**presentation fields only** (position, run, music, UI prefs); all value/progress
fields in the PUT body are ignored. Hiscores/profiles/dungeon-gate now read the
authoritative save (closes **G5, H1, M6, D1**). Economy still frozen (no
cross-account movement), so this is single-account-safe to ship.

*Verify:* skilling suite (#7), forgery suite (#1, #8) pass; a forged
`PUT /api/character` no longer changes xp/items.

### Phase 3 — Combat authority — ~1 week
Server `CombatProfile` + authoritative HP + server-side death (§3). `handleSwing`
reads the profile, ignores wire stats/gear/spec; `damagePlayer` decrements server
HP. Closes **G1, M4**. Ammo consumption server-side; re-enable recovery tied to it
(M5).

*Verify:* godmode suite (#2), AoE/spec ownership, server-side death all pass; PvE
difficulty matches design.

### Phase 4 — Re-open Market & GE against the ledger — ~1 week
Rebuild GE escrow (§4.1); market needs only its freeze lifted + suite (§4.2).
Lift `ECONOMY_FROZEN` for **market and GE only** after suites #3 and the market
suite pass. (Mechanically: split the freeze into per-path flags so paths re-open
independently, or keep one flag and only flip it once these paths are ready and
the remaining paths — trade/drop/gambling — are still individually refused.)

*Verify:* GE-mint suite (#3), oracle wash-resistance (M2), market round-trip.

### Phase 5 — Re-open P2P trade & drop/pickup — ~3–4 days
Server-escrowed trade (§4.3); authoritative drop/pickup (§4.4). Lift freeze for
those paths after suites #4, #5, #6.

*Verify:* trade/drop/pickup dupe suites pass under interleaving.

### Phase 6 — Re-open gambling & guild economy; final lift — ~2–3 days
Server-escrowed coinflip, charged guild create, backed vault (§2.1, H2/H3/H4).
Run the **full** suite (§4.5 #1–#10) on the integration build. Only when all pass
does the **global** `ECONOMY_FROZEN=0` (or all per-path flags) ship.

*Verify:* full adversarial suite green; load/concurrency test (#10) green.

Total rough scope: ~4–5 focused weeks. Phases 2 and 3 are the heavy lifts (they
move authority for skills/inventory/combat); 4–6 are mostly wiring already-server
paths to the now-trustworthy ledger.

---

## 6. Go / No-Go checklist for lifting `ECONOMY_FROZEN`

Do **not** set `ECONOMY_FROZEN=0` (or flip the final per-path flag) unless every
box is checked:

- [ ] `characters.save` is **server-authoritative**; `PUT /api/character` accepts
      **presentation fields only** and cannot alter `xp/coins/bank/inventory/
      equipment/quests/collectionLog` (G5).
- [ ] Hiscores, profiles, and the dungeon gate read **only** authoritative state
      (H1, M6, D1).
- [ ] Combat `eff/bonus/maxHit/speed/gear/spec` and `effDef/defBonus/hp/maxHp`
      are **server-derived**; wire values are ignored (clamps remain as defense in
      depth) (G1, M4).
- [ ] Player HP is **authoritative server state**; `damagePlayer` decrements it;
      death is resolved server-side (G1).
- [ ] GE offer **debits real escrow** at creation; collect/abort credit/return
      only backed value; self-match exclusion intact (G4, M1).
- [ ] Market, P2P trade, drop/pickup all move value via `withState` against the
      authoritative ledger; no path trusts a client-asserted quantity (G2, G3,
      market, trade).
- [ ] Coinflip, guild create, and vault deposit **debit server-owned value**
      before settling (H2, H3, H4).
- [ ] Price oracle resists low-volume wash prints (M2).
- [ ] Skilling/making/gathering validate level + inputs + tool + range against
      **server** state; no client xp/item assertion accepted (skilling suite).
- [ ] Quest stages are **monotonic** and rewards are **idempotent per stage**
      (M6).
- [ ] The full adversarial suite (§4.5 #1–#10) is **green on the integration
      build**, including the concurrency/idempotency and dupe-socket cases.
- [ ] Regression-watch invariants from `docs/SEC-AUDIT-game.md` §"Confirmed-good"
      are all still present (session TTL, rate limits, CSRF/WS Origin guards, SQL
      params, GE self-match) — **none undone** by this refactor.
- [ ] `npx tsc --noEmit` is green in **both** trees (root + `admin/`) and
      `npm run validate` passes.
- [ ] A rollback plan exists: re-setting `ECONOMY_FROZEN=1` immediately re-closes
      every wealth path without data loss (the authoritative state is unchanged
      by freezing).

Until every box is checked, the freeze **stays on**.
