// Aldgate city life pack — spawns, ambient dialogue, and the two city shops.
// City district (SPEC): x76-130 / y8-56, west gate at y37-39, plaza near the
// centre (~x100-106, y28-34). Exact tiles below are plausible open-street picks;
// the architect reconciles any collisions with world.ts at integration.
import {
  registerNpcAction, registerObjectAction,
  startDialogue, msg, state, openShop, requestIntent,
} from '../game';

// NPC definitions + spawns live in data/npcs.json and data/spawns.json
// (server-authoritative world). This pack registers actions/dialogue only.

// ---------------- Actions ----------------

registerNpcAction('armourer', 'Trade', () => { openShop('aldgate_armoury'); return 'done'; });
registerNpcAction('armourer', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Steel plate, fitted while you wait. Mithril if your purse can take the dent.' },
    { speaker: state.player.name, text: 'Do you do refunds?' },
    { speaker: n.def.name, text: 'I do a short laugh and then I don\'t.' },
    { speaker: n.def.name, text: 'Twenty years I\'ve fitted plate in this city. Twenty years I\'ve waited for one customer — ONE — who oils their armour. Aulden put the ring in good steel; the least you lot could do is keep it from rusting flat.' },
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
    { speaker: state.player.name, text: 'Ever tempted to trade yourself?' },
    { speaker: n.def.name, text: 'Concord neutrality oath: a clerk may not own what they list. I list everything. I own a stool and this quill, and the quill is leased.' },
    { speaker: n.def.name, text: 'And before you ask — no, it does not bother us that Pip\'s casino out-earns this Exchange on feast days. We have simply never once discussed it, by unanimous vote.' },
  ]);
  return 'done';
});

// City guards: directions flavour. NOTE: 'Talk-to' belongs to quest_warlord.ts
// (The Warlord's Banner start/turn-in); registering it here too shadowed the
// quest (first registration wins), so directions live on a bespoke option.
registerNpcAction('city_guard', 'Ask-directions', (n) => {
  startDialogue([
    { speaker: state.player.name, text: 'Excuse me — which way to everything?' },
    { speaker: n.def.name, text: 'Plaza\'s at the centre: exchange booths, bank, the fountain folk keep drinking out of.' },
    { speaker: n.def.name, text: 'Inn\'s up the northwest lane, armoury northeast, gun guild just north of the armoury, food shop southeast. West gate takes you back to the old road.' },
    { speaker: n.def.name, text: 'And keep clear of the fort east of here, unless you fancy goblins with ambition.' },
  ]);
  return 'done';
});

// Fountain ambience: a questionable drink that heals 1.
registerObjectAction('fountain', 'Drink', () => {
  msg('You scoop up a mouthful of fountain water. Cold, coppery, strangely invigorating.');
  void requestIntent('heal', { source: 'fountain' });
  return 'done';
});

export {};
