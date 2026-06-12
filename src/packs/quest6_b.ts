// Quest pack (Phase 6, Round B): two quests.
// 'The Catch of a Lifetime' — Harbormaster Quill at Port Brackwater needs a shark
//   for the festival. Turn in 1 raw_shark OR shark. Rewards: 1800 Fishing xp,
//   800 Cooking xp, a harpoon, 1000 coins.
// 'Ash and Ruin' — Brogan the slayer master (gated on 'embers_below' complete)
//   sends you after Korr the Molten in the Ashen Depths. Turn in molten_core.
//   Rewards: 2500 Slayer xp, 1500 Mining xp, molten_gauntlets, 3000 coins.
// Imported for side effects by src/packs/index.ts (before initGame).

import {
  msg, invCount,
  registerNpcAction, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';
import { questStage, advanceQuestStage, claimQuestReward, questTurnin } from '../quest-sync';

const CATCH = 'catch_of_a_lifetime';
const ASH = 'ash_and_ruin';
const EMBERS = 'embers_below';

function stage(id: string): number { return questStage(id); }
function embersDone(): boolean { return questStage(EMBERS) >= 2; }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

// ---------------------------------------------------------------------------
// Quest 1: The Catch of a Lifetime
// ---------------------------------------------------------------------------

function hasAnyShark(): boolean {
  return invCount('raw_shark') >= 1 || invCount('shark') >= 1;
}

registerQuest({
  id: CATCH,
  name: 'The Catch of a Lifetime',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'Harbormaster Quill at Port Brackwater is said to have work for a capable pair of hands. I should ask her about it.';
    if (s === 1) {
      return hasAnyShark()
        ? 'I have a shark in my pack! Harbormaster Quill at Port Brackwater will want to see this before the Tidefest crowds arrive.'
        : 'Harbormaster Quill needs a shark landed for Port Brackwater\'s Tidefest. Sharks demand level 76 Fishing and a harpoon — the harpoon spots are out on the Brackwater docks, where the big shapes circle.';
    }
    return 'I landed a shark for Tidefest and Port Brackwater\'s reputation is safe. Quill says they\'ll be telling the story for years — with me in it. Quest complete!';
  },
});

registerNpcAction('harbormaster', 'Ask-about-work', (_n: Npc) => {
  const s = stage(CATCH);

  if (s === 0) {
    startDialogue([
      ...me('I hear the harbormaster has work going. What needs doing?'),
      ...say('Quill', 'Depends. Can you fish, or do you just own a hat that says you can?'),
      ...say('Quill', 'Here\'s the trouble. Tidefest opens in three days. Every port on this coast sends its finest catch, and the port that lands the grandest fish keeps its name on the trade charts.'),
      ...say('Quill', 'Brackwater has entered a shark every Tidefest for forty years. This year my best harpooner is laid up with a wrenched shoulder, and the sea does not care about excuses.'),
      ...me('And if Brackwater shows up empty-handed?'),
      ...say('Quill', 'Then the merchants whisper, the charters dry up, and this port becomes a footnote with a nice beach. I won\'t have it.'),
      ...say('Quill', 'Land me one shark — raw or cooked, I\'m not fussy — and you\'ll have coin, a fine harpoon, and a friend in every tavern on these docks.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll land your shark.',
          fn: () => {
            void advanceQuestStage(CATCH, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say('Quill', 'Ha! There\'s the spirit. Now listen, because sharks don\'t forgive sloppy work.'),
                ...say('Quill', 'You\'ll need a harpoon and the arm to use it — nothing less than a level 76 angler ever pulled a shark from these waters.'),
                ...say('Quill', 'The harpoon spots are out on our own docks, where the planks run into deep water. Watch for the big shapes gliding under the surface. That\'s them watching you back.'),
              ]);
            });
          },
        },
        {
          label: 'A shark? I like my arms attached, thanks.',
          fn: () => {
            startDialogue(say('Quill', 'Suit yourself. The tide turns whether you\'re brave or not — come back if your nerve does.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    if (!hasAnyShark()) {
      startDialogue([
        ...say('Quill', 'No shark yet? Tidefest won\'t wait, and neither will the gossip.'),
        ...say('Quill', 'Harpoon, level 76 Fishing, and the deep-water spots off our docks — that\'s the whole recipe. The big shapes under the planks aren\'t driftwood.'),
      ]);
      return 'done';
    }
    const cooked = invCount('raw_shark') < 1;
    startDialogue([
      ...me(cooked ? 'One shark — cooked it myself, so the judges needn\'t wait.' : 'One shark, fresh from the deep. It put up a debate.'),
      ...say('Quill', 'Look at the SIZE of it! Forty years of Tidefest and I\'ve seen maybe three finer.'),
      ...say('Quill', 'Brackwater\'s name stays on the charts, and the whole coast will know who put it there.'),
      ...say('Quill', 'A deal\'s a deal: coin, my harpooner\'s spare — better than anything in the shops — and every trick I know about fish and fire.'),
    ], () => {
      void questTurnin('catch_shark').then((echo) => {
        if (!echo.ok) return;
        void claimQuestReward(CATCH, 2);
        msg('Congratulations! Quest complete!', 'level');
        startDialogue([
          ...say('Quill', 'When the festival crowds ask who landed the great shark of Brackwater, I\'ll point them your way.'),
          ...say('Quill', 'Fair warning: by the third telling it\'ll have been wrestled barehanded. Stories grow faster than fish.'),
        ]);
      });
    });
    return 'done';
  }

  // Post-quest chatter.
  startDialogue([
    ...say('Quill', 'The shark-slinger of Brackwater! Your catch took first ribbon at Tidefest — the charter captains haven\'t stopped toasting it.'),
    ...say('Quill', 'If the sea ever coughs up something stranger, you\'ll be the first name on my slate.'),
  ]);
  return 'done';
});

// ---------------------------------------------------------------------------
// Quest 2: Ash and Ruin
// ---------------------------------------------------------------------------

registerQuest({
  id: ASH,
  name: 'Ash and Ruin',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) {
      return embersDone()
        ? 'Brogan the slayer master keeps glancing at the cavern floor like it owes him money. Something below has him rattled — I should ask him about the depths.'
        : 'Brogan the slayer master won\'t speak of what stirs in the depths until the shadow drake business is settled. I should finish Embers Below first.';
    }
    if (s === 1) {
      return invCount('molten_core') >= 1
        ? 'Korr the Molten is slain and its molten core sits warm in my pack. Brogan will want to see this with his own eyes.'
        : 'Brogan sent me into the Ashen Depths, far beyond the drake\'s old nest, to slay Korr the Molten and bring back its molten core. Follow the lava east and down — Korr\'s lair is at the deepest end.';
    }
    return 'Korr the Molten is ash and memory, and its core sits on Brogan\'s table, never quite going cold. He says the deep is quiet now — and that I made it so. Quest complete!';
  },
});

