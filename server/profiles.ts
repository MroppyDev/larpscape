// Player profiles: server-rendered public profile pages + a logged-in edit
// page (bio, signature, password change). Self-contained module — wire up
// from server/index.ts with:
//
//   import { initProfiles } from './profiles';
//   initProfiles(app, db, { userFromRequest });
//
// where userFromRequest(req) resolves the session user from the Bearer header
// or the bs_session cookie (same contract as /api/me) and returns
// { id, username } or null.
//
// Routes (work on any host — larpscape.net, play., forum., wiki. all proxy
// here, so /profile/<name> is linkable from hiscores and the forum):
//   GET  /profile/:username   public profile page
//   GET  /profile             your own profile + edit forms (cookie session)
//   POST /profile/edit        save bio + signature (cookie session + CSRF)
//   POST /profile/password    change password (cookie session + CSRF)
//
// SIGNATURE CONTRACT (for the forum module): a player's forum signature is
// profile_meta.signature for their user_id — plain text, max 240 chars, may
// contain newlines. Render it HTML-escaped with \n -> <br>; no BBCode here.

import type { Express, Request, Response } from 'express';
import express from 'express';
import type { Database } from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { getPlayerHiscores } from './hiscores';

const BIO_MAX = 500;
const SIG_MAX = 240;
const SESSION_COOKIE = 'bs_session';

export interface ProfileHelpers {
  userFromRequest: (req: Request) => { id: number; username: string } | null;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Plain text -> safe HTML with line breaks preserved.
function textToHtml(s: string): string {
  return esc(s).replace(/\r\n|\r|\n/g, '<br>');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (!k) continue;
    let v = part.slice(eq + 1).trim();
    try { v = decodeURIComponent(v); } catch { /* keep raw */ }
    out[k] = v;
  }
  return out;
}

// The session token this request rode in on (Bearer wins, cookie fallback) —
// needed so a password change can keep the current session alive while
// killing every other one.
function requestToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
  if (m) return m[1];
  return parseCookieHeader(req.headers.cookie)[SESSION_COOKIE] ?? null;
}

// Same Origin rule as the /api CSRF guard in server/index.ts: cookie-authed
// non-GET requests must come from a larpscape.net page (or localhost in dev).
function csrfOk(req: Request): boolean {
  const src = String(req.headers.origin || req.headers.referer || '');
  let host = '';
  try { host = new URL(src).hostname.toLowerCase(); } catch { host = ''; }
  return host === 'localhost' || host === '127.0.0.1'
    || host === 'larpscape.net' || host.endsWith('.larpscape.net');
}

// ---------------------------------------------------------------------------
// Page shell — parchment-and-stone, same design language as homepage/src/style.css
// ---------------------------------------------------------------------------

