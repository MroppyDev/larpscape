// Stonewatch outpost hub — Trapper Hode's fur trade and the watch's supply quest.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, addItem, removeItem, invCount, addXp,
  registerNpcAction, startDialogue, showOptions, openShop,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

const FURS = 'furs_for_watch';
const FUR_NEEDED = 3;

function stage(): number { return state.player.quests[FURS] ?? 0; }
function setStage(s: number) { state.player.quests[FURS] = s; }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

registerQuest({
  id: FURS,
  name: 'Furs for the Watch',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'Trapper Hode at Stonewatch outpost smells of woodsmoke and pelts. He might have work for a hunter.';
    if (s === 1) {
      const have = invCount('bear_fur');
      return have >= FUR_NEEDED
        ? `I have ${FUR_NEEDED} bear furs for the watch. I should take them to Trapper Hode.`
        : `Hode needs ${FUR_NEEDED} bear furs to line the watch cloaks. I have ${have} so far.`;
    }
    return 'I supplied the Stonewatch with bear furs and the outpost sleeps warmer tonight. Quest complete!';
  },
});

const HODE = 'Trapper Hode';

registerNpcAction('trapper', 'Trade', () => { openShop('stonewatch_trapper'); return 'done'; });

registerNpcAction('trapper', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...say(HODE, '*Hode stirs a campfire with the toe of his boot.* Cold season\'s coming, and the watch is shivering in thin cloaks.'),
      ...say(HODE, 'Bears roam the forest north of here — big ones, with pelts thick enough to turn a blade.'),
      ...me('You want me to hunt them?'),
      ...say(HODE, `Bring me ${FUR_NEEDED} bear furs and I'll pay well. The watch needs lining, and I need coin to keep buying.`),
    ], () => {
      showOptions([
        {
          label: 'I\'ll bring you the furs.',
          fn: () => {
            setStage(1);
            startDialogue([
              ...say(HODE, 'Good. Track north into the trees — bears favour the shaded hollows.'),
              ...say(HODE, 'Bring the pelts whole. Torn fur\'s no good to a cloak-maker.'),
            ]);
          },
        },
        {
          label: 'Hunting bears isn\'t my business.',
          fn: () => {
            startDialogue(say(HODE, 'Fair enough. The watch will just keep freezing, then. Offer stands if you reconsider.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    const have = invCount('bear_fur');
    if (have < FUR_NEEDED) {
      startDialogue([
        ...say(HODE, 'How goes the bear business?'),
        ...say(HODE, `Still short ${FUR_NEEDED - have} fur${FUR_NEEDED - have === 1 ? '' : 's'}. The watch won\'t wait out winter on good intentions.`),
      ]);
      return 'done';
    }
    startDialogue([
      ...me(`Three bear furs, whole and untorn.`),
      ...say(HODE, '*Hode runs a thumb along the nap and nods.* Prime pelts. The watch\'ll sleep warmer tonight.'),
      ...say(HODE, 'Here\'s your pay — and my thanks. Stonewatch remembers who keeps the cold at bay.'),
    ], () => {
      removeItem('bear_fur', FUR_NEEDED);
      setStage(2);
      addXp('Hunter', 600);
      addItem('coins', 500);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue(say(HODE, 'If you\'ve more furs, I\'ll buy them. Good pelts never go out of fashion at an outpost.'));
    });
    return 'done';
  }
  // post-quest idle line
  startDialogue([
    ...say(HODE, '*Hode pats a stack of pelts by the fire.* Watch cloaks are lined, campfire\'s hot, and business is brisk.'),
    ...say(HODE, 'Bring me furs anytime. I pay fair — better than letting them rot on a carcass.'),
  ]);
  return 'done';
});

export {};
