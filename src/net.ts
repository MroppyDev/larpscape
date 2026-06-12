// Network layer: session bootstrap (website cookie or legacy Bearer token),
// server save provider, world-state websocket (NPCs/combat/ground items are
// server-authoritative), chat relay.
// Login is REQUIRED: there is no offline mode — the world lives on the server.
// Sign-in happens on the website (larpscape.net/login); the client only shows
// an interstitial pointing there when no session exists.

import {
  state, msg, setSaveProvider, netLink, combatSnapshot, saveGame,
  netWorldSnapshot, netWorldDelta, netHit, netYouHit, netNpcHitYou,
  netYouKilled, netFx, netShorn, netDeny,
  netIntent, netGranted,
  netPvpHitYou, netPvpYouHit, netPvpHit, netPvpDeath, netPvpKill,
  netDeath, netHpSync, netSpecSync, netPrayerSync,
} from './game';
import type { RemotePlayer } from './game';
import { loadFriends, loadGuild, setFriendOnline } from './friends';

const TOKEN_KEY = 'bs-token';
const USER_KEY = 'bs-username';

export interface NetState {
  online: boolean;
  username: string | null;
  token: string | null;
}

export const net: NetState & {
  bootstrap: () => Promise<any | null>;
  sendChat: (text: string) => void;
  api: (path: string, body?: any) => Promise<any>;
} = {
  online: false,
  username: null,
  token: null,
  bootstrap,
  sendChat,
  api,
};

// ---------------------------------------------------------------------------
// REST helper
// ---------------------------------------------------------------------------

async function api(path: string, body?: any): Promise<any> {
  const headers: Record<string, string> = {};
  if (net.token) headers['Authorization'] = 'Bearer ' + net.token;
  let res: Response;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include' });
  } else {
    res = await fetch(path, { headers, credentials: 'include' });
  }
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const m = (data && (data.error || data.message)) || res.status + ' ' + res.statusText;
    throw new Error(String(m));
  }
  return data;
}

// ---------------------------------------------------------------------------
// Server save provider (debounced PUT, fire-and-forget)
// ---------------------------------------------------------------------------

let pendingSave: any = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (net.token) headers['Authorization'] = 'Bearer ' + net.token;
  return headers;
}

function putSave(data: any, keepalive = false) {
  if (!net.online) return;
  try {
    fetch('/api/character', {
      method: 'PUT',
      headers: saveHeaders(),
      body: JSON.stringify({ save: data }),
      credentials: 'include',
      keepalive,
    }).then((res) => {
      // 409 = save fenced (a trade just rewrote the server save). Re-queue a
      // FRESH snapshot after the fence so the post-trade state persists —
      // never resend `data`, it predates the trade.
      if (res.status === 409) {
        setTimeout(() => { try { saveGame(); } catch { /* best effort */ } }, 2500);
      }
    }).catch(() => { /* fire-and-forget */ });
  } catch { /* ignore */ }
}

function flushSave(keepalive = false) {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (pendingSave != null) {
    const data = pendingSave;
    pendingSave = null;
    putSave(data, keepalive);
  }
}

// Awaited save flush: captures the CURRENT game state and waits for the PUT
// to land. Used before final trade acceptance so the server-side save (which
// the trade transaction validates against) matches the live inventory.
export async function syncSaveNow(): Promise<boolean> {
  if (!net.online) return false;
  try { saveGame(); } catch { /* best effort */ }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const data = pendingSave;
  pendingSave = null;
  if (data == null) return true;
  try {
    const res = await fetch('/api/character', {
      method: 'PUT',
      headers: saveHeaders(),
      body: JSON.stringify({ save: data }),
      credentials: 'include',
    });
    return res.ok;
  } catch { return false; }
}

let serverSaveCache: any = null;

function installServerProvider(initialSave: any) {
  serverSaveCache = initialSave;
  setSaveProvider({
    load: () => serverSaveCache,
    save: (data) => {
      serverSaveCache = data;
      pendingSave = data;
      if (!saveTimer) {
        saveTimer = setTimeout(() => { saveTimer = null; flushSave(); }, 2000);
      }
    },
  });
  const flushOnHide = () => {
    if (!net.online) return;
    try { saveGame(); } catch { /* best effort */ }
    flushSave(true);
  };
  window.addEventListener('beforeunload', flushOnHide);
  window.addEventListener('pagehide', flushOnHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnHide();
  });
}

// ---------------------------------------------------------------------------
// Websocket presence + chat
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let wsBackoff = 1000;
let wsWanted = false;
let posTimer: ReturnType<typeof setInterval> | null = null;
let lastSentX = -1;
let lastSentY = -1;
let lastSentApp = '';
let lastSentStats = '';

