// Boss pack: the Shadow Drake — lurks at the far end of the great cavern.
// Mechanics: fire breath every ~10 ticks while fighting at close range, with a
// one-tick telegraph. Any active prayer halves the breath damage.

import {
  state, msg, events, level, startDialogue,
  registerNpcSpawn, registerNpcAction, registerTickHook,
  Npc,
} from '../game';
import { audio } from '../audio';

const DRAKE_ID = 'shadow_drake';
const BREATH_INTERVAL = 10;   // ticks between breaths while engaged
const BREATH_MAX = 12;        // max hit, halved by faith

// Lair: far south-east end of the cavern (district x60-150 / y110-160).
registerNpcSpawn(DRAKE_ID, 140, 152);

// ---- fire breath -----------------------------------------------------------

function playerDies() {
  const p = state.player;
  if (p.dead) return;
  p.dead = true;
  p.curHp = 0;
  p.activePrayers.clear();
  msg('Oh dear, you are dead!');
  events.onStatsChange();
  window.setTimeout(() => {
    p.x = 22; p.y = 38; p.prevX = 22; p.prevY = 38;
    p.path = []; p.action = null;
    p.curHp = level('Hitpoints');
    p.dead = false;
    p.energy = 100;
    for (const n of state.npcs) if (n.target === 'player') n.target = null;
    events.onStatsChange();
  }, 2000);
}

function breatheFire(drake: Npc) {
  const p = state.player;
  let dmg = Math.floor(Math.random() * (BREATH_MAX + 1));
  if (p.activePrayers.size > 0 && dmg > 0) {
    dmg = Math.floor(dmg / 2);
    msg('Your faith shields you from the worst of the flames.');
  }
  msg('The drake engulfs you in a torrent of fire!');
  p.curHp -= dmg;
  p.hitsplat = { dmg, until: performance.now() + 900 };
  audio.sfx(dmg > 0 ? 'hit' : 'miss');
  events.onStatsChange();
  if (p.curHp <= 0) playerDies();
}

registerTickHook(() => {
  const p = state.player;
  for (const n of state.npcs) {
    if (n.def.id !== DRAKE_ID) continue;
    if (n.dead || p.dead || n.target !== 'player') { delete n.meta.breathAt; continue; }
    const dist = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
    if (dist > 2) { delete n.meta.breathAt; continue; }
    if (n.meta.breathAt === undefined) {
      n.meta.breathAt = state.tick + BREATH_INTERVAL;
      continue;
    }
    if (state.tick === n.meta.breathAt - 1) {
      msg('The drake draws a deep breath...');
    } else if (state.tick >= n.meta.breathAt) {
      // re-check range at the moment of the blast — stepping away dodges it
      const d2 = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
      if (d2 <= 2) breatheFire(n);
      else msg('You scramble clear as flame scorches the stone behind you.');
      n.meta.breathAt = state.tick + BREATH_INTERVAL;
    }
  }
});

// ---- flavor ----------------------------------------------------------------

registerNpcAction(DRAKE_ID, 'Look-at', (n) => {
  if (n.dead) return 'done';
  startDialogue([
    { speaker: '', text: 'The great drake coils in the dark, scales drinking what little light there is.' },
    { speaker: '', text: 'Beneath the plates of its chest something pulses — a deep orange glow, like a coal that refuses to die.' },
    { speaker: '', text: 'You get the distinct feeling its fire is not in its belly, but in its heart.' },
  ]);
  return 'done';
});

export {};
