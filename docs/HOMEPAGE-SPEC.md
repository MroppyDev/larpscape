# Larpscape Homepage Spec (larpscape.net)

Implementation spec for the marketing homepage, derived from a structural study of the
OSRS website (layout/UX patterns only — all copy, art, names, and assets here must be
ORIGINAL Larpscape content per project rules). Game lives at play.larpscape.net;
larpscape.net is the front door.

---

## 1. Page anatomy, top to bottom

```
[ utility strip: login link, top-right ]
[ banner header: game wordmark/title + Home link ]
[ live player counter line ]
[ two-column body:
    LEFT  = nav rail (3 grouped link boxes) + stacked CTA buttons + promo slot
    RIGHT = main content: welcome blurb, news list, social/archive pointer ]
[ footer: studio mark, legal links, ratings row ]
```

The reference site is notably NOT a modern full-bleed marketing page. It is a compact,
fixed-width "portal" layout: a decorative banner up top, then a sidebar-plus-content
shell that itself looks like carved game UI. The whole page reads as an extension of
the game client. Larpscape should reuse its existing stone-bevel/parchment design
language (src/style.css `--stone-*`, `--parchment`) for the same effect.

### 1.1 Utility strip
- A thin strip at the very top, right-aligned, containing a single "log in" text link
  styled as a small plaque. On Larpscape this deep-links to the game's login at
  play.larpscape.net.

### 1.2 Banner header
- Full-width decorative header band (illustrated scene / textured stone) containing:
  - The game title as an `h1` (rendered as a styled wordmark, visually hidden text ok).
  - A "Home" link slot (on subpages the banner persists and this returns home).
- No horizontal mega-nav in the header — navigation lives in the left rail instead.
  This is a distinctive retro-portal choice; keep it.

### 1.3 Live player counter
- A single centered line directly under the banner: "{N} people playing" pattern with
  a live number. High nostalgia value, trivially cheap.
- Larpscape: server already knows online count; expose a tiny public JSON endpoint
  (e.g. `GET /api/stats/online`) and render the count client-side with a fallback.

### 1.4 Left rail — grouped navigation boxes
Three stacked bordered boxes, each with a small heading and an icon-bulleted link list.
Each link row = small pictographic icon + label. Grouping pattern:

1. **Game box** (~7–8 links): download/play client, world/server select, world map,
   redeem code, news archive, mobile info, service status, new player guide.
2. **Community box** (~8–9 links): polls, hiscores, roadmap, item exchange, plus
   clearly-marked EXTERNAL links (Discord, merch/shop, wiki, third-party client).
   External links carry a distinct modifier style (outbound arrow / different tint).
3. **Account box** (~5 links): membership, premium currency, account settings,
   2FA/security, support.

Larpscape mapping: Game → Play, World Map, News, Status, New Player Guide;
Community → Hiscores (subpage), Wiki (wiki.larpscape.net), Discord, Roadmap;
Account → Register, Account, Support. Drop slots we have no feature for rather than
inventing dead links.

### 1.5 CTA button stack (below the nav boxes, still in left rail)
- Three large stacked stone-button CTAs, equal width, big bold outlined text:
  1. Primary play/try-free action → play.larpscape.net
  2. Secondary account/membership action (Larpscape: "Create Account")
  3. Tertiary: **link to Hiscores** (the reference site promotes hiscores as a
     top-three CTA — note for §3 we go further and embed a panel)
- A small plain-text foot-link under the buttons (reference uses it for manual world
  select; Larpscape can use "choose server" or omit).
- Below that, one **promo banner slot**: a single clickable image plugging a current
  event/feature. Make it a swappable slot (config-driven), fine to ship empty.

### 1.6 Main content column
1. **Welcome heading** (`h1`-styled): one-line greeting naming the game.
2. **Elevator-pitch paragraph**: 2–3 sentences on what the game is and its hook
   (community-driven, retro, browser-based). Write original copy from docs/LORE.md
   tone — world Cantorne, the Offnote, F.S. 743.
3. **News & Updates section** (`h2`), then a vertical list of exactly **5** article
   entries. Each entry is a horizontal media-object card:
   - Left: thumbnail image (fixed aspect, links to article).
   - Right: title (`h3`, link), then a sub-line with **category tag + date**
     (semantic `<time>`), then a 1–2 line excerpt ending in an inline
     "read more" link.   NOT a 3-column grid — a stacked list with left thumbnails.
4. **Post-news pointer line**: a centered sentence with two inline links — one to a
   social feed (Larpscape: Discord or X), one to the full news archive page.

### 1.7 Footer
- Studio/owner logo slot (links out), small.
- Copyright line with year range.
- Legal link row: terms, privacy, game rules, cookie policy, cookie preferences.
- An RSS/feed link slot.
- Age-rating / descriptor icon row (Larpscape: omit or replace with a fan-project
  disclaimer line — "unaffiliated fan homage" notice is our legal must-have).
- Footer is dark, dense, small type; clearly separated from parchment content.

---

## 2. Sibling-page conventions (for links off the homepage)

### 2.1 News archive page
- Same banner shell. Heading + one-line explainer.
- **Year/month filter** rendered as two rows of plain link-chips (a row of years,
  a row of months) — no dropdowns. Current selection highlighted.
- Below: month heading (`h3`), then the same media-object article cards as the
  homepage (thumbnail left; title / category tag / date / excerpt + read-more right).