const PAGE_CSS = `
:root {
  --stone-dark:#3e3529; --stone-mid:#5a4e3c; --stone-light:#7a6a52;
  --bevel-hi:#8d7d62; --bevel-lo:#241d12;
  --stone-face:linear-gradient(#6e5f48,#5b4d38 55%,#4c4030);
  --stone-face-lit:linear-gradient(#7e6e54,#685a42 55%,#574a36);
  --parchment:#c0a886; --parchment-dark:#a58e6f; --parchment-lit:#cdb796;
  --panel-bg:#494034; --yellow:#ffff00; --orange:#ff981f;
  --gold:#e8b54a; --gold-bright:#f1c85a; --ink:#2b2114; --ink-soft:#4a3c28;
  --ember:#9a3324;
  --outline:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,
    1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000;
}
* { box-sizing:border-box; margin:0; padding:0; }
body {
  background:radial-gradient(ellipse 120% 60% at 50% -5%, #2a2018 0%, transparent 60%), #14100c;
  color:var(--parchment); font-family:Georgia,'Times New Roman',serif;
  font-size:16px; line-height:1.5; padding:18px 10px 40px;
}
a { color:var(--gold); } a:hover { color:var(--gold-bright); }
.shell { max-width:760px; margin:0 auto; }
.masthead {
  text-align:center; margin-bottom:14px;
}
.masthead a.home {
  font-size:30px; font-weight:bold; letter-spacing:.06em;
  color:var(--gold-bright); text-decoration:none; text-shadow:var(--outline);
}
.masthead .strap { font-size:12px; color:var(--parchment-dark); font-style:italic; }
.panel {
  background:var(--panel-bg);
  border:2px solid; border-color:var(--bevel-hi) var(--bevel-lo) var(--bevel-lo) var(--bevel-hi);
  box-shadow:0 0 0 1px #0a0805, 0 4px 0 rgba(0,0,0,.4);
  border-radius:3px; margin-bottom:16px;
}
.panel h2 {
  background:var(--stone-face);
  border-bottom:2px solid var(--bevel-lo);
  color:var(--yellow); text-shadow:var(--outline);
  font-size:19px; letter-spacing:.05em; padding:7px 12px 8px;
}
.panel .inner { padding:12px 14px 14px; }
.parch {
  background:var(--parchment); color:var(--ink);
  border:1px solid var(--bevel-lo); border-radius:2px;
  padding:10px 12px;
}
.parch .muted { color:var(--ink-soft); }
.head-row { display:flex; gap:14px; align-items:flex-start; }
.portrait {
  width:96px; height:96px; flex:0 0 96px;
  background:var(--stone-dark);
  border:2px solid; border-color:var(--bevel-lo) var(--bevel-hi) var(--bevel-hi) var(--bevel-lo);
  image-rendering:pixelated; object-fit:contain;
}
.pname { font-size:26px; color:var(--gold-bright); text-shadow:var(--outline); }
.ptag { color:var(--orange); font-size:18px; }
table.stats { width:100%; border-collapse:collapse; }
table.stats th, table.stats td {
  border:1px solid var(--parchment-dark); padding:4px 8px; text-align:left;
  font-size:14px; color:var(--ink);
}
table.stats th { background:var(--parchment-dark); }
table.stats td.num { text-align:right; }
dl.facts { display:grid; grid-template-columns:max-content 1fr; gap:3px 14px; font-size:14px; }
dl.facts dt { color:var(--parchment-dark); }
dl.facts dd { color:var(--parchment-lit); }
form label { display:block; font-size:13px; color:var(--parchment-dark); margin:10px 0 3px; }
textarea, input[type=password] {
  width:100%; background:var(--parchment); color:var(--ink);
  border:1px solid var(--bevel-lo); border-radius:2px;
  padding:6px 8px; font-family:inherit; font-size:14px;
}
textarea { resize:vertical; }
.btn {
  display:inline-block; margin-top:12px;
  background:var(--stone-face);
  border:2px solid; border-color:var(--bevel-hi) var(--bevel-lo) var(--bevel-lo) var(--bevel-hi);
  box-shadow:0 0 0 1px #0a0805, 0 3px 0 rgba(0,0,0,.45);
  border-radius:3px; padding:7px 22px 8px;
  font-family:inherit; font-weight:bold; font-size:16px; letter-spacing:.04em;
  color:var(--yellow); text-shadow:var(--outline); cursor:pointer;
}
.btn:hover { background:var(--stone-face-lit); }
.btn:active { transform:translateY(2px); box-shadow:0 0 0 1px #0a0805, 0 1px 0 rgba(0,0,0,.45); }
.notice {
  border:1px solid var(--gold); background:rgba(232,181,74,.12);
  color:var(--gold-bright); padding:8px 12px; border-radius:2px; margin-bottom:14px; font-size:14px;
}
.notice.err { border-color:var(--ember); background:rgba(154,51,36,.18); color:#e8a08e; }
.footnav { text-align:center; font-size:13px; color:var(--parchment-dark); margin-top:18px; }
`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - Larpscape</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="shell">
  <div class="masthead">
    <a class="home" href="https://larpscape.net/">LARPSCAPE</a>
    <div class="strap">A free land of Cantorne &mdash; est. F.S. 743</div>
  </div>
  ${body}
  <div class="footnav">
    <a href="https://larpscape.net/">Home</a> &middot;
    <a href="https://play.larpscape.net/">Play</a> &middot;
    <a href="https://wiki.larpscape.net/">Wiki</a> &middot;
    <a href="https://forum.larpscape.net/">Forum</a>
  </div>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Data lookups (defensive about tables owned by other modules)
