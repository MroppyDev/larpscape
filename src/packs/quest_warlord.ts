// Quest pack: 'The Warlord's Banner' — given by any city guard in Aldgate.
// Slay the goblin warlord in the palisade fort and bring back his banner as proof.
// (The warlord always drops the banner, so the kill isn't tracked separately —
// holding the banner IS the proof.)
// Imported for side effects via src/packs; registers its quest in the journal.

import {
  state, msg, addItem, removeItem, invCount, addXp,
  registerNpcAction, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

const QUEST = 'warlords_banner';
const BANNER = 'warlord_banner';

function stage(): number { return state.player.quests[QUEST] ?? 0; }
function setStage(s: number) { state.player.quests[QUEST] = s; }
function hasBanner(): boolean { return invCount(BANNER) >= 1; }

registerQuest({
  id: QUEST,
  name: "The Warlord's Banner",
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'The guards of Aldgate look worried about something stirring in the fort to the east.';
    if (s === 1) {
      return hasBanner()
        ? 'I have the warlord\'s ragged banner. I should show it to a city guard in Aldgate.'
        : 'A guard captain asked me to slay the goblin warlord in the palisade fort east of the city and bring back his banner as proof.';
    }
    return 'I toppled the goblin warlord and laid his banner at the guards\' feet. Aldgate sleeps easier. Quest complete!';
  },
});

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

const GUARD = 'City Guard';

registerNpcAction('city_guard', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...say(GUARD, 'Halt — no, wait. You\'re no goblin. Apologies, traveller. Nerves are thin on this wall.'),
      ...me('Nerves? What\'s got the city guard jumping at shadows?'),
      ...say(GUARD, 'A goblin warlord has raised a fort east of here. Palisade walls, war drums all night, and a great ragged banner flying over it all.'),
      ...say(GUARD, 'While that banner flies, every goblin from here to the river marches under it. Cut down the warlord, tear down his banner, and the warband scatters.'),
      ...say(GUARD, 'The captain has posted a bounty: eight hundred marks of training in arms and five hundred coins. Bring us the banner as proof of the deed.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll bring you that banner.',
          fn: () => {
            setStage(1);
            startDialogue([
              ...say(GUARD, 'Stout heart! Follow the east road past the gate and you\'ll see the palisade. The warlord holds the arena at its centre.'),
              ...say(GUARD, 'He\'s no common goblin — twice the size and thrice the temper. Bring food, mind your guard, and watch for that blade of his when he raises it high.'),
            ]);
          },
        },
        {
          label: 'Sounds like a job for the army, not me.',
          fn: () => {
            startDialogue(say(GUARD, 'The army holds the wall — we can\'t spare a single spear. But if you change your mind, the bounty stands.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    if (!hasBanner()) {
      startDialogue([
        ...say(GUARD, 'The drums are still beating out east. Is the warlord dealt with?'),
        ...me('Not yet. I\'m working on it.'),
        ...say(GUARD, 'Then steel yourself and get to it. Remember — we need the banner itself. No banner, no bounty.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('The warlord is dead. Here — his banner.'),
      ...say(GUARD, 'By the wall... that\'s it. That\'s the rag itself. Listen — the drums have stopped!'),
      ...say(GUARD, 'The warband will be scattered to the hills by morning. Aldgate owes you, traveller.'),
    ], () => {
      if (!hasBanner()) return; // safety: inventory changed mid-dialogue
      removeItem(BANNER, 1);
      setStage(2);
      addXp('Attack', 800);
      addItem('coins', 500);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say(GUARD, 'The captain\'s bounty, as promised: five hundred coins, and a few hard lessons in swordwork from the drill yard.'),
        ...say(GUARD, 'We\'ll burn this filthy banner at the gate tonight. You\'re welcome to warm your hands at the fire.'),
      ]);
    });
    return 'done';
  }
  // Post-quest: the guards remember.
  startDialogue([
    ...say(GUARD, '*The guard snaps a crisp salute.* Banner-breaker! The east road\'s been quiet ever since you toppled the warlord.'),
    ...say(GUARD, 'Walk tall in Aldgate, friend. The watch drinks to your name.'),
  ]);
  return 'done';
});
