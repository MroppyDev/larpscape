// Network layer: login/register UI, server save provider, presence websocket, chat relay.
// Contract (SPEC.md Phase 5 "net.ts contract"). Offline mode always keeps working.

import { state, msg, setSaveProvider } from './game';
import type { RemotePlayer } from './game';

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
    res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  } else {
    res = await fetch(path, { headers });
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

function putSave(data: any, keepalive = false) {
  if (!net.token) return;
  try {
    fetch('/api/character', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + net.token },
      body: JSON.stringify({ save: data }),
      keepalive,
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

function installServerProvider(initialSave: any) {
  setSaveProvider({
    load: () => initialSave,
    save: (data) => {
      pendingSave = data;
      if (!saveTimer) {
        saveTimer = setTimeout(() => { saveTimer = null; flushSave(); }, 2000);
      }
    },
  });
  window.addEventListener('beforeunload', () => {
    if (pendingSave != null && net.token) {
      // keepalive PUT is the reliable path; sendBeacon as a last-ditch extra (POST).
      const data = pendingSave;
      flushSave(true);
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob(
            [JSON.stringify({ save: data, token: net.token })],
            { type: 'application/json' },
          );
          navigator.sendBeacon('/api/character', blob);
        }
      } catch { /* ignore */ }
    }
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

function handlePlayers(players: { name: string; x: number; y: number; app: any }[]) {
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
      if (old.chat && performance.now() > old.chat.until) old.chat = undefined;
      next.push(old);
    } else {
      next.push({ name: p.name, x: p.x, y: p.y, prevX: p.x, prevY: p.y, updatedAt: performance.now(), app: p.app ?? {} });
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
  } else if (m.t === 'chat' && typeof m.text === 'string') {
    const from = typeof m.from === 'string' ? m.from : '???';
    msg(from + ': ' + m.text, 'player-msg');
    const rp = state.remotePlayers.find((r) => r.name === from);
    if (rp) rp.chat = { text: m.text, until: performance.now() + 4000 };
  } else if (m.t === 'system' && typeof m.text === 'string') {
    msg('[Server] ' + m.text.slice(0, 200), 'server-msg');
  } else if (m.t === 'hello' && typeof m.name === 'string') {
    net.username = m.name;
  }
}

function openWs() {
  if (!net.token || !wsWanted) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(net.token)}`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => {
    wsBackoff = 1000;
    lastSentX = -1; lastSentY = -1; lastSentApp = ''; // force a fresh pos send
  };
  ws.onmessage = (ev) => { if (typeof ev.data === 'string') handleWsMessage(ev.data); };
  ws.onclose = () => { ws = null; scheduleReconnect(); };
  ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
}

function scheduleReconnect() {
  if (!wsWanted) return;
  const delay = wsBackoff;
  wsBackoff = Math.min(wsBackoff * 2, 30000);
  setTimeout(() => { if (wsWanted && !ws) openWs(); }, delay);
}

function startPresence() {
  wsWanted = true;
  openWs();
  if (!posTimer) {
    posTimer = setInterval(() => {
      if (!state.player || !ws || ws.readyState !== WebSocket.OPEN) return;
      const x = state.player.x, y = state.player.y;
      const app = currentApp();
      const appKey = JSON.stringify(app);
      if (x !== lastSentX || y !== lastSentY || appKey !== lastSentApp) {
        lastSentX = x; lastSentY = y; lastSentApp = appKey;
        wsSend({ t: 'pos', x, y, app });
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
// Login panel + bootstrap
// ---------------------------------------------------------------------------

function buildLoginPanel(): {
  panel: HTMLDivElement;
  user: HTMLInputElement;
  pass: HTMLInputElement;
  loginBtn: HTMLButtonElement;
  regBtn: HTMLButtonElement;
  offBtn: HTMLButtonElement;
  err: HTMLDivElement;
} {
  const style = document.createElement('style');
  style.textContent = `
    #bs-login { display:flex; flex-direction:column; gap:6px; align-items:center;
      margin:8px auto 10px; padding:10px 14px; max-width:280px;
      background:rgba(0,0,0,0.45); border:1px solid #5a4a2a; border-radius:6px; }
    #bs-login input { width:200px; padding:5px 8px; background:#1b1610; color:#e8dcc0;
      border:1px solid #6b5a36; border-radius:3px; font:inherit; outline:none; }
    #bs-login input:focus { border-color:#c8a85a; }
    #bs-login .bs-login-row { display:flex; gap:6px; }
    #bs-login button { padding:5px 10px; cursor:pointer; background:#3a2f1c; color:#f0e6c8;
      border:1px solid #8a7340; border-radius:3px; font:inherit; }
    #bs-login button:hover { background:#52431f; }
    #bs-login button:disabled { opacity:0.5; cursor:default; }
    #bs-login .bs-login-err { min-height:14px; color:#ff7a6a; font-size:11px; text-align:center; }
    #bs-login .bs-login-title { color:#e8d9a8; font-size:12px; letter-spacing:1px; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'bs-login';
  panel.innerHTML = `
    <div class="bs-login-title">ACCOUNT</div>
    <input id="bs-login-user" maxlength="12" placeholder="Username" autocomplete="username" spellcheck="false"/>
    <input id="bs-login-pass" type="password" placeholder="Password" autocomplete="current-password"/>
    <div class="bs-login-row">
      <button id="bs-login-go">Login</button>
      <button id="bs-login-reg">Register</button>
      <button id="bs-login-off">Play offline</button>
    </div>
    <div class="bs-login-err" id="bs-login-err"></div>
  `;

  const nameInput = document.getElementById('name-input');
  const screen = document.getElementById('welcome-screen');
  if (nameInput && nameInput.parentElement) {
    nameInput.parentElement.insertBefore(panel, nameInput);
  } else if (screen) {
    screen.appendChild(panel);
  } else {
    document.body.appendChild(panel);
  }

  return {
    panel,
    user: panel.querySelector('#bs-login-user') as HTMLInputElement,
    pass: panel.querySelector('#bs-login-pass') as HTMLInputElement,
    loginBtn: panel.querySelector('#bs-login-go') as HTMLButtonElement,
    regBtn: panel.querySelector('#bs-login-reg') as HTMLButtonElement,
    offBtn: panel.querySelector('#bs-login-off') as HTMLButtonElement,
    err: panel.querySelector('#bs-login-err') as HTMLDivElement,
  };
}

function goOnline(token: string, username: string | null, save: any) {
  net.token = token;
  net.username = username;
  net.online = true;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    if (username) localStorage.setItem(USER_KEY, username);
  } catch { /* ignore */ }
  installServerProvider(save);
  startPresence();
}

async function bootstrap(): Promise<any | null> {
  const ui = buildLoginPanel();

  // silent session resume from stored token
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
      ui.panel.remove();
      return res?.save ?? null;
    } catch (e: any) {
      net.token = null;
      if (e instanceof TypeError || /fetch/i.test(String(e?.message))) {
        // server unreachable: keep the buttons but fall straight to offline play
        ui.err.textContent = 'Server unreachable, playing offline.';
        return null;
      }
      // token invalid/expired — clear and show the form
      try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
      ui.err.textContent = 'Session expired — please log in again.';
    }
  }

  return new Promise<any | null>((resolve) => {
    let settled = false;
    const finish = (save: any | null) => {
      if (settled) return;
      settled = true;
      resolve(save);
    };

    const setBusy = (busy: boolean) => {
      ui.loginBtn.disabled = busy;
      ui.regBtn.disabled = busy;
      ui.offBtn.disabled = busy;
    };

    const attempt = async (path: '/api/login' | '/api/register') => {
      const username = ui.user.value.trim();
      const password = ui.pass.value;
      ui.err.textContent = '';
      if (!/^[a-zA-Z0-9]{3,12}$/.test(username)) {
        ui.err.textContent = 'Username must be 3-12 letters/numbers.';
        return;
      }
      if (!password) { ui.err.textContent = 'Enter a password.'; return; }
      setBusy(true);
      try {
        net.token = null;
        const auth = await api(path, { username, password });
        net.token = auth.token;
        const res = await api('/api/character');
        goOnline(auth.token, auth.username ?? username, res?.save ?? null);
        ui.panel.remove();
        finish(res?.save ?? null);
      } catch (e: any) {
        net.token = null;
        ui.err.textContent =
          e instanceof TypeError ? 'Server unreachable — try Play offline.'
          : String(e?.message || 'Login failed.');
      } finally {
        setBusy(false);
      }
    };

    ui.loginBtn.addEventListener('click', () => { void attempt('/api/login'); });
    ui.regBtn.addEventListener('click', () => { void attempt('/api/register'); });
    ui.pass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void attempt('/api/login');
    });
    ui.offBtn.addEventListener('click', () => {
      ui.panel.remove();
      finish(null); // leave the local save provider in place
    });
  });
}
