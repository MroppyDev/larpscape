// Quests: 'The Empty Larder' (Cook Edda) and 'Seeds of Trouble' (Old Fen).
// Registers NPC talk handlers + a tick hook for goblin kill tracking.
// Imported for side effects by main.ts; exports QUESTS for the quest journal UI.

import {
  state, msg, addItem, removeItem, invCount, addXp,
  registerNpcAction, onKill, startDialogue, showOptions,
  DialogueLine, Npc,
} from './game';

export interface QuestDef {
  id: string;
  name: string;
  doneStage: number;
  journal: (stage: number) => string;
}

const LARDER = 'empty_larder';
const SEEDS = 'seeds_of_trouble';
const SEEDS_KILLS = 'seeds_kills';
const KILLS_NEEDED = 5;

function stage(id: string): number { return state.player.quests[id] ?? 0; }
function setStage(id: string, s: number) { state.player.quests[id] = s; }

function killCount(): number { return state.player.quests[SEEDS_KILLS] ?? 0; }

export const QUESTS: QuestDef[] = [
  {
    id: LARDER,
    name: 'The Empty Larder',
    doneStage: 2,
    journal: (s) => {
      if (s <= 0) return 'Cook Edda in the castle kitchen looks like she could use a hand.';
      if (s === 1) {
        const need: string[] = [];
        if (invCount('egg') < 1) need.push('an egg');
        if (invCount('bucket_of_milk') < 1) need.push('a bucket of milk');
        if (invCount('bread') < 1) need.push('some bread');
        return need.length
          ? `Edda needs ingredients for the banquet cake. Still to find: ${need.join(', ')}.`
          : 'I have the egg, milk and bread. I should take them back to Cook Edda.';
      }
      return 'I saved the castle banquet. Edda baked me a cake of my very own. Quest complete!';
    },
  },
  {
    id: SEEDS,
    name: 'Seeds of Trouble',
    doneStage: 2,
    journal: (s) => {
      if (s <= 0) return 'Old Fen the gardener is fretting over his trampled seedbeds.';
      if (s === 1) {
        const k = Math.min(killCount(), KILLS_NEEDED);
        const cab = invCount('cabbage') >= 1 ? 'I have a cabbage for him.' : 'I still need a cabbage to bring him.';
        return `Old Fen asked me to drive off the goblins. Goblins driven off: ${k}/${KILLS_NEEDED}. ${cab}`;
      }
      return 'Old Fen\'s seedbeds are safe and replanted. Quest complete!';
    },
  },
];

// Content packs add their quests here (before the UI first renders the journal).
export function registerQuest(q: QuestDef) {
  QUESTS.push(q);
}

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

