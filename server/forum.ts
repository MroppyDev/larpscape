// Larpscape Forums — a faithful early-2000s bulletin board, server-rendered.
// Table layout, 11px Verdana, beveled borders, classic ?f= / ?t= URLs, zero
// client JS (even the Quote button is a plain link the server prefills).
// Structure researched from era boards (archive.org, STRUCTURE only); all
// copy, names, and skin are original Larpscape work. See docs/FORUM-SPEC.md.
//
// Self-contained: mounted by initForum(app, db, helpers) at /forum. The
// forum.larpscape.net vhost is handled here too — requests arriving with that
// host are internally rewritten to /forum/*.

import express from 'express';
import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { FORUM_CSS } from './forum-skin';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ForumHelpers {
  /** Resolve the logged-in user from Bearer header or bs_session cookie. */
  userFromRequest: (req: Request) => { id: number; username: string } | null;
  /** Optional live presence count (WS clients). Falls back to recent sessions. */
  onlineCount?: () => number;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const THREADS_PER_PAGE = 30;
const POSTS_PER_PAGE = 15;
const SEARCH_PER_PAGE = 25;
const TITLE_MAX = 80;
const BODY_MAX = 8000;
const POST_COOLDOWN_MS = 20_000;
const QUOTE_NEST_CAP = 5;
const LOGIN_URL = 'https://larpscape.net/login?return=forum';

// Lore ranks by post count (highest threshold first).
const RANKS: Array<[number, string]> = [
  [1000, 'Voice of the Choir'],
  [400, 'Offnote Hunter'],
  [150, 'Toll-Payer'],
  [50, 'Town Crier'],
  [10, 'Bellmeadow Regular'],
  [0, 'Newcomer'],
];

function rankFor(posts: number): string {
  for (const [min, name] of RANKS) if (posts >= min) return name;
  return 'Newcomer';
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Classic board stamp: "Wed 11 Jun 2026, 14:02" (24-hour, day-first).
function fmtDate(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${min}`;
}

function intQ(v: unknown, fallback = 0): number {
  const n = Number(typeof v === 'string' ? v : NaN);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// "Goto page 1, 2, 3 ... 12" — the classic line.
function gotoPages(base: string, total: number, perPage: number, start: number): string {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return '';
  const cur = Math.floor(start / perPage) + 1;
  const link = (p: number) =>
    p === cur ? `<b>${p}</b>` : `<a href="${base}&amp;start=${(p - 1) * perPage}">${p}</a>`;
  const parts: string[] = [];
  if (pages <= 8) {
    for (let p = 1; p <= pages; p++) parts.push(link(p));
  } else {
    const lo = Math.max(1, cur - 1);
    const hi = Math.min(pages, cur + 1);
    if (lo > 1) { parts.push(link(1)); if (lo > 2) parts.push('...'); }
    for (let p = lo; p <= hi; p++) parts.push(link(p));
    if (hi < pages) { if (hi < pages - 1) parts.push('...'); parts.push(link(pages)); }
  }
  return `<span class="pagelinks">Goto page ${parts.join(', ').replace(/, \.\.\.,/g, ' ...').replace(/\.\.\.,/g, '... ')}</span>`;
}

// ---------------------------------------------------------------------------
// BBCode — escape ALL HTML first, then transform a safe subset. No [img].
// ---------------------------------------------------------------------------

function renderBBCode(raw: string): string {
  // 0. normalise newlines, hard cap (defence in depth; routes also cap).
  let src = raw.replace(/\r\n?/g, '\n').slice(0, BODY_MAX);

  // 1. pull [code] blocks out before anything else; restored verbatim at the end.
  const codes: string[] = [];
  src = src.replace(/\[code\]\n?([\s\S]*?)\[\/code\]/gi, (_m, c: string) => `\x00C${codes.push(c) - 1}\x00`);

  // 2. escape everything.
  let s = esc(src);

  // 3. quotes — innermost first, nesting capped.
  const quoteRe = /\[quote(?:=((?:(?!\[quote)[^\]\n]){1,40}))?\]\n?((?:(?!\[quote)[\s\S])*?)\n?\[\/quote\]/i;
  for (let d = 0; d < QUOTE_NEST_CAP; d++) {
    const before = s;
    s = s.replace(new RegExp(quoteRe.source, 'gi'), (_m, name: string | undefined, inner: string) => {
      let who = (name ?? '').trim().replace(/^&quot;|&quot;$/g, '').trim();
      if (who.length > 30) who = who.slice(0, 30);
      const head = who ? `${who} wrote:` : 'Quote:';
      return `<div class="quotewrap"><div class="quotehead">${head}</div><div class="quotebox">${inner}</div></div>`;
    });
    if (s === before) break;
  }

  // 4. lists with [*] items, nesting capped.
  for (let d = 0; d < QUOTE_NEST_CAP; d++) {
    const before = s;
    s = s.replace(/\[list\]((?:(?!\[list\])[\s\S])*?)\[\/list\]/gi, (_m, inner: string) => {
      const items = inner.split(/\[\*\]/).slice(1)
        .map((it) => `<li>${it.trim()}</li>`).join('');
      return items ? `<ul>${items}</ul>` : '';
    });
    if (s === before) break;
  }

  // 5. simple paired tags (loop a few times for nesting).
  for (let d = 0; d < 3; d++) {
    const before = s;
    for (const t of ['b', 'i', 'u']) {
      s = s.replace(new RegExp(`\\[${t}\\]([\\s\\S]*?)\\[\\/${t}\\]`, 'gi'), `<${t}>$1</${t}>`);
    }
    if (s === before) break;
  }

  // 6. links — http(s) only, no [img] ever.
  s = s.replace(/\[url=(https?:\/\/[^\s\[\]"'<>]{1,300})\]((?:(?!\[url)[\s\S])*?)\[\/url\]/gi,
    '<a href="$1" rel="nofollow noopener">$2</a>');
  s = s.replace(/\[url\](https?:\/\/[^\s\[\]"'<>]{1,300})\[\/url\]/gi,
    '<a href="$1" rel="nofollow noopener">$1</a>');

  // 7. newlines.
  s = s.replace(/\n/g, '<br />\n');

  // 8. restore code blocks (escaped, raw whitespace preserved by white-space:pre).
  s = s.replace(/\x00C(\d+)\x00/g, (_m, i: string) =>
    `<div class="codehead">Code:</div><div class="codebox">${esc(codes[Number(i)] ?? '')}</div>`);

  return s;
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

export function initForum(app: Express, db: Database.Database, helpers: ForumHelpers) {
  // --- schema + seed ---------------------------------------------------------
  db.exec(`
CREATE TABLE IF NOT EXISTS forum_boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  "desc" TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  mods_only INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS forum_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board INTEGER NOT NULL REFERENCES forum_boards(id),
  title TEXT NOT NULL,
  author INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  last_post_at INTEGER NOT NULL,
  sticky INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_forum_threads_board ON forum_threads (board, sticky, last_post_at);
CREATE TABLE IF NOT EXISTS forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread INTEGER NOT NULL REFERENCES forum_threads(id),
  author INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON forum_posts (thread, id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author ON forum_posts (author, created_at);
CREATE TABLE IF NOT EXISTS forum_mods (
  user_id INTEGER PRIMARY KEY REFERENCES users(id)
);
`);

  const boardCount = (db.prepare('SELECT COUNT(*) AS c FROM forum_boards').get() as { c: number }).c;
  if (boardCount === 0) {
    const ins = db.prepare(
      'INSERT INTO forum_boards (category, name, "desc", sort, mods_only) VALUES (?,?,?,?,?)');
    const seed: Array<[string, string, string, number, number]> = [
      ['ANNOUNCEMENTS', 'News & Announcements',
        'Word from the choirloft. Updates, downtime, and decrees — only the wardens may post here.', 10, 1],
      ['CANTORNE', 'General Discussion',
        'The commons of the vale. Anything Larpscape that fits nowhere else, F.S. 743 and counting.', 20, 0],
      ['CANTORNE', 'Help & Advice — Ask the Wayfarer',
        'Lost on the toll path? Stuck on a quest? Sorrel sells snares, not courage — the rest is up to us.', 30, 0],
      ['CANTORNE', 'Guilds & Trading',
        'Recruit your guild, post your prices, argue about the Aldgate Exchange like civilised merchants.', 40, 0],
      ['CANTORNE', 'Quests & Lore',
        'Spoilers expected. The Offnote, the Choir of Five, and every dusty corner of the Codex.', 50, 0],
      ['THE TAVERN', 'The Listing Gull',
        'The off-topic taproom. Pull up a stool; the floor leans, the talk leans further.', 60, 0],
      ['THE TAVERN', 'Rants — Keep It Civil',
        'Shout into the Offnote so it stays out of the other boards. House rule: no names, no feuds.', 70, 0],
    ];
    for (const row of seed) ins.run(...row);
  }

  // --- prepared statements ---------------------------------------------------
  const qBoards = db.prepare(`
    SELECT b.id, b.category, b.name, b."desc" AS descr, b.sort, b.mods_only,
      (SELECT COUNT(*) FROM forum_threads t WHERE t.board = b.id) AS threads,
      (SELECT COUNT(*) FROM forum_posts p JOIN forum_threads t ON t.id = p.thread WHERE t.board = b.id) AS posts
    FROM forum_boards b ORDER BY b.sort, b.id`);
  const qBoard = db.prepare('SELECT id, category, name, "desc" AS descr, mods_only FROM forum_boards WHERE id = ?');
  const qBoardLastPost = db.prepare(`
    SELECT p.created_at, u.username, t.id AS tid
    FROM forum_posts p JOIN forum_threads t ON t.id = p.thread JOIN users u ON u.id = p.author
    WHERE t.board = ? ORDER BY p.id DESC LIMIT 1`);
  const qThreadCount = db.prepare('SELECT COUNT(*) AS c FROM forum_threads WHERE board = ?');
  const qThreads = db.prepare(`
    SELECT t.id, t.title, t.sticky, t.locked, t.views, t.last_post_at, u.username AS author,
      (SELECT COUNT(*) FROM forum_posts p WHERE p.thread = t.id) - 1 AS replies,
      (SELECT u2.username FROM forum_posts p2 JOIN users u2 ON u2.id = p2.author
        WHERE p2.thread = t.id ORDER BY p2.id DESC LIMIT 1) AS last_poster
    FROM forum_threads t JOIN users u ON u.id = t.author
    WHERE t.board = ? ORDER BY t.sticky DESC, t.last_post_at DESC LIMIT ? OFFSET ?`);
  const qThread = db.prepare(`
    SELECT t.id, t.board, t.title, t.author, t.sticky, t.locked, t.views, u.username AS author_name
    FROM forum_threads t JOIN users u ON u.id = t.author WHERE t.id = ?`);
  const qPostCount = db.prepare('SELECT COUNT(*) AS c FROM forum_posts WHERE thread = ?');
  const qPosts = db.prepare(`
    SELECT p.id, p.body, p.created_at, p.edited_at, u.id AS uid, u.username, u.created_at AS joined,
      (SELECT COUNT(*) FROM forum_posts px WHERE px.author = u.id) AS postcount
    FROM forum_posts p JOIN users u ON u.id = p.author
    WHERE p.thread = ? ORDER BY p.id LIMIT ? OFFSET ?`);
  const qPost = db.prepare(`
    SELECT p.id, p.thread, p.body, p.author, u.username
    FROM forum_posts p JOIN users u ON u.id = p.author WHERE p.id = ?`);
  const qFirstPost = db.prepare('SELECT id FROM forum_posts WHERE thread = ? ORDER BY id LIMIT 1');
  const qLastPostAt = db.prepare('SELECT MAX(created_at) AS m FROM forum_posts WHERE thread = ?');
  const qBumpViews = db.prepare('UPDATE forum_threads SET views = views + 1 WHERE id = ?');
  const qInsThread = db.prepare(
    'INSERT INTO forum_threads (board, title, author, created_at, last_post_at) VALUES (?,?,?,?,?)');
  const qInsPost = db.prepare(
    'INSERT INTO forum_posts (thread, author, body, created_at) VALUES (?,?,?,?)');
  const qTouchThread = db.prepare('UPDATE forum_threads SET last_post_at = ? WHERE id = ?');
  const qUserLastPost = db.prepare('SELECT MAX(created_at) AS m FROM forum_posts WHERE author = ?');
  const qIsMod = db.prepare('SELECT 1 FROM forum_mods WHERE user_id = ?');
  const qIsBanned = db.prepare('SELECT 1 FROM bans WHERE user_id = ?');
  const qMute = db.prepare('SELECT until FROM mutes WHERE user_id = ?');
  const qStats = db.prepare(`SELECT
    (SELECT COUNT(*) FROM forum_posts) AS posts,
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT username FROM users ORDER BY id DESC LIMIT 1) AS newest`);
  const qRecentSessions = db.prepare(
    'SELECT COUNT(DISTINCT user_id) AS c FROM sessions WHERE created_at > ?');
  // Forum signatures live in profile_meta (owned by server/profiles.ts —
  // plain text, max 240 chars, rendered escaped with \n -> <br>). When this
  // module runs without the profiles module (standalone tests), the table is
  // absent and signatures simply don't render.
  let qSig: Database.Statement | null = null;
  try { qSig = db.prepare('SELECT signature FROM profile_meta WHERE user_id = ?'); }
  catch { qSig = null; }

  function isMod(userId: number): boolean { return !!qIsMod.get(userId); }
  function isBanned(userId: number): boolean { return !!qIsBanned.get(userId); }
  function isMuted(userId: number): boolean {
    const row = qMute.get(userId) as { until: number | null } | undefined;
    if (!row) return false;
    return row.until === null || row.until > Date.now();
  }

  function onlineLine(): string {
    let n: number;
    if (helpers.onlineCount) n = helpers.onlineCount();
    else n = (qRecentSessions.get(Date.now() - 15 * 60 * 1000) as { c: number }).c;
    return `In total there ${n === 1 ? 'is' : 'are'} <b>${n}</b> ${n === 1 ? 'soul' : 'souls'} abroad in Cantorne right now
 :: registered larpers, wardens, and the odd ghost the Offnote hasn't claimed.<br>
This count is taken from souls seen on the toll path within the last fifteen minutes.`;
  }

  // Bottom-of-page board jump — a plain GET form straight to viewforum, so it
  // works with zero client JS (the Go button stands in for onchange).
  function jumpBox(): string {
    const boards = qBoards.all() as Array<{ id: number; category: string; name: string }>;
    let opts = '';
    let curCat: string | null = null;
    for (const b of boards) {
      if (b.category !== curCat) {
        if (curCat !== null) opts += '</optgroup>';
        opts += `<optgroup label="${esc(b.category)}">`;
        curCat = b.category;
      }
      opts += `<option value="${b.id}">${esc(b.name)}</option>`;
    }
    if (curCat !== null) opts += '</optgroup>';
    return `<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td class="gensmall">All times are Fablesong Standard (F.S.)</td>
<td align="right"><form method="get" action="/forum/viewforum" style="margin:4px 0 0 0">
<span class="gensmall">Jump to:</span> <select class="txt" name="f">${opts}</select>
<input class="btn" type="submit" value="Go"></form></td></tr></table>`;
  }

  // --- page shell --------------------------------------------------------------

  type Crumb = [string, string | null]; // [label, href|null]

  function shell(user: { id: number; username: string } | null, title: string,
                 crumbs: Crumb[], body: string): string {
    const crumbHtml = [['Larpscape Forums', '/forum/'] as Crumb, ...crumbs]
      .map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : `<b>${esc(label)}</b>`))
      .join(' &raquo; ');
    const userLine = user
      ? `Logged in as <b>${esc(user.username)}</b>`
      : `<a href="${LOGIN_URL}">Log in</a> to post`;
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=780">
<title>${esc(title)} :: Larpscape Forums</title>
<style>${FORUM_CSS}</style>
</head><body>
<div id="pagewrap">
<div class="banner"><a class="bigname" href="/forum/">Larpscape Forums</a><span class="tagline">est. F.S. 743 &mdash; every post is a held note</span></div>
<div class="navbar">
<a href="/forum/">Board Index</a> &middot; <a href="/forum/search">Search</a> &middot;
<a href="https://play.larpscape.net">Play the game</a> &middot;
<a href="https://wiki.larpscape.net">Wiki</a> &middot;
<a href="https://trade.larpscape.net">Trade</a>
<span style="float:right">${userLine}</span>
</div>
<div class="crumbs">${crumbHtml}</div>
${body}
<div class="whosonline">${onlineLine()}</div>
${jumpBox()}
<div class="footer">Larpscape Forums &mdash; powered by quill, parchment, and one very patient scribe. Not affiliated with Jagex.</div>
</div>
</body></html>`;
  }

  function send(res: Response, html: string, status = 200) {
    res.status(status).type('html').send(html);
  }

  function notFound(res: Response, user: { id: number; username: string } | null, what: string) {
    send(res, shell(user, 'Not found', [['Not found', null]],
      `<div class="errbox">The ${esc(what)} you asked for does not exist. Perhaps the Offnote ate it.</div>
       <p><a class="btnlink" href="/forum/">Back to the board index</a></p>`), 404);
  }

  function authorPanel(username: string, postcount: number, joined: number, mod: boolean): string {
    return `<td class="authorcell">
<span class="postername">${esc(username)}</span>
<div class="avatarbox"><img src="/api/portrait/${encodeURIComponent(username)}.svg" width="64" height="64" alt=""></div>
<span class="postrank">${rankFor(postcount)}</span>
${mod ? '<br><span class="modbadge">Warden</span>' : ''}<br>
Posts: ${postcount}<br>
Joined: ${MONTHS[new Date(joined).getMonth()]} ${new Date(joined).getFullYear()}
</td>`;
  }

  // CSRF posture: session cookie is SameSite=Lax; belt-and-braces, reject any
  // cookie-authed form post whose Origin/Referer is missing or foreign (same
  // rule as the /api guard in server/index.ts and /profile in profiles.ts —
  // browsers always send Origin on form POSTs). Requests carrying an explicit
  // Bearer header are not forgeable cross-site and skip the check.
  function sameOriginOk(req: Request): boolean {
    if (/^Bearer\s+\S+$/.test(String(req.headers.authorization || ''))) return true;
    const src = req.headers.origin || req.headers.referer;
    try {
      const h = new URL(String(src)).hostname.toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === 'larpscape.net' || h.endsWith('.larpscape.net');
    } catch { return false; }
  }

  // --- vhost: forum.larpscape.net serves the forum at / -------------------------
  app.use((req, _res, next) => {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0].trim().split(':')[0].toLowerCase();
    if (host === 'forum.larpscape.net'
        && !req.url.startsWith('/forum') && !req.url.startsWith('/api') && !req.url.startsWith('/ws')) {
      req.url = '/forum' + (req.url === '/' ? '/' : req.url);
    }
    next();
  });

  const r = express.Router();
  r.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use('/forum', r);

  // --- index ---------------------------------------------------------------
  r.get(['/', '/index'], (req, res) => {
    const user = helpers.userFromRequest(req);
    const boards = qBoards.all() as Array<{
      id: number; category: string; name: string; descr: string; mods_only: number;
      threads: number; posts: number;
    }>;
    let html = '';
    let curCat: string | null = null;
    let row = 0;
    for (const b of boards) {
      if (b.category !== curCat) {
        if (curCat !== null) html += '</table><br>';
        html += `<table class="forumline" cellspacing="1" cellpadding="3">
<tr><th class="cathead" colspan="4">${esc(b.category)}</th></tr>
<tr><th class="colhead" width="62%">&nbsp;Board</th><th class="colhead" width="8%">Topics</th>
<th class="colhead" width="8%">Posts</th><th class="colhead" width="22%">Last Post</th></tr>`;
        curCat = b.category;
        row = 0;
      }
      const cls = row++ % 2 === 0 ? 'row1' : 'row2';
      const last = qBoardLastPost.get(b.id) as
        { created_at: number; username: string; tid: number } | undefined;
      const lastHtml = last
        ? `<span class="smalltext">${fmtDate(last.created_at)}<br>by <b>${esc(last.username)}</b>
           <a href="/forum/viewtopic?t=${last.tid}&amp;start=999999">&raquo;</a></span>`
        : '<span class="smalltext">No posts</span>';
      html += `<tr>
<td class="${cls}"><span class="fldr${b.posts ? '' : ' quiet'}${b.mods_only ? ' lockd' : ''}"></span>
 <a class="boardlink" href="/forum/viewforum?f=${b.id}">${esc(b.name)}</a><br>
 <span class="boarddesc">${esc(b.descr)}</span></td>
<td class="${cls}" align="center">${b.threads}</td>
<td class="${cls}" align="center">${b.posts}</td>
<td class="${cls}">${lastHtml}</td></tr>`;
    }
    if (curCat !== null) html += '</table>';
    const stats = qStats.get() as { posts: number; users: number; newest: string | null };
    html += `<div class="crumbs" style="font-size:10px">Our scribes have written <b>${stats.posts}</b> posts
 &middot; We have <b>${stats.users}</b> registered larpers
 ${stats.newest ? `&middot; The newest larper is <b>${esc(stats.newest)}</b>` : ''}<br>
 <span class="fldr"></span> New-ish posts &nbsp; <span class="fldr quiet"></span> Quiet board &nbsp;
 <span class="fldr lockd"></span> Wardens only</div>`;
    send(res, shell(user, 'Board Index', [], html));
  });

  // --- viewforum -------------------------------------------------------------
  r.get('/viewforum', (req, res) => {
    const user = helpers.userFromRequest(req);
    const board = qBoard.get(intQ(req.query.f)) as
      { id: number; category: string; name: string; descr: string; mods_only: number } | undefined;
    if (!board) { notFound(res, user, 'board'); return; }
    const total = (qThreadCount.get(board.id) as { c: number }).c;
    const start = Math.min(intQ(req.query.start),
      Math.max(0, (Math.ceil(total / THREADS_PER_PAGE) - 1) * THREADS_PER_PAGE));
    const threads = qThreads.all(board.id, THREADS_PER_PAGE, start) as Array<{
      id: number; title: string; sticky: number; locked: number; views: number;
      last_post_at: number; author: string; replies: number; last_poster: string | null;
    }>;
    const pager = gotoPages(`/forum/viewforum?f=${board.id}`, total, THREADS_PER_PAGE, start);
    const newBtn = `<a class="btnlink" href="/forum/posting?mode=newtopic&amp;f=${board.id}">New Topic</a>`;
    let rows = '';
    let i = 0;
    for (const t of threads) {
      const cls = i++ % 2 === 0 ? 'row1' : 'row2';
      const prefix = (t.sticky ? '<span class="prefix">Sticky:</span> ' : '')
        + (t.locked ? '<span class="prefix">Locked:</span> ' : '');
      rows += `<tr>
<td class="${cls}" align="center"><span class="fldr${t.locked ? ' lockd' : ''}"></span></td>
<td class="${cls}">${prefix}<a class="topictitle" href="/forum/viewtopic?t=${t.id}">${esc(t.title)}</a></td>
<td class="${cls}" align="center">${t.replies}</td>
<td class="${cls}" align="center"><span class="smalltext">${esc(t.author)}</span></td>
<td class="${cls}" align="center">${t.views}</td>
<td class="${cls}"><span class="smalltext">${fmtDate(t.last_post_at)}<br>by <b>${esc(t.last_poster ?? t.author)}</b></span></td>
</tr>`;
    }
    if (!rows) {
      rows = `<tr><td class="row1" colspan="6" align="center"><span class="smalltext">No topics yet. The parchment is blank and waiting.</span></td></tr>`;
    }
    const html = `
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td>${newBtn}</td><td align="right">${pager}</td></tr></table>
<table class="forumline" cellspacing="1" cellpadding="3">
<tr><th class="cathead" colspan="6">${esc(board.name)}</th></tr>
<tr><th class="colhead" width="4%">&nbsp;</th><th class="colhead" width="48%">Topics</th>
<th class="colhead" width="7%">Replies</th><th class="colhead" width="12%">Author</th>
<th class="colhead" width="7%">Views</th><th class="colhead" width="22%">Last Post</th></tr>
${rows}
</table>
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td>${newBtn}</td><td align="right">${pager}</td></tr></table>`;
    send(res, shell(user, board.name, [[board.name, null]], html));
  });

  // --- viewtopic -------------------------------------------------------------
  r.get('/viewtopic', (req, res) => {
    const user = helpers.userFromRequest(req);
    const thread = qThread.get(intQ(req.query.t)) as {
      id: number; board: number; title: string; author: number; sticky: number;
      locked: number; views: number; author_name: string;
    } | undefined;
    if (!thread) { notFound(res, user, 'topic'); return; }
    const board = qBoard.get(thread.board) as { id: number; name: string; mods_only: number };
    qBumpViews.run(thread.id);
    const total = (qPostCount.get(thread.id) as { c: number }).c;
    const start = Math.min(intQ(req.query.start),
      Math.max(0, (Math.ceil(total / POSTS_PER_PAGE) - 1) * POSTS_PER_PAGE));
    const posts = qPosts.all(thread.id, POSTS_PER_PAGE, start) as Array<{
      id: number; body: string; created_at: number; edited_at: number | null;
      uid: number; username: string; joined: number; postcount: number;
    }>;
    const userIsMod = user ? isMod(user.id) : false;
    const canReply = !thread.locked || userIsMod;
    const pager = gotoPages(`/forum/viewtopic?t=${thread.id}`, total, POSTS_PER_PAGE, start);
    const replyBtn = canReply
      ? `<a class="btnlink" href="/forum/posting?mode=reply&amp;t=${thread.id}">Post Reply</a>`
      : '<span class="smalltext"><b>This topic is locked.</b></span>';

    let rows = '';
    let i = 0;
    for (const p of posts) {
      const cls = i++ % 2 === 0 ? 'row1' : 'row2';
      const mod = isMod(p.uid);
      const edited = p.edited_at
        ? `<br><br><span class="smalltext"><i>Last edited ${fmtDate(p.edited_at)}</i></span>` : '';
      const userSig = qSig
        ? String((qSig.get(p.uid) as { signature: string | null } | undefined)?.signature ?? '').trim()
        : '';
      const sigLines = [
        userSig ? esc(userSig.slice(0, 240)).replace(/\n/g, '<br />') : '',
        mod ? '&mdash; a Warden of the Larpscape boards' : '',
      ].filter(Boolean).join('<br />');
      const sig = sigLines
        ? `<div class="sigdiv">_________________</div><div class="signature">${sigLines}</div>`
        : '';
      const delBtn = userIsMod
        ? `<form method="post" action="/forum/mod" style="display:inline;margin:0">
<input type="hidden" name="action" value="delpost"><input type="hidden" name="p" value="${p.id}">
<input class="btn" type="submit" value="Delete" style="font-size:9px;padding:0 4px"></form>`
        : '';
      rows += `<tr>
${authorPanel(p.username, p.postcount, p.joined, mod)}
<td class="postcell ${cls}">
<div class="postmeta"><b>Posted:</b> ${fmtDate(p.created_at)}
<span style="float:right"><a href="/forum/posting?mode=reply&amp;t=${thread.id}&amp;quote=${p.id}" class="smalltext"><b>Quote</b></a> ${delBtn}</span></div>
<div class="postbody">${renderBBCode(p.body)}${edited}${sig}</div>
</td></tr>`;
    }

    let modBar = '';
    if (userIsMod) {
      const act = (action: string, label: string) =>
        `<form method="post" action="/forum/mod" style="display:inline;margin:0 2px">
<input type="hidden" name="action" value="${action}"><input type="hidden" name="t" value="${thread.id}">
<input class="btn" type="submit" value="${label}"></form>`;
      modBar = `<div class="crumbs" style="font-size:10px"><b>Warden tools:</b>
${act(thread.locked ? 'unlock' : 'lock', thread.locked ? 'Unlock' : 'Lock')}
${act(thread.sticky ? 'unsticky' : 'sticky', thread.sticky ? 'Unsticky' : 'Sticky')}
${act('delthread', 'Delete Topic')}</div>`;
    }

    const html = `
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td>${replyBtn}</td><td align="right">${pager}</td></tr></table>
<table class="forumline" cellspacing="1" cellpadding="3">
<tr><th class="cathead" colspan="2">${esc(thread.title)}</th></tr>
<tr><th class="colhead" width="150">Author</th><th class="colhead">Message</th></tr>
${rows}
</table>
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td>${replyBtn}</td><td align="right">${pager}</td></tr></table>
${modBar}`;
    send(res, shell(user, thread.title,
      [[board.name, `/forum/viewforum?f=${board.id}`], [thread.title, null]], html));
  });

  // --- posting (form + submit + preview) --------------------------------------

  interface PostingCtx {
    mode: 'newtopic' | 'reply';
    board: { id: number; name: string; mods_only: number };
    thread?: { id: number; title: string; locked: number };
  }

  function resolvePostingCtx(req: Request): PostingCtx | null {
    const mode = String((req.query.mode ?? (req.body as any)?.mode) || '');
    if (mode === 'newtopic') {
      const f = intQ(req.query.f ?? (req.body as any)?.f);
      const board = qBoard.get(f) as PostingCtx['board'] | undefined;
      return board ? { mode, board } : null;
    }
    if (mode === 'reply') {
      const t = intQ(req.query.t ?? (req.body as any)?.t);
      const thread = qThread.get(t) as
        { id: number; board: number; title: string; locked: number } | undefined;
      if (!thread) return null;
      const board = qBoard.get(thread.board) as PostingCtx['board'];
      return { mode, board, thread: { id: thread.id, title: thread.title, locked: thread.locked } };
    }
    return null;
  }

  // null = allowed; otherwise a human-readable refusal.
  function postingRefusal(ctx: PostingCtx, user: { id: number; username: string } | null): string | null {
    if (!user) return `You must be logged in to post. <a href="${LOGIN_URL}">Log in at larpscape.net</a> &mdash; you will be returned to the forums.`;
    if (isBanned(user.id)) return 'Your account is banned. The boards are closed to you.';
    if (isMuted(user.id)) return 'You are muted. You may read the boards, but the quill is withheld until your mute lifts.';
    if (ctx.board.mods_only && !isMod(user.id)) return 'Only the wardens may post in this board.';
    if (ctx.mode === 'reply' && ctx.thread?.locked && !isMod(user.id)) return 'This topic is locked.';
    return null;
  }

  function postingForm(user: { id: number; username: string } | null, ctx: PostingCtx,
                       subject: string, body: string, error: string | null, preview: boolean): string {
    const hidden = ctx.mode === 'newtopic'
      ? `<input type="hidden" name="mode" value="newtopic"><input type="hidden" name="f" value="${ctx.board.id}">`
      : `<input type="hidden" name="mode" value="reply"><input type="hidden" name="t" value="${ctx.thread!.id}">`;
    const subjectRow = ctx.mode === 'newtopic'
      ? `<tr><td class="row1" width="22%"><b>Subject</b></td>
<td class="row2"><input class="txt" type="text" name="subject" size="60" maxlength="${TITLE_MAX}" value="${esc(subject)}"></td></tr>`
      : '';
    const previewBox = preview
      ? `<table class="forumline previewbox" cellspacing="1" cellpadding="3" width="100%">
<tr><th class="cathead">Preview</th></tr>
<tr><td class="row1"><div class="postbody">${renderBBCode(body)}</div></td></tr></table>`
      : '';
    const errBox = error ? `<div class="errbox">${error}</div>` : '';
    const heading = ctx.mode === 'newtopic'
      ? `Post a new topic in ${esc(ctx.board.name)}`
      : `Reply to: ${esc(ctx.thread!.title)}`;
    return `${errBox}${previewBox}
<form method="post" action="/forum/posting">${hidden}
<table class="forumline" cellspacing="1" cellpadding="3" width="100%">
<tr><th class="cathead" colspan="2">${heading}</th></tr>
${subjectRow}
<tr><td class="row1" width="22%" valign="top"><b>Message body</b><br>
<span class="bbhint">BBCode: [b] [i] [u]<br>[quote=name] [url=...]<br>[code] [list] [*]<br>No [img]. ${BODY_MAX} chars max.</span></td>
<td class="row2"><textarea class="txt" name="body" rows="15" cols="76">${esc(body)}</textarea></td></tr>
<tr><td class="row1" colspan="2" align="center">
<input class="btn" type="submit" name="preview" value="Preview">&nbsp;
<input class="btn" type="submit" name="post" value="Submit"></td></tr>
</table></form>`;
  }

  r.get('/posting', (req, res) => {
    const user = helpers.userFromRequest(req);
    const ctx = resolvePostingCtx(req);
    if (!ctx) { notFound(res, user, 'board or topic'); return; }
    const refusal = postingRefusal(ctx, user);
    let body = '';
    const quoteId = intQ(req.query.quote);
    if (quoteId && ctx.mode === 'reply') {
      const qp = qPost.get(quoteId) as
        { id: number; thread: number; body: string; username: string } | undefined;
      if (qp && qp.thread === ctx.thread!.id) body = `[quote=${qp.username}]${qp.body}[/quote]\n`;
    }
    const crumbs: Crumb[] = ctx.mode === 'reply'
      ? [[ctx.board.name, `/forum/viewforum?f=${ctx.board.id}`],
         [ctx.thread!.title, `/forum/viewtopic?t=${ctx.thread!.id}`], ['Reply', null]]
      : [[ctx.board.name, `/forum/viewforum?f=${ctx.board.id}`], ['New Topic', null]];
    if (refusal) {
      send(res, shell(user, 'Posting', crumbs, `<div class="errbox">${refusal}</div>`), user ? 403 : 401);
      return;
    }
    send(res, shell(user, 'Posting', crumbs, postingForm(user, ctx, '', body, null, false)));
  });

  r.post('/posting', (req, res) => {
    const user = helpers.userFromRequest(req);
    if (!sameOriginOk(req)) { res.status(403).type('text').send('cross-site post rejected'); return; }
    const ctx = resolvePostingCtx(req);
    if (!ctx) { notFound(res, user, 'board or topic'); return; }
    const crumbs: Crumb[] = [[ctx.board.name, `/forum/viewforum?f=${ctx.board.id}`], ['Posting', null]];
    const refusal = postingRefusal(ctx, user);
    if (refusal) {
      send(res, shell(user, 'Posting', crumbs, `<div class="errbox">${refusal}</div>`), user ? 403 : 401);
      return;
    }
    const b = req.body as Record<string, unknown>;
    const subject = String(b.subject ?? '').trim().replace(/\s+/g, ' ');
    const body = String(b.body ?? '').replace(/\r\n?/g, '\n');
    const wantPreview = b.preview !== undefined && b.post === undefined;

    let error: string | null = null;
    if (!wantPreview) {
      if (ctx.mode === 'newtopic' && (subject.length < 1 || subject.length > TITLE_MAX)) {
        error = `Topic titles must be 1&ndash;${TITLE_MAX} characters.`;
      } else if (body.trim().length < 1 || body.length > BODY_MAX) {
        error = `Posts must be 1&ndash;${BODY_MAX} characters.`;
      } else {
        const last = (qUserLastPost.get(user!.id) as { m: number | null }).m;
        if (last !== null && Date.now() - last < POST_COOLDOWN_MS) {
          error = 'Easy with the quill &mdash; you may post once every 20 seconds.';
        }
      }
    }

    if (wantPreview || error) {
      send(res, shell(user, 'Posting', crumbs,
        postingForm(user, ctx, subject, body, error, wantPreview && !error)));
      return;
    }

    const now = Date.now();
    let threadId: number;
    if (ctx.mode === 'newtopic') {
      threadId = Number(qInsThread.run(ctx.board.id, subject, user!.id, now, now).lastInsertRowid);
    } else {
      threadId = ctx.thread!.id;
    }
    qInsPost.run(threadId, user!.id, body, now);
    qTouchThread.run(now, threadId);
    const count = (qPostCount.get(threadId) as { c: number }).c;
    const lastPageStart = Math.floor((count - 1) / POSTS_PER_PAGE) * POSTS_PER_PAGE;
    res.redirect(303, `/forum/viewtopic?t=${threadId}${lastPageStart ? `&start=${lastPageStart}` : ''}`);
  });

  // --- search ----------------------------------------------------------------
  r.get('/search', (req, res) => {
    const user = helpers.userFromRequest(req);
    const q = String(req.query.q ?? '').trim().slice(0, 60);
    const start = intQ(req.query.start);
    let results = '';
    if (q.length >= 2) {
      const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
      const where = `t.title LIKE ? ESCAPE '\\' OR t.id IN
        (SELECT thread FROM forum_posts WHERE body LIKE ? ESCAPE '\\')`;
      const total = (db.prepare(
        `SELECT COUNT(*) AS c FROM forum_threads t WHERE ${where}`).get(like, like) as { c: number }).c;
      const rows = db.prepare(`
        SELECT t.id, t.title, t.last_post_at, t.views, b.name AS board_name, b.id AS board_id,
          u.username AS author,
          (SELECT COUNT(*) FROM forum_posts p WHERE p.thread = t.id) - 1 AS replies
        FROM forum_threads t JOIN forum_boards b ON b.id = t.board JOIN users u ON u.id = t.author
        WHERE ${where} ORDER BY t.last_post_at DESC LIMIT ? OFFSET ?`)
        .all(like, like, SEARCH_PER_PAGE, start) as Array<{
          id: number; title: string; last_post_at: number; views: number;
          board_name: string; board_id: number; author: string; replies: number;
        }>;
      let body = '';
      let i = 0;
      for (const t of rows) {
        const cls = i++ % 2 === 0 ? 'row1' : 'row2';
        body += `<tr>
<td class="${cls}"><a class="topictitle" href="/forum/viewtopic?t=${t.id}">${esc(t.title)}</a><br>
<span class="smalltext">in <a href="/forum/viewforum?f=${t.board_id}">${esc(t.board_name)}</a></span></td>
<td class="${cls}" align="center">${t.replies}</td>
<td class="${cls}" align="center"><span class="smalltext">${esc(t.author)}</span></td>
<td class="${cls}"><span class="smalltext">${fmtDate(t.last_post_at)}</span></td></tr>`;
      }
      if (!body) body = `<tr><td class="row1" colspan="4" align="center"><span class="smalltext">Nothing found. The archives hum, but not for that.</span></td></tr>`;
      const pager = gotoPages(`/forum/search?q=${encodeURIComponent(q)}`, total, SEARCH_PER_PAGE, start);
      results = `<br><table class="forumline" cellspacing="1" cellpadding="3">
<tr><th class="cathead" colspan="4">Search: ${total} ${total === 1 ? 'topic' : 'topics'} found</th></tr>
<tr><th class="colhead" width="59%">Topic</th><th class="colhead" width="8%">Replies</th>
<th class="colhead" width="12%">Author</th><th class="colhead" width="21%">Last Post</th></tr>
${body}</table>
<div align="right">${pager}</div>`;
    } else if (q.length === 1) {
      results = `<div class="errbox">Search terms must be at least 2 characters.</div>`;
    }
    const html = `<table class="forumline" cellspacing="1" cellpadding="3">
<tr><th class="cathead">Search the boards</th></tr>
<tr><td class="row1">
<form method="get" action="/forum/search">
Keywords: <input class="txt" type="text" name="q" size="40" maxlength="60" value="${esc(q)}">
<input class="btn" type="submit" value="Search">
<span class="bbhint">&mdash; matches topic titles and post bodies</span>
</form></td></tr></table>${results}`;
    send(res, shell(user, 'Search', [['Search', null]], html));
  });

  // --- moderation --------------------------------------------------------------
  r.post('/mod', (req, res) => {
    const user = helpers.userFromRequest(req);
    if (!sameOriginOk(req)) { res.status(403).type('text').send('cross-site post rejected'); return; }
    if (!user || !isMod(user.id)) {
      send(res, shell(user, 'Forbidden', [['Forbidden', null]],
        '<div class="errbox">Warden tools are for wardens.</div>'), 403);
      return;
    }
    const b = req.body as Record<string, unknown>;
    const action = String(b.action ?? '');
    const tid = intQ(b.t);
    const pid = intQ(b.p);

    if (action === 'delpost' && pid) {
      const post = qPost.get(pid) as { id: number; thread: number } | undefined;
      if (!post) { notFound(res, user, 'post'); return; }
      const first = qFirstPost.get(post.thread) as { id: number } | undefined;
      if (first && first.id === post.id) {
        // deleting the opening post removes the whole topic, phpBB-style
        db.prepare('DELETE FROM forum_posts WHERE thread = ?').run(post.thread);
        const t = qThread.get(post.thread) as { board: number } | undefined;
        db.prepare('DELETE FROM forum_threads WHERE id = ?').run(post.thread);
        res.redirect(303, `/forum/viewforum?f=${t?.board ?? ''}`);
        return;
      }
      db.prepare('DELETE FROM forum_posts WHERE id = ?').run(pid);
      const m = (qLastPostAt.get(post.thread) as { m: number | null }).m;
      if (m !== null) qTouchThread.run(m, post.thread);
      res.redirect(303, `/forum/viewtopic?t=${post.thread}`);
      return;
    }

    const thread = qThread.get(tid) as { id: number; board: number } | undefined;
    if (!thread) { notFound(res, user, 'topic'); return; }
    switch (action) {
      case 'lock':
        db.prepare('UPDATE forum_threads SET locked = 1 WHERE id = ?').run(tid); break;
      case 'unlock':
        db.prepare('UPDATE forum_threads SET locked = 0 WHERE id = ?').run(tid); break;
      case 'sticky':
        db.prepare('UPDATE forum_threads SET sticky = 1 WHERE id = ?').run(tid); break;
      case 'unsticky':
        db.prepare('UPDATE forum_threads SET sticky = 0 WHERE id = ?').run(tid); break;
      case 'delthread':
        db.prepare('DELETE FROM forum_posts WHERE thread = ?').run(tid);
        db.prepare('DELETE FROM forum_threads WHERE id = ?').run(tid);
        res.redirect(303, `/forum/viewforum?f=${thread.board}`);
        return;
      default:
        notFound(res, user, 'action'); return;
    }
    res.redirect(303, `/forum/viewtopic?t=${tid}`);
  });

  // --- login convenience -------------------------------------------------------
  r.get('/login', (_req, res) => { res.redirect(302, LOGIN_URL); });
}
