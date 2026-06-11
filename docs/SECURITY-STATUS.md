# SECURITY-STATUS — Larpscape

**Date:** 2026-06-11  •  **Verifier:** security lead (final pass)
**Build state:** all trees green — see "Verification" below.
**Freeze:** `ECONOMY_FROZEN` default-ON and intact on every wealth path.
**Verdict:** **CLEAN** (builds green, freeze intact).

---

## 1. Executive summary

Larpscape shipped with a **client-authoritative economy and progression**. The
client save was the source of truth for all wealth, levels, and quest gates, and
several cross-account wealth paths trusted that forgeable document. An emergency
freeze (commit `0c295a6`) closed every path that *moves wealth between accounts
or conjures it from nothing*, plus a set of contained hardening fixes. A
remediation pass then fixed every Medium-and-up finding that does **not** require
the server-owned-economy refactor, and closed three wealth-shaped routes that the
freeze had missed. What remains is the deep refactor: making the server — not the
client save — the authority for inventory, coins, skills, equipment, and quest
state. The freeze **stays on** until that ships and is audited.

---

## 2. What was exploitable (root causes)

Two roots drive almost every critical finding:

- **R1 — The character save is client-authoritative.** `PUT /api/character`
  (`server/index.ts:437`) stores the client's JSON verbatim (size-capped, rate-
  limited, otherwise unvalidated). Every server feature that reads `coins`,
  `bank`, `inventory`, `equipment`, `xp`, or `quests` is trusting a forgeable
  document. This is the master forgery primitive (audit **G5**) and the root of
  hiscore forgery (**H1**) and dungeon-gate bypass (**M6/D1**).

- **R2 — Combat stats are client-supplied.** The server owns NPC hp and the hit
  *roll*, but every input to the roll (`eff`, `bonus`, `maxHit`, `speed`,
  `gear[]`) is client-sent and only clamped, and player HP lives in the client
  (`damagePlayer` only *suggests* damage). Result: combat godmode / one-shot and
  free best-in-slot specs without owning the item (audit **G1/M4**).

Wealth paths that trusted R1 for cross-account movement:

- **GE escrow** (`index.ts` GE matching) — buy/sell offers assumed the client
  already moved coins/items; nothing on the server backed them. A coin/item
  printer once filled (audit **G4/M1**).
- **handleDrop** (`sim.ts`) — spawned a ground item of any id/qty with no
  possession check → cross-account item injection (audit **G3**).
- **P2P trade** (`social.ts` `finishTrade`) — validated possession against the
  forgeable save.
- **Market list/buy** (`market.ts`) — server-atomic, but escrowed against the
  client-writable save.
- **Coinflip, guild create, guild vault** (`social.ts`) — unbacked stake/cost/
  deposit (audit **H2/H4/H3**); these were **not** gated by the original freeze.

