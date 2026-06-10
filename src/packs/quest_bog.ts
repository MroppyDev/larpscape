// Quest pack: 'Heart of the Bog' — given by Old Fen (gardener) via an
// 'Ask-about-bog' option (his 'Talk-to' is owned by quests.ts for Seeds of
// Trouble). Slay the bog_horror in the deep bog and bring back its heart.
// Registered for side effects via src/packs/index.ts.

import {
  state, msg, addItem, removeItem, invCount, addXp,
  registerNpcAction, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

const BOG = 'heart_of_the_bog';
const SEEDS = 'seeds_of_trouble';
const SEEDS_DONE = 2;

function stage(id: string): number { return state.player.quests[id] ?? 0; }
function setStage(id: string, s: number) { state.player.quests[id] = s; }

function fen(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'Old Fen', text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

registerQuest({
  id: BOG,
  name: 'Heart of the Bog',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) {
      return stage(SEEDS) >= SEEDS_DONE
        ? 'Old Fen keeps glancing south toward the deep bog. I should ask him about it.'
        : 'Old Fen seems troubled by something in the bog, but he won\'t share his worries with a stranger. Perhaps if I helped with his seedbeds first.';
    }
    if (s === 1) {
      return invCount('bog_heart') >= 1
        ? 'I cut the festering heart from the horror in the deep bog. I should bring it to Old Fen.'
        : 'Old Fen says something festers at the heart of the deep bog, south past the swamp, twisting everything that grows. I must slay it and bring back its heart.';
    }
    return 'I slew the horror of the deep bog and gave its heart to Old Fen. The bog can grow honest weeds again. Quest complete!';
  },
});

registerNpcAction('gardener', 'Ask-about-bog', (_n: Npc) => {
  const s = stage(BOG);

  if (s === 0) {
    if (stage(SEEDS) < SEEDS_DONE) {
      // Not offered until Seeds of Trouble is complete — just a hint.
      startDialogue([
        ...me('You keep looking south. What\'s out there?'),
        ...fen('Hm? Nothing for you yet, friend. One worry at a time.'),
        ...fen('Help me with my seedbeds first, and maybe I\'ll trust you with the bigger trouble.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...fen('You noticed, eh? Aye, it\'s the deep bog, south past the swamp.'),
      ...fen('Plants grow wrong down there now. Reeds with teeth. Moss that watches you back.'),
      ...me('Watches you back?'),
      ...fen('Something festers at the heart of that bog. A great moss-bound thing — I\'ve heard it gurgle in the dark.'),
      ...fen('Whatever rots in it is seeping into the soil. Slay it, and bring me its heart so I can study the blight.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll cut the rot out of your bog.',
          fn: () => {
            setStage(BOG, 1);
            startDialogue([
              ...fen('You\'ve a braver spine than mine. Head south through the swamp and keep to the firm ground.'),
              ...fen('And mind the spit — they say the thing\'s breath sours the blood. Pack a bite to eat.'),
            ]);
          },
        },
        {
          label: 'A heart-cutting errand? Not today.',
          fn: () => {
            startDialogue(fen('Can\'t blame you. I\'ll be here, watching the weeds grow fangs.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    if (invCount('bog_heart') < 1) {
      startDialogue([
        ...fen('Still in one piece! Found the festering thing yet?'),
        ...me('Not yet. The bog is... uncooperative.'),
        ...fen('Deep south, past the swamp, where the water turns black. You\'ll hear it before you see it.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('It\'s done. Here — the heart of the thing, still warm. Unpleasantly warm.'),
      ...fen('Faugh, the smell of it! But look — root-threads all through the flesh. So that\'s how it was poisoning the soil.'),
      ...fen('You\'ve done the green world a kindness today. Take these — brewed them myself, from honest herbs.'),
    ], () => {
      removeItem('bog_heart', 1);
      setStage(BOG, 2);
      addXp('Herblore', 600);
      addXp('Farming', 600);
      addItem('attack_potion', 2);
      addItem('defence_potion', 2);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue(fen('Give the bog a season or two. It\'ll grow honest weeds again — and I do love an honest weed.'));
    });
    return 'done';
  }

  // post-quest idle line
  startDialogue(fen('The black water\'s clearing already. Saw a frog yesterday with the regular number of eyes!'));
  return 'done';
});
