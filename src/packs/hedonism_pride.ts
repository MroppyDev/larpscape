// Hedonism Patch + Pride update — party lounge west, rainbow parade east.
// District: x54-68 / y38-44, just east of the river near the starter town.
import {
  registerNpcAction, registerObjectAction,
  startDialogue, msg, state, events, openShop, level,
} from '../game';

registerNpcAction('party_host', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Welcome to the Hedonism Patch! Shoes optional, regrets delayed.' },
    { speaker: n.def.name, text: 'Dance on the floor, soak in the tub, grab a drink at Fizz\'s bar.' },
    { speaker: state.player.name, text: 'And the rainbow banners east of here?' },
    { speaker: n.def.name, text: 'That\'s Pride Avenue — Marshal Riley runs the stall, Sashabella owns the stage.' },
    { speaker: n.def.name, text: 'Oh, and PvP is on everywhere now. Try not to start a brawl during the conga line.' },
  ]);
  return 'done';
});

registerNpcAction('bartender_fizz', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Thirsty? I pour courage in a glass and call it a cocktail.' },
    { speaker: n.def.name, text: 'Trade at the bar for sparkling cocktails — they heal a little, hurt your dignity a lot.' },
  ]);
  return 'done';
});
registerNpcAction('bartender_fizz', 'Trade', () => { openShop('hedon_lounge'); return 'done'; });

registerNpcAction('pride_marshal', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Happy Pride! Everyone\'s welcome on Rainbow Avenue — especially you.' },
    { speaker: n.def.name, text: 'Grab a rainbow scarf from my stall if you want to wear the colours loud.' },
    { speaker: state.player.name, text: 'Beautiful district.' },
    { speaker: n.def.name, text: 'We built it so the whole world could see we\'re still here, still fabulous.' },
  ]);
  return 'done';
});
registerNpcAction('pride_marshal', 'Trade', () => { openShop('pride_stall'); return 'done'; });

registerNpcAction('drag_icon', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Darling! The stage is mine, the spotlight is negotiable, the drama is complimentary.' },
    { speaker: state.player.name, text: 'You\'re incredible.' },
    { speaker: n.def.name, text: 'I know. Now go make a wish at the fountain — the universe loves a confident ask.' },
  ]);
  return 'done';
});

registerObjectAction('hedon_bar', 'Trade', () => { openShop('hedon_lounge'); return 'done'; });

registerObjectAction('dance_floor', 'Dance', () => {
  msg('You bust out your finest moves. The disco ball approves.');
  return 'done';
});

registerObjectAction('hot_tub', 'Relax', () => {
  const p = state.player;
  const maxHp = level('Hitpoints');
  msg('You sink into the hot tub. The bubbles judge nothing.');
  if (p.curHp < maxHp) {
    p.curHp = Math.min(maxHp, p.curHp + 2);
    events.onStatsChange();
    msg('You feel a little better.');
  }
  return 'done';
});

registerObjectAction('pride_fountain', 'Make-a-wish', () => {
  const p = state.player;
  msg('You toss a coin into the pride fountain and make a wish.');
  if (Math.random() < 0.15 && p.curHp < level('Hitpoints')) {
    p.curHp = Math.min(level('Hitpoints'), p.curHp + 1);
    events.onStatsChange();
    msg('Something sparkles back at you. You feel hopeful.');
  }
  return 'done';
});

export {};