### 2.2 Hiscores page
- Own compact centered layout inside the same visual frame; log-in link top right;
  small title plaque with a Home link back.
- **Mode tab bar** above the table: current mode + dropdown groups for special modes
  (e.g. ironman variants, seasonal). Larpscape: include only modes that exist; a
  single "Hiscores" tab is fine at launch, but build it as a tab bar.
- **Two-column body:**
  - LEFT: skill selector — a plain vertical list of text links, one per skill,
    starting with Overall, each switching the table via a query param
    (`?table=N` pattern). Optional second list for activities/bosses with tiny icons.
  - RIGHT: the table itself:
    - `<table>` with header row: *(blank icon col) | Rank | Name | Level | XP* —
      Rank/XP right-aligned, Name/Level left-aligned, thousands separators on XP.
    - **25 rows per page**, tight row height, alternating-row readability.
    - Pagination as simple prev/next arrows + page jumps at top and bottom.
- **Side widget stack** (right of or below the table): small boxes for
  *search by name*, *search by rank*, *compare two players* (two inputs), and a
  *friends hiscores* prompt for logged-out users. Larpscape: name search + rank
  search minimum; compare is a nice-to-have.
- Clicking a player name opens their personal hiscore (all skills, one row each).

---

## 3. Homepage hiscores panel (Larpscape addition — REQUIRED)

The owner wants live leaderboards ON the homepage, not only the subpage. The
reference site only links to hiscores; we upgrade that slot:

- Replace/augment the third CTA ("Visit Hiscores") with a **live leaderboard panel**
  in the main content column, directly below the news section (or in the left rail
  under the promo slot if width allows).
- Panel = stone-framed box, heading row, then a mini version of the hiscores table:
  **top 5–10 Overall** with columns *Rank | Name | Level | XP*.
- A small skill switcher (compact `<select>` or a row of icon tabs) is optional v2;
  v1 ships Overall only.
- Footer link inside the panel: "full hiscores →" to the subpage.
- Data: public endpoint (e.g. `GET /api/hiscores/overall?limit=10`), fetched
  client-side, cached ~60s server-side; render a skeleton/placeholder while loading
  and a graceful "unavailable" state.

---

## 4. Mood & typography (adjectives only — never copy values or assets)

- **Overall:** medieval portal, hand-carved, dense, nostalgic, game-UI-as-website.
- **Backdrop:** dark weathered stone / moody illustrated landscape framing the page.
- **Content surfaces:** warm parchment panels with darker burnt-edge borders.
- **Chrome:** beveled stone boxes, riveted/cornered frames around every module.
- **Accents:** golden-yellow display text with dark outlines for titles and buttons;
  deep red/brown for emphasis links.
- **Type:** a chunky serif/blackletter-flavored display face for headings; plain
  readable small serif or sans for body; small caps / engraved feel on box titles.
- **Buttons:** look physically pressed into stone — highlight top edge, shadow bottom.
- Larpscape already has all of this in src/style.css (`--stone-*`, `--parchment`,
  yellow outlined text). The homepage must reuse those exact tokens, not invent new.

---

## 5. Responsive behavior

- Reference behaves as a fixed/max-width centered portal (~1000px shell) that scales
  down clumsily; we should do better while keeping the silhouette:
  - **Desktop (≥900px):** two-column body — nav rail + CTAs left (~280px), content
    right; footer full-width.
  - **Tablet/mobile (<900px):** single column in this order: banner → player count →
    CTA buttons (full-width, stacked) → leaderboard panel → news list → nav boxes
    (collapsed into accordions or a simple link grid) → footer.
  - News cards keep the thumbnail-left layout down to ~480px, then stack
    image-above-text.
  - Hiscores table: allow horizontal scroll on narrow screens rather than reflowing
    columns; skill selector becomes a `<select>`.
- Meta: standard viewport tag, OG/social card tags, favicon set, semantic landmarks
  (`header/nav/main/section/article/footer`) exactly as the section list above.

---

## 6. Structural checklist — Larpscape homepage MUST have

- [ ] Top-right login link strip (→ play.larpscape.net login)
- [ ] Decorative banner header with Larpscape wordmark `h1` + Home link
- [ ] Live "{N} playing now" counter line fed by a public stats endpoint
- [ ] Left nav rail: 3 grouped icon-link boxes (Game / Community / Account),
      external links visually marked
- [ ] CTA stack: Play Now (primary) + Create Account + Hiscores, stone-button style
- [ ] Small foot-link slot under CTAs
- [ ] Swappable promo banner slot (config-driven, may ship empty)
- [ ] Welcome `h1` + 2–3 sentence original pitch paragraph (Cantorne lore voice)
- [ ] News section: heading + 5 media-object cards (thumb left; title, category tag,
      `<time>` date, excerpt, read-more right) backed by real news data
- [ ] Centered pointer line: social link + news archive link
- [ ] **Live leaderboards panel on the homepage**: top 5–10 Overall, Rank/Name/Level/XP,
      "full hiscores" link, loading + error states, ~60s cache
- [ ] Footer: copyright, terms, privacy, game rules, cookies, RSS slot, and an
      explicit original-fan-project disclaimer
- [ ] Responsive collapse per §5; semantic landmark elements throughout
- [ ] Zero copied text/assets — every string and image original to Larpscape