function currentApp(): Record<string, string | null> {
  const app: Record<string, string | null> = {};
  const eq = state.player?.equipment as Record<string, { id: string } | null> | undefined;
  if (eq) for (const slot of Object.keys(eq)) app[slot] = eq[slot]?.id ?? null;
  return app;
}

function wsSend(obj: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
  }
}

function sendChat(text: string) {
  const t = String(text ?? '').slice(0, 80).trim();
  if (t && net.online) wsSend({ t: 'chat', text: t });
}

function handlePlayers(players: { name: string; x: number; y: number; app: any; cb?: number; hp?: number; maxHp?: number; d?: boolean; tag?: string | null }[]) {
  const prev = new Map<string, RemotePlayer>();
  for (const rp of state.remotePlayers) prev.set(rp.name, rp);
  const next: RemotePlayer[] = [];
  for (const p of players) {
    if (!p || typeof p.name !== 'string') continue;
    if (net.username && p.name === net.username) continue;
    const old = prev.get(p.name);
    if (old) {
      if (p.x !== old.x || p.y !== old.y) {
        const jump = Math.max(Math.abs(p.x - old.x), Math.abs(p.y - old.y));
        if (jump > 3) {
          // teleport — snap, don't glide across the map
          old.prevX = p.x; old.prevY = p.y;
        } else {
          // interpolate from wherever they are now toward the new tile
          old.prevX = old.x; old.prevY = old.y;
        }
        old.x = p.x; old.y = p.y;
        old.updatedAt = performance.now();
      }
      // unchanged position: leave prev/x/updatedAt alone so in-flight interpolation finishes
      old.app = p.app ?? old.app;
      old.tag = p.tag ?? null;
      if (typeof p.cb === 'number') old.cb = p.cb;
      if (typeof p.hp === 'number') old.hp = p.hp;
      if (typeof p.maxHp === 'number') old.maxHp = p.maxHp;
      if (typeof p.d === 'boolean') old.dead = p.d;
      if (old.chat && performance.now() > old.chat.until) old.chat = undefined;
      next.push(old);
    } else {
      next.push({
        name: p.name, x: p.x, y: p.y, prevX: p.x, prevY: p.y, updatedAt: performance.now(),
        app: p.app ?? {}, cb: p.cb, hp: p.hp, maxHp: p.maxHp, dead: p.d, tag: p.tag ?? null,
      });
    }
  }
  state.remotePlayers.length = 0;
  state.remotePlayers.push(...next);
}

