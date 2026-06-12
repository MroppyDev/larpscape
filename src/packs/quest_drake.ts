// Quest pack: 'Embers Below' — given by Brogan the slayer master.
// Stage 0: Brogan shares rumors of a shadow drake beneath the swamp.
// Stage 1: slay the drake in the cavern and bring back the ember crystal it hoards.
// Stage 2: complete. Rewards: 1000 Slayer xp, 800 Smithing xp, mithril scimitar, 1500 coins.
// Imported for side effects by src/packs/index.ts (before initGame).

import {
  msg, invCount,
  registerNpcAction, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';
import { questStage, advanceQuestStage, claimQuestReward } from '../quest-sync';

const EMBERS = 'embers_below';

function stage(): number { return questStage(EMBERS); }

function brogan(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'Brogan', text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

registerQuest({
  id: EMBERS,
  name: 'Embers Below',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'Brogan the slayer master has been muttering about strange embers glowing beneath the swamp. I should ask him about it.';
    if (s === 1) {
      return invCount('ember_crystal') >= 1
        ? 'The shadow drake is slain and its ember crystal is in my pack. Brogan will want to see this.'
        : 'Brogan asked me to slay the shadow drake that nests in the cavern beneath the swamp, and bring back the ember crystal it hoards. The cave mouth lies at the south edge of the swamp mine.';
    }
    return 'I slew the shadow drake and brought its ember crystal to Brogan. Even he was impressed — and he doesn\'t impress easily. Quest complete!';
  },
});

registerNpcAction('slayer_master', 'Ask-about-embers', (_n: Npc) => {
  const s = stage();

  if (s === 0) {
    startDialogue([
      ...me('People say you\'ve been muttering about embers under the swamp. What\'s that about?'),
      ...brogan('Hmph. Sharp ears. Miners at the bog camp swear the deep rock glows at night.'),
      ...brogan('I went down myself. Found scorch marks on stone that\'s never seen a torch, and scales the size of dinner plates.'),
      ...brogan('There\'s a drake down there. A shadow drake, nesting at the far end of the cavern, sitting on a crystal that burns from the inside.'),
      ...me('And you want it dealt with?'),
      ...brogan('I want it DEAD, and I want that ember crystal on my table. A beast like that doesn\'t stay under the swamp forever.'),
      ...brogan('Fair warning: its breath will cook you in your boots. Bring food, bring your best steel, and brace yourself when it inhales.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll slay your drake and fetch the crystal.',
          fn: () => {
            void advanceQuestStage(EMBERS, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...brogan('Ha! Either you\'re brave or you\'re stupid. Down here, the two pay the same.'),
                ...brogan('The cave mouth is at the south edge of the swamp mine. Follow the heat. You\'ll know the lair when the walls start to glow.'),
                ...brogan('Come back with that crystal and I\'ll make it worth the singed eyebrows.'),
              ]);
            });
          },
        },
        {
          label: 'A fire-breathing drake? I\'ll pass.',
          fn: () => {
            startDialogue(brogan('Wise, maybe. But that crystal won\'t wait, and neither will the drake. Offer stands if your spine grows back.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    if (invCount('ember_crystal') < 1) {
      startDialogue([
        ...brogan('Still breathing? Then the drake still is too.'),
        ...brogan('Cave mouth, south edge of the swamp mine. Kill the beast, take the ember crystal it hoards, bring it here.'),
        ...brogan('And eat before you fight. Dead heroes carry no crystals.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('The shadow drake is dead. And this... this is what it was hoarding.'),
      ...brogan('By every forge in the kingdom. It\'s warm as a hearth and it\'s been out of the ground for days.'),
      ...brogan('You actually did it. I\'ve buried better-armed slayers for less.'),
      ...brogan('A deal\'s a deal. Coin, a blade I\'ve been saving, and everything I know about killing things that fly and smithing what they leave behind.'),
    ], () => {
      void advanceQuestStage(EMBERS, 2).then((echo) => {
        if (!echo.ok) return;
        void claimQuestReward(EMBERS, 2);
        msg('Congratulations! Quest complete!', 'level');
        startDialogue([
          ...brogan('That scimitar has a drake-slayer\'s name on it now. Yours.'),
          ...brogan('I\'ll set the crystal above my hearth. Cheaper than firewood, and a sight better story.'),
        ]);
      });
    });
    return 'done';
  }

  // Post-quest respect line.
  startDialogue([
    ...brogan('The drake-slayer returns. That ember crystal still glows on my hearth — best trophy in the room, and I\'ve got shelves of them.'),
    ...brogan('Whatever crawls out of the dark next, I know whose door to knock on.'),
  ]);
  return 'done';
});