// ---------------------------------------------------------------------------

interface UserRow { id: number; username: string; created_at: number }
interface MetaRow { bio: string | null; signature: string | null }

function tableExists(db: Database, name: string): boolean {
  return !!db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(name);
}

function getGuildTag(db: Database, userId: number): string | null {
  try {
    if (!tableExists(db, 'guilds') || !tableExists(db, 'guild_members')) return null;
    const row = db.prepare(`
      SELECT g.tag AS tag, g.name AS name
      FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id
      WHERE gm.user_id = ?
    `).get(userId) as { tag: string; name: string } | undefined;
    return row ? `[${row.tag}] ${row.name}` : null;
  } catch { return null; }
}

function getForumPostCount(db: Database, userId: number): number {
  try {
    if (!tableExists(db, 'forum_posts')) return 0;
    const cols = (db.prepare('PRAGMA table_info(forum_posts)').all() as { name: string }[])
      .map((c) => c.name);
    const col = cols.includes('user_id') ? 'user_id'
      : cols.includes('author_id') ? 'author_id'
      : cols.includes('author') ? 'author' : null;
    if (!col) return 0;
    const row = db.prepare(`SELECT COUNT(*) AS n FROM forum_posts WHERE ${col} = ?`)
      .get(userId) as { n: number };
    return row.n;
  } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderProfile(db: Database, user: UserRow, isOwn: boolean): string {
  const meta = db.prepare('SELECT bio, signature FROM profile_meta WHERE user_id = ?')
    .get(user.id) as MetaRow | undefined;
  const hs = getPlayerHiscores(db, user.username);
  const guild = getGuildTag(db, user.id);
  const posts = getForumPostCount(db, user.id);

  // Five highest skills: by level, ties broken by xp.
  const top5 = hs
    ? [...hs.skills].sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, 5)
    : [];

  const skillRows = top5.map((s) => `
      <tr>
        <td>${esc(s.skill)}</td>
        <td class="num">${s.level}</td>
        <td class="num">${fmtNum(s.xp)}</td>
        <td class="num">${fmtNum(s.rank)}</td>
      </tr>`).join('');

  const adventurerPanel = hs ? `
  <div class="panel">
    <h2>Adventurer's Record</h2>
    <div class="inner">
      <dl class="facts" style="margin-bottom:10px">
        <dt>Total level</dt><dd>${fmtNum(hs.overall.totalLevel)}</dd>
        <dt>Total XP</dt><dd>${fmtNum(hs.overall.totalXp)}</dd>
        <dt>Overall rank</dt><dd>${fmtNum(hs.overall.rank)} &mdash; <a href="https://larpscape.net/hiscores">hiscores</a></dd>
      </dl>
      <table class="stats">
        <tr><th>Finest skills</th><th>Level</th><th>XP</th><th>Rank</th></tr>
        ${skillRows}
      </table>
    </div>
  </div>` : `
  <div class="panel">
    <h2>Adventurer's Record</h2>
    <div class="inner"><div class="parch"><span class="muted">This adventurer has not yet set foot in Cantorne. No hiscores recorded.</span></div></div>
  </div>`;

  const bio = (meta?.bio || '').trim();
  const sig = (meta?.signature || '').trim();

  return `
  <div class="panel">
    <h2>Character Profile</h2>
    <div class="inner">
      <div class="head-row">
        <img class="portrait" src="/api/portrait/${encodeURIComponent(user.username)}.svg" alt=""
             onerror="this.style.visibility='hidden'">
        <div>
          <div class="pname">${esc(user.username)}</div>
          ${guild ? `<div class="ptag">${esc(guild)}</div>` : ''}
          <dl class="facts" style="margin-top:6px">
            <dt>Joined</dt><dd>${fmtDate(user.created_at)}</dd>
            <dt>Forum posts</dt><dd>${fmtNum(posts)}</dd>
          </dl>
        </div>
      </div>
    </div>
  </div>
  ${adventurerPanel}
  <div class="panel">
    <h2>About</h2>
    <div class="inner">
      <div class="parch">${bio ? textToHtml(bio) : '<span class="muted">This adventurer keeps their story to themselves.</span>'}</div>
    </div>
  </div>
  <div class="panel">
    <h2>Forum Signature</h2>
    <div class="inner">
      <div class="parch">${sig ? textToHtml(sig) : '<span class="muted">No signature set.</span>'}</div>
    </div>
  </div>
  ${isOwn ? renderEditForms(bio, sig) : ''}`;
}

