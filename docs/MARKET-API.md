# Larpscape Market API (trade.larpscape.net)

Backend: `server/market.ts` (`initMarket`) + one GE addition in `server/index.ts`.
All paths are on the main API host; the trade site calls them same-origin
through nginx (or cross-origin for the public GETs, which send
`Access-Control-Allow-Origin: *`).

## Auth & CSRF

- **Authed endpoints** accept the `bs_session` cookie (set on login at
  larpscape.net, `Domain=.larpscape.net`) **or** an `Authorization: Bearer
  <token>` header. 401 `{error:"unauthorized"}` without either.
- **Writes via cookie** must come from a `*.larpscape.net` (or localhost) page:
  the global `/api` middleware checks the `Origin`/`Referer` host and returns
  403 `{error:"csrf check failed"}` otherwise. The frontend needs no CSRF
  token — just normal `fetch(..., {method:'POST', credentials:'include'})`
  from the trade site.

## Error shape

Every error is `{"error": "<human-readable message>"}` with status 400
(validation / can't afford / capacity), 401 (no session), 403 (CSRF),
404 (unknown listing), 409 (listing no longer active / not active), 500
(unexpected — nothing committed).

## Escrow invariants

Every mutation is one synchronous SQLite transaction against the **server**
copy of the character save (`characters.save` JSON, `save.bank` =
`[{id, qty}, ...]`, stacks merged by id). Every save rewrite bumps the save
fence (`fenceSaves`), so an in-flight game-client `PUT /api/character` with
stale inventory gets 409 `save_fenced` and re-snapshots — no dupes.

- ACTIVE listing → the items exist only in `market_listings` (removed from the
  seller's bank at creation).
- SOLD → items are in the buyer's bank; the full price sits in
  `market_proceeds` for the seller until collected.
- CANCELLED → items are back in the seller's bank.
- The 1% listing fee (min 10 gp) is destroyed at creation (gold sink) and is
  **not refunded** on cancel.
- Bank caps respected: a stack never exceeds 2,000,000,000 and at most 800
  distinct stacks; a buy/cancel/collect that would overflow is rejected (or,
  for collect, partially fulfilled) with **nothing else committed**.

## Listing object

```json
{
  "id": 17,
  "item": "rimeglass_blade",
  "name": "Rimeglass blade",
  "qty": 1,
  "price": 120000,            // TOTAL price in coins for the whole listing
  "pricePer": 120000,         // ceil(price / qty)
  "createdAt": 1760000000000, // ms epoch
  "status": "active",         // active | sold | cancelled
  "soldAt": null,
  "seller": "Maraza",
  "sellerOnline": true,       // only on search / listing/:id responses
  "meta": {
    "slot": "weapon",         // equipSlot or null
    "levelReq": 45,           // highest required level (0 = none)
    "levelReqs": [{"skill": "Attack", "level": 45}],
    "effects": ["freeze"],    // effect type tokens
    "spec": "Held Note",      // special attack name or null
    "bonuses": {"att": 50, "str": 49, "ranged": 0, "mage": 0, "gun": 0},
    "attackSpeed": 4,
    "stackable": false,
    "value": 32000
  }
}
```

## Endpoints

### POST /api/market/list  (auth + CSRF)

Body `{ "item": "rune_scimitar", "qty": 1, "price": 25000 }`

- `item`: known item id, never `coins`.
- `qty`: integer 1..2,000,000,000; the seller's **bank** must hold it.
- `price`: integer 1..2,000,000,000 — **total** coins for the whole listing.
- Fee `max(10, floor(price * 0.01))` coins deducted from bank coins at
  creation; rejected if unaffordable.
- Max **12** active listings per user (400 otherwise).
- Items are moved out of the bank into escrow atomically.

200 → `{ "listing": <Listing> }`

### POST /api/market/buy  (auth + CSRF)

Body `{ "id": 17 }`

- Listing must be `active`; buyer ≠ seller.
- Buyer's bank must hold `price` coins. Coins out, item in (stack-merged;
  rejected if it would overflow the 2b stack cap or the 800-stack bank cap —
  the whole purchase rolls back).
- Seller is credited `price` coins in `market_proceeds`; if online in game,
  they get a system chat message.
- A row is appended to the shared `trades` table (per-unit price) so the item
  shows in GE price history.

200 → `{ "listing": <Listing status:"sold"> }` · 409 if already sold/cancelled.

### POST /api/market/cancel  (auth + CSRF)

Body `{ "id": 17 }` — seller only. Items return to the bank (capacity-checked,
rolls back on overflow). Fee not refunded.

200 → `{ "listing": <Listing status:"cancelled"> }`

### POST /api/market/collect  (auth + CSRF)

No body. Moves owed coins from `market_proceeds` into bank coins. If the bank
coin stack would exceed 2b, collects what fits and leaves the rest owed.

200 → `{ "collected": 120000, "remaining": 0 }` (`collected` may be 0).
400 `{"error":"your bank coin stack is full"}` when nothing fits.

### GET /api/market/search  (public, cached 30 s)

Query params (all optional):

| param         | meaning                                                    |
|---------------|------------------------------------------------------------|
| `name`        | case-insensitive substring of the item display name        |
| `slot`        | exact `equipSlot` (`weapon`, `head`, ...)                  |
| `effect`      | effect type token (`poison`,`burn`,`bleed`,`freeze`,`lifesteal`,`family_bane`) |
| `hasSpec`     | `1`/`true` → only items with a special attack              |
| `maxLevelReq` | highest item level requirement ≤ N                         |
| `minPrice`,`maxPrice` | bounds on **total** listing price                  |
| `sort`        | `price` (default — ascending per-unit price) or `age` (newest first) |
| `page`        | 1-based, 25 per page (clamped to last page)                |

200 → `{ "total": 132, "page": 1, "pages": 6, "pageSize": 25, "listings": [<Listing+sellerOnline>...] }`

Results may be ≤ 30 s stale (cache cleared eagerly on any list/buy/cancel).

### GET /api/market/listing/:id  (public)

200 → `{ "listing": <Listing+sellerOnline> }` (any status) · 404 unknown.

### GET /api/market/mine  (auth)

200 → `{ "listings": [<Listing>...] }` — caller's 50 most recent listings,
all statuses, newest first.

### GET /api/market/proceeds  (auth)

200 → `{ "coins": 120000 }` — uncollected sale proceeds.

### GET /api/market/items  (public, `Cache-Control: max-age=3600`)

Full item metadata catalogue for building filter UIs:
`{ "items": [{id, name, slot, levelReq, effects, spec, bonuses, attackSpeed, stackable, value}, ...] }`

### GET /api/ge/history/:item  (public, cached 5 min, in `server/index.ts`)

Daily volume-weighted buckets from the shared `trades` table (in-game GE +
market buyouts), last 90 days:

```json
{ "item": "rune_scimitar",
  "days": [ {"date": "2026-06-10", "avgPrice": 15800, "volume": 42}, ... ] }
```

`Cache-Control: public, max-age=300`, CORS `*`. 400 on malformed item id;
unknown-but-well-formed ids return empty `days`.

## Notes for the frontend

- All prices are integer coins; `price` is the whole-listing total.
- The in-game GE offer endpoints (`/api/ge/offer` etc.) already accept the
  session cookie (auth checks Bearer first, then `bs_session`), but they use
  the client-trusted escrow model — the trade site should use the
  `/api/market/*` endpoints exclusively for buying/selling.
- After any successful write the player's game client (if open) will briefly
  409 on autosave and re-pull its save; that is expected fence behaviour.
