// Quest: 'Streets of Aldgate' — the innkeeper's storeroom has collapsed and
// needs 3 logs + 1 plank to shore it back up. Reward: 300 Construction xp + 150 coins.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, addItem, removeItem, invCount, addXp,
  registerNpcAction, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

const ALDGATE = 'streets_of_aldgate';
const LOGS_NEEDED = 3;
const PLANKS_NEEDED = 1;

function stage(): number { return state.player.quests[ALDGATE] ?? 0; }
function setStage(s: number) { state.player.quests[ALDGATE] = s; }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

function missing(): string[] {
  const need: string[] = [];
  const logs = invCount('logs');
  const planks = invCount('plank');
  if (logs < LOGS_NEEDED) need.push(`${LOGS_NEEDED - logs} more log${LOGS_NEEDED - logs === 1 ? '' : 's'}`);
  if (planks < PLANKS_NEEDED) need.push('a plank');
  return need;
}

registerQuest({
  id: ALDGATE,
  name: 'Streets of Aldgate',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'Maro the innkeeper at the Gilded Kettle in Aldgate seems to be having a rough week.';
    if (s === 1) {
      const need = missing();
      return need.length
        ? `Maro's storeroom collapsed. He needs ${LOGS_NEEDED} logs and a plank for repairs. Still to gather: ${need.join(' and ')}.`
        : 'I have the logs and the plank. I should take them back to Maro at the Gilded Kettle.';
    }
    return 'I helped Maro shore up the storeroom of the Gilded Kettle. Quest complete!';
  },
});

registerNpcAction('innkeeper', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...say('Maro', 'Welcome to the Gilded Kettle! Finest inn in Aldgate. Also the only inn in Aldgate.'),
      ...say('Maro', 'Mind the dust. The storeroom roof came down last night — took half my ale barrels with it.'),
      ...me('That sounds bad. Anything I can do?'),
      ...say('Maro', 'As it happens, yes! The carpenter wants a week, and I haven\'t got a week.'),
      ...say('Maro', `Bring me ${LOGS_NEEDED} sturdy logs and a sawn plank, and I'll brace it up myself. There's coin in it for you.`),
    ], () => {
      showOptions([
        {
          label: 'I\'ll fetch your timber.',
          fn: () => {
            setStage(1);
            startDialogue([
              ...say('Maro', 'You\'re a lifesaver! Any honest tree will give you logs if you\'ve an axe.'),
              ...say('Maro', 'For the plank, try a sawmill — or a market, if you\'d rather pay than sweat.'),
            ]);
          },
        },
        {
          label: 'Sorry, carpentry isn\'t my trade.',
          fn: () => {
            startDialogue(say('Maro', 'Fair enough. I\'ll just keep serving soup under the open sky, then.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    const need = missing();
    if (need.length > 0) {
      startDialogue([
        ...say('Maro', 'Any luck with that timber? The hole in my roof isn\'t getting smaller.'),
        ...say('Maro', `By my count you still need ${need.join(' and ')}.`),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('Three logs and one plank, as ordered.'),
      ...say('Maro', 'Ha! Good straight grain, too. Hold this end and watch a publican turn carpenter.'),
      ...say('Maro', 'There — braced, beamed, and better than before. The Kettle stands!'),
    ], () => {
      removeItem('logs', LOGS_NEEDED);
      removeItem('plank', PLANKS_NEEDED);
      setStage(2);
      addXp('Construction', 300);
      addItem('coins', 150);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say('Maro', 'Here\'s your coin, and my thanks. First bowl of soup is on the house, forever.'),
        ...say('Maro', 'Well. The first one. Soup isn\'t free, you know.'),
      ]);
    });
    return 'done';
  }
  // post-quest idle chatter
  startDialogue(say('Maro', 'Storeroom\'s holding firm! Guests keep asking who my carpenter is. I tell them it\'s a trade secret.'));
  return 'done';
});