function renderEditForms(bio: string, sig: string): string {
  return `
  <div class="panel">
    <h2>Edit Profile</h2>
    <div class="inner">
      <form method="post" action="/profile/edit">
        <label for="bio">About me (plain text, up to ${BIO_MAX} characters)</label>
        <textarea id="bio" name="bio" rows="6" maxlength="${BIO_MAX}">${esc(bio)}</textarea>
        <label for="signature">Forum signature (shown under your forum posts, up to ${SIG_MAX} characters)</label>
        <textarea id="signature" name="signature" rows="3" maxlength="${SIG_MAX}">${esc(sig)}</textarea>
        <button class="btn" type="submit">Save Profile</button>
      </form>
    </div>
  </div>
  <div class="panel">
    <h2>Change Password</h2>
    <div class="inner">
      <form method="post" action="/profile/password">
        <label for="current">Current password</label>
        <input id="current" name="current" type="password" autocomplete="current-password" required>
        <label for="next">New password (4&ndash;64 characters)</label>
        <input id="next" name="next" type="password" autocomplete="new-password" required>
        <button class="btn" type="submit">Change Password</button>
      </form>
      <p style="font-size:12px;color:var(--parchment-dark);margin-top:8px">
        Changing your password signs you out everywhere else (all other sessions are revoked).
      </p>
    </div>
  </div>`;
}

