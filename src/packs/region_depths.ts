// Region pack: Ashen Depths — Korr the Molten flavor; lava + eruption are server-authoritative.
import {
  msg, registerNpcAction, registerFx, startDialogue, Npc,
} from '../game';

registerFx('korr_telegraph', () => {
  msg('The ground begins to boil...');
});

registerFx('korr_eruption_dodge', () => {
  msg('Magma erupts where you were standing!');
});

registerFx('korr_enrage', () => {
  msg('Korr roars, and his cracked hide blazes white-hot!');
});

registerFx('korr_eruption', () => {
  msg('The ground erupts beneath your feet!');
});

registerFx('korr_lash', () => {
  msg('Korr lashes out in molten fury!');
});

registerNpcAction('magma_fiend', 'Look-at', (_n: Npc) => {
  startDialogue([
    { speaker: '', text: 'A mountain of cooling slag in the rough shape of a giant, seams of liquid fire glowing between the plates. The air around him shivers with heat.' },
    { speaker: 'Korr the Molten', text: 'You walk on my roof, little spark. Everything down here was fire once. Everything will be again.' },
    { speaker: 'Korr the Molten', text: 'Stand still. The ground remembers how to swallow.' },
  ]);
  return 'done';
});

export {};