Web/infra exposure (no wealth, but real): **no security headers on any surface**
(clickjacking on the admin ban/publish/restart panel, no HSTS, no nosniff — audit
web #1/#2, infra #1); no `Cache-Control` on authed HTML (web #3); a latent
unescaped forum errbox (web #4); a non-constant-time admin-token compare and a WS
reconnect DoS amplifier (game L1/M3, infra #4); ADMIN_PASSWORD echoed during
provisioning (infra #3); a speculative ammo-recovery item faucet (game M5).

---

## 3. What the emergency freeze closed

`ECONOMY_FROZEN` (`server/econ-freeze.ts`, default-ON) makes every wealth-movement
path refuse. Single-account save editing still "works" but is **sandboxed** — it
cannot be cashed out, transferred, or used to pollute the public price oracle.

Gates verified present this pass:

| Path | Location |
|------|----------|
| GE offer | `server/index.ts:540` |
| GE collect | `server/index.ts:588` |
| Market list | `server/market.ts:296` |
| Market buy | `server/market.ts:349` |
| P2P `finishTrade` | `server/social.ts:280` |
| `handleDrop` | `server/sim.ts:741` |

Contained hardening shipped in the same emergency commit (regression watch — do
**not** undo): GE self-match exclusion (`user_id != ?`), 90-day session TTL + lazy
expiry + `invalidateAllSessions`, admin login SHA-256 digest compare with lockout,
rate limits on `PUT /api/character` and GE offer, CSRF Origin-host check on
cookie-authed writes, cross-site WS Origin guard.

---

## 4. What the remediation phase fixed

All Medium-and-up findings that do **not** need the refactor are now closed. Both
TypeScript trees compile and `npm run validate` passes.

**Closed the freeze gaps (audit H2/H3/H4)** — `server/social.ts`
- coinflip `/offer` (`:493`) and `/accept` (`:516`) — gated (unbacked stake).
- guild `/create` (`:552`) — gated (5000-coin cost never charged).
- guild `/vault/deposit` (`:704`) and `/vault/withdraw` (`:729`) — gated (unbacked
  item conjure / faucet).
- Non-wealth guild/friend routes (invite, accept, leave, kick, promote, settings,
  decline) correctly remain open.

**Server-side hardening** — `server/index.ts`
- Admin-token compare now `crypto.timingSafeEqual` over SHA-256 digests
  (`:254-263`), matching the login pattern (game L1, infra #4).
- WS-upgrade per-IP rate limit (`:1123-1145`) + per-connection inbound message-
  rate token bucket (`:1029`, `:1194`) — closes the reconnect/flood DoS (game M3).
- Global hardening headers on responses: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff` (`:340-341`).

**Item faucet removed** — `server/sim.ts`
- Speculative ammo-recovery ground spawns disabled (game M5); re-enable only when
  ammo consumption is server-owned.

**Web render hardening**
- `server/forum.ts` — errbox/refusal now `esc()`'d (web #4, latent XSS foot-gun);
  forum shells set `Cache-Control: private, no-store` (web #3).
- `server/profiles.ts` — `/profile` responses set `Cache-Control: private,
  no-store` (web #3).

**Infra**
- Security-headers block added to every TLS vhost — admin, play, trade, forum,
  wiki, and the shared conf (`deploy/nginx-*.conf`): HSTS, nosniff, X-Frame-
  Options DENY, Referrer-Policy, CSP/COOP (infra #1, web #1/#2). Admin clickjacking
  closed.
- `deploy/setup-vps.sh` — generated ADMIN_PASSWORD no longer echoed to stdout;
  read from the `0600` env file instead (infra #3).

---

## 5. What remains (deferred to the economy / progression refactor)

These are exploitable **only if the freeze is lifted** or are inherent to client-
authoritative state. None is fixable without server-owned data; the freeze is the
mitigation until then. Design plan: `docs/ECONOMY-AUTHORITY.md`.

| ID | Finding | Needs |
|----|---------|-------|
| G5 | Master save forgery (`PUT /api/character` verbatim) | Server-owned progression — save stops being the truth for wealth/levels/quests |
| G1, M4 | Combat godmode + free best-in-slot specs | Server-owned skills + equipment + authoritative player HP decremented server-side |
| G3 | handleDrop cross-account item injection | Server-owned inventory (drops debit a real stack) — stays frozen |
| G4, M1 | GE coin/item printer (unbacked escrow) | Server-owned coin/item ledger; offer creation atomically debits — stays frozen |
| H2, H3, H4 | Coinflip / vault / guild-create unbacked | Server-owned coins/items — wired into the ledger; stay frozen meanwhile |
| H1 | Hiscore forgery (`save.xp`) | Server-authoritative xp |
| M6/D1 | Dungeon gate reads forgeable quest state | Server-authoritative quest state |
| G2 | FFA loot has no owner-tag (kill/loot-stealing) | Owner-tag drops from player kills (partial fix possible pre-refactor) |
| M2 | Price-oracle wash-trading | Mostly resolved once trades cost real server-owned coins; oracle can also use volume-weighted medians |

Low-severity / defense-in-depth carryovers (non-blocking): admin in-memory
sessions have no idle timeout / invalidate-all (infra #6); username case/homograph
impersonation (web #5); register username enumeration via `409` (web #5);
`RESTART_CMD` shell-metacharacter foot-gun if reconfigured (infra #2).

---

## 6. Prioritized roadmap & go/no-go checklist to lift the freeze

**Phase A — Server-owned ledger (coins + items).** Move `coins`, `inventory`,
`bank` to server-owned state mutated only via intent handlers inside a DB
transaction (see `docs/ECONOMY-AUTHORITY.md` §1, option B). Rewire GE escrow,
market, P2P trade, handleDrop, coinflip, guild vault/create to debit/credit the
ledger atomically. This unblocks G3/G4/M1/H2/H3/H4 and most of M2.

**Phase B — Server-owned progression (xp + quests).** xp and quest stage become
server-authoritative; hiscores and the dungeon gate read server state. Unblocks
G5 (for progression), H1, M6.

**Phase C — Server-owned combat (skills + equipment + HP).** Derive `eff`/`bonus`/
`maxHit`/`speed` from server skills + server-validated equipped gear; player HP is
an authoritative server pool decremented by `damagePlayer`, death resolved
server-side. Unblocks G1, M4. (Strictly larger than the economy refactor.)

**Phase D — Owner-tagged loot (G2)** and **oracle wash-resistance (M2)** —
independently shippable cleanups, can land alongside A.

### Go/no-go checklist — ALL must be true before `ECONOMY_FROZEN=0`

- [ ] Coins, inventory, and bank are server-owned; no authoritative read of them
      comes from the client save. `PUT /api/character` no longer stores wealth.
- [ ] GE offer creation atomically debits server-owned coins (buy) or items
      (sell); collect/abort credit only what was escrowed. No path mints.
- [ ] Market, P2P trade, coinflip, guild create, and guild vault deposit all
      debit server-owned state inside the same transaction as their effect.
- [ ] `handleDrop` debits a real server-owned stack; pickup *grants* server-side
      rather than hinting the client.
- [ ] xp and quest stage are server-authoritative (hiscores + dungeon gate read
      server state).
- [ ] Combat stats and player HP are server-derived/authoritative (G1/M4); clamps
      remain only as defense-in-depth.
- [ ] An audit pass confirms no remaining unbacked credit/mint path, and a
      ledger-conservation invariant test passes (total coins/items in == out).
- [ ] Each freeze gate is removed only after its path's server-owned replacement
      is verified — never lift the global flag with any path still trusting the
      save.

Until every box is checked, the freeze **stays ON**.

---

## 7. Verification (this pass)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (root) | green |
| `npx tsc --noEmit` (server) | green |
| `npx tsc --noEmit` (admin) | green |
| `npm run validate` | green ("Content validation passed.") |
| `npm run build` (client) | green (chunk-size warnings only) |
| `npm run home:build` | green |
| `npm run trade:build` | green |
| `npm run wiki:build` | green |
| Freeze gates GE offer/collect, market list/buy, P2P finishTrade, handleDrop | present |
| Wealth-shaped social paths (coinflip, guild create, vault) | now gated |
| Regression watch (self-match excl., session TTL, rate limits, CSRF/WS guards) | intact |

**VERDICT: CLEAN** — builds green, freeze intact.
