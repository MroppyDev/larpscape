# LARPSCAPE FORUMS — STRUCTURE SPEC

Period reference: the anatomy below is the common skeleton of early-2000s bulletin
boards (phpBB 2.0.x, Invision Board 1.x, ezBoard, vBulletin 2) as preserved on
archive.org snapshots. **Structure only** — every word of copy, every name, and the
entire skin here are original Larpscape work in the Cantorne lore voice.

## 1. Era anatomy (what made a 2000s forum *feel* like a 2000s forum)

1. **Server-rendered, table-based layout.** One outer table ~750–780px wide,
   centered, on a dark page background. Zero client JS except trivial helpers
   (a "quote" button that stuffs a textarea). Every action is a full page load.
2. **Classic query-string URLs.** `index`, `viewforum?f=N`, `viewtopic?t=N`,
   `posting?mode=reply&t=N`, `search?q=...`. Pagination via `&start=N`.
3. **Typography.** Verdana/Arial/Helvetica at 11px (10px for meta lines), bold
   11px for board/thread links. A display face only in the top banner.
4. **Beveled borders & alternating rows.** Tables with 1px solid hex borders,
   `cellspacing` simulated via border gaps, row classes `row1`/`row2`
   alternating background tints, gold/solid category header bars.
5. **Index page.** Categories as full-width header bars; under each, one row per
   board: folder icon | bold board name + small grey description | Topics |
   Posts | Last post (date + by Author). Footer: "Who is online" line and a
   tiny legend ("New posts / No new posts").
6. **viewforum.** Breadcrumb ("Larpscape Forums -> Board name"), "New Topic"
   button, thread table: icon | Title (sticky/locked prefixed **Sticky:** /
   **Locked:**) | Replies | Author | Views | Last post. Sticky threads pinned
   on page 1. Pagination line: `Goto page 1, 2, 3 ... 12`.
7. **viewtopic.** Each post is a table row pair: left column (~150px) author
   panel — bold name, rank title, stars/avatar, "Posts: N", "Joined: date";
   right column — "Posted: <date>  Post subject:" meta bar, body, then a
   `_________________` divider and the signature. Reply / New Topic buttons top
   and bottom, breadcrumbs both ends, lock/sticky controls for moderators.
8. **Posting form.** Subject input, big body textarea, BBCode hint line,
   Preview + Submit buttons (Preview re-renders the form with a rendered
   preview box above it).
9. **Search.** Single keywords box, LIKE matching, results as a thread list.
10. **Footer.** "Powered by ..." credit line, tiny copyright, total-posts /
    who-is-online stats on the index.

## 2. Larpscape mapping

### URLs (all under `/forum`; the forum.larpscape.net vhost rewrites `/` -> `/forum`)
| Route | Method | Purpose |
|---|---|---|
| `/forum/` (and `/forum/index`) | GET | category -> board index |
| `/forum/viewforum?f=N&start=M` | GET | thread list, 30/page, sticky first |
| `/forum/viewtopic?t=N&start=M` | GET | posts, 15/page, bumps view count |
| `/forum/posting?mode=newtopic&f=N` | GET/POST | new thread form / submit (Preview supported) |
| `/forum/posting?mode=reply&t=N` | GET/POST | reply form / submit (Preview supported) |
| `/forum/search?q=...&start=M` | GET | LIKE search over titles + bodies, 25/page |
| `/forum/mod` | POST | moderator actions: lock/unlock/sticky/unsticky/delthread/delpost |
| `/forum/login` | GET | 302 -> `https://larpscape.net/login?return=forum` |

### Tables (created `IF NOT EXISTS` by `initForum`)
- `forum_boards (id, category, name, desc, sort, mods_only)` — `mods_only=1`
  restricts new threads/replies to moderators (News & Announcements).
- `forum_threads (id, board, title, author, created_at, last_post_at, sticky, locked, views)`
  — `author` is a user id; denormalised `last_post_at` for sorting.
- `forum_posts (id, thread, author, body, created_at, edited_at)` — body is raw
  BBCode, rendered at view time.
- `forum_mods (user_id)` — moderator flag (the game's admin auth is a header
  token, not a user attribute, so mods get their own table; insert rows by hand
  or via a future admin endpoint).

### Seed boards (lore voice — see docs/LORE.md)
| Category | Board | Notes |
|---|---|---|
| ANNOUNCEMENTS | News & Announcements | mods_only — "word from the choirloft" |
| CANTORNE | General Discussion | the vale's commons |
| CANTORNE | Help & Advice — Ask the Wayfarer | named for Wayfarer Sorrel |
| CANTORNE | Guilds & Trading | recruitment + merchanting |
| CANTORNE | Quests & Lore | spoilers expected |
| THE TAVERN | The Listing Gull | off-topic taproom |
| THE TAVERN | Rants — Keep It Civil | shout into the Offnote |

### Ranks (by post count; era forums used star ladders — ours are lore titles)
| Posts | Rank |
|---|---|
| 0 | Newcomer |
| 10 | Bellmeadow Regular |
| 50 | Town Crier |
| 150 | Toll-Payer |
| 400 | Offnote Hunter |
| 1000 | Voice of the Choir |

Moderators additionally show **Warden** in gold under their rank.

### BBCode (escape ALL HTML first, then transform; nesting capped at 5)
`[b] [i] [u] [quote] [quote=name] [url=http(s)://...] [code] [list] [*]`
— no `[img]` (period boards had it; we deliberately don't, no remote content).
`[code]` contents are extracted before any other transform and restored verbatim
(escaped) in a classic "Code:" box. URLs must start http:// or https://.

### Moderation & limits
- Banned users (existing `bans` table): cannot post. Muted (existing `mutes`):
  can read, cannot post. Logged-out: read everything, posting links to login.
- Rate limit: 1 post per 20 s per user (checked against `forum_posts.created_at`).
- Title 1–80 chars, body 1–8000 chars.
- Mods: lock/unlock, sticky/unsticky, delete thread, delete individual post
  (deleting a thread's first post deletes the thread, phpBB-style).
- mods_only boards refuse non-mod posting at both render and submit time.

### Skin (`server/forum-skin.ts`)
Game palette flattened to 2000s sensibilities: page background dark stone
(#1d1b17), content tables parchment (#e8dcbe / #efe6cf row stripes), borders
#5a4a32 / #8a7448, category bars gold gradient-free (#b8860b solid with
#3a2c14 text), links #6b3a1e, visited likewise (era boards rarely styled
:visited differently), everything Verdana 11px. Banner: original text/SVG
"LARPSCAPE FORUMS" with a blackletter-ish display font (CSS `font-family:
'Old English Text MT', 'Blackadder ITC', serif` fallback stack — no embedded
fonts, exactly like 2002). Footer credit: *"Larpscape Forums — powered by
quill, parchment, and one very patient scribe. Not affiliated with Jagex."*

### Who is online
`initForum(app, db, helpers)` accepts an optional `helpers.onlineCount()` the
integrator can wire to the live WS presence set; otherwise the forum counts
sessions created in the last 15 minutes as "abroad in Cantorne".
