// Larpscape marketing homepage — larpscape.net.
// Vanilla TS: renders news from ../news.ts, the live hiscores panel from
// /api/hiscores, the player counter, rail navigation, and the promo slot.

import { NEWS_POSTS, type NewsPost } from '../news';
import { ICONS, FEATURE_ICONS, CATEGORY_MOTIFS } from './icons';
import { renderMarkdown } from './md';
import { apiMe, logout, FORUM_URL } from './auth';

const PLAY_URL = 'https://play.larpscape.net';
const WIKI_URL = 'https://wiki.larpscape.net';
const TRADE_URL = 'https://trade.larpscape.net';
const GITHUB_URL = 'https://github.com/MroppyDev/larpscape';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Left rail navigation (spec §1.4 — Game / Community / Account boxes)
// ---------------------------------------------------------------------------

interface RailLink { label: string; href: string; icon: string; ext?: boolean }

const RAIL: Record<string, RailLink[]> = {
  'rail-game-list': [
    { label: 'Play Larpscape', href: PLAY_URL, icon: 'sword' },
    { label: 'News & updates', href: '#news', icon: 'scroll' },
    { label: 'Hiscores', href: '#hiscores', icon: 'trophy' },
    { label: 'New player guide', href: `${WIKI_URL}/guide/getting-started`, icon: 'book', ext: true },
  ],
  'rail-community-list': [
    { label: 'Forum', href: FORUM_URL, icon: 'quill', ext: true },
    { label: 'The Larpscape Wiki', href: WIKI_URL, icon: 'book', ext: true },
    { label: 'The Aldgate Exchange', href: TRADE_URL, icon: 'economy', ext: true },
    { label: 'Join our Discord', href: '#discord', icon: 'discord' },
    { label: 'Guilds & trading', href: '#about', icon: 'banner' },
    { label: 'GitHub', href: GITHUB_URL, icon: 'code', ext: true },
  ],
  'rail-account-list': [
    { label: 'Create account', href: '/register', icon: 'quill' },
    { label: 'Log in', href: '/login', icon: 'key' },
    { label: 'Support', href: `${GITHUB_URL}/issues`, icon: 'bell', ext: true },
  ],
};

