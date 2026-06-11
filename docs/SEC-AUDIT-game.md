# Security Audit — Game Server & WebSocket Authoritative Surface

Scope: `server/index.ts`, `server/sim.ts`, `server/social.ts`, `server/market.ts`,
`server/dungeon.ts`, `server/hiscores.ts`, `server/portrait.ts`, `server/profiles.ts`,
plus `server/bosses.ts` (combat). Read-only review. Date: 2026-06-11.

Two framing facts that drive most severities:

1. **`ECONOMY_FROZEN` (default ON)** already refuses GE offer/collect, market
   list/buy, P2P trade, and `handleDrop`. Findings against those paths are
   only exploitable if the freeze is lifted, so they are scored **assuming the
   freeze is lifted** (the state the refactor must reach) and flagged
   `[freeze-gated]`. Anything reachable **today, with the freeze ON**, is
   scored as live.
2. **The character save is client-authoritative** (`PUT /api/character` stores
   the client's JSON verbatim). Every server feature that reads `inventory`,
   `bank`, `coins`, `xp`, or `quests` from that save is trusting a forgeable
   document. This is the root cause the server-owned-economy refactor must fix;
   individual findings below note where it is the *only* real fix vs. where an
   independent hardening exists.

---

## Findings

| # | Sev | Location | Exploit | Fix | Needs refactor? |
|---|-----|----------|---------|-----|-----------------|
| G1 | **Critical** | `sim.ts:1146-1167` (`stats` intake) + `handleSwing` `sim.ts:567-728` | **Combat godmode / one-shot.** The server owns NPC hp and the hit *roll*, but every input to the roll comes from the client: `eff` (1-200), `bonus` (0-200), `maxHit` (0-60), `speed` (2-8 ticks), `gear[]` (effect/spec item ids). A client sends `eff:200, bonus:200, maxHit:60, speed:2` plus any spec item id and lands ~60-dmg hits at max cadence on any NPC/boss regardless of its real levels or gear. Defensively, the player's own `effDef`/`defBonus`/`hp`/`maxHp` are self-reported (`stats`), so a player is near-unkillable: report `effDef:200, defBonus:500, maxHp:999, hp:999` and NPC/boss rolls almost never land and never matter. Net effect: trivialize all PvE, the dungeon boss, and all drop tables. | The server must own combat stats: derive `eff`/`bonus`/`maxHit`/`speed` from the player's **server-side** levels + **server-validated** equipped gear (which requires server-owned inventory/equipment), not from wire values. Clamping (current behavior) only bounds the cheat, it does not prevent it. The defensive side (`effDef`,`maxHp`,`hp`) must likewise be server-derived; player HP must be an authoritative server value decremented by `damagePlayer`, not a client mirror. | **Yes** — needs server-owned stats/equipment (a superset of the economy refactor). Independently fixable *partial* mitigation now: also enforce a server max-hit ceiling per weapon-class and an absolute per-tick DPS cap to blunt the worst one-shotting, but real fix is authoritative stats. |
| G2 | **High** | `sim.ts:730-739` `handlePickup` + drop ownership model | **Ground-item theft / free items (shared world).** A picked-up shared-world ground item (`ownerUserId === null`) is delivered as `{t:'got', item, qty}` and the client adds it to its own inventory. Because inventory is client-authoritative, two effects: (a) any client can pick up another player's just-dropped/NPC-dropped public loot (no per-drop owner on shared kills — by design loot is FFA, but combined with G1 a godmode farmer vacuums all world drops); (b) more importantly, `got` only *suggests* the item — the client could ignore the message and re-pick the same `gid` before the removal delta is applied? No: `removeGroundItem` is synchronous before `got`, so the gid is gone. The real issue is (a) FFA loot has no owner-tag for player-killed shared NPCs, so kill-stealing/loot-stealing is unmitigated. Lower than G1 but enables mass item acquisition. | For drops from *player* kills, tag `addGroundItem(..., ownerUserId)` with the killer for a short protection window (RS-style loot ownership). Real anti-dupe requires server-owned inventory so `got` *grants* server-side rather than hinting the client. | Partially. Owner-tagging drops is independently fixable now; making pickup authoritative needs the inventory refactor. |
| G3 | **High** `[freeze-gated]` | `sim.ts:741-753` `handleDrop` | **Cross-account item injection.** With `ECONOMY_FROZEN` lifted, `handleDrop` spawns a ground item of any `ITEM_RE` id and qty up to 2e9 at the player's tile with **no possession check**. A second account standing there picks it up: arbitrary item/coin transfer and minting. Already frozen; the comment at `sim.ts:743-746` documents this. | Drops must debit a server-owned inventory; the spawned ground item must be backed by a real removed stack. Do not lift the freeze on this path until inventory is server-owned. | **Yes.** |
| G4 | **High** `[freeze-gated]` | `index.ts:478-538` GE matching + escrow | **GE is a coin/item printer.** The escrow model is explicitly client-authoritative: a buy offer assumes the client already removed `qty*price` coins; a sell offer assumes the client already removed the items. Nothing on the server verifies either. With the freeze lifted: place a sell offer for items you do not have (server never checks), self-fill is blocked (`user_id != ?`, good) but a second account fills it and pays real coins → you sold nothing for real money; or collect `coins_owed`/`items_owed` that were never backed. Self-match minting is closed (G-note: `user_id != ?` at `index.ts:488`), but the fundamental no-backing problem remains. | Server-owned balances: offer creation must atomically debit coins (buy) or items (sell) from a server ledger; collect credits the ledger. Keep frozen until then. | **Yes.** |
| G5 | **High** | `index.ts:437-453` `PUT /api/character` | **Master forgery primitive.** The save is stored verbatim (size-capped, otherwise unvalidated). A client PUTs arbitrary `xp` (→ hiscores, profiles, dungeon-gate via `quests`), `coins`, `bank`, `inventory`, `equipment`. This is the root that makes G1/G3/G4/M-* exploitable and also directly forges hiscore rank (see H1) and dungeon access (see D1). Reachable **today** despite the freeze, because the freeze only stops *cross-account wealth movement*, not single-account self-editing. | The save must stop being the source of truth for anything authoritative (wealth, levels, quest gates). Server-owned progression. Until then, single-account edits are "sandboxed" per the freeze doc — acceptable only because cash-out paths are frozen. | **Yes.** |
| H1 | **Med** | `hiscores.ts:60-97` + `index.ts:437` | **Hiscore forgery.** Rankings are computed from the client-written `save.xp` array (`parseXp` only clamps to finite/positive). Any player PUTs `xp:[200000000,...]` and tops every board. Cosmetic (no wealth), but it is a public-integrity defacement and trivially scriptable. | Server-authoritative xp (same refactor). Independent partial mitigation: sanity-cap per-skill xp at the max table value (200M) — already effectively bounded by `>0` only, so add an upper clamp — but this does not stop a forger from claiming max xp. | Yes for real fix. |
| H2 | **Med** `[freeze-gated]` | `social.ts:489-538` coinflip | **Unbacked gambling / coin minting.** Coinflip is server-authoritative on the *flip* but the stake (`amount`, ≤10M) is never debited or credited server-side — the result message just tells both clients who "won". Both clients are trusted to move coins in their own saves. With client-authoritative saves this is a wash today (loser can simply not pay; winner can claim the win regardless). It becomes a real exploit the moment any coin path is server-backed but coinflip is not wired into it. Not currently behind `ECONOMY_FROZEN` — the route runs even with the freeze ON, but it moves no server wealth so it is inert today. | When the economy is server-owned, coinflip must escrow both stakes server-side before flipping and pay the winner from the server ledger. Until then it does nothing real; consider gating it behind `ECONOMY_FROZEN` too for consistency so it cannot be the one un-migrated path. | Yes. |
| H3 | **Med** `[freeze-gated]` | `social.ts:692-740` guild vault | **Vault deposit is unbacked; withdraw is a faucet.** Deposit trusts the client removed the item (GE trust model) — server increments `guild_vault` with no possession check. Withdraw is server-atomic and clamps to stock (good), but since deposits can be conjured, the vault is a shared minting pool: deposit items you never had, guildmates withdraw real (client-side) stacks. Vault writes are **not** behind `ECONOMY_FROZEN`, so with a server-backed inventory this would leak; today it only moves client-trusted items. | Deposit must debit a server-owned inventory inside the same transaction that increments the vault. Gate vault deposit/withdraw behind `ECONOMY_FROZEN` until then (it is currently *not* gated — an inconsistency vs. trade/market/GE). | Yes. **Note: vault routes are not currently freeze-gated — recommend adding the gate now even before the refactor.** |
| H4 | **Med** `[freeze-gated]` | `social.ts:544-561` guild create | **5000-coin cost is never charged.** `/api/guild/create` comments that "the client removes the coins before calling this" and never verifies. Free guild creation; also free tag/name squatting. | Charge from server-owned coins on create. | Yes. |
| M1 | **Med** | `index.ts:549-564` GE abort + `index.ts:566-578` collect | **Abort/collect escrow edge with no backing.** `abort` re-credits `coins_owed`/`items_owed` for the unfilled remainder; `collect` hands those out (`collect` is freeze-gated, `abort` is **not**). Because the offer was never backed (G4), abort+collect is another unbacked credit path once the freeze lifts. Also: `abort` has no rate limit and can be called repeatedly on the same id — each call after the first is a no-op (`if (o.active)`), so no double-credit, which is correct. The exposure is purely the unbacked-escrow root (G4). | Same as G4 (server ledger). No independent bug beyond the escrow model. | Yes. |
| M2 | **Low/Med** | `index.ts:518-538` GE offer | **Offer qty/price griefing of the price oracle.** With the freeze lifted, a filled trade writes to `trades`, which feeds the public price endpoints (`/api/ge/price`, `/api/ge/history`, `/api/ge/prices`) used by the wiki. Two colluding accounts (not self-match, so allowed) can print arbitrary "last traded" prices for any item, poisoning the oracle other players and the trade site trust. Bounded by the 30/min offer rate limit and 8 active offers. | Oracle should resist wash trading (e.g. volume-weighted medians, ignore tiny-volume prints, or require server-backed trades so wash trading costs real coins). Mostly mitigated once trades cost real server-owned coins (G4). | Partially (refactor reduces it). |
| M3 | **Med** | `index.ts:1099-1141` WS auth + replace | **No per-account WS connection cap beyond "one".** On connect, any existing socket for the same `user.id` is closed (`index.ts:1121`). Good for dupe-socket, but there is **no rate limit on WS upgrades** — a script can reconnect in a tight loop, each connection running `fullSnapshot`, `notifyFriendsOnline` (DB query per friend), and a presence broadcast to all clients. Cheap DoS / friend-spam amplifier. Also `pos`/`stats`/`swing` messages have only per-message logical checks, not a global message-rate cap (only `pos` is throttled to 200ms at `index.ts:1152`; `swing` is throttled by the swing-cooldown but `stats`, `chat`-via-guild, `interact`, `trade_*` are not rate-limited). | Add a per-IP WS-upgrade rate limit and a per-connection inbound message-rate cap (token bucket) covering all message types. Independently fixable now. | No — fixable now. |
| M4 | **Med** | `sim.ts:567-728` `handleSwing` AoE/spec | **AoE spec lets one swing hit many NPCs with client-chosen params.** `aoe_adjacent`/`warcry_aoe_debuff`/DoT params are clamped against the server item catalog (good — effects come from `ITEMS[id]`, not the wire), and spec is only honored if the named item is in the reported `gear[]`. But `gear[]` is client-asserted: a client lists *any* spec/effect item id it does not own (`ITEM_RE` + catalog existence is the only check). Combined with G1, a player wields the best spec weapon in the game without owning it. The clamp prevents *out-of-catalog* values but not *unowned-item* use. | Equipped gear must be validated against server-owned equipment, not echoed by the client. Same root as G1. | **Yes** (server-owned equipment). |
| M5 | **Low** | `sim.ts:641-649` ammo recovery | **Free ammo generation.** Ranged/gun swings drop `msg.ammo` on the ground (~20% / ~5%) with only `ITEM_RE` + `_arrow`/`_round` suffix checks — no proof the player fired (or owns) that ammo. A scripted client spams swings naming `rune_arrow` and harvests free arrows from the ground (public, anyone can pick up). Minor, but a steady item faucet. Note these drops are **not** freeze-gated (`addGroundItem` runs inside `handleSwing`). | Tie ammo recovery to server-owned ammo consumption; until then, cap/remove the speculative ground spawn. Independently fixable now (remove or heavily rate-limit). | Partial — can mitigate now. |
| M6 | **Low** | `index.ts:686-699` dungeon enter (D1) | **Dungeon gate reads the forgeable save.** Access requires `save.quests.gd3_sealed_wing >= 6`, read from the client-written save. Forge the quest stage → free dungeon access (and its loot tables, via G1). Low direct impact (the dungeon is content, not wealth) but it is another save-trust gate. | Server-authoritative quest state. | Yes. |
| L1 | **Low** | `index.ts:251-256` `requireAdmin` | **Admin auth is a single shared static token via header compare** (`req.headers['x-admin-token'] !== ADMIN_TOKEN`). Non-constant-time compare (`!==`) leaks via timing in principle (low practicality over network); no per-IP lockout on admin endpoints. If `ADMIN_TOKEN` leaks, full account/economy control (edit any save, ban, GE cancel). | Use `crypto.timingSafeEqual`, scope admin endpoints to an internal interface / allowlist, rotate the token. Independently fixable now. | No. |
| L2 | **Low** | `index.ts:1146-1148` WS message size | Messages are `JSON.parse(String(raw).slice(0,2048))`. Slicing the *string* of a binary frame can corrupt but not overflow; fine. No issue — noted as reviewed. | — | — |
| L3 | **Low** | `social.ts:461-487` friends, `index.ts:816-846` admin user search | **SQL parameterization reviewed — clean.** All user-influenced SQL uses bound parameters; the only string-built SQL is the admin `LIKE` with proper `ESCAPE '\\'` and the dynamic `ORDER BY`/column choice in hiscores/profiles which come from server-controlled constant lists (`SKILL_NAMES`, `PRAGMA table_info` allowlist), not user input. No injection found. | — | — |
| L4 | **Low** | `profiles.ts:343-372`, `455-522` | XSS reviewed: bio/signature are HTML-escaped (`esc`) before render; password change is CSRF-gated (`csrfOk`) + per-user brute-force throttle (`pwFails`) + keeps current session. `username` in routes is `USERNAME_RE`/length-bounded. Portrait `lookFromSave` reads ids but only maps them through fixed palettes (no id reaches SVG text). No stored/reflected XSS found. | — | — |
| L5 | **Low** | `index.ts:402-407` `/api/me`, `index.ts:580-586` ge/price | **IDOR review — clean for player-facing reads.** GE offer/collect/abort all scope by `user_id = req.userId` (`index.ts:552,570`); market cancel/collect/mine scope by `user.id`; guild ops re-check membership/rank server-side; vault clamps to the caller's guild. No cross-user resource access found in non-admin routes. Admin routes intentionally cross users behind `requireAdmin`. | — | — |

---

## Combat client-trust — exact godmode surface (expanded G1/G4/M4)

The server's authority split (documented at `sim.ts:1-7`) is: **server owns NPC
state, hit resolution, drops, ground items; player stats are client snapshots,
clamped.** Clamping bounds magnitude but every *value* is attacker-chosen:

Offensive inputs to a swing (`handleSwing`, all per-message, only clamped):
- `eff` → effective attack level, clamp 1..200 (`sim.ts:587`)
- `bonus` → equipment accuracy bonus, clamp 0..200 (`sim.ts:588`)
- `maxHit` → max damage, clamp 0..60 (`sim.ts:589`)
- `speed` → swing cadence in ticks, clamp 2..8 (`sim.ts:584`) → governs the
  server cooldown `nextSwingAt` (`sim.ts:585`)
- `gear[]` → effect/spec item ids, validated only for *existence in the catalog*
  (`sim.ts:595-601`), never for *ownership* → free best-in-slot specs/effects
- `mode`, `ammo`, `spec` → likewise unowned-but-catalog-valid

Defensive inputs (`stats` message, `index.ts:1160-1167`, clamped):
- `effDef` 1..200, `defBonus` 0..500, `hp` 0..999, `maxHp` 1..999, `cb` 1..126

Because NPC→player damage is delivered as a *suggestion* (`damagePlayer` just
sends `{t:'npcHitYou', dmg}` at `sim.ts:216-218`) and the player's HP lives in
the client, a player is unkillable by PvE regardless of reported stats — the
server never decrements an authoritative player HP. Maxed offensive params plus
unowned specs trivialize every NPC, boss, and the dungeon.

**What server-side state is needed to fix:** authoritative per-player combat
profile derived from server-owned skills + server-owned equipped items
(attack/strength/defence levels, weapon max hit & speed, accuracy & defence
bonuses, prayer/style), and an authoritative server-side player HP pool that
`damagePlayer` decrements (with death resolved server-side). This is strictly
larger than the economy refactor: it requires server-owned **skills + equipment
+ inventory**. Clamps stay as defense-in-depth but are not a fix.

---

## Independently fixable NOW (do not need the refactor)

- **M3** — per-IP WS-upgrade rate limit + per-connection inbound message-rate cap.
- **L1** — `crypto.timingSafeEqual` for the admin token; network-scope admin routes.
- **M5** — remove or rate-limit speculative ammo ground spawns in `handleSwing`.
- **H3 / H4 / H2 (gating)** — add the `ECONOMY_FROZEN` gate to **guild vault
  deposit/withdraw, guild create, and coinflip**, which are currently NOT gated
  even though they are wealth-shaped. They are inert today only because saves
  are client-trusted; the moment any coin path becomes server-backed, an
  un-gated path leaks. Closing this inconsistency now is cheap insurance.
- **G2** — owner-tag drops from player kills for a loot-protection window.
- **M2** — make the public price oracle resistant to low-volume wash prints.

## Requires the server-owned-economy / progression refactor

- **G1, M4** (server-owned skills + equipment + authoritative HP)
- **G3, G4, M1, H2, H3, H4** (server-owned coin/item ledger)
- **G5, H1, M6** (server-owned progression: xp, quests, wealth stop living in
  the client save)

## Confirmed-good (regression watch — do NOT undo)

- GE self-match exclusion `index.ts:488` (`user_id != ?`).
- 90-day session TTL + lazy expiry `index.ts:157-168`; `invalidateAllSessions`.
- `ECONOMY_FROZEN` refusals: GE offer `index.ts:519`, GE collect `index.ts:567`,
  market list `market.ts:296`, market buy `market.ts:349`, P2P trade
  `social.ts:280`, `handleDrop` `sim.ts:746`.
- Rate limits: `PUT /api/character` (`saveRateLimit`), GE offer (`offerRateLimit`),
  login/register, hiscores.
- Market is genuinely server-authoritative (single-tx escrow against the server
  save, status re-checked inside the tx) — its only weakness is that the
  "server save" it mutates is itself client-writable (G5); the dupe fence +
  `save_reload` push mitigate the in-flight-PUT race.
- CSRF Origin-host check on cookie-authed writes (`index.ts:354-365`) and the
  cross-site WS Origin guard (`index.ts:1109-1114`).
- SQL parameterization throughout (L3); profile XSS escaping (L4); player-facing
  IDOR scoping (L5).
