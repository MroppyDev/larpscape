// Quest pack 6c — two side quests:
//  'A Gem of a Problem' (gem_problem): the gem trader's best stock keeps vanishing.
//    Recover 3 uncut gems (sapphire/emerald/ruby, any mix). Reward: 700 Crafting xp,
//    700 Mining xp, a chisel, 800 coins.
//  'The Shepherd's Lost Flock' (lost_flock): the tanner's wool supply has dried up.
//    Shear and deliver 5 wool. Reward: 600 Crafting xp, 400 Farming xp, 500 coins,
//    2 balls of wool.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, addItem, removeItem, invCount, addXp,
  registerNpcAction, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

// ---------------- Quest: A Gem of a Problem ----------------

const GEMS = 'gem_problem';
const GEM_IDS = ['uncut_sapphire', 'uncut_emerald', 'uncut_ruby'] as const;
const GEMS_NEEDED = 3;

function gemStage(): number { return state.player.quests[GEMS] ?? 0; }
function setGemStage(s: number) { state.player.quests[GEMS] = s; }
function gemsHeld(): number {
  return GEM_IDS.reduce((sum, id) => sum + invCount(id), 0);
}

registerQuest({
  id: GEMS,
  name: 'A Gem of a Problem',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'The gem trader looks like someone who has been counting her stock twice and liking the answer less each time.';
    if (s === 1) {
      const held = Math.min(gemsHeld(), GEMS_NEEDED);
      return held >= GEMS_NEEDED
        ? `I have ${GEMS_NEEDED} uncut gems. I should bring them to the gem trader to replace her stolen stock.`
        : `The gem trader's finest uncut stones keep vanishing — she blames the bandits. I'm to recover ${GEMS_NEEDED} uncut gems of any kind. So far I have ${held} of ${GEMS_NEEDED}.`;
    }
    return 'I replaced the gem trader\'s stolen stock with three uncut stones. Her ledger balances again. Quest complete!';
  },
});

