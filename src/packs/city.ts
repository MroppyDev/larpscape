// Aldgate city life pack — spawns, ambient dialogue, and the two city shops.
// City district (SPEC): x76-130 / y8-56, west gate at y37-39, plaza near the
// centre (~x100-106, y28-34). Exact tiles below are plausible open-street picks;
// the architect reconciles any collisions with world.ts at integration.
import {
  registerNpcSpawn, registerNpcAction, registerObjectAction,
  startDialogue, msg, state, events, openShop, level,
} from '../game';
import { NPCS } from '../defs';

// ---------------- New NPC definitions owned by this pack ----------------
// (gear agent defines city_guard / ge_clerk / innkeeper; these two are ours)

NPCS['armourer'] = {
  id: 'armourer', name: 'Hetta the Armourer', examine: 'Arms folded, like everything she sells.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#7a8694', size: 1, attackable: false, drops: [],
};

NPCS['grocer'] = {
  id: 'grocer', name: 'Pim the Grocer', examine: 'Smells faintly of fresh bread and ambition.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#a8854f', size: 1, attackable: false, drops: [],
};

// ---------------- Spawns ----------------

// City guards: two by the west gate, two patrol-posted on the main streets.
registerNpcSpawn('city_guard', 79, 37);   // gate, north side
registerNpcSpawn('city_guard', 79, 39);   // gate, south side
registerNpcSpawn('city_guard', 94, 30);   // street NW of plaza
registerNpcSpawn('city_guard', 112, 41);  // street SE of plaza

// Grand Exchange clerks on the plaza, near the booths.
registerNpcSpawn('ge_clerk', 101, 30);
registerNpcSpawn('ge_clerk', 105, 30);

// Banker on the plaza by the bank booths.
registerNpcSpawn('banker', 103, 27);

// Innkeeper inside an inn building (NW city block, ~x86-92 / y20-25).
// Spawn ONLY — the quest pack owns all innkeeper dialogue/actions.
registerNpcSpawn('innkeeper', 89, 22);

// Townsfolk on the streets.
registerNpcSpawn('man', 97, 36);
registerNpcSpawn('man', 109, 34);

// Shopkeepers inside their buildings: armoury (NE block) and food shop (SE block).
registerNpcSpawn('armourer', 116, 23);
registerNpcSpawn('grocer', 116, 44);

// ---------------- Actions ----------------

registerNpcAction('armourer', 'Trade', () => { openShop('aldgate_armoury'); return 'done'; });
registerNpcAction('armourer', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Steel plate, fitted while you wait. Mithril if your purse can take the dent.' },
    { speaker: state.player.name, text: 'Do you do refunds?' },
    { speaker: n.def.name, text: 'I do a short laugh and then I don\'t.' },
  ]);
  return 'done';
});

registerNpcAction('grocer', 'Trade', () => { openShop('aldgate_food'); return 'done'; });
registerNpcAction('grocer', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Bread, cake, good honest meat. Nothing in this shop will bite you back.' },
    { speaker: n.def.name, text: 'Which in Aldgate is a stronger guarantee than you\'d think.' },
  ]);
  return 'done';
});

// GE clerks point you at the booths; the booths themselves handle Exchange (ge.ts).
registerNpcAction('ge_clerk', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Welcome to the Aldgate Exchange. Buyers, sellers, and the occasional optimist.' },
    { speaker: n.def.name, text: 'Step up to any of the gilded booths on the plaza to place an offer.' },
  ]);
  return 'done';
});

// City guards: directions flavour.
registerNpcAction('city_guard', 'Talk-to', (n) => {
  startDialogue([
    { speaker: state.player.name, text: 'Excuse me — which way to everything?' },
    { speaker: n.def.name, text: 'Plaza\'s at the centre: exchange booths, bank, the fountain folk keep drinking out of.' },
    { speaker: n.def.name, text: 'Inn\'s up the northwest lane, armoury northeast, food shop southeast. West gate takes you back to the old road.' },
    { speaker: n.def.name, text: 'And keep clear of the fort east of here, unless you fancy goblins with ambition.' },
  ]);
  return 'done';
});

// Fountain ambience: a questionable drink that heals 1.
registerObjectAction('fountain', 'Drink', () => {
  const p = state.player;
  const maxHp = level('Hitpoints');
  msg('You scoop up a mouthful of fountain water. Cold, coppery, strangely invigorating.');
  if (p.curHp < maxHp) {
    p.curHp = Math.min(maxHp, p.curHp + 1);
    events.onStatsChange();
  }
  return 'done';
});

export {};
