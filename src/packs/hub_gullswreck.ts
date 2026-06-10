// Gullswreck Cove hub — Boatman Wick's ferry quest and dockside flavor.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, addItem, removeItem, invCount, addXp,
  registerNpcAction, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

const WRECK = 'wreck_of_gull';
const BARS_NEEDED = 10;

function stage(): number { return state.player.quests[WRECK] ?? 0; }
function setStage(s: number) { state.player.quests[WRECK] = s; }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

registerQuest({
  id: WRECK,
  name: 'Wreck of the Gull',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'Boatman Wick at the docks mutters about a broken ferry. He might need smithing supplies.';
    if (s === 1) {
      const have = invCount('iron_bar');
      return have >= BARS_NEEDED
        ? `I have ${BARS_NEEDED} iron bars for the ferry repairs. I should bring them to Boatman Wick.`
        : `Wick needs ${BARS_NEEDED} iron bars to repair the ferry to Gullswreck Cove. I have ${have} so far.`;
    }
    return 'I helped Wick repair the ferry. Gullswreck Cove is reachable again. Quest complete!';
  },
});

const WICK = 'Boatman Wick';

registerNpcAction('boatman', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...say(WICK, 'Mind the gangplank — she\'s listing worse than my last three marriages.'),
      ...say(WICK, 'The ferry to Gullswreck Cove took a beating in last week\'s squall. Hull\'s sound, but the ironwork\'s rusted through.'),
      ...me('Can I help somehow?'),
      ...say(WICK, `Bring me ${BARS_NEEDED} iron bars and I'll have her seaworthy by morning. There's coin in it — and a cutlass off a wrecker who owed me.`),
    ], () => {
      showOptions([
        {
          label: 'I\'ll fetch your iron bars.',
          fn: () => {
            setStage(1);
            startDialogue([
              ...say(WICK, 'Good lad. Smelt ore at a furnace, or buy bars if you\'ve the purse for it.'),
              ...say(WICK, 'Once she\'s patched, I\'ll run the cove route again. Pirates be damned — a boatman\'s got to boat.'),
            ]);
          },
        },
        {
          label: 'Smithing isn\'t my trade.',
          fn: () => {
            startDialogue(say(WICK, 'Then the cove stays cut off and the pirates keep the wreck to themselves. Offer keeps, if you change your mind.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    const have = invCount('iron_bar');
    if (have < BARS_NEEDED) {
      startDialogue([
        ...say(WICK, 'Any luck with those bars? The tide won\'t wait on rust.'),
        ...say(WICK, `Still need ${BARS_NEEDED - have} more iron bar${BARS_NEEDED - have === 1 ? '' : 's'}.`),
      ]);
      return 'done';
    }
    startDialogue([
      ...me(`Ten iron bars, as ordered.`),
      ...say(WICK, '*Wick hammers the last brace into place and steps back, wiping his brow.* There — she\'ll float, she\'ll row, and she might even come back.'),
      ...say(WICK, 'Gullswreck Cove\'s open again. Mind the pirates — they\'ve no love for paying passengers.'),
    ], () => {
      removeItem('iron_bar', BARS_NEEDED);
      setStage(2);
      addXp('Smithing', 800);
      addItem('boarding_cutlass', 1);
      addItem('coins', 1000);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say(WICK, 'Thousand coins from the harbour purse, and this cutlass — taken off a wrecker who tried to skip his fare.'),
        ...say(WICK, 'Ferry\'s yours when you need her. Just don\'t mention the listing to the harbormaster.'),
      ]);
    });
    return 'done';
  }
  // post-quest idle chatter
  startDialogue([
    ...say(WICK, 'Ferry\'s riding level and the cove run\'s back on the board. Pirates still eye us, but she\'ll outpace any rowboat.'),
    ...say(WICK, 'Need passage to Gullswreck? Ask when the tide\'s right — I\'ll be at the gangplank.'),
  ]);
  return 'done';
});

export {};