for (const [listId, links] of Object.entries(RAIL)) {
  el<HTMLUListElement>(listId).innerHTML = links
    .map(
      (l) =>
        `<li><a href="${l.href}"${l.ext ? ' class="ext"' : ''}>${ICONS[l.icon] ?? ''}<span>${escapeHtml(l.label)}</span></a></li>`
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Util-strip auth state (spec §2): /api/me decides between the static
// logged-out plaques (Log in / Create account, already in the HTML) and a
// "Logged in as <name>" plaque + Log out. PLAY NOW keeps pointing at the game.
// ---------------------------------------------------------------------------

void (async () => {
  const username = await apiMe();
  if (!username) return; // keep the server-rendered logged-out links
  const strip = el('auth-strip');
  strip.innerHTML = `
    <a class="login-plaque" href="/profile">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 1.4a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2ZM2.6 14a5.4 5.4 0 0 1 10.8 0Z" fill="currentColor"/></svg>
      Logged in as <strong>${escapeHtml(username)}</strong>
    </a>
    <button class="login-plaque" id="strip-logout" type="button">Log out</button>`;
  el<HTMLButtonElement>('strip-logout').addEventListener('click', () => {
    void (async () => {
      const btn = el<HTMLButtonElement>('strip-logout');
      btn.disabled = true;
      btn.textContent = 'Logging out…';
      await logout();
      location.reload();
    })();
  });
})();

// ---------------------------------------------------------------------------
// Promo slot (spec §1.5 — config-driven, swappable; set to null to ship empty)
// ---------------------------------------------------------------------------

interface Promo { href: string; title: string; sub: string }

const PROMO: Promo | null = {
  href: PLAY_URL,
  title: 'The Untuned Mine is open',
  sub: 'Solo dungeon · two bosses · the plaque remembers',
};

if (PROMO) {
  el('promo-slot').innerHTML = `
    <a class="promo" href="${PROMO.href}">
      <svg viewBox="0 0 260 130" aria-hidden="true">
        <rect width="260" height="130" fill="#120d14"/>
        <path d="M0 130 V60 L40 28 h180 L260 60 v70 Z" fill="#241c26"/>
        <path d="M70 130 V72 a60 60 0 0 1 120 0 v58 Z" fill="#06040a"/>
        <path d="M70 130 V72 a60 60 0 0 1 120 0 v58" fill="none" stroke="#4d3526" stroke-width="5"/>
        <g stroke="#7ec8e3" stroke-width="2.5" fill="none" opacity=".9">
          <path d="M118 96 l12 -22 l12 22 Z" />
          <path d="M124 96 l6 -11 l6 11" opacity=".6"/>
        </g>
        <circle cx="130" cy="84" r="26" fill="none" stroke="#7ec8e3" stroke-width="1" opacity=".35">
          <animate attributeName="r" values="22;30;22" dur="3.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values=".4;.08;.4" dur="3.2s" repeatCount="indefinite"/>
        </circle>
        <g fill="#e8b54a"><rect x="46" y="48" width="5" height="8"/><rect x="208" y="52" width="5" height="8"/></g>
      </svg>
      <span class="promo-text">
        <span class="promo-title">${escapeHtml(PROMO.title)}</span>
        <span class="promo-sub">${escapeHtml(PROMO.sub)}</span>
      </span>
    </a>`;
}

// ---------------------------------------------------------------------------
// Live player counter (spec §1.3) — graceful fallback if the endpoint
// doesn't exist yet; the line keeps its lore text.
// ---------------------------------------------------------------------------

(async () => {
  try {
    const res = await fetch('/api/stats/online');
    if (!res.ok) return;
    const data = (await res.json()) as { online?: number; count?: number };
    const n = typeof data.online === 'number' ? data.online : data.count;
    if (typeof n !== 'number' || !Number.isFinite(n)) return;
    el('player-count').innerHTML =
      `There are currently <strong>${n.toLocaleString('en-US')}</strong> ${n === 1 ? 'person' : 'people'} playing in Cantorne.`;
  } catch {
    /* keep fallback text */
  }
})();

// ---------------------------------------------------------------------------
// News (spec §1.6 + prompt): newest first, top post featured larger,
// remaining cards in a grid; full body opens in a modal (tiny md renderer).
// ---------------------------------------------------------------------------

const HOMEPAGE_POST_COUNT = 5;
const posts = [...NEWS_POSTS].sort((a, b) => b.date.localeCompare(a.date));

const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

function cardHtml(post: NewsPost, index: number, featured: boolean): string {
  const motif = CATEGORY_MOTIFS[post.category] ?? ICONS.scroll;
  return `
    <button type="button" class="news-card${featured ? ' featured' : ''}" data-post="${index}">
      <span class="card-band" style="--band:${post.accent}" aria-hidden="true">${motif}</span>
      <span class="card-content">
        <span class="card-meta">
          <span class="card-tag" style="--band:${post.accent}">${escapeHtml(post.category)}</span>
          <time datetime="${post.date}">${fmtDate(post.date)}</time>
        </span>
        <span class="card-title">${escapeHtml(post.title)}</span>
        <span class="card-excerpt">${escapeHtml(post.excerpt)}</span>
        <span class="card-read">Read more &rarr;</span>
      </span>
    </button>`;
}

const newsList = el('news-list');
newsList.innerHTML = posts
  .slice(0, HOMEPAGE_POST_COUNT)
  .map((p, i) => cardHtml(p, i, i === 0))
  .join('');

// "Older news" reveals the rest in place (we have no archive page yet).
const moreBtn = el<HTMLButtonElement>('news-more');
if (posts.length > HOMEPAGE_POST_COUNT) {
  moreBtn.hidden = false;
  moreBtn.addEventListener('click', () => {
    newsList.insertAdjacentHTML(
      'beforeend',
      posts.slice(HOMEPAGE_POST_COUNT).map((p, i) => cardHtml(p, HOMEPAGE_POST_COUNT + i, false)).join('')
    );
    moreBtn.hidden = true;
  });
}

// --- article modal ---
const backdrop = el('news-modal');
const modalBand = el('modal-band');
const modalMeta = el('modal-meta');
const modalTitle = el('modal-title');
const modalBody = el('modal-body');
let lastFocus: HTMLElement | null = null;

function openPost(post: NewsPost): void {
  modalBand.style.setProperty('--band', post.accent);
  modalMeta.innerHTML =
    `<span class="card-tag" style="--band:${post.accent}">${escapeHtml(post.category)}</span>` +
    `<time datetime="${post.date}">${fmtDate(post.date)}</time>`;
  modalTitle.textContent = post.title;
  modalBody.innerHTML = renderMarkdown(post.body);
  backdrop.hidden = false;
  document.body.classList.add('modal-open');
  el('modal-close').focus();
}

function closeModal(): void {
  backdrop.hidden = true;
  document.body.classList.remove('modal-open');
  lastFocus?.focus();
}

document.addEventListener('click', (e) => {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.news-card');
  if (card) {
    lastFocus = card;
    openPost(posts[Number(card.dataset.post)]);
  }
});
el('modal-close').addEventListener('click', closeModal);
backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !backdrop.hidden) closeModal();
});

// ---------------------------------------------------------------------------
// What is Larpscape — feature blurbs
// ---------------------------------------------------------------------------

const FEATURES: { icon: string; title: string; text: string }[] = [
  {
    icon: 'skills',
    title: '24 skills, one of them is Gun',
    text: 'Train everything from Mining to Magic to the Aldgate Gun Guild’s pride and joy. Classic XP curves, level-up jingles, and a hiscores plaque with your name’s shape on it.',
  },
  {
    icon: 'quest',
    title: 'Quests & the Untuned Mine',
    text: 'A four-chapter questline that opens a sealed wing nobody should have opened, plus a solo instanced dungeon with dodge-on-the-beat bosses and a speedrun plaque.',
  },
  {
    icon: 'economy',
    title: 'A player economy & guilds',
    text: 'Trade face to face, post offers at the Aldgate Exchange, or found a guild with ranks, /g chat, and a shared vault. The first vault full of resonant shards earns our respect.',
  },
  {
    icon: 'offnote',
    title: 'The Offnote is listening',
    text: 'Cantorne was sung into being, and one wrong note slipped into the final cadence. Every monster is a place where the song skipped — killing them is retuning the world.',
  },
];

