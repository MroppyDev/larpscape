// Eldermere village hub — Elder Maeryn's toll quest, the wayfarer's wares, and
// village general supplies. District: forest village near Tanglewood.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, invCount,
  registerNpcAction, startDialogue, showOptions, openShop,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';
import { questStage, advanceQuestStage, claimQuestReward } from '../quest-sync';

const TOLL = 'tanglewood_toll';
const LOGS_NEEDED = 5;

function stage(): number { return questStage(TOLL); }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

registerQuest({
  id: TOLL,
  name: 'The Tanglewood Toll',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'Elder Maeryn in Eldermere mutters about the road into Tanglewood. She might need a hand clearing it.';
    if (s === 1) {
      const have = invCount('logs');
      return have >= LOGS_NEEDED
        ? `I have ${LOGS_NEEDED} logs for the path. I should bring them to Elder Maeryn.`
        : `Elder Maeryn needs ${LOGS_NEEDED} logs to clear the Tanglewood path. I have ${have} so far.`;
    }
    return 'I helped Elder Maeryn brace the Tanglewood toll path. The village can travel again. Quest complete!';
  },
});

const MAERYN = 'Elder Maeryn';
const SORREL = 'Wayfarer Sorrel';

registerNpcAction('village_elder', 'Trade', () => { openShop('eldermere_general'); return 'done'; });

registerNpcAction('village_elder', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...say(MAERYN, 'Welcome to Eldermere, traveller. A quiet village — or it was, before the Tanglewood started swallowing the road.'),
      ...say(MAERYN, 'A fallen oak and three seasons of bramble have blocked the toll path west. Merchants won\'t risk it, and the woodcutters won\'t go near the spiders.'),
      ...me('Sounds like you need timber more than sympathy.'),
      ...say(MAERYN, `Bring me ${LOGS_NEEDED} sturdy logs and I'll have the path cleared by dusk. There's coin in it, and yew from the old grove — if you're brave enough to earn it.`),
    ], () => {
      showOptions([
        {
          label: 'I\'ll fetch your logs.',
          fn: () => {
            void advanceQuestStage(TOLL, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say(MAERYN, 'Bless you. Any honest tree will give up logs if you\'ve an axe and patience.'),
                ...say(MAERYN, 'Mind the Tanglewood edge — the spiders there grow bold when the path is quiet.'),
              ]);
            });
          },
        },
        {
          label: 'Woodcutting isn\'t my trade.',
          fn: () => {
            startDialogue(say(MAERYN, 'Then the path stays choked and the village stays poor. The offer keeps, if you change your mind.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    const have = invCount('logs');
    if (have < LOGS_NEEDED) {
      startDialogue([
        ...say(MAERYN, 'How goes the timber hunt?'),
        ...say(MAERYN, `I still need ${LOGS_NEEDED - have} more log${LOGS_NEEDED - have === 1 ? '' : 's'}. The brambles won\'t wait forever.`),
      ]);
      return 'done';
    }
    startDialogue([
      ...me(`Five logs, as you asked. Good straight grain, too.`),
      ...say(MAERYN, 'Ha! These will do nicely. Hold this end — even an elder can swing a mallet when the village depends on it.'),
      ...say(MAERYN, 'There — braced, beamed, and wide enough for a cart. The Tanglewood toll is open again!'),
    ], () => {
      // Server consumes the 5 logs on the validated 1->2 advance, then grants
      // the data-defined reward (Woodcutting xp + coins + yew logs).
      void advanceQuestStage(TOLL, 2).then((echo) => {
        if (!echo.ok) return;
        void claimQuestReward(TOLL, 2);
        msg('Congratulations! Quest complete!', 'level');
        startDialogue([
          ...say(MAERYN, 'Three hundred coins from the village purse, and two yew logs from the old grove — payment and promise alike.'),
          ...say(MAERYN, 'Walk the path with care. Tanglewood remembers every footfall.'),
        ]);
      });
    });
    return 'done';
  }
  // post-quest idle line
  startDialogue(say(MAERYN, 'The toll path holds firm. Merchants are already haggling at my door — a fine problem to have.'));
  return 'done';
});

registerNpcAction('wayfarer', 'Trade', () => { openShop('wayfarer'); return 'done'; });

registerNpcAction('wayfarer', 'Talk-to', (n) => {
  const tollDone = stage() >= 2;
  startDialogue([
    { speaker: n.def.name, text: 'Road-weary and pack-heavy — the two finest qualifications for my trade.' },
    { speaker: state.player.name, text: 'What do you carry?' },
    { speaker: n.def.name, text: 'A little of everywhere: runes from the city, seeds from Fen\'s stall, the odd gem that fell off a cart. Honest goods, mostly.' },
    { speaker: n.def.name, text: tollDone
      ? 'The Tanglewood path is open again, thanks to you and Maeryn. I\'ll be running that route before the week is out.'
      : 'Word is the toll path into Tanglewood is choked — fallen timber and bramble. Elder Maeryn\'s been asking after logs if you\'ve an axe and a steady arm.' },
    { speaker: n.def.name, text: 'Beyond the path, the wood grows dark. Spiders the size of cart wheels, they say. I sell snares, not courage.' },
    { speaker: state.player.name, text: 'I\'ll keep that in mind.' },
    { speaker: n.def.name, text: 'Do. And if you\'re buying, my pack\'s open — fair prices, and I never short the weight.' },
  ]);
  return 'done';
});

export {};