function handleWsMessage(raw: string) {
  let m: any;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'players' && Array.isArray(m.players)) {
    handlePlayers(m.players);
  } else if (m.t === 'world') {
    netWorldSnapshot(m); // full NPC + ground resync (connect/reconnect)
  } else if (m.t === 'w') {
    netWorldDelta(m); // per-tick NPC/ground deltas
  } else if (m.t === 'hit') {
    netHit(m);
  } else if (m.t === 'youHit') {
    netYouHit(m);
  } else if (m.t === 'npcHitYou') {
    netNpcHitYou(m);
  } else if (m.t === 'death') {
    netDeath(m);
  } else if (m.t === 'hpSync') {
    netHpSync(m);
  } else if (m.t === 'specSync') {
    netSpecSync(m);
  } else if (m.t === 'prayerSync') {
    netPrayerSync(m);
  } else if (m.t === 'youKilled') {
    netYouKilled(m);
  } else if (m.t === 'intent') {
    netIntent(m); // server-authoritative skilling echo (gather/cook/make/...)
  } else if (m.t === 'granted') {
    netGranted(m); // authoritative pickup/drop echo
  } else if (m.t === 'pickupFail') {
    msg("You don't have enough inventory space.");
  } else if (m.t === 'fx') {
    netFx(m);
  } else if (m.t === 'shorn') {
    netShorn();
  } else if (m.t === 'deny') {
    netDeny(m);
  } else if (m.t === 'chat' && typeof m.text === 'string') {
    const from = typeof m.from === 'string' ? m.from : '???';
    const tag = typeof m.tag === 'string' && m.tag ? `[${m.tag}] ` : '';
    msg(tag + from + ': ' + m.text, 'player-msg');
    const rp = state.remotePlayers.find((r) => r.name === from);
    if (rp) rp.chat = { text: m.text, until: performance.now() + 4000 };
  } else if (m.t === 'gchat' && typeof m.text === 'string' && typeof m.from === 'string') {
    msg(`[${m.tag ?? 'Guild'}] ${m.from}: ${m.text}`, 'guild-msg');
  } else if (m.t === 'trade_req' && typeof m.id === 'string' && typeof m.from === 'string') {
    import('./ui').then((u) => u.showTradeRequest(m.id, m.from));
  } else if (m.t === 'trade_req_declined' && typeof m.from === 'string') {
    msg(`${m.from} declined the trade.`, 'game');
  } else if (m.t === 'trade_open' && typeof m.with === 'string') {
    import('./ui').then((u) => u.openTradeWindow(m.with));
  } else if (m.t === 'trade_state') {
    import('./ui').then((u) => u.updateTradeState(m));
  } else if (m.t === 'trade_cancelled') {
    import('./ui').then((u) => u.tradeCancelled(typeof m.reason === 'string' ? m.reason : 'Trade cancelled.'));
  } else if (m.t === 'trade_complete') {
    import('./ui').then((u) => u.tradeComplete(m));
  } else if (m.t === 'guild_invite' && typeof m.id === 'string' && typeof m.from === 'string') {
    import('./friends').then((f) => f.showGuildInvite(m.id, m.from, String(m.guild ?? ''), String(m.tag ?? '')));
  } else if (m.t === 'guild_kicked') {
    msg(`You have been removed from ${m.guild ?? 'your guild'}.`, 'game');
    import('./friends').then((f) => void f.loadGuild());
  } else if (m.t === 'guild_update') {
    if (typeof m.text === 'string') msg(m.text, 'guild-msg');
    import('./friends').then((f) => void f.loadGuild());
  } else if (m.t === 'guild_vault_change') {
    import('./ui').then((u) => u.refreshGuildVault());
  } else if (m.t === 'save_reload') {
    // The trade site (or another server-side system) just rewrote our save.
    // Pull the authoritative bank and drop any stale pending PUT, otherwise
    // our retry loop would eventually outlast the fence and clobber the
    // market mutation (the dupe the economy audit flagged).
    void reloadServerOwned();
  } else if (m.t === 'system' && typeof m.text === 'string') {
    msg('[Server] ' + m.text.slice(0, 200), 'server-msg');
  } else if (m.t === 'hello' && typeof m.name === 'string') {
    net.username = m.name;
    if (typeof m.buildId === 'string') checkBuild(m.buildId);
    void loadFriends();
    void loadGuild();
  } else if (m.t === 'friend_status' && typeof m.username === 'string' && typeof m.online === 'boolean') {
    setFriendOnline(m.username, m.online);
  } else if (m.t === 'cf_offer' && typeof m.id === 'string' && typeof m.from === 'string' && typeof m.amount === 'number') {
    import('./packs/gambling').then((g) => g.showCoinflipOffer(m.id, m.from, m.amount));
  } else if (m.t === 'cf_result' && typeof m.winner === 'string' && typeof m.loser === 'string' && typeof m.amount === 'number') {
    import('./packs/gambling').then((g) => g.handleCoinflipResult(m.winner, m.loser, m.amount, m.flip ?? 'heads'));
  } else if (m.t === 'cf_declined' && typeof m.from === 'string') {
    msg(`${m.from} declined your coinflip challenge.`, 'game');
  } else if (m.t === 'pvpHitYou') {
    netPvpHitYou(m);
  } else if (m.t === 'pvpYouHit') {
    netPvpYouHit(m);
  } else if (m.t === 'pvpHit') {
    netPvpHit(m);
  } else if (m.t === 'pvpDeath') {
    netPvpDeath(m);
  } else if (m.t === 'pvpKill') {
    netPvpKill(m);
  }
}