el('feature-grid').innerHTML = FEATURES.map(
  (f) => `
  <article class="feature">
    <span class="feature-icon" aria-hidden="true">${FEATURE_ICONS[f.icon]}</span>
    <div><h3>${escapeHtml(f.title)}</h3><p>${escapeHtml(f.text)}</p></div>
  </article>`
).join('');

// ---------------------------------------------------------------------------
// Hiscores panel (spec §3): top 10 Overall + per-skill <select>.
// Same-origin /api/hiscores — proxied by nginx in prod; in `home:dev` run the
// game server on :8080 and the panel shows its empty/error state otherwise.
// ---------------------------------------------------------------------------

// Mirrors SKILL_NAMES in shared/schema.ts (kept inline so the static homepage
// build doesn't pull in zod).
const SKILL_NAMES = [
  'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing',
  'Defence', 'Herblore', 'Fishing', 'Ranged', 'Thieving', 'Cooking',
  'Prayer', 'Crafting', 'Firemaking', 'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming', 'Construction', 'Hunter', 'Gun',
] as const;

interface OverallEntry { rank: number; username: string; totalLevel: number; totalXp: number }
interface SkillEntry { rank: number; username: string; level: number; xp: number }

const skillSelect = el<HTMLSelectElement>('skill-select');
skillSelect.innerHTML =
  '<option value="overall">Overall</option>' +
  SKILL_NAMES.map((s) => `<option value="${s}">${s}</option>`).join('');

const hiscoresBody = el('hiscores-body');
const hsCache = new Map<string, string>(); // skill -> rendered table html
let hsRequestSeq = 0;

function skeletonHtml(): string {
  const row =
    '<tr class="skel-row"><td><span class="skel" style="width:24px"></span></td>' +
    '<td><span class="skel" style="width:110px"></span></td>' +
    '<td><span class="skel" style="width:42px"></span></td>' +
    '<td><span class="skel" style="width:80px;margin-left:auto"></span></td></tr>';
  return tableShell('Level', row.repeat(5));
}

function tableShell(levelHeader: string, rows: string): string {
  return `
    <div class="hiscores-table-wrap">
      <table class="hiscores-table">
        <thead><tr>
          <th class="num" scope="col">Rank</th>
          <th scope="col" style="text-align:left">Name</th>
          <th scope="col" style="text-align:left">${levelHeader}</th>
          <th class="num" scope="col">XP</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function rowsHtml(skill: string, ranking: (OverallEntry | SkillEntry)[]): string {
  return ranking
    .map((r) => {
      const level = 'totalLevel' in r ? r.totalLevel : r.level;
      const xp = 'totalXp' in r ? r.totalXp : r.xp;
      const podium = r.rank <= 3 ? ` class="podium-${r.rank}"` : '';
      return `<tr${podium}>
        <td class="num rank-cell">${r.rank}</td>
        <td class="name">${escapeHtml(r.username)}</td>
        <td>${level.toLocaleString('en-US')}</td>
        <td class="num">${xp.toLocaleString('en-US')}</td>
      </tr>`;
    })
    .join('');
}

async function loadHiscores(skill: string): Promise<void> {
  const seq = ++hsRequestSeq;
  const cached = hsCache.get(skill);
  if (cached) {
    hiscoresBody.innerHTML = cached;
    return;
  }
  hiscoresBody.innerHTML = skeletonHtml();
  try {
    const res = await fetch(`/api/hiscores?skill=${encodeURIComponent(skill)}&limit=10`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { ranking: (OverallEntry | SkillEntry)[] };
    if (seq !== hsRequestSeq) return; // a newer request superseded this one
    let html: string;
    if (!data.ranking || data.ranking.length === 0) {
      html = '<p class="hiscores-note">No names on the plaque yet — be the first on the board.</p>';
    } else {
      html = tableShell(skill === 'overall' ? 'Total' : 'Level', rowsHtml(skill, data.ranking));
    }
    hsCache.set(skill, html);
    hiscoresBody.innerHTML = html;
  } catch {
    if (seq !== hsRequestSeq) return;
    hiscoresBody.innerHTML =
      '<p class="hiscores-note error">The surveyor’s plaque is unreadable right now — try again shortly.</p>';
  }
}

skillSelect.addEventListener('change', () => void loadHiscores(skillSelect.value));
void loadHiscores('overall');

// ---------------------------------------------------------------------------
// Scroll-reveal (respects prefers-reduced-motion via CSS)
// ---------------------------------------------------------------------------

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.08 }
);
document.querySelectorAll('.reveal').forEach((node) => revealObserver.observe(node));