function flash(req: Request): string {
  const ok = typeof req.query.ok === 'string' ? req.query.ok : '';
  const err = typeof req.query.err === 'string' ? req.query.err : '';
  if (err) return `<div class="notice err">${esc(err.slice(0, 200))}</div>`;
  if (ok) return `<div class="notice">${esc(ok.slice(0, 200))}</div>`;
  return '';
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

export function initProfiles(app: Express, db: Database, helpers: ProfileHelpers) {
  const { userFromRequest } = helpers;

  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_meta (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      bio TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
  `);

  const form = express.urlencoded({ extended: false, limit: '32kb' });

  function userByName(username: string): UserRow | null {
    if (typeof username !== 'string' || username.length > 12) return null;
    return (db.prepare('SELECT id, username, created_at FROM users WHERE username = ?')
      .get(username) as UserRow | undefined) ?? null;
  }

  // Auth + CSRF gate for the profile POST routes (forms are cookie-authed and
  // live outside /api, so the index.ts CSRF middleware doesn't cover them).
  function gate(req: Request, res: Response): { id: number; username: string } | null {
    const user = userFromRequest(req);
    if (!user) {
      res.redirect(303, '/profile?err=' + encodeURIComponent('You must be signed in.'));
      return null;
    }
    if (!csrfOk(req)) {
      res.status(403).send(page('Error', `<div class="panel"><h2>Request blocked</h2>
        <div class="inner"><div class="parch">Cross-site request rejected.</div></div></div>`));
      return null;
    }
    return user;
  }

  // GET /profile — your own profile with edit forms (cookie session).
  app.get('/profile', (req, res) => {
    const user = userFromRequest(req);
    if (!user) {
      res.status(401).send(page('Sign In', `
        ${flash(req)}
        <div class="panel">
          <h2>Character Profile</h2>
          <div class="inner"><div class="parch">
            You are not signed in. <a href="https://larpscape.net/">Sign in at larpscape.net</a>
            to view and edit your profile.
          </div></div>
        </div>`));
      return;
    }
    const row = userByName(user.username);
    if (!row) { res.status(404).send(page('Not Found', notFoundPanel(user.username))); return; }
    res.send(page(`${row.username}'s Profile`, flash(req) + renderProfile(db, row, true)));
  });

  // GET /profile/:username — public profile page.
  app.get('/profile/:username', (req, res) => {
    const row = userByName(req.params.username);
    if (!row) {
      res.status(404).send(page('Not Found', notFoundPanel(req.params.username)));
      return;
    }
    const viewer = userFromRequest(req);
    const isOwn = !!viewer && viewer.id === row.id;
    res.send(page(`${row.username}'s Profile`, flash(req) + renderProfile(db, row, isOwn)));
  });

  // POST /profile/edit — save bio + signature.
  app.post('/profile/edit', form, (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const bio = typeof body.bio === 'string' ? body.bio.replace(/\r\n/g, '\n') : '';
    const sig = typeof body.signature === 'string' ? body.signature.replace(/\r\n/g, '\n') : '';
    if (bio.length > BIO_MAX) {
      res.redirect(303, `/profile?err=${encodeURIComponent(`Bio must be at most ${BIO_MAX} characters.`)}`);
      return;
    }
    if (sig.length > SIG_MAX) {
      res.redirect(303, `/profile?err=${encodeURIComponent(`Signature must be at most ${SIG_MAX} characters.`)}`);
      return;
    }
    db.prepare(`INSERT INTO profile_meta (user_id, bio, signature, updated_at) VALUES (?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET
                  bio = excluded.bio, signature = excluded.signature, updated_at = excluded.updated_at`)
      .run(user.id, bio, sig, Date.now());
    res.redirect(303, '/profile?ok=' + encodeURIComponent('Profile saved.'));
  });

  // Brute-force guard: a logged-in attacker (stolen cookie) must not be able
  // to grind the "current password" check. Fixed window, per user id.
  const PW_WINDOW_MS = 10 * 60_000;
  const PW_MAX_FAILS = 5;
  const pwFails = new Map<number, { count: number; reset: number }>();

  // POST /profile/password — verify current password, set new one, revoke
  // every session except the one making this request.
  app.post('/profile/password', form, (req, res) => {
    const user = gate(req, res);
    if (!user) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const current = typeof body.current === 'string' ? body.current : '';
    const next = typeof body.next === 'string' ? body.next : '';
    if (next.length < 4 || next.length > 64) {
      res.redirect(303, '/profile?err=' + encodeURIComponent('New password must be 4-64 characters.'));
      return;
    }
    const now = Date.now();
    let fails = pwFails.get(user.id);
    if (!fails || now >= fails.reset) {
      if (pwFails.size > 10_000) pwFails.clear(); // bound memory
      fails = { count: 0, reset: now + PW_WINDOW_MS };
      pwFails.set(user.id, fails);
    }
    if (fails.count >= PW_MAX_FAILS) {
      res.redirect(303, '/profile?err=' + encodeURIComponent('Too many attempts. Try again in a few minutes.'));
      return;
    }
    const row = db.prepare('SELECT passhash FROM users WHERE id = ?')
      .get(user.id) as { passhash: string } | undefined;
    if (!row || !bcrypt.compareSync(current, row.passhash)) {
      fails.count++;
      res.redirect(303, '/profile?err=' + encodeURIComponent('Current password is incorrect.'));
      return;
    }
    pwFails.delete(user.id);
    const passhash = bcrypt.hashSync(next, 10);
    const currentToken = requestToken(req) ?? '';
    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET passhash = ? WHERE id = ?').run(passhash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
        .run(user.id, currentToken);
    });
    tx();
    res.redirect(303, '/profile?ok=' + encodeURIComponent('Password changed. Other sessions have been signed out.'));
  });
}

function notFoundPanel(name: string): string {
  return `
  <div class="panel">
    <h2>Adventurer Not Found</h2>
    <div class="inner"><div class="parch">
      No adventurer named &ldquo;${esc(String(name).slice(0, 24))}&rdquo; is recorded in the annals of Cantorne.
    </div></div>
  </div>`;
}
