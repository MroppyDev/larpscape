# Web-Surface Security Audit — Larpscape

Scope: every browser-facing surface — `homepage/` (auth pages, `auth.ts`, `main.ts`,
`md.ts`), `trade/src/*`, the wiki build (`scripts/build-wiki.ts`), `server/forum.ts`,
`server/profiles.ts`, `server/portrait.ts`, plus the cookie/CSRF/auth core in
`server/index.ts`. READ-ONLY audit; no code changed.

Threats checked: stored & reflected XSS, CSRF on cookie-authed mutations, open
redirect, cookie flags, session fixation, secrets/PII leakage, SSRF, clickjacking,
cache-control on authed responses.

## Verdict

The HTML-rendering surfaces are in good shape. Every server-rendered string runs
through `esc()`; the forum BBCode renderer escapes **before** transforming a safe
subset; profile bio/signature use `textToHtml` (escape + `\n`→`<br>`); the portrait
SVG never echoes user text (strict `^[a-zA-Z0-9]{1,20}$` username, item ids mapped
only to a fixed color table). Cookies are `HttpOnly; SameSite=Lax; Secure` with a
suffix-checked `Domain=.larpscape.net`. CSRF is enforced by an Origin/Referer host
check on every cookie-authed write (`/api`, `/forum/posting`, `/forum/mod`,
`/profile/edit`, `/profile/password`, and the WS upgrade). The `?return=` redirect is
a true whitelist (`play`/`forum` → fixed URLs, everything else → local `/profile`).
No email/PII is stored or returned anywhere; `/api/me` returns only `username`.

The findings below are real but none is a critical break. The headline gaps are the
total absence of clickjacking/MIME-sniffing/CSP headers and missing `Cache-Control`
on authed HTML.

## Findings