// Re-sync owned fields from the server's authoritative save after a server-side
// mutation (combat xp, market, intents, GE, …). Stale pending PUTs are dropped
// so the client cannot clobber fresh server state on retry.
export async function reloadServerOwned() {
  try {
    const data = await api('/api/character');
    const save = data?.save;
    const p = state.player;
    if (!save || !p) return;
    pendingSave = null;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (Array.isArray(save.xp)) p.xp = save.xp;
    if (Array.isArray(save.inventory)) p.inventory = save.inventory;
    if (save.equipment && typeof save.equipment === 'object') {
      for (const slot of Object.keys(save.equipment)) {
        if (slot in p.equipment) p.equipment[slot as keyof typeof p.equipment] = save.equipment[slot] ?? null;
      }
    }
    if (Array.isArray(save.bank)) p.bank = save.bank;
    if (typeof save.curHp === 'number') p.curHp = save.curHp;
    if (typeof save.prayerPoints === 'number') p.prayerPoints = save.prayerPoints;
    if (Array.isArray(save.activePrayers)) p.activePrayers = new Set(save.activePrayers);
    if (typeof save.specEnergy === 'number') p.specEnergy = Math.max(0, Math.min(100, save.specEnergy));
    if (save.slayerTask !== undefined) p.slayerTask = save.slayerTask ?? null;
    if (save.quests && typeof save.quests === 'object') p.quests = save.quests;
    if (save.collectionLog && typeof save.collectionLog === 'object') p.collectionLog = save.collectionLog;
    if (typeof save.slayerPoints === 'number') (p as { slayerPoints?: number }).slayerPoints = save.slayerPoints;
    if (typeof save.x === 'number' && typeof save.y === 'number') {
      p.x = save.x;
      p.y = save.y;
      p.prevX = save.x;
      p.prevY = save.y;
    }
    serverSaveCache = save;
    saveGame();
    import('./game').then((g) => {
      g.events.onStatsChange?.();
      if (state.bankOpen) g.events.onBankShopChange?.();
    });
  } catch { /* next save_reload or relog will reconcile */ }
}

