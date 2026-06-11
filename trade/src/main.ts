// Larpscape Trade — entry point. Hash-routed tabs over the market API.
import './style.css';
import { apiMe, logout } from './api';
import { el, clear } from './ui';
import { renderSearch, type TabCtx } from './search';
import { renderSell } from './sell';
import { renderMyListings } from './listings';
import { renderExchange } from './exchange';

const HOME_URL = 'https://larpscape.net';
const PLAY_URL = 'https://play.larpscape.net';
const FORUM_URL = 'https://forum.larpscape.net';
const WIKI_URL = 'https://wiki.larpscape.net';
// dev convenience: same-origin /login only exists behind nginx in prod
const LOGIN_URL = `${HOME_URL}/login`;

type TabId = 'search' | 'sell' | 'listings' | 'exchange';
const TABS: { id: TabId; label: string; render: (c: HTMLElement, ctx: TabCtx) => void }[] = [
  { id: 'search', label: 'Search the board', render: renderSearch },
  { id: 'sell', label: 'Sell an item', render: renderSell },
  { id: 'listings', label: 'My listings', render: renderMyListings },
  { id: 'exchange', label: 'The Exchange', render: renderExchange },
];

const ctx: TabCtx = {
  username: null,
  loginUrl: LOGIN_URL,
  async refreshSession() {
    ctx.username = await apiMe();
    renderAuth();
  },
};

const authSlot = document.getElementById('auth-slot')!;
const tabBar = document.getElementById('tab-bar')!;
const main = document.getElementById('main')!;

function currentTab(): TabId {
  const h = location.hash.replace('#', '');
  return (TABS.some((t) => t.id === h) ? h : 'search') as TabId;
}

function renderAuth(): void {
  clear(authSlot as HTMLElement);
  if (ctx.username) {
    authSlot.append(
      el('span', { class: 'who' }, 'Trading as ', el('b', { text: ctx.username })),
      el('button', {
        class: 'link-btn', type: 'button', text: 'Log out',
        click: async () => {
          await logout();
          ctx.username = null;
          renderAuth();
          renderTab();
        },
      })
    );
  } else {
    authSlot.append(
      el('a', { class: 'site-nav-login', href: LOGIN_URL, text: 'Log in' }),
      el('span', { class: 'who', text: '·' }),
      el('a', { href: `${HOME_URL}/register`, text: 'Create account' })
    );
  }
}

function renderTabBar(): void {
  clear(tabBar as HTMLElement);
  const active = currentTab();
  for (const t of TABS) {
    tabBar.appendChild(el('a', {
      href: `#${t.id}`,
      text: t.label,
      ...(t.id === active ? { 'aria-current': 'page' } : {}),
    }));
  }
}

function renderTab(): void {
  renderTabBar();
  const tab = TABS.find((t) => t.id === currentTab())!;
  tab.render(main as HTMLElement, ctx);
  main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', renderTab);

void (async () => {
  // nav links (static in index.html already) — just boot session + first tab
  ctx.username = await apiMe();
  renderAuth();
  renderTab();
})();
