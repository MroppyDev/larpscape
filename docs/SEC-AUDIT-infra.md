# SEC-AUDIT-infra — Admin, infra & deploy security audit

Scope: `admin/server/index.ts` + `admin/ui`, `deploy/*.conf`, `deploy/*.sh`, systemd units.
Read-only audit; no code changed. Date 2026-06-11.

Bottom line: the admin app's auth/validation/proxy core is sound (the array-args
+ regex-path claim re-verified, see below). The real exposure is at the nginx
layer: **zero security headers on any vhost** (no HSTS, no X-Frame-Options, no
nosniff, no Referrer-Policy, no CSP) and a few defense-in-depth gaps in the admin
server. Nothing here re-opens a frozen wealth path; the `/api` proxy fan-out is
acceptable because the game server owns its own auth + CSRF (verified).

---

## Findings

| # | Sev | File:line / conf | Issue | Exploit | Fix |
|---|-----|------------------|-------|---------|-----|
| 1 | High | every `deploy/nginx-*.conf` | **No security headers on any vhost** — no `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or CSP. | admin.larpscape.net is fully clickjackable (iframe overlay → operator clicks ban/publish/restart); no HSTS means a first-visit SSL-strip / downgrade MITM; missing nosniff allows content-type confusion on proxied JSON. | Add the headers block below to *every* `server{}` (esp. the admin SSL vhost). |
| 2 | High | `admin/server/index.ts:25` + `larpscape-admin.service:15` (`RESTART_CMD`) | `RESTART_CMD` is split on spaces and run via `spawn` (`:286-287`). It is **operator/env-controlled, not request-controlled**, so not an injection from the web — but it is shell-less only by luck. If anyone ever sets `RESTART_CMD` with a value needing a shell, or on win32 (`shell:true` at `:238`), tokens become injectable. | Not remotely exploitable today (env is `sudo /usr/bin/systemctl restart larpscape`, locked by sudoers). Latent foot-gun. | Document that `RESTART_CMD` must be a bare `argv` with no shell metacharacters; keep `shell:false` on Linux (already true). Low urgency. |
| 3 | Med | `setup-vps.sh:44-48` | **Generated `ADMIN_PASSWORD` is echoed to stdout** during provisioning (`echo "...generated ADMIN_PASSWORD: $ADMIN_PASSWORD..."`). | The bootstrap password lands in terminal scrollback / CI logs / `journalctl` if setup runs under systemd. ADMIN_TOKEN is *not* printed (good). | Drop the value from the echo — print only "generated (see /etc/larpscape/env)". |
| 4 | Med | `admin/server/index.ts:252` (game-server `requireAdmin`, re-checked) | The game server's admin-token check uses `req.headers['x-admin-token'] !== ADMIN_TOKEN` — a **non-constant-time** string compare. (The admin *login* at `:73-75` correctly uses `timingSafeEqual` over SHA-256 digests — good — but the inter-service token compare does not.) | Theoretical remote timing oracle on a 24-byte hex token; very hard over a network, but free to fix. | Compare via `crypto.timingSafeEqual` over fixed-length digests, same pattern as the login. |
| 5 | Med | `admin/server/index.ts:312-316` SPA fallback | The catch-all `sendFile(dist/index.html)` runs for any GET not starting with `/admin-api`. It serves a fixed file (no `req.path` interpolation) so **no traversal** — but the `dist-admin` SPA is served with default headers and no `Cache-Control`/nosniff. | Low. Mostly a caching/headers nit; the admin vhost has no headers either (finding #1). | Covered by adding headers at nginx (#1). |
| 6 | Low | `admin/server/index.ts:36-37` sessions | Admin sessions are in-memory `Map`, 7-day TTL, **no idle timeout and no "invalidate all" control**; a leaked `adm` cookie is valid for a week and survives password change (only a process restart clears them). | Stolen cookie = 7 days of full admin. | Add a logout-all / restart-on-rotate note; consider shorter TTL + sliding refresh. Acceptable for single-operator. |
| 7 | Low | `deploy/nginx-larpscape.conf:88-94`, wiki alias | `location /wiki/ { alias /opt/larpscape/dist-wiki-path/; }`. `alias` + `try_files` is safe here (no regex capture, no `$uri` concatenation past the alias), so the documented traversal class (`/wiki../`) does **not** apply — nginx normalizes `..` before location match. Noted as verified-clean, not a finding. | n/a | none |
| 8 | Info | `deploy/nginx-larpscape-forum-ssl.conf`, `*-wiki-ssl.conf` | These vhosts proxy to the game server (forum proxies **all** of `/`; wiki proxies only `/api/ge/`). This is **not** an SSRF/abuse vector: the upstream is a fixed `127.0.0.1:8080`, the path is the client's request path (no user-controlled host), and the game server enforces its own Bearer/cookie auth + the `/api` Origin-host CSRF guard (`server/index.ts:354-365`, re-verified) and the WS Origin guard (`:1107-1113`). The forum/trade pages legitimately need same-origin `/api`. Leave as-is. | n/a | none |

### Re-verification of prior claims (all hold)

- **array-args + regex-path** (`admin/server/index.ts:198-217`): the game proxy
  derives `sub` from `req.path`, hard-rejects anything not matching
  `^[a-zA-Z0-9_/-]+$` (`:201`) **before** building the upstream URL, so no path
  traversal / scheme smuggling into `${GAME_API}/api/admin/${sub}`. `x-admin-token`
  is injected server-side and never reaches the browser. Clean.
- **git calls** (`git()` at `:105-111`, callers `:161-185`): every invocation uses
  `execFile('git', [...args])` with a fixed `argv` array (no shell) and the only
  user input — the commit `message` — is passed as a discrete arg after `-m`,
  trimmed and length-capped (`:158-160`). The filename arg is the schema-validated
  `data/${name}` where `name ∈ FILE_SCHEMAS` (`contentFileOk`, `:119-121`). No
  command injection, no arg-injection (`--` terminator used at `:162`). Clean.
- **content-write zod** (`:137-164`): PUT validates `FILE_SCHEMAS[name].safeParse`,
  then writes, then runs cross-reference `validateContent` and **reverts on
  failure** before committing. Name is allow-listed. Clean.
- **db / save_backups not statically reachable**: SQLite lives at
  `server/data.db` (`server/index.ts:53`, `__dirname`=server/). No nginx `root`
  points at `server/`; the game server's `express.static` serves only `../dist`
  (`:741`) and the admin server serves only `dist-admin` (`:309-311`). The db and
  `save_backups` table are unreachable via any static route. Clean.
- **publish `warnSeconds`/`message`** (`:248-251`): clamped (`Math.min/max`) and
  length-capped; no interpolation into a shell. Clean.
- Already-shipped fixes confirmed still present: SHA-256 digest login compare
  (`:73-75`), login lockout (`:65-80`), GE/save rate limits (game server
  `:345-348`), `ECONOMY_FROZEN` default-on (`server/econ-freeze.ts:13`). **Not regressed.**

---

## Recommended security-headers block — add to EVERY vhost `server{}`

Put this inside each `server { listen 443 ssl; ... }` block (HSTS only belongs on
the TLS blocks; keep it off plain `:80` redirect-only servers). nginx's
`add_header` does NOT inherit into a `location` once that location declares its
own `add_header`, so either set these at `server` scope only OR re-declare in any
`location` that already calls `add_header` (the Cache-Control locations) — use
`always` so they attach to error/proxy responses too.

```nginx
    # --- Security headers (server scope) ---
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header X-Frame-Options           "DENY" always;          # SAMEORIGIN if any vhost legitimately iframes itself
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    # CSP — tune per app. Game/trade use WS + inline bootstrap; start report-only,
    # then enforce. Admin can be strict (no third-party origins):
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: https:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'" always;
```

Per-vhost notes:
- **admin.larpscape.net** (`nginx-larpscape-admin.conf`) — highest priority for
  #1. Add the full block; `X-Frame-Options DENY` + `frame-ancestors 'none'` kill
  the clickjacking risk on ban/publish/restart controls. The admin SPA is
  first-party only, so the strict CSP above works without `unsafe-eval`.
- **play / trade / forum / wiki** — same block; for the game and trade clients
  keep `connect-src 'self' wss:` (WebSocket) and verify no inline `eval`; ship CSP
  as `Content-Security-Policy-Report-Only` first if unsure, then flip to enforce.
- Because `add_header` inheritance is replaced (not merged) inside any `location`
  that already has an `add_header` (e.g. the `location /assets/`,
  `location = /index.html` Cache-Control blocks), either move all security headers
  to server scope and remove `add_header` from those locations, or duplicate the
  security headers into each such location. Easiest correct fix: server-scope
  security headers + keep Cache-Control where it is, accepting that the
  Cache-Control locations will drop the security headers — so instead, prefer
  re-declaring the security block in the `/assets/` and `index.html` locations, or
  use a shared `include deploy/security-headers.conf;` snippet referenced from
  both server scope and each header-bearing location.

## Suggested follow-ups (not blocking, all defense-in-depth)
- #3 redact ADMIN_PASSWORD from `setup-vps.sh` stdout.
- #4 constant-time `x-admin-token` compare in `server/index.ts requireAdmin`.
- #6 admin session: add idle timeout + a way to invalidate all sessions on
  password rotation (today only a process restart clears the in-memory map).
- Add `include /etc/letsencrypt/options-ssl-nginx.conf` already pins modern TLS
  (good) — no TLS-version finding.
