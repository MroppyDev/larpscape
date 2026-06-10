// Starter-town south updates: LARP Pride field, Chimperton III court, Dentist Tick Eat clinic.
// Districts: x12-20 / x22-30 / x34-42 at y54-57, just south of the castle & general store.
import {
  registerNpcAction, registerObjectAction,
  startDialogue, msg, state, events, openShop, level,
} from '../game';

// ── Black Monkey LARP Pride update ──────────────────────────────────────────

registerNpcAction('larp_marshal_monk', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Hail, adventurer! Welcome to the Black Monkey LARP Pride update — patch notes are carved on the sign.' },
    { speaker: n.def.name, text: 'Foam swords only. Real steel is for the goblin field east of here.' },
    { speaker: state.player.name, text: 'The banners are magnificent.' },
    { speaker: n.def.name, text: 'We LARP loud and proud. Grab gear from the quartermaster if your cape lacks drama.' },
  ]);
  return 'done';
});

registerNpcAction('larp_quartermaster', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Need a foam blade or a cape that screams "I rolled a natural 20 on fabulous"?' },
    { speaker: n.def.name, text: 'Trade at the rack — all proceeds fund more monkey totems.' },
  ]);
  return 'done';
});
registerNpcAction('larp_quartermaster', 'Trade', () => { openShop('larp_pride_stall'); return 'done'; });

registerObjectAction('foam_weapon_rack', 'Trade', () => { openShop('larp_pride_stall'); return 'done'; });

registerObjectAction('larp_campfire', 'LARP', () => {
  msg('You strike a heroic pose by the campfire. A passing chimp NPC applauds.');
  return 'done';
});

registerObjectAction('larp_pride_sign', 'Read', () => {
  msg('BLACK MONKEY LARP PRIDE UPDATE — v1.0. Foam combat enabled. Pride flags mandatory. Shoes still optional.');
  return 'done';
});

// ── Danquavious Chimperton III update ───────────────────────────────────────

registerNpcAction('danquavious_chimperton', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Behold — Danquavious Chimperton the Third, Sovereign of Bananas, Duke of the Southern Lawn.' },
    { speaker: n.def.name, text: 'I do not merely rule. I *chimp*. Bow, or at least nod respectfully.' },
    { speaker: state.player.name, text: 'Your majesty.' },
    { speaker: n.def.name, text: 'The herald sells medallions. Wear one and strangers will pretend they know who you are.' },
  ]);
  return 'done';
});

registerNpcAction('chimperton_herald', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Make way for Danquavious Chimperton III! Long may he reign from yonder throne.' },
    { speaker: n.def.name, text: 'Curios and commemorative medallions — all officially unofficial.' },
  ]);
  return 'done';
});
registerNpcAction('chimperton_herald', 'Trade', () => { openShop('chimperton_curios'); return 'done'; });

registerObjectAction('chimperton_throne', 'Pay-respects', () => {
  msg('You bow before the gilded throne. Danquavious Chimperton III nods as if he noticed.');
  return 'done';
});

registerObjectAction('chimperton_plaque', 'Read', () => {
  msg('DANQUAVIOUS CHIMPERTON III UPDATE — erected in honour of the only monarch to win both a joust and a banana-eating contest.');
  return 'done';
});

registerObjectAction('golden_banana_pedestal', 'Admire', () => {
  msg('A golden banana gleams under glass. It has never been peeled. Legend says it never will be.');
  return 'done';
});

// ── Dentist Tick Eat update ─────────────────────────────────────────────────

registerNpcAction('dentist_dr_tick', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Welcome to the Dentist Tick Eat clinic. We remove ticks and, controversially, sometimes eat them.' },
    { speaker: n.def.name, text: 'Sit in the chair for a check-up. Glen by the aquarium handles the... tasting menu.' },
    { speaker: state.player.name, text: 'That sounds unhygienic.' },
    { speaker: n.def.name, text: 'It\'s artisanal. Browse supplies if you want tick jerky to go — no questions asked.' },
  ]);
  return 'done';
});
registerNpcAction('dentist_dr_tick', 'Trade', () => { openShop('tick_eat_bar'); return 'done'; });

registerNpcAction('tick_eater_glen', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'They call me Glen the Tick Eater. I call it farm-to-mouth protein.' },
    { speaker: n.def.name, text: 'The aquarium ticks are fed organic blood. Very ethical, if you don\'t think about it.' },
  ]);
  return 'done';
});

registerNpcAction('tick_eater_glen', 'Eat-tick', () => {
  const p = state.player;
  const maxHp = level('Hitpoints');
  if (Math.random() < 0.4) {
    msg('Glen offers you a tick on a tiny cracker. You eat it. Your soul files a complaint.');
    if (p.curHp < maxHp) {
      p.curHp = Math.min(maxHp, p.curHp + 1);
      events.onStatsChange();
      msg('Oddly, you feel a little stronger. Protein? Placebo? Who can say.');
    }
  } else {
    msg('Glen eats the tick himself and gives you a thumbs-up. No thank-you required.');
  }
  return 'done';
});

registerObjectAction('dentist_chair', 'Get-checked', () => {
  const p = state.player;
  const maxHp = level('Hitpoints');
  msg('Dr. Ticksworth leans in with a mirror and a tiny pick. "Say aaah."');
  if (p.curHp < maxHp && Math.random() < 0.35) {
    p.curHp = Math.min(maxHp, p.curHp + 2);
    events.onStatsChange();
    msg('Your teeth sparkle. You feel slightly better.');
  } else {
    msg('No cavities today. The tick in the aquarium waves a leg at you.');
  }
  return 'done';
});

registerObjectAction('tick_aquarium', 'Sample', () => {
  msg('You peer at ticks swimming in formaldehyde-styled brine. Glen winks through the glass.');
  return 'done';
});

export {};
