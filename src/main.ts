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

// Scaled fixed mode: keep the authentic 765×503 layout but scale it to fill
// the window (like RuneLite's scaled fixed mode). The 3D viewport re-renders
// at the scaled resolution so it stays sharp instead of blurring up.
function applyScale() {
  const frame = document.getElementById('frame');
  if (!frame) return;
  const s = Math.max(1, Math.min((window.innerWidth - 24) / 785, (window.innerHeight - 24) / 523, 2.6));
  frame.style.transform = s > 1.02 ? `scale(${s.toFixed(3)})` : '';
  setViewportScale(s);
}
window.addEventListener('resize', applyScale);
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