registerNpcAction('slayer_master', 'Ask-about-the-depths', (_n: Npc) => {
  const s = stage(ASH);

  // Gate: requires Embers Below complete.
  if (s === 0 && !embersDone()) {
    startDialogue([
      ...me('You keep staring at the floor like it might stare back. What\'s down in the depths?'),
      ...say('Brogan', 'Nothing I\'ll hang on an untested neck. There\'s drake business between us first.'),
      ...say('Brogan', 'Ask me about the embers under the swamp. Settle that, and then we\'ll talk about what\'s UNDER the embers.'),
    ]);
    return 'done';
  }

  if (s === 0) {
    startDialogue([
      ...me('The drake\'s dealt with. So why do you still look like a man listening for footsteps?'),
      ...say('Brogan', 'Because I am. You think that drake chose to nest under a swamp for the view?'),
      ...say('Brogan', 'It was running. Something drove it up from the deep rock — something far older. The miners hear it now: a slow hammering under the east galleries, like a forge that never sleeps.'),
      ...say('Brogan', 'The old charts call it Korr the Molten. Stone that walks. Fire that thinks. My grandmother\'s grandmother swore it was a story.'),
      ...me('And the hammering says otherwise.'),
      ...say('Brogan', 'The hammering says it\'s awake. The Ashen Depths run east past the drake\'s old nest, down where the lava pools. Korr waits at the very bottom.'),
      ...say('Brogan', 'Kill it, and bring me the molten core it carries — the heart of its forge. As long as that core beats, the deep will breed more fiends. On my table, it\'s just a very warm paperweight.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll put out Korr\'s forge for good.',
          fn: () => {
            void advanceQuestStage(ASH, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say('Brogan', 'Then you\'re the best fool I\'ve ever armed. Listen well.'),
                ...say('Brogan', 'Follow the cavern east where it breaks into the Ashen Depths. The lava marks the road; the crawlers and ash fiends mark the toll.'),
                ...say('Brogan', 'Korr is bigger than anything you\'ve faced and angrier than everything you\'ve faced put together. Pack food until your bag complains, and don\'t stand where it\'s standing.'),
              ]);
            });
          },
        },
        {
          label: 'Old fire gods are above my pay grade.',
          fn: () => {
            startDialogue(say('Brogan', 'Hmph. So is being melted, I\'d wager. The hammering won\'t stop on its own — door\'s open when your courage is.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    if (invCount('molten_core') < 1) {
      startDialogue([
        ...say('Brogan', 'Still hear the hammering at night. That means Korr\'s still swinging.'),
        ...say('Brogan', 'East through the cavern, down into the Ashen Depths, lair at the very bottom. Kill it and bring me that molten core — and don\'t come back medium-rare.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('The hammering\'s stopped, Brogan. And this is why.'),
      ...say('Brogan', 'Stand back— no. It\'s cooling. By the deep stone, it\'s actually cooling.'),
      ...say('Brogan', 'You walked into the bottom of the world and put out a forge that burned before this town had a name.'),
      ...say('Brogan', 'I\'ve no medal grand enough, so take this instead: coin, gauntlets quenched in the fiend\'s own fire, and every scrap I know about slaying and the stone it hides in.'),
    ], () => {
      void advanceQuestStage(ASH, 2).then((echo) => {
        if (!echo.ok) return;
        void claimQuestReward(ASH, 2);
        msg('Congratulations! Quest complete!', 'level');
        startDialogue([
          ...say('Brogan', 'First quiet night the miners will have in a season. They\'ll never know who to thank. I will.'),
          ...say('Brogan', 'The core goes on my table, in sight of the drake\'s crystal on the hearth. I\'m building a shelf of things you\'ve killed. It\'s getting crowded.'),
        ]);
      });
    });
    return 'done';
  }

  // Post-quest respect line.
  startDialogue([
    ...say('Brogan', 'The deep\'s gone quiet, and quiet is the finest sound a slayer ever buys. You bought it.'),
    ...say('Brogan', 'Drake, fire fiend... I\'m running out of nightmares to point you at. Give the dark time. It\'ll think of something.'),
  ]);
  return 'done';
});
