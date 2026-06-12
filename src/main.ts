// Boot: login bootstrap (server required) -> init -> 600ms tick loop + render loop.

import { initGame, gameTick, state, saveGame } from './game';
import './content';
import './quests';
import './packs';
import './ge';
import './friends';
import './tutorial';
import './worldmap';
import { net } from './net';
import { initUI } from './ui';
import { maybeShowPatchNotes } from './patch-notes';
import {
  render, renderMinimap, buildMinimapBase, markTick,
  setViewportScale, setViewportSize, nudgeZoom, nudgeYaw,
} from './render';
import { audio, TRACKS, trackForRegion } from './audio';
import { TICK_MS } from './defs';

// Start downloading the SoundFont immediately; warm the synth on first click so
// it's ready by the time the player hits "Click here to play".
document.addEventListener('pointerdown', () => audio.warmUp(), { once: true });

let lastRegionTrack = '';
let booted = false;

// Mobile/touch detection: coarse pointer or touch points. Adds body.mobile
// (bigger touch targets via CSS).
const PARAMS = new URLSearchParams(location.search);
export const IS_MOBILE =
  (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
  (navigator.maxTouchPoints ?? 0) > 1 ||
  PARAMS.has('mobile') ||      // manual override / testing (scaled fixed mode)
  PARAMS.has('mobilefull');    // manual override / testing (true mobile mode)

// True mobile client mode (OSRS-Mobile style): phones get a native fullscreen
// layout with overlay HUD; tablets (short edge >= 700px) keep scaled fixed mode.
export const MOBILE_FULL =
  IS_MOBILE && (Math.min(screen.width, screen.height) < 700 || PARAMS.has('mobilefull'));

if (IS_MOBILE) document.body.classList.add('mobile');
if (MOBILE_FULL) document.body.classList.add('mobile-full');

// Scaled fixed mode: keep the authentic 765×503 layout but scale it to fill
// the window (like RuneLite's scaled fixed mode). The 3D viewport re-renders
// at the scaled resolution so it stays sharp instead of blurring up.
function applyScale() {
  if (MOBILE_FULL) {
    // true mobile mode: the canvas IS the screen — resize the drawing buffer
    const cv = document.getElementById('viewport');
    if (cv) {
      const r = cv.getBoundingClientRect();
      setViewportSize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    }
    return;
  }
  const frame = document.getElementById('frame');
  if (!frame) return;
  const pad = IS_MOBILE ? 4 : 24;
  const fit = Math.min((window.innerWidth - pad) / 785, (window.innerHeight - pad) / 523, 2.6);
  const s = IS_MOBILE ? Math.max(0.4, fit) : Math.max(1, fit);
  frame.style.transform = Math.abs(s - 1) > 0.02 ? `scale(${s.toFixed(3)})` : '';
  setViewportScale(s);
  // portrait phones: the client is unusably small sideways — ask for landscape
  const hint = document.getElementById('rotate-hint');
  if (hint) hint.style.display = IS_MOBILE && window.innerHeight > window.innerWidth ? 'flex' : 'none';
}
if (IS_MOBILE && !MOBILE_FULL) {
  // scaled-fixed-mode tablets only: mobile-full treats both orientations as
  // first-class, so the rotate hint is retired there.
  const hint = document.createElement('div');
  hint.id = 'rotate-hint';
  hint.innerHTML = '<div>↻</div><p>Rotate your device to landscape<br/>for the best experience.</p>';
  document.body.appendChild(hint);
}
if (IS_MOBILE) {
  // Long-press on UI elements -> contextmenu (iOS Safari never fires it
  // natively; the viewport canvas handles its own touch input in render.ts).
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let lpX = 0, lpY = 0;
  document.addEventListener('touchstart', (e) => {
    const target = e.target as HTMLElement;
    if (!target || target.id === 'viewport' || e.touches.length !== 1) return;
    lpX = e.touches[0].clientX; lpY = e.touches[0].clientY;
    lpTimer = setTimeout(() => {
      lpTimer = null;
      target.dispatchEvent(new MouseEvent('contextmenu', {
        clientX: lpX, clientY: lpY, button: 2, bubbles: true, cancelable: true,
      }));
    }, 500);
  }, { passive: true });
  const lpCancel = (e: TouchEvent) => {
    if (!lpTimer) return;
    if (e.type === 'touchmove' && e.touches.length === 1) {
      const t = e.touches[0];
      if (Math.hypot(t.clientX - lpX, t.clientY - lpY) < 12) return;
    }
    clearTimeout(lpTimer); lpTimer = null;
  };
  document.addEventListener('touchmove', lpCancel, { passive: true });
  document.addEventListener('touchend', lpCancel, { passive: true });
  // touchcancel fires (instead of touchend) when the browser takes over the
  // gesture for native scrolling — e.g. inside the drawer panel or chat
  // overlay — so it must also kill the pending long-press.
  document.addEventListener('touchcancel', lpCancel, { passive: true });
}
window.addEventListener('resize', applyScale);
window.addEventListener('orientationchange', () => setTimeout(applyScale, 250));
applyScale();

// ---------------- True mobile client UI (body.mobile-full) ----------------
// Repositions existing widgets into an overlay HUD: combined tab strip +
// panel drawer, collapsible chat pill, camera button cluster, fullscreen.
// All game logic/rendering of these widgets stays in ui.ts untouched.
function setupMobileFull() {
  const body = document.body;

  // --- combined tab strip (both tab rows side by side, docked to an edge) ---
  const strip = document.createElement('div');
  strip.id = 'mf-tabstrip';
  strip.append(document.getElementById('tabs-top')!, document.getElementById('tabs-bottom')!);
  body.appendChild(strip);

  // --- panel drawer (bottom sheet in portrait, right drawer in landscape) ---
  const drawer = document.createElement('div');
  drawer.id = 'mf-drawer';
  const dx = document.createElement('div');
  dx.id = 'mf-drawer-x';
  dx.textContent = '✕';
  dx.onclick = () => body.classList.remove('drawer-open');
  drawer.append(dx, document.getElementById('panel')!);
  body.appendChild(drawer);

  // Tab taps open the drawer; tapping the already-active tab closes it.
  // Capture phase so we read the .active class BEFORE ui.ts re-renders the row.
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.('#orb-prayer')) { body.classList.add('drawer-open'); return; }
    const tab = t?.closest?.('.tab');
    if (!tab || !strip.contains(tab)) return;
    if (body.classList.contains('drawer-open') && tab.classList.contains('active')) {
      body.classList.remove('drawer-open');
    } else {
      body.classList.add('drawer-open');
    }
  }, true);

  // --- chat: collapsed 2-line pill <-> expanded overlay with input/tabs ---
  const chatbox = document.getElementById('chatbox')!;
  const cx = document.createElement('div');
  cx.id = 'mf-chat-close';
  cx.textContent = '✕';
  cx.onclick = (e) => { e.stopPropagation(); body.classList.remove('chat-open'); };
  chatbox.appendChild(cx);
  chatbox.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    // dialogue/make-X overlays live inside #chatbox but render as their own
    // fixed boxes — tapping them must not toggle the chat pill
    if (t?.closest?.('#dialogue-overlay') || t?.closest?.('#make-strip') || t?.closest?.('#mf-chat-close')) return;
    if (!body.classList.contains('chat-open')) body.classList.add('chat-open');
  });

  // keep the focused chat input visible above the soft keyboard
  const vv = window.visualViewport;
  if (vv) {
    const adjust = () => {
      if (!body.classList.contains('chat-open')) { chatbox.style.bottom = ''; return; }
      const hidden = window.innerHeight - (vv.height + vv.offsetTop);
      chatbox.style.bottom = hidden > 4 ? `${Math.round(hidden) + 8}px` : '';
    };
    vv.addEventListener('resize', adjust);
    vv.addEventListener('scroll', adjust);
    document.getElementById('chat-input')?.addEventListener('blur', () => { chatbox.style.bottom = ''; });
  }

  // tap outside closes the drawer/chat (context menu + modals don't count)
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t || t.closest('#context-menu') || t.closest('#modal-layer') || t.closest('#item-tooltip')) return;
    if (body.classList.contains('drawer-open') && !t.closest('#mf-drawer') && !t.closest('#mf-tabstrip')) {
      body.classList.remove('drawer-open');
    }
    if (body.classList.contains('chat-open') && !t.closest('#chatbox')) {
      body.classList.remove('chat-open');
    }
  });

  // --- camera cluster (mid-right): zoom/rotate with hold-to-repeat + fullscreen ---
  const cam = document.createElement('div');
  cam.id = 'mf-cam';
  const mkBtn = (label: string, title: string, act?: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mf-cam-btn';
    b.textContent = label;
    b.title = title;
    if (act) {
      let iv: ReturnType<typeof setInterval> | null = null;
      const stop = () => { if (iv) { clearInterval(iv); iv = null; } };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        act();
        stop();
        iv = setInterval(act, 90);
      });
      b.addEventListener('pointerup', stop);
      b.addEventListener('pointercancel', stop);
      b.addEventListener('pointerleave', stop);
    }
    cam.appendChild(b);
    return b;
  };
  mkBtn('+', 'Zoom in', () => nudgeZoom(0.93));
  mkBtn('−', 'Zoom out', () => nudgeZoom(1.075));
  mkBtn('⟲', 'Rotate left', () => nudgeYaw(0.1));
  mkBtn('⟳', 'Rotate right', () => nudgeYaw(-0.1));
  mkBtn('⛶', 'Fullscreen').addEventListener('click', () => void toggleFullscreen());
  body.appendChild(cam);

  // play button: reveal the HUD overlays + try fullscreen (works on Android;
  // iOS Safari rejects — swallowed)
  document.getElementById('play-btn')?.addEventListener('click', () => {
    body.classList.add('mf-playing');
    try {
      const p = document.documentElement.requestFullscreen?.();
      if (p && typeof p.catch === 'function') p.catch(() => { /* iOS */ });
    } catch { /* unsupported */ }
  });
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { /* iOS Safari: fullscreen API unavailable — ignore */ }
}