registerNpcAction('gem_trader', 'Ask-about-rumours', (_n: Npc) => {
  const s = gemStage();
  if (s === 0) {
    startDialogue([
      ...me('Heard any interesting rumours lately?'),
      ...say('Gem trader', 'Rumours? I AM the rumour, friend. "The gem trader who can\'t keep a gem." That\'s what they\'re saying.'),
      ...say('Gem trader', 'Every week my best uncut stones walk out of this stall without paying. Sapphires, emeralds — last week a ruby the size of a quail\'s egg.'),
      ...say('Gem trader', 'I\'d stake my loupe it\'s those bandits. Light fingers, heavy pockets, and far too fond of anything that sparkles.'),
      ...me('That\'s rough. Can I help?'),
      ...say('Gem trader', `Recover ${GEMS_NEEDED} uncut gems for me — sapphire, emerald, ruby, I\'m not fussy, any mix will do. Shake them out of the bandits or chip them from the rocks yourself.`),
      ...say('Gem trader', 'Restock my tray and I\'ll see you well rewarded. Coin, a good chisel, and a trick or two of the trade.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll get your gems back.',
          fn: () => {
            setGemStage(1);
            startDialogue([
              ...say('Gem trader', 'Splendid! Try the bandits first — half my inventory is jangling in their pockets.'),
              ...say('Gem trader', 'Or take a pick to a gem rock, if you\'ve the arm for it. An uncut stone is an uncut stone.'),
            ]);
          },
        },
        {
          label: 'Sounds like a problem for the guards.',
          fn: () => {
            startDialogue(say('Gem trader', 'The guards! Ha. They couldn\'t find a ruby in a bowl of cherries.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    const held = gemsHeld();
    if (held < GEMS_NEEDED) {
      startDialogue([
        ...say('Gem trader', 'Any sparkle for me yet?'),
        ...say('Gem trader', `By my count you\'re carrying ${held} uncut stone${held === 1 ? '' : 's'}. I need ${GEMS_NEEDED - held} more.`),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('Three uncut gems, as promised.'),
      ...say('Gem trader', 'Oh, lovely. LOVELY. Look at the colour on this one — the bandits never knew what they had.'),
      ...say('Gem trader', 'My tray gleams again and my ledger balances. You, friend, are good for business.'),
    ], () => {
      // Consume any 3 uncut gems, counted across all three kinds.
      let toRemove = GEMS_NEEDED;
      for (const id of GEM_IDS) {
        while (toRemove > 0 && invCount(id) > 0) {
          removeItem(id, 1);
          toRemove--;
        }
      }
      setGemStage(2);
      addXp('Crafting', 700);
      addXp('Mining', 700);
      addItem('chisel', 1);
      addItem('coins', 800);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say('Gem trader', 'Coin, as agreed — and take this chisel. A steady hand can coax a fortune out of a rough stone.'),
        ...say('Gem trader', 'And if you ever find that quail\'s-egg ruby... my door is always open. My prices, slightly less so.'),
      ]);
    });
    return 'done';
  }
  // post-quest idle chatter
  startDialogue(say('Gem trader', 'Stock\'s been safe ever since word got round about you. Apparently bandits CAN learn.'));
  return 'done';
});

// ---------------- Quest: The Shepherd's Lost Flock ----------------

const FLOCK = 'lost_flock';
const WOOL_NEEDED = 5;

function flockStage(): number { return state.player.quests[FLOCK] ?? 0; }
function setFlockStage(s: number) { state.player.quests[FLOCK] = s; }

registerQuest({
  id: FLOCK,
  name: 'The Shepherd\'s Lost Flock',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'The tanner keeps glancing at his empty wool shelf and sighing. Something is amiss with his supplier.';
    if (s === 1) {
      const held = Math.min(invCount('wool'), WOOL_NEEDED);
      return held >= WOOL_NEEDED
        ? `I have all ${WOOL_NEEDED} loads of wool. Time to deliver them to the tanner.`
        : `A panicked shepherd has sold the tanner nothing for weeks. I'm to shear ${WOOL_NEEDED} loads of wool and deliver them. So far I have ${held} of ${WOOL_NEEDED}.`;
    }
    return 'I delivered five loads of wool to the tanner. His shelf is full and the shepherd\'s reputation is saved. Quest complete!';
  },
});

registerNpcAction('tanner', 'Ask-about-wool', (_n: Npc) => {
  const s = flockStage();
  if (s === 0) {
    startDialogue([
      ...me('Do you deal in wool as well as hides?'),
      ...say('Tanner', 'I would, if I had any! Old Fenwick the shepherd hasn\'t sold me a single load in weeks.'),
      ...say('Tanner', 'Came by in a terrible state — says half his flock bolted in a storm and the other half won\'t stand still for the shears.'),
      ...say('Tanner', 'Meanwhile my wool shelf sits empty and my customers ask questions I can\'t answer.'),
      ...me('Maybe I could shear some sheep for you?'),
      ...say('Tanner', `Would you? Bring me ${WOOL_NEEDED} good loads of wool and I\'ll pay fair coin — better than fair. The sheep in the paddock won\'t mind a stranger, they\'re used to worse.`),
    ], () => {
      showOptions([
        {
          label: 'Consider it done. Five loads of wool.',
          fn: () => {
            setFlockStage(1);
            startDialogue([
              ...say('Tanner', 'You\'re a friend to tanners everywhere. Just grab a sheep, hold steady, and shear — they grow it back faster than you\'d think.'),
            ]);
          },
        },
        {
          label: 'I don\'t fancy wrestling sheep today.',
          fn: () => {
            startDialogue(say('Tanner', 'Can\'t blame you. They look soft, but they kick like little furry mules.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    const held = invCount('wool');
    if (held < WOOL_NEEDED) {
      startDialogue([
        ...say('Tanner', 'How goes the shearing?'),
        ...say('Tanner', `That\'s ${held} load${held === 1 ? '' : 's'} you\'ve got there — I need ${WOOL_NEEDED - held} more before the shelf looks respectable.`),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('Five loads of wool, fresh off the sheep.'),
      ...say('Tanner', 'Look at that — thick, clean, barely any grass in it. Fenwick himself never sheared better.'),
      ...say('Tanner', 'The shelf is full, the customers are happy, and I owe you, stranger.'),
    ], () => {
      removeItem('wool', WOOL_NEEDED);
      setFlockStage(2);
      addXp('Crafting', 600);
      addXp('Farming', 400);
      addItem('coins', 500);
      addItem('ball_of_wool', 2);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say('Tanner', 'Here\'s your coin, and a couple of balls of wool I spun while we talked. Idle hands, you know.'),
        ...say('Tanner', 'And when Fenwick rounds up his flock, I\'ll tell him a stranger kept his name good. He\'ll be glad of it.'),
      ]);
    });
    return 'done';
  }
  // post-quest idle chatter
  startDialogue(say('Tanner', 'Fenwick found his flock, by the way — three fields over, eating someone else\'s turnips. All\'s well that ends woolly.'));
  return 'done';
});
