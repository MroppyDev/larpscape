// Starter-town south: Chimperton III court, Dentist Tick Eat clinic.
// Districts: x22-30 / x34-42 at y54-57, just south of the castle & general store.
import {
  registerNpcAction, registerObjectAction,
  startDialogue, showOptions, msg, state, events, openShop, level,
} from '../game';

// ── Danquavious Chimperton III update ───────────────────────────────────────

registerNpcAction('danquavious_chimperton', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Behold — Danquavious Chimperton the Third, Sovereign of Bananas, Duke of the Southern Lawn.' },
    { speaker: n.def.name, text: 'I do not merely rule. I *chimp*. Bow, or at least nod respectfully.' },
    { speaker: state.player.name, text: 'Your majesty.' },
    { speaker: n.def.name, text: 'The herald sells medallions. Wear one and strangers will pretend they know who you are.' },
  ], () => {
    showOptions([
      { label: 'How does a chimp hold a duchy, legally?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'The Will of F.S. 703. Duke Reginald the Odd, childless and beloved, left the entire Southern Lawn to his dearest companion. The courts read it four times looking for a loophole.' },
          { speaker: n.def.name, text: 'There is no loophole. Reginald was odd, not careless. His human cousins still file an appeal every year. Every year, we serve them banana bread at the hearing. They never finish it.' },
        ]);
      }},
      { label: 'Ask about the golden banana.', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'It was Reginald\'s last gift to my grandsire. It has never been peeled, and while I draw breath, it never shall be.' },
          { speaker: state.player.name, text: 'What\'s inside it?' },
          { speaker: n.def.name, text: 'That is precisely the point, adventurer. Some songs are best left one note short of the cadence. Now admire it and move along.' },
        ]);
      }},
      { label: 'Ask about the First and Second.', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: '...' },
          { speaker: n.def.name, text: 'The herald will see you out.' },
        ]);
      }},
    ]);
  });
  return 'done';
});

registerNpcAction('chimperton_herald', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Make way for Danquavious Chimperton III! Long may he reign from yonder throne.' },
    { speaker: n.def.name, text: 'Curios and commemorative medallions — all officially unofficial.' },
    { speaker: state.player.name, text: 'You announce him very loudly.' },
    { speaker: n.def.name, text: 'Volume is the job. Twelve years of gesture-protocol, a court fluent in three kinds of hooting, and not once — not once — has anyone announced ME.' },
    { speaker: n.def.name, text: '...Sorry. Medallions. Lovely medallions. Smell faintly of banana, guaranteed.' },
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
  ], () => {
    showOptions([
      { label: 'Why eat the ticks at all?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Science, adventurer. Since the Deep Bog stirred in F.S. 740, the ticks coming north carry discord-motes — little slivers of the Offnote. Left alone, they spread the world\'s sour note.' },
          { speaker: n.def.name, text: 'Properly prepared and consumed, the mote is neutralized by stomach acid and, I theorize, spite. I founded this clinic in 741 on that discovery. It is, technically, public health.' },
          { speaker: state.player.name, text: 'Have YOU ever eaten one?' },
          { speaker: n.def.name, text: '...I am the supervising clinician. Glen handles the tasting menu. Next question.' },
        ]);
      }},
      { label: 'Why the dentistry, then?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Respectability. Aldgate\'s academies won\'t cite "the tick-eating man," but nobody argues with a dentist. Also, you would be amazed what bog ticks do to enamel.' },
          { speaker: n.def.name, text: 'One day the journals will recognize this work. Until then: sit in the chair, say aaah, and tell your friends we\'re artisanal.' },
        ]);
      }},
    ]);
  });
  return 'done';
});
registerNpcAction('dentist_dr_tick', 'Trade', () => { openShop('tick_eat_bar'); return 'done'; });

registerNpcAction('tick_eater_glen', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'They call me Glen the Tick Eater. I call it farm-to-mouth protein.' },
    { speaker: n.def.name, text: 'The aquarium ticks are fed organic blood. Very ethical, if you don\'t think about it.' },
  ], () => {
    showOptions([
      { label: 'Doesn\'t the Offnote... do anything to you?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Doc says I\'ve eaten more of the Offnote, gram for gram, than any mortal in history. The herbalist folk — Stillwater lot — keep a file on me. Thick one. They send someone every season to check if I\'ve gone sour.' },
          { speaker: state.player.name, text: 'And have you?' },
          { speaker: n.def.name, text: 'Feel great. Bit smug, maybe. The world\'s biggest mistake versus Glen\'s stomach, and Glen\'s stomach is undefeated.' },
        ]);
      }},
      { label: 'What do they actually taste like?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Bog ones? Earthy. Mote-y ones have a little fizz on the back end, like the world hiccupping. Pairs well with the fluoride ration.' },
          { speaker: n.def.name, text: 'My one complaint, and I\'ve raised it with the Doc formally: the crackers are too small. A man doing public health deserves a bigger cracker.' },
        ]);
      }},
    ]);
  });
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
