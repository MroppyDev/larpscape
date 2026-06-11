// Hedonism Patch + Pride update — party lounge west, rainbow parade east.
// District: x54-68 / y38-44, just east of the river near the starter town.
import {
  registerNpcAction, registerObjectAction,
  startDialogue, showOptions, msg, state, events, openShop, level,
} from '../game';

registerNpcAction('party_host', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Welcome to the Hedonism Patch! Shoes optional, regrets delayed.' },
    { speaker: n.def.name, text: 'Dance on the floor, soak in the tub, grab a drink at Fizz\'s bar.' },
    { speaker: state.player.name, text: 'And the rainbow banners east of here?' },
    { speaker: n.def.name, text: 'That\'s Pride Avenue — Marshal Riley runs the stall, Sashabella owns the stage.' },
    { speaker: n.def.name, text: 'Oh, and PvP is on everywhere now. Try not to start a brawl during the conga line.' },
    { speaker: n.def.name, text: 'The line\'s been unbroken since F.S. 739, you know. Technically the same conga. Shifts change. Legends don\'t.' },
  ]);
  return 'done';
});

registerNpcAction('bartender_fizz', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Thirsty? I pour courage in a glass and call it a cocktail.' },
    { speaker: n.def.name, text: 'Trade at the bar for sparkling cocktails — they heal a little, hurt your dignity a lot.' },
  ], () => {
    showOptions([
      { label: 'What\'s the best drink you\'ve ever made?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Second best, you mean. The best was my mentor\'s — one recipe she never wrote down anywhere but her own book, and she took that book to sea.' },
          { speaker: n.def.name, text: 'Ship never came back. If some salt-crusted wretch out west is hoarding a recipe book they can\'t even read, I swear on every bottle behind this bar...' },
          { speaker: state.player.name, text: 'And the second best?' },
          { speaker: n.def.name, text: 'You\'re drinking it. Now stop making me sentimental, it curdles the citrus.' },
        ]);
      }},
      { label: 'Just a cocktail, thanks.', fn: () => {
        openShop('hedon_lounge');
      }},
    ]);
  });
  return 'done';
});
registerNpcAction('bartender_fizz', 'Trade', () => { openShop('hedon_lounge'); return 'done'; });

registerNpcAction('pride_marshal', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Happy Pride! Everyone\'s welcome on Rainbow Avenue — especially you.' },
    { speaker: n.def.name, text: 'Grab a rainbow scarf from my stall if you want to wear the colours loud.' },
    { speaker: state.player.name, text: 'Beautiful district.' },
    { speaker: n.def.name, text: 'We built it so the whole world could see we\'re still here, still fabulous.' },
  ], () => {
    showOptions([
      { label: 'When was the Avenue built?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'F.S. 735. Veterans, refugees, anyone the Discord Wars had told to be quieter — we raised it together, east of the river, and held the first parade that same year.' },
          { speaker: n.def.name, text: 'I said those words at the ribbon, and I\'ll keep saying them: still here, still fabulous.' },
        ]);
      }},
      { label: 'Is it true the Offnote can\'t touch this place?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Not one discord-mote ever recorded on that dance floor. The scholars argue about why — the joy, the glitter, Sashabella\'s encores.' },
          { speaker: n.def.name, text: 'My theory? The Offnote is a mistake that wants to be repeated. Nothing on this avenue ever wanted to be anything but itself.' },
        ]);
      }},
    ]);
  });
  return 'done';
});
registerNpcAction('pride_marshal', 'Trade', () => { openShop('pride_stall'); return 'done'; });

registerNpcAction('drag_icon', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Darling! The stage is mine, the spotlight is negotiable, the drama is complimentary.' },
    { speaker: state.player.name, text: 'You\'re incredible.' },
    { speaker: n.def.name, text: 'I know. Now go make a wish at the fountain — the universe loves a confident ask.' },
  ], () => {
    showOptions([
      { label: 'They say your encores keep the Offnote away.', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'The Stillwater Circle says that. They send little observers in sensible cloaks to take notes during my finale. I send them home with glitter.' },
          { speaker: state.player.name, text: 'Is it true, though?' },
          { speaker: n.def.name, text: 'Darling, I sang in a choir once, a very quiet one, a long time ago. Whether the world stays in tune because of my voice or my eyeliner is between me and the Choir of Five.' },
          { speaker: n.def.name, text: 'Personally I back the eyeliner. It could cut steel.' },
        ]);
      }},
      { label: 'Any advice for an adventurer?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'The same advice I give every opening act: the world was sung, sweetheart, so make sure your verse is worth humming back.' },
          { speaker: n.def.name, text: 'The Choir does that for your kind, you know. Hums you back. Try to be worth the breath.' },
        ]);
      }},
    ]);
  });
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
