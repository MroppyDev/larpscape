// Sunscorch Desert life pack — spawns, nomad + gem trader shops, bandit
// pickpocketing, gem stall thieving, the fire altar, and the bandit king boss.
// Desert district (SPEC Phase 6): x6-64 / y170-218; bandit camp ~30,200
// (palisade 24-36/195-205); nomad tent 10-15/176-181; gem_stall at 17,178;
// fire_altar at 50,180. Imported for side effects via src/packs/index.ts.
import {
  state, msg, level,
  registerNpcAction, registerObjectAction, registerFx, registerDamageModifier,
  startDialogue, openShop,
  invCount, freeSlots, requestIntent,
  Npc,
} from '../game';
import { audio } from '../audio';

let stunnedUntil = 0; // cosmetic thieving stun timer (damage is server-owned via thieve intent)

// Spawns live in data/spawns.json (server-authoritative world).

// ---------------- Nomad Zahra ----------------
registerNpcAction('desert_nomad', 'Trade', (_n: Npc) => {
  openShop('nomad_supplies');
  return 'done';
});

registerNpcAction('desert_nomad', 'Talk-to', (_n: Npc) => {
  startDialogue([
    { speaker: 'Nomad Zahra', text: 'Welcome to the shade, traveller. Out here we measure wealth in two things: water you carry, and water you know where to find.' },
    { speaker: 'You', text: 'And the sand? There seems to be a lot of it.' },
    { speaker: 'Nomad Zahra', text: 'The sand is not for measuring. The sand simply arrives — in your boots, your bread, your bedroll. You learn to share.' },
    { speaker: 'Nomad Zahra', text: 'Buy a waterskin before you wander far. The dunes are patient, and they have outlasted prouder folk than you.' },
  ]);
  return 'done';
});

// ---------------- Gem trader ----------------
registerNpcAction('gem_trader', 'Trade', (_n: Npc) => {
  openShop('gem_stall');
  return 'done';
});

registerNpcAction('gem_trader', 'Talk-to', (_n: Npc) => {
  startDialogue([
    { speaker: 'Gem trader', text: 'Behold! Sapphires bluer than the oasis at dawn, rubies redder than a noon sunburn. The finest stones south of anywhere.' },
    { speaker: 'You', text: 'Where do you find them all?' },
    { speaker: 'Gem trader', text: 'Find? Ha! Gems find ME. I once sneezed and an emerald fell out of my turban. True story. Mostly true. Partly true.' },
    { speaker: 'Gem trader', text: 'And keep your fingers where I can see them. Every stone on this stall is counted twice — once by me, once by my knife.' },
  ]);
  return 'done';
});

// ---------------- Desert bandit pickpocket (server-authoritative) ----------------
registerNpcAction('desert_bandit', 'Pickpocket', (n: Npc) => {
  if (state.tick < stunnedUntil) { msg("You're still seeing stars; you can't pickpocket right now."); return 'done'; }
  const lvl = level('Thieving');
  if (lvl < 35) { msg('You need a Thieving level of 35 to pickpocket the desert bandit.'); return 'done'; }
  msg('You attempt to pick the desert bandit\'s pocket...');
  void requestIntent('thieve', { target: 'desert_bandit' }).then((echo) => {
    if (!echo.ok) return;
    if (echo.granted && echo.granted.length > 0) {
      if (echo.granted.some((g) => g.id === 'uncut_sapphire')) msg('Among the coins you find an uncut sapphire!');
      audio.sfx('thieve');
      msg('You pick the desert bandit\'s pocket.');
    } else {
      msg('You fail to pick the desert bandit\'s pocket.');
      msg(`${n.def.name}: 'Hands off, or lose them!'`);
      stunnedUntil = state.tick + 3;
    }
  });
  return 'done';
});

// ---------------- Gem stall thieving ----------------
registerObjectAction('gem_stall', 'Steal-from', (o) => {
  if (o.depletedUntil > 0) { msg('The stall has been picked over. The trader is restocking, glaring all the while.'); return 'done'; }
  if (state.tick < stunnedUntil) { msg("You're still seeing stars; you can't steal right now."); return 'done'; }
  const lvl = level('Thieving');
  if (lvl < 30) { msg('You need a Thieving level of 30 to steal from the gem stall.'); return 'done'; }
  if (freeSlots() === 0) { msg("You don't have enough inventory space."); return 'done'; }
  void requestIntent('thieve', { target: 'gem_stall', x: o.x, y: o.y }).then((echo) => {
    if (!echo.ok) return;
    if (!echo.granted || echo.granted.length === 0) {
      msg('You fumble — the trader catches your wrist and cuffs you smartly.');
      stunnedUntil = state.tick + 3;
      return;
    }
    const gem = echo.granted[0].id;
    const name = gem === 'uncut_sapphire' ? 'an uncut sapphire'
      : gem === 'uncut_emerald' ? 'an uncut emerald'
      : 'an uncut ruby';
    audio.sfx('thieve');
    msg(`You palm ${name} from the gem stall.`);
    o.depletedUntil = state.tick + 15;
  });
  return 'done';
});

// ---------------- Fire altar runecrafting ----------------
registerObjectAction('fire_altar', 'Craft-rune', () => {
  const lvl = level('Runecraft');
  if (lvl < 14) { msg('The altar\'s heat pushes you back. You need a Runecraft level of 14 to bind fire runes.'); return 'done'; }
  const n = invCount('rune_essence');
  if (n === 0) { msg('You need some rune essence to craft runes here.'); return 'done'; }
  void requestIntent('runecraft', { altar: 'fire' }).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('spell');
    msg('You bind the desert\'s shimmering heat into fire runes.');
  });
  return 'done';
});

// ---------------- Bandit king: Saif the Red Smile ----------------
// Blade flurry + call-for-help run server-side (server/bosses.ts); this pack
// renders the fx events.
registerFx('saif_telegraph', () => msg('Saif twirls his blades...'));
registerFx('saif_miss', () => msg('Saif\'s blades carve only sunlight.'));
registerFx('saif_call', () => msg('Saif whistles sharply — a desert bandit answers his king\'s call!'));

registerDamageModifier('saif_flurry', (dmg) => {
  msg('Saif\'s twin blades bite twice in a blur!');
  return dmg;
});

// ---------------- Look-at flavor ----------------
registerNpcAction('bandit_king', 'Look-at', (_n: Npc) => {
  startDialogue([
    { speaker: '', text: 'A lean man in sun-bleached red silk, a curved blade on each hip. His grin has more confidence than teeth, and twice as many scars.' },
    { speaker: 'Saif the Red Smile', text: 'Another guest! The desert sends me so few, and keeps even fewer.' },
    { speaker: 'Saif the Red Smile', text: 'Everything in these dunes pays my toll, friend. The caravans pay in gold. You? You may pay in whatever you have left.' },
  ]);
  return 'done';
});

export {};
