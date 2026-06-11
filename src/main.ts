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
import { render, renderMinimap, buildMinimapBase, markTick, setViewportScale } from './render';
import { audio, TRACKS, trackForRegion } from './audio';
import { TICK_MS } from './defs';

// Start downloading the SoundFont immediately; warm the synth on first click so
// it's ready by the time the player hits "Click here to play".
document.addEventListener('pointerdown', () => audio.warmUp(), { once: true });

let lastRegionTrack = '';
let booted = false;

// Mobile/touch detection: coarse pointer or touch points. Adds body.mobile
// (bigger touch targets via CSS) and lets the client scale BELOW 1x so the
// whole 765x503 layout fits a phone screen.
export const IS_MOBILE =
  (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
  (navigator.maxTouchPoints ?? 0) > 1 ||
  new URLSearchParams(location.search).has('mobile'); // manual override / testing
if (IS_MOBILE) document.body.classList.add('mobile');

// Scaled fixed mode: keep the authentic 765×503 layout but scale it to fill
// the window (like RuneLite's scaled fixed mode). The 3D viewport re-renders
// at the scaled resolution so it stays sharp instead of blurring up.
function applyScale() {
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
if (IS_MOBILE) {
  const hint = document.createElement('div');
  hint.id = 'rotate-hint';
  hint.innerHTML = '<div>↻</div><p>Rotate your device to landscape<br/>for the best experience.</p>';
  document.body.appendChild(hint);

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
}
window.addEventListener('resize', applyScale);
window.addEventListener('orientationchange', () => setTimeout(applyScale, 250));
applyScale();

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