if (MOBILE_FULL) setupMobileFull();

async function boot() {
  // net.bootstrap shows the login/register UI and only resolves once a server
  // session exists (the world sim lives on the server — no offline play)
  const save = await net.bootstrap();
  initGame(save);
  buildMinimapBase();
  initUI();
  booted = true;

  const nameInput = document.getElementById('name-input') as HTMLInputElement | null;
  if (nameInput) {
    nameInput.value = state.player.name === 'Adventurer' ? '' : state.player.name;
    if (net.online && net.username) {
      state.player.name = net.username;
      nameInput.value = net.username;
      nameInput.disabled = true;
    }
  }

  document.getElementById('play-btn')!.addEventListener('click', () => {
    void (async () => {
      await maybeShowPatchNotes();
      const entered = nameInput?.value.trim();
      if (entered && !net.online) state.player.name = entered.slice(0, 12);
      const nameEl = document.getElementById('chat-name');
      if (nameEl) nameEl.textContent = state.player.name + ':';
      document.getElementById('welcome-screen')!.style.display = 'none';
      state.started = true;
      audio.init();
      const want = trackForRegion(state.player.x, state.player.y);
      const t = TRACKS.find((t) => t.name === want) ?? TRACKS[0];
      audio.unlocked.add(t.name);
      audio.play(t);
      lastRegionTrack = t.name;
      saveGame();
    })();
  });
}
boot();

window.addEventListener('beforeunload', () => { if (state.started) saveGame(); });

// game tick loop
setInterval(() => {
  if (!booted || !state.started) return;
  gameTick();
  markTick();

  const want = trackForRegion(state.player.x, state.player.y);
  if (want !== lastRegionTrack && audio.unlocked.has(want)) {
    lastRegionTrack = want;
    const t = TRACKS.find((t) => t.name === want);
    if (t && audio.current) audio.play(t);
  }
}, TICK_MS);

// render loop
function frame() {
  if (booted && state.started) {
    render();
    renderMinimap();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug/testing handle
import('./world').then((world) => {
  import('./game').then((game) => {
    (window as any).__bs = { state, world, game, net };
  });
});
