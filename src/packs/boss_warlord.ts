// Boss pack: Goblin Warlord — fort arena boss with a telegraphed slam attack.
// The slam mechanic runs server-side (server/bosses.ts); this pack renders the
// fx events and flavor dialogue. Spawn lives in data/spawns.json.
import {
  msg, registerNpcAction, registerFx, registerDamageModifier, startDialogue,
  Npc,
} from '../game';

// ---------------- Slam fx (server events) ----------------
registerFx('warlord_telegraph', () => msg('The warlord raises his blade...'));
registerFx('warlord_miss', () => msg('The warlord\'s blade slams into empty earth.'));
registerDamageModifier('warlord_slam', (dmg) => {
  msg('The warlord\'s blade crashes down on you!');
  return dmg;
});

// ---------------- Look-at flavor ----------------
registerNpcAction('goblin_warlord', 'Look-at', (_n: Npc) => {
  startDialogue([
    { speaker: '', text: 'A hulking goblin in scavenged plate, a tattered war banner lashed to his back. Notches on his blade mark every fool who reached the arena.' },
    { speaker: 'Goblin Warlord', text: 'Grakk Splitjaw breaks armies, little soft-skin. You? You is barely a snack.' },
    { speaker: 'Goblin Warlord', text: 'Come closer. My blade is hungry, and the fort needs new decorations.' },
  ]);
  return 'done';
});

export {};