function openWs() {
  if (!net.online || !wsWanted) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // With a stored Bearer token, pass it as ?token= (legacy path). Cookie
  // sessions send bs_session on the upgrade request automatically and the
  // server accepts that when no token param is present.
  const qs = net.token ? `?token=${encodeURIComponent(net.token)}` : '';
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws${qs}`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    wsBackoff = 1000;
    lastSentX = -1; lastSentY = -1; lastSentApp = ''; lastSentStats = ''; // force fresh sends
    netLink.send = (m) => wsSend(m); // game.ts intents (swing/pickup/drop/interact)
    if (state.player) wsSend(combatSnapshot());
  };
  ws.onmessage = (ev) => { if (typeof ev.data === 'string') handleWsMessage(ev.data); };
  ws.onclose = () => { ws = null; netLink.send = null; scheduleReconnect(); };
  ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
}

function scheduleReconnect() {
  if (!wsWanted) return;
  const delay = wsBackoff;
  wsBackoff = Math.min(wsBackoff * 2, 30000);
  setTimeout(() => { if (wsWanted && !ws) openWs(); }, delay);
}

// ---------------------------------------------------------------------------
// Deploy auto-refresh: when the server's build differs from the one baked into
// this bundle, announce an OSRS-style system update and reload the page so
// players never get stuck on a stale cached client.
// ---------------------------------------------------------------------------

let updateScheduled = false;

function checkBuild(serverBuild: string) {
  if (updateScheduled) return;
  if (serverBuild === 'dev' || __BUILD_ID__ === 'dev') return;
  if (serverBuild === __BUILD_ID__) return;
  updateScheduled = true;
  let secs = 10;
  msg(`System update in ${secs} seconds — the game will reload.`, 'server-msg');
  const timer = setInterval(() => {
    secs -= 5;
    if (secs > 0) {
      msg(`System update in ${secs} seconds...`, 'server-msg');
      return;
    }
    clearInterval(timer);
    try { saveGame(); } catch { /* best effort */ }
    location.reload();
  }, 5000);
}

let versionTimer: ReturnType<typeof setInterval> | null = null;

function startVersionPolling() {
  if (versionTimer) return;
  versionTimer = setInterval(async () => {
    try {
      const r = await fetch('/api/version', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (typeof j.buildId === 'string') checkBuild(j.buildId);
    } catch { /* offline blips are fine; ws hello also checks */ }
  }, 3 * 60 * 1000);
}

function startPresence() {
  wsWanted = true;
  openWs();
  startVersionPolling();
  if (!posTimer) {
    posTimer = setInterval(() => {
      if (!state.player || !ws || ws.readyState !== WebSocket.OPEN) return;
      const x = state.player.x, y = state.player.y;
      const app = currentApp();
      const appKey = JSON.stringify(app);
      if (x !== lastSentX || y !== lastSentY || appKey !== lastSentApp) {
        lastSentX = x; lastSentY = y; lastSentApp = appKey;
        wsSend({ t: 'pos', x, y, app, d: state.player.dead });
      }
      // combat stats snapshot (server uses it for aggro + retaliation rolls)
      const stats = combatSnapshot();
      const statsKey = JSON.stringify(stats);
      if (statsKey !== lastSentStats) {
        lastSentStats = statsKey;
        wsSend(stats);
      }
    }, 600);
  }
  // mirror locally-typed chat to the server (capture phase: runs alongside ui's handler)
  const input = document.getElementById('chat-input') as HTMLInputElement | null;
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && net.online) {
        const text = input.value.trim();
        if (text) sendChat(text);
      }
    }, true);
  }
}

// ---------------------------------------------------------------------------
// Sign-in interstitial + bootstrap
//
// Accounts are managed on the website: players sign in at
// https://larpscape.net/login?return=play and the site redirects back to
// https://play.larpscape.net carrying the shared bs_session cookie
// (Domain=.larpscape.net). The game client itself never shows a
// username/password form anymore — it resumes a session (cookie or legacy
// localStorage Bearer token) or points the player at the website.
// ---------------------------------------------------------------------------

// Prod builds always send players to the canonical website login. In dev
// (vite serve → __BUILD_ID__ === 'dev') fall back to a relative /login so a
// locally-running homepage (localhost:5176 proxied, or any local stack that
// serves /login) can handle it.
function loginUrl(): string {
  return __BUILD_ID__ === 'dev' ? '/login?return=play' : 'https://larpscape.net/login?return=play';
}

// Styled interstitial inside the welcome panel (styles in src/style.css).
function showSignin(note?: string) {
  let box = document.getElementById('bs-signin');
  if (!box) {
    box = document.createElement('div');
    box.id = 'bs-signin';
    box.innerHTML = `
      <div class="bs-signin-msg">Adventurers sign in at <strong>larpscape.net</strong></div>
      <a id="bs-signin-btn" href="${loginUrl()}">LOG IN</a>
      <div class="bs-signin-note" id="bs-signin-note"></div>
    `;
    const nameInput = document.getElementById('name-input');
    const screen = document.getElementById('welcome-screen');
    if (nameInput && nameInput.parentElement) {
      nameInput.parentElement.insertBefore(box, nameInput);
    } else if (screen) {
      screen.appendChild(box);
    } else {
      document.body.appendChild(box);
    }
    // the name prompt + play button are meaningless without a session
    const ni = document.getElementById('name-input');
    const pb = document.getElementById('play-btn');
    if (ni) ni.style.display = 'none';
    if (pb) pb.style.display = 'none';
  }
  const noteEl = document.getElementById('bs-signin-note');
  if (noteEl) noteEl.textContent = note ?? '';
}

function removeSignin() {
  document.getElementById('bs-signin')?.remove();
  const ni = document.getElementById('name-input');
  const pb = document.getElementById('play-btn');
  if (ni) ni.style.display = '';
  if (pb) pb.style.display = '';
}

// token === null means cookie-session mode (bs_session rides on every fetch).
function goOnline(token: string | null, username: string | null, save: any) {
  net.token = token;
  net.username = username;
  net.online = true;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (username) localStorage.setItem(USER_KEY, username);
  } catch { /* ignore */ }
  installServerProvider(save);
  startPresence();
  void loadFriends();
  void loadGuild();
}

function isNetworkError(e: any): boolean {
  return e instanceof TypeError || /fetch/i.test(String(e?.message));
}

async function bootstrap(): Promise<any | null> {
  // 1) legacy session resume from a stored Bearer token — existing players
  //    stay logged in even though the in-client form is gone
  const stored = (() => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  })();
  if (stored) {
    net.token = stored;
    try {
      const res = await api('/api/character');
      const username = (() => {
        try { return localStorage.getItem(USER_KEY); } catch { return null; }
      })();
      goOnline(stored, username, res?.save ?? null);
      removeSignin();
      return res?.save ?? null;
    } catch (e: any) {
      net.token = null;
      if (isNetworkError(e)) {
        showSignin('Server unreachable — please try again in a moment.');
        return new Promise<never>(() => { /* reload to retry */ });
      }
      // token invalid/expired — clear it and try the cookie session below
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    }
  }

  // 2) cookie session (set by the website login at larpscape.net)
  try {
    const me = await fetch('/api/me', { credentials: 'include' });
    if (me.ok) {
      const j = await me.json().catch(() => null);
      const username = typeof j?.username === 'string' ? j.username : null;
      const res = await api('/api/character'); // cookie-authenticated
      goOnline(null, username, res?.save ?? null);
      removeSignin();
      return res?.save ?? null;
    }
  } catch {
    showSignin('Server unreachable — please try again in a moment.');
    return new Promise<never>(() => { /* reload to retry */ });
  }

  // 3) no session: point the player at the website. The login page redirects
  //    back to play.larpscape.net, so this page load never resumes — the
  //    promise intentionally never resolves.
  showSignin();
  return new Promise<never>(() => { /* navigation away handles the rest */ });
}
