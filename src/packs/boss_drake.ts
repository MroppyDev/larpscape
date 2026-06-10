// Boss pack: the Shadow Drake — lurks at the far end of the great cavern.
// The fire-breath mechanic runs server-side (server/bosses.ts); any active
// prayer halves the breath damage, applied here because the server cannot see
// prayers. Spawn lives in data/spawns.json.

import {
  state, msg, registerNpcAction, registerFx, registerDamageModifier,
  startDialogue,
} from '../game';

const DRAKE_ID = 'shadow_drake';

registerFx('drake_telegraph', () => msg('The drake draws a deep breath...'));
registerFx('drake_dodge', () => msg('You scramble clear as flame scorches the stone behind you.'));

registerDamageModifier('drake_breath', (dmg) => {
  if (state.player.activePrayers.size > 0 && dmg > 0) {
    dmg = Math.floor(dmg / 2);
    msg('Your faith shields you from the worst of the flames.');
  }
  msg('The drake engulfs you in a torrent of fire!');
  return dmg;
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