// ---------------- Quest 1: The Empty Larder ----------------
registerNpcAction('cook', 'Talk-to', (_n: Npc) => {
  const s = stage(LARDER);
  if (s === 0) {
    startDialogue([
      ...say('Cook Edda', 'Oh, calamity! The castle banquet is tonight and the larder is bare!'),
      ...say('Cook Edda', 'I need to bake a cake, but I haven\'t a single ingredient to my name.'),
      ...me('What do you need?'),
      ...say('Cook Edda', 'An egg, a bucket of milk, and some bread. Will you fetch them for me?'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll fetch your ingredients.',
          fn: () => {
            setStage(LARDER, 1);
            startDialogue([
              ...say('Cook Edda', 'You\'re a treasure! Eggs at the chicken farm, milk from a cow if you\'ve a bucket...'),
              ...say('Cook Edda', '...and bread from the general store, or the bake stall if you\'re feeling bold.'),
            ]);
          },
        },
        {
          label: 'Sorry, I\'m busy adventuring.',
          fn: () => {
            startDialogue(say('Cook Edda', 'Adventuring! And who do you think feeds the adventurers? Hmph.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    const need: string[] = [];
    if (invCount('egg') < 1) need.push('an egg');
    if (invCount('bucket_of_milk') < 1) need.push('a bucket of milk');
    if (invCount('bread') < 1) need.push('some bread');
    if (need.length > 0) {
      startDialogue([
        ...say('Cook Edda', 'Back already? Let me see what you\'ve got...'),
        ...say('Cook Edda', `You're still missing ${need.join(', ')}. Hurry, the banquet won't wait!`),
      ]);
      return 'done';
    }
    startDialogue([
      ...say('Cook Edda', 'An egg, milk, and bread — all here! You wonderful thing!'),
      ...say('Cook Edda', 'Stand back. Watch a master at work.'),
    ], () => {
      removeItem('egg', 1);
      removeItem('bucket_of_milk', 1);
      removeItem('bread', 1);
      setStage(LARDER, 2);
      addXp('Cooking', 300);
      addItem('cake', 1);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say('Cook Edda', 'The banquet is saved! And I baked a second cake — just for you.'),
        ...say('Cook Edda', 'Don\'t eat it all at once. Or do. You\'ve earned it.'),
      ]);
    });
    return 'done';
  }
  // post-quest idle line
  startDialogue(say('Cook Edda', 'The banquet was a triumph! The duke had three slices. Don\'t tell his physician.'));
  return 'done';
});

// ---------------- Quest 2: Seeds of Trouble ----------------
registerNpcAction('gardener', 'Talk-to', (_n: Npc) => {
  const s = stage(SEEDS);
  if (s === 0) {
    startDialogue([
      ...say('Old Fen', 'Look at this! Bootprints all over my seedbeds. Goblin bootprints!'),
      ...say('Old Fen', 'They tromp across the river every night and flatten a season\'s work.'),
      ...me('Can I help somehow?'),
      ...say('Old Fen', `Drive off ${KILLS_NEEDED} of the brutes, and fetch me one good cabbage to replant. Deal?`),
    ], () => {
      showOptions([
        {
          label: 'Deal. Those goblins are done trampling.',
          fn: () => {
            setStage(SEEDS, 1);
            state.player.quests[SEEDS_KILLS] = state.player.quests[SEEDS_KILLS] ?? 0;
            startDialogue([
              ...say('Old Fen', 'Ha! That\'s the spirit. You\'ll find them lurking east, across the bridge.'),
              ...say('Old Fen', 'And mind the cabbage — a bruised one\'s no good to anybody.'),
            ]);
          },
        },
        {
          label: 'Goblins? Not my problem.',
          fn: () => {
            startDialogue(say('Old Fen', 'Suit yourself. I\'ll be here, weeping into my watering can.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    const k = Math.min(killCount(), KILLS_NEEDED);
    const haveCabbage = invCount('cabbage') >= 1;
    if (k < KILLS_NEEDED || !haveCabbage) {
      const lines: DialogueLine[] = say('Old Fen', 'How goes the goblin business?');
      if (k < KILLS_NEEDED) {
        lines.push(...me(`I've driven off ${k} of the ${KILLS_NEEDED} so far.`));
        lines.push(...say('Old Fen', 'Keep at it. They breed faster than dandelions.'));
      } else {
        lines.push(...me('All five goblins sent packing.'));
        lines.push(...say('Old Fen', 'Good work! Now, where\'s that cabbage? My beds won\'t replant themselves.'));
      }
      startDialogue(lines);
      return 'done';
    }
    startDialogue([
      ...me(`The goblins are dealt with — all ${KILLS_NEEDED}. And here's your cabbage.`),
      ...say('Old Fen', 'Well, I\'ll be. The beds are quiet and the cabbage is a beauty.'),
      ...say('Old Fen', 'Take these seeds and a bit of coin. You\'ve a gardener\'s heart, whatever they say.'),
    ], () => {
      removeItem('cabbage', 1);
      setStage(SEEDS, 2);
      addXp('Farming', 500);
      addItem('potato_seed', 2);
      addItem('cabbage_seed', 2);
      addItem('coins', 200);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue(say('Old Fen', 'Come back when those seeds sprout. First harvest tastes the sweetest.'));
    });
    return 'done';
  }
  // post-quest idle line
  startDialogue(say('Old Fen', 'Beds are coming up lovely. Not a goblin bootprint in sight, thanks to you.'));
  return 'done';
});

// ---------------- Goblin kill tracking ----------------
// Server-authoritative kills: only the player who landed the killing blow
// receives the youKilled event, so quest credit goes to the killer alone.
onKill((defId) => {
  if (!state.player || defId !== 'goblin') return;
  if (stage(SEEDS) !== 1 || killCount() >= KILLS_NEEDED) return;
  state.player.quests[SEEDS_KILLS] = killCount() + 1;
  const k = killCount();
  if (k < KILLS_NEEDED) msg(`Goblin driven off! (${k}/${KILLS_NEEDED})`);
  else msg(`That's all ${KILLS_NEEDED} goblins driven off. Old Fen will be pleased.`, 'level');
});