| # | Severity | Location | Issue / Exploit | Fix |
|---|----------|----------|-----------------|-----|
| 1 | Medium | All server-rendered HTML responses (`server/forum.ts` `send()` ~L366; `server/profiles.ts` `page()` ~L195; homepage static HTML) | **No clickjacking defense.** No `X-Frame-Options` / CSP `frame-ancestors` anywhere in the codebase (grep for `x-frame`/`content-security`/`helmet` → 0 hits). The forum mod panel, profile edit/password, and posting forms can be framed by an attacker page for clickjacking (e.g. tricking a Warden into clicking a "Delete Topic" button overlay, or a user into a password-change). SameSite=Lax on the cookie partially blunts cross-site POSTs, but UI-redress on same-site-framed-but-foreign-overlay tricks and read-style framing remain. | Send `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`) on all server-rendered HTML. Cheapest: one middleware in `server/index.ts` setting it for HTML responses, plus the same header from the homepage/trade nginx vhost. |
| 2 | Medium | All HTML responses; JSON API responses | **No `X-Content-Type-Options: nosniff`.** Combined with the SVG portrait endpoint and any user-influenced response, a sniffing browser could mis-interpret content types. Low standalone risk but a standard hardening miss. | Add `X-Content-Type-Options: nosniff` globally (same middleware as #1). |
| 3 | Medium | Authed server-rendered HTML: `server/profiles.ts` `/profile` (own profile, L423) and `server/forum.ts` pages that show "Logged in as <name>" / Warden tools | **No `Cache-Control` on cookie-authed HTML.** `send()`/`page()` set no cache headers, so a shared/intermediary proxy could cache a personalized page (the logged-in `/profile` edit page, or a forum page rendered with a user's session showing mod controls / their own quote-prefill) and serve it to another user. The API correctly uses `no-store` on `/api/character` (L717) but the HTML render paths don't. | Set `Cache-Control: private, no-store` on responses that embed session-derived content (`/profile`, `/profile/:username` when `isOwn`, and forum shells — simplest to apply `private, no-cache` on the whole forum/profile HTML). |
| 4 | Low | `server/forum.ts` `postingForm()` L641, `r.post('/posting')` error path L676/690 | **Error strings are interpolated into HTML without escaping** (`<div class="errbox">${error}</div>` / `${refusal}`). Currently *all* `error`/`refusal` values are hard-coded server constants (e.g. the char-limit and cooldown messages), so there is **no** injection today. It is a latent foot-gun: any future error string that incorporates user input (e.g. echoing the bad subject) becomes stored/reflected XSS. The `LOGIN_URL` and `${esc(...)}` interpolations around it are already escaped. | Treat the errbox as untrusted: wrap with `esc()` or keep an explicit invariant comment that error strings must be literal HTML-safe constants. No action strictly required today. |
| 5 | Low | `server/index.ts` register (L367) / login (L385); username `COLLATE NOCASE UNIQUE` (L59) | **Username case-folding / homograph display.** Registration is case-insensitively unique (`COLLATE NOCASE`), but the *stored* casing is whatever the registrant typed and is what renders on profiles, forum author panels, and hiscores. An attacker can register a visually-near display variant (e.g. differing case, or `rn` vs `m`) to impersonate. Not an injection (all render sites `esc()`), purely a trust/impersonation UX issue. Also: `/api/login` returns the same 401 for unknown-user vs bad-password (good — no user enumeration there), but `/api/register` returns a distinct `409 username taken`, allowing username enumeration. | Accept as low-risk for a fan MMO. If desired: normalize/canonicalize display name casing, and make register's "taken" response generic or rate-limited harder (already 10/hr/IP). |
| 6 | Low | `server/forum.ts` viewtopic IDOR-by-design check; `r.post('/mod')` L788 | **Mod actions are authorization-correct** (every branch gates on `isMod(user.id)` after `sameOriginOk`). No IDOR: delpost/delthread/lock/sticky resolve the target by id and require mod. Noting here only to record it was verified — `delpost` correctly cascades to whole-thread delete when the post is the opener. No fix needed. | None. |
| 7 | Info | `server/index.ts` `/api/ge/history`, `/api/ge/prices`, `/api/hiscores` set `Access-Control-Allow-Origin: *` | CORS wildcard is **safe** here: these are unauthenticated public endpoints and `Access-Control-Allow-Credentials` is never set, so the wildcard cannot be combined with the session cookie to read private data. Verified no authed endpoint sets `ACAO`. | None. |
| 8 | Info | `server/portrait.ts` SVG; `server/index.ts` WS upgrade | **SVG injection: not present.** Username is regex-gated and never placed in the SVG; equipment ids only index fixed `metalTint`/`UNIQUE_*` color tables (a non-matching id falls through to a literal default color, never the id text). **Session fixation: not present** — `createSession` mints a fresh token on every login/register and the cookie is replaced; password change revokes all *other* sessions. **SSRF: not present** — no server-side fetch of user-supplied URLs (forum `[url]` is http(s)-only and rendered as a client-side `<a rel="nofollow noopener">`, never fetched). | None. |

## Re-verified claims from the brief

- **BBCode/escaping (forum):** Confirmed safe. `renderBBCode` (L108) pulls `[code]`
  blocks out, runs `esc()` over everything, then applies bounded/anchored regex
  transforms for quote/list/b/i/u/url. `[url=...]` only accepts `https?://...` and
  emits `rel="nofollow noopener"`. No `[img]`. Quote/list nesting is capped. The
  quote-prefill (L669) puts `qp.body` + `qp.username` back into a textarea via
  `esc(body)` — escaped, no XSS.
- **CSRF Origin check present:** Yes, on all cookie-authed writes — `/api` middleware
  (L354), forum `sameOriginOk` (L392) used by `/forum/posting` and `/forum/mod`,
  profiles `csrfOk` (L90) used by `gate()`, and the WS upgrade origin guard (L1109).
  Bearer-authed requests correctly bypass (not forgeable cross-site).
- **`?return=` whitelist:** Confirmed a whitelist, not a free URL (`auth.ts`
  `returnTarget` L14): only `play`/`forum` map to fixed origins; anything else →
  `/profile`. No open redirect.
- **Cookie flags:** `HttpOnly; SameSite=Lax; Path=/`, `Secure` when proxied https,
  `Domain=.larpscape.net` only for genuine larpscape hosts (exact-suffix check blocks
  `evillarpscape.net`). 90-day Max-Age matches server TTL.
- **PII/secrets exposure:** No email column exists; no endpoint returns `passhash` or
  session tokens to other users; `/api/me` and market/profile responses expose only
  public usernames and game stats.

## Recommended priority

1. Add a global hardening-header middleware (Findings #1, #2): `X-Frame-Options: DENY`,
   `X-Content-Type-Options: nosniff`, and a baseline CSP.
2. Add `Cache-Control: private, no-store` to authed HTML render paths (#3).
3. Optional: escape the forum errbox as defense-in-depth (#4).
