// 'Against the Grain' (against_the_grain) — farm-belt comedy side quest (Q10).
// The windmill grinds BACKWARDS — flour in, wheat out — ever since Wayfarer
// Sorrel sold Miller Hob Greaves a "lucky" millstone shim (an inert Offnote
// sliver). The resulting lawsuit is decided, with full legal authority, by
// Danquavious Chimperton III, Sovereign of Bananas, at the Court of the
// Southern Lawn. No combat anywhere.
//
// Owns (per QUEST-DESIGN.md §14.3/§14.4): miller/'Talk-to' (incl. post-quest
// Collect-flour), wayfarer/'Ask-about-the-shim',
// danquavious_chimperton/'Present-evidence', item-on-object keys
// `wheat|millstone` + `hammer|millstone`, and object actions on `millstone`
// and (new) `wheat_field`.
// New ids live in data/_fragments/q10_windmill.json.
// Imported for side effects via src/packs/index.ts (integrator wires it).

import {
  msg, invCount, hasItem, freeSlots,
  registerNpcAction, registerObjectAction, registerItemOnObject,
  startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';
import { questStage, advanceQuestStage, claimQuestReward, questbGrant } from '../quest-sync';

const QID = 'against_the_grain';

function stage(): number { return questStage(QID); }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

const HOB = 'Miller Hob Greaves';
const SORREL = 'Wayfarer Sorrel';
const HERALD = 'Herald Bananrick';
const SOVEREIGN = 'Danquavious Chimperton III';

// Post-quest free flour: once per login session, deliberately NOT persisted.
let flourCollectedThisSession = false;

// ============================================================
// Quest registration
// ============================================================

registerQuest({
  id: QID,
  name: 'Against the Grain',
  doneStage: 6,
  journal: (s) => {
    if (s <= 0) return 'Miller Hob Greaves is staring into his hopper like it owes him money. Apparently it does.';
    if (s === 1) return 'Run one wheat through the mill so I can see the impossible happen on purpose.';
    if (s === 2) return 'Sorrel sold the "lucky" shim in good faith, he says. I should find him on his rounds — he walks the lane by Ravenmoor Manor — and ask about it.';
    if (s === 3) return 'One borrowed hammer should get the lucky shim out of the millstone. The general stores sell hammers, and one\'s lying about by the mill.';
    if (s === 4) return 'Shim and receipt in hand. The case goes before Danquavious Chimperton III at the Court of the Southern Lawn, south of Bellmeadow castle.';
    if (s === 5) return 'The court has ruled. The shim is crown evidence, Sorrel owes a refund, and the wind is no longer a defendant. One final test: a wheat through the mill, then tell Hob.';
    return 'The mill grinds the right way round and I eat free flour for life. Quest complete!';
  },
});

// ============================================================
// Miller Hob Greaves — quest giver (Talk-to owned by Q10)
// ============================================================

registerNpcAction('miller', 'Talk-to', (_n: Npc) => {
  const s = stage();

  if (s === 0) {
    startDialogue([
      ...say(HOB, 'Don\'t. Don\'t ask.'),
      ...me('I wasn\'t going to—'),
      ...say(HOB, 'Everyone asks. "Hob," they say, "why is your grain store overflowing and your flour store empty?" Because the mill runs BACKWARDS, that\'s why. Flour goes in. Wheat comes out.'),
      ...me('That\'s not how mills work.'),
      ...say(HOB, 'I KNOW that\'s not how mills work. I\'m a miller. Goodwife Plum brought me a sack of flour to fine-grind and got a sack of wheat back, and now she\'s suing me in the chimp court for "negligent un-grinding."'),
      ...say(HOB, 'It started the day I fitted a lucky shim under the millstone. Bought it off Wayfarer Sorrel. "Lucky," he said. He didn\'t say lucky for WHOM.'),
      ...say(HOB, 'I need a witness who isn\'t me. Bring one wheat — pick it from the field east of here, it\'s mine, help yourself — and run it through the stone. Watch what happens. Then we\'ll both know I\'m not mad.'),
    ], () => {
      showOptions([
        {
          label: 'One wheat, one mill, one witness. I\'m in.',
          fn: () => {
            void advanceQuestStage(QID, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say(HOB, 'Bless you. The hopper\'s on the millstone, just inside. Use the wheat on it and stand well back.'),
                ...say(HOB, 'Not that it\'s dangerous. It\'s just embarrassing, and embarrassment carries.'),
              ]);
            });
          },
        },
        {
          label: 'I make it a rule not to testify against weather.',
          fn: () => {
            startDialogue(say(HOB, 'The wind\'s already a defendant, friend, the docket\'s full either way. The offer keeps.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    const lines: DialogueLine[] = [
      ...say(HOB, 'Well? Have you fed it a wheat yet?'),
      ...say(HOB, 'One wheat, into the hopper on the millstone. I\'d do it myself but I can\'t watch any more. My granddad built that stone. It used to make BREAD.'),
    ];
    if (!hasItem('wheat')) {
      startDialogue(lines, () => offerSpareWheat());
      return 'done';
    }
    startDialogue(lines);
    return 'done';
  }

  if (s === 2) {
    startDialogue([
      ...say(HOB, 'You saw it. ONE in, TWO out. I lay down on my own threshold and I\'m not ashamed.'),
      ...say(HOB, 'It\'s that shim, I\'d bet the mill on it — if the mill were worth anything, which currently it is the opposite of.'),
      ...say(HOB, 'Go shake the truth out of Sorrel. He walks the lane by Ravenmoor Manor on his rounds, away southeast. Tell him Hob sends his regards and his lawyer.'),
    ]);
    return 'done';
  }

  if (s === 3) {
    startDialogue([
      ...say(HOB, '"Good faith," he says. A receipt he wrote AFTERWARDS, you say. That man could sell a drowning man the river.'),
      ...say(HOB, 'Right. The shim comes out. You\'ll want a hammer — the general stores carry them, or there\'s one lying in the grass north of the mill where I threw it. Give the stone a good whack and pry the cursed thing loose.'),
    ]);
    return 'done';
  }

  if (s === 4) {
    startDialogue([
      ...say(HOB, 'You\'ve got it out? And it\'s HUMMING? Stones don\'t hum. Stones famously don\'t hum.'),
      ...say(HOB, 'Take it and Sorrel\'s little fiction of a receipt to the Court of the Southern Lawn, south of the castle in Bellmeadow. The Sovereign hears cases at all hours. He\'s a chimpanzee, and before you ask: yes, legally. There was a will.'),
    ]);
    return 'done';
  }

  if (s === 5) {
    if (!hasItem('flour')) {
      const lines: DialogueLine[] = [
        ...say(HOB, 'A verdict! A real one, with a seal! Read me the bit about the wind again— no. No, I\'m composed.'),
        ...say(HOB, 'One last thing before I believe it: run a wheat through the stone. If flour comes out, the curse is done and so is my lying down.'),
      ];
      if (!hasItem('wheat')) {
        startDialogue(lines, () => offerSpareWheat());
        return 'done';
      }
      startDialogue(lines);
      return 'done';
    }
    // Turn-in: flour in hand — the mill grinds forward again.
    startDialogue([
      ...me('One wheat in. Flour out. Your mill grinds the right way round.'),
      ...say(HOB, '*Hob takes the flour, holds it to the light, and weeps briefly and with dignity.* That\'s good flour. That\'s GOOD flour.'),
      ...say(HOB, 'Sorrel\'s refund came by runner — counted twice, short by nothing, which for him is an apology. And the wind and I have settled out of court. We\'re not speaking, but we\'ve settled.'),
    ], () => {
      void advanceQuestStage(QID, 6).then((echo) => {
        if (!echo.ok) return;
        void claimQuestReward(QID, 6);
        msg('Congratulations! Quest complete!', 'level');
        startDialogue([
          ...say(HOB, 'Hundred and fifty coins from the refund, three loaves from the first honest batch, and this: a miller\'s token. Show it at my door any day you like and there\'s flour in it for you. ONE per visit. It\'s underlined.'),
          ...say(HOB, 'Granddad always said a mill remembers who set it right. Mine will. So will I.'),
        ]);
      });
    });
    return 'done';
  }

  // Post-quest (stage >= 6): idle line + Collect-flour path.
  startDialogue([
    ...say(HOB, 'In goes the wheat, out comes the flour, and nobody is suing anybody. Some days I grind a sack just to watch it go the right way.'),
  ], () => {
    showOptions([
      {
        label: 'Collect my flour. (miller\'s token)',
        fn: () => {
          if (flourCollectedThisSession) {
            startDialogue(say(HOB, 'You\'ve had today\'s, friend. ONE per visit — it\'s underlined, and I underlined it.'));
            return;
          }
          if (freeSlots() === 0 && !hasItem('flour')) {
            startDialogue(say(HOB, 'Your pack\'s full. I\'m not dusting your pockets with it; come back with room for a proper measure.'));
            return;
          }
          void questbGrant('atg_collect_flour').then((echo) => {
            if (!echo.ok) return;
            flourCollectedThisSession = true;
            startDialogue(say(HOB, 'Fresh off the stone, ground frontwards, as the Choir intended. Eat well.'));
          });
        },
      },
      {
        label: 'Just passing through.',
        fn: () => {
          startDialogue(say(HOB, 'Pass through any time. The door\'s open and the wind — well. The wind knows what it did.'));
        },
      },
    ]);
  });
  return 'done';
});

// Hob keeps a spare sack: second acquisition path for the test wheat
// (alongside picking the wheat_field east of the mill).
function offerSpareWheat() {
  showOptions([
    {
      label: 'Spare a wheat from your store? (10 coins)',
      fn: () => {
        if (!hasItem('coins', 10)) {
          startDialogue(say(HOB, 'Ten coins it is — when you have them. Or pick your own from the field east of here; the grain\'s the only honest thing left on this plot.'));
          return;
        }
        if (freeSlots() === 0) {
          startDialogue(say(HOB, 'Your pack\'s full. Wheat needs somewhere to sit; it\'s not proud, but it\'s not liquid either.'));
          return;
        }
        void questbGrant('atg_buy_wheat').then((echo) => {
          if (!echo.ok) return;
          startDialogue(say(HOB, 'Ten coins, one wheat — the first transaction on this plot in a month that\'s gone the proper direction.'));
        });
      },
    },
    {
      label: 'I\'ll pick my own from the field.',
      fn: () => {
        startDialogue(say(HOB, 'East of the mill, past the hay. Take what you need — the field\'s the only part of the business still producing on purpose.'));
      },
    },
  ]);
}

// ============================================================
// Wayfarer Sorrel — 'Ask-about-the-shim' (Q10-owned option)
// ============================================================

registerNpcAction('wayfarer', 'Ask-about-the-shim', (_n: Npc) => {
  const s = stage();

  if (s < 2) {
    startDialogue([
      ...me('I hear you sell lucky shims.'),
      ...say(SORREL, 'Sold. Past tense. A one-of-a-kind item, and between us, the luck market\'s soft this season. Now, snares — snares I have in three sizes.'),
    ]);
    return 'done';
  }

  if (s === 2) {
    startDialogue([
      ...me('Hob Greaves\' mill grinds backwards. He says it started with your "lucky" shim.'),
      ...say(SORREL, 'Backwards! Remarkable. You understand, of course, that "lucky" is a descriptive term, not a warranty. No warranty was expressed, implied, hummed, or whistled.'),
      ...me('Where did you even get it?'),
      ...say(SORREL, 'A goblin. At a campfire. At a very good price — which, in my trade, is the only provenance that matters. He said it sang to him at night and he wanted it gone. I took that for salesmanship. Goblins are gifted amateurs.'),
      ...me('It SANG to him, and you sold it to a man who works with his hands next to a large rotating stone.'),
      ...say(SORREL, 'In good faith! Look — here\'s the receipt. Sale of one lucky shim, all defects of luck excluded, signed S-O-R-R-E-L.'),
      ...me('You\'re writing it right now. I\'m watching you write it.'),
      ...say(SORREL, '*Sorrel signs with a flourish and blows on the ink.* Paperwork is paperwork, friend, whenever it\'s born. Take it to whatever court will have it. Every road open, that\'s my motto — including the legal ones.'),
    ], () => {
      if (freeSlots() === 0 && !hasItem('shim_receipt')) {
        startDialogue(say(SORREL, 'Your pack\'s full. Even free paperwork needs a pocket — come back with room and the receipt is yours.'));
        return;
      }
      void questbGrant('atg_shim_receipt').then((grantEcho) => {
        if (!grantEcho.ok) return;
        void advanceQuestStage(QID, 3).then((stageEcho) => {
          if (!stageEcho.ok) return;
          msg('Sorrel hands you a freshly-written, suspiciously dry receipt.');
        });
      });
    });
    return 'done';
  }

  if ((s === 3 || s === 4) && !hasItem('shim_receipt')) {
    startDialogue([
      ...me('I\'ve lost the receipt.'),
      ...say(SORREL, 'Tragic. Fortunately my filing system is portable. *He writes another one, even more retroactive than the first.*'),
    ], () => {
      if (freeSlots() === 0 && !hasItem('shim_receipt')) {
        startDialogue(say(SORREL, 'No room! Honestly, the trouble I go to. Come back with a free pocket and your paperwork awaits.'));
        return;
      }
      void questbGrant('atg_shim_receipt').then((echo) => {
        if (!echo.ok) return;
        msg('Sorrel issues a replacement receipt. The ink is, again, somehow still wet.');
      });
    });
    return 'done';
  }

  if (s === 3 || s === 4) {
    startDialogue([
      ...say(SORREL, 'Still carrying my excellent paperwork, I see. The court sits on the Southern Lawn, south of Bellmeadow castle. Mention my name. Actually — don\'t.'),
    ]);
    return 'done';
  }

  // s >= 5: post-verdict grumble.
  startDialogue([
    ...say(SORREL, 'A refund. A REFUND. Eleven years on the roads and my first ever, ordered by a chimpanzee with better penmanship than mine.'),
    ...say(SORREL, 'No hard feelings, mind. The court was legally airtight, the banana untouched, and frankly the goblin warned me. Care for a snare? Three sizes. No warranty.'),
  ]);
  return 'done';
});

// ============================================================
// Danquavious Chimperton III — 'Present-evidence' (Q10-owned option)
// ============================================================

registerNpcAction('danquavious_chimperton', 'Present-evidence', (_n: Npc) => {
  const s = stage();

  if (s < 4) {
    startDialogue([
      ...say(HERALD, 'HIS MAJESTY ASKS — and I quote the gesture directly — "evidence of WHAT?" The Court of the Southern Lawn does not hear hypotheticals. Return when you have a case, a grievance, or a truly exceptional banana.'),
    ]);
    return 'done';
  }

  if (s === 4) {
    if (!hasItem('lucky_shim') || !hasItem('shim_receipt')) {
      const missing = !hasItem('lucky_shim')
        ? 'You come before the Sovereign of Bananas without the DISPUTED SHIM? The hammer, the millstone — acquaint them. The court will wait. Regally.'
        : 'No receipt, no case! Wayfarer Sorrel will furnish one. He always does. That is, in fact, the substance of the complaint.';
      startDialogue(say(HERALD, missing));
      return 'done';
    }
    startDialogue([
      ...say(HERALD, 'OYEZ! OYEZ! THE COURT OF THE SOUTHERN LAWN IS NOW IN SESSION! PRESIDING: DANQUAVIOUS CHIMPERTON THE THIRD, SOVEREIGN OF BANANAS, DUKE OF THE SOUTHERN LAWN, WINNER OF BOTH A JOUST AND A BANANA-EATING CONTEST! THE CASE OF GREAVES VERSUS SORREL VERSUS, REGRETTABLY, THE WIND!'),
      ...me('That was extremely loud.'),
      ...say(HERALD, 'Thank you. Present the evidence to His Majesty.'),
      ...say(SOVEREIGN, '*The Sovereign takes the shim in both hands and examines it with tremendous gravity. He turns it over. He listens to it. His brow furrows in a way that has ended dynasties.*'),
      ...say(SOVEREIGN, '*He holds it beside the golden banana on its pedestal, considers them both for a long moment, and makes a single decisive gesture.*'),
      ...say(HERALD, 'HIS MAJESTY RULES AS FOLLOWS! ONE: the shim hums, and humming stones are CROWN EVIDENCE, to be displayed beside the golden banana in perpetuity, where someone responsible can keep an eye on it.'),
      ...say(HERALD, 'TWO: Wayfarer Sorrel shall refund Miller Greaves in full, the phrase "in good faith" having been weighed by the court and found to contain neither. THREE: the case of Greaves versus the Wind is DISMISSED, the wind having retained no counsel and, in the court\'s judgment, having suffered enough.'),
      ...say(HERALD, 'The verdict is sealed. Court is adjourned! *quietly* That last part is usually louder, but His Majesty is napping.'),
    ], () => {
      void advanceQuestStage(QID, 5).then((stageEcho) => {
        if (!stageEcho.ok) return;
        void questbGrant('atg_court_verdict').then((grantEcho) => {
          if (!grantEcho.ok) return;
          msg('The shim is confiscated as crown evidence. You receive the sealed verdict of the Court of the Southern Lawn.');
        });
      });
    });
    return 'done';
  }

  // s >= 5: case closed.
  startDialogue([
    ...say(HERALD, 'The matter of Greaves versus Sorrel is CLOSED, and closed matters stay closed — that\'s what makes this court better than most. The shim sits beside the golden banana, humming to itself. His Majesty checks on it daily. He does not trust it. Nor, citizen, should you.'),
  ]);
  return 'done';
});

// ============================================================
// The millstone — wheat|millstone and hammer|millstone (Q10-owned keys),
// plus an Inspect flavor action (millstone/* owned by Q10).
// ============================================================

registerItemOnObject('wheat', 'millstone', (_slot, _o) => {
  const s = stage();

  if (s === 0) {
    msg('The millstone sits at an angle that stones should not achieve. Best talk to the miller before feeding it anything.');
    return;
  }

  if (s === 1) {
    if (freeSlots() === 0) {
      msg('You need a free inventory slot. The mill gives back more than it takes — that\'s the problem.');
      return;
    }
    void questbGrant('atg_mill_demo').then((grantEcho) => {
      if (!grantEcho.ok) return;
      void advanceQuestStage(QID, 2).then((stageEcho) => {
        if (!stageEcho.ok) return;
        startDialogue([
          ...me('*You drop one wheat into the hopper. The stone turns — the wrong way — with a sound like a song played from the last note to the first.*'),
          ...me('*Two wheat slide out of the flour chute.*'),
          ...say(HOB, '*From outside, you hear a soft thump as Miller Greaves lies down in the grass.*'),
          ...me('One in. Two out. That\'s... arithmetic now. It\'s doing arithmetic.'),
        ]);
      });
    });
    return;
  }

  if (s >= 2 && s <= 4) {
    msg('The stone strains against its own direction, humming faintly under the hopper. Best not feed it more until the court rules.');
    return;
  }

  if (s === 5) {
    void questbGrant('atg_mill_flour').then((echo) => {
      if (!echo.ok) return;
      msg('You feed a wheat into the hopper. The stone turns — the RIGHT way — and soft white flour pours from the chute. Miller Greaves will want to see this.');
    });
    return;
  }

  // Post-quest: the mill works like a mill.
  void questbGrant('atg_mill_flour').then((echo) => {
    if (!echo.ok) return;
    msg('The millstone grinds your wheat into flour, frontwards, like it never considered the alternative.');
  });
});

registerItemOnObject('hammer', 'millstone', (_slot, _o) => {
  const s = stage();

  if (s < 3) {
    msg('You see no reason to hit the millstone. Yet.');
    return;
  }

  if (s === 3 || (s === 4 && !hasItem('lucky_shim'))) {
    if (freeSlots() === 0 && !hasItem('lucky_shim')) {
      msg('You need a free inventory slot to take the shim.');
      return;
    }
    if (s === 3) {
      void questbGrant('atg_lucky_shim').then((grantEcho) => {
        if (!grantEcho.ok) return;
        void advanceQuestStage(QID, 4).then((stageEcho) => {
          if (!stageEcho.ok) return;
          msg('One firm whack and the lucky shim pops loose. It is still humming — a half-beat behind itself. You don\'t like that it\'s humming.');
        });
      });
    } else {
      void questbGrant('atg_lucky_shim').then((echo) => {
        if (!echo.ok) return;
        msg('You tap the housing and another splinter of the shim shakes loose from the hopper. Still humming. Still wrong.');
      });
    }
    return;
  }

  msg('The millstone has been hit quite enough for one lifetime.');
});

registerObjectAction('millstone', 'Inspect', (_o) => {
  const s = stage();
  if (s === 0) msg('A great grinding stone. Something thin and grey is wedged under the bed stone, and the whole assembly feels faintly... reluctant.');
  else if (s <= 2) msg('The stone is turning the wrong way at a speed best described as "smug." A grey shim glints beneath it.');
  else if (s === 3) msg('The shim sits wedged under the bed stone, humming. A solid whack with a hammer should free it.');
  else if (s === 4) msg('With the shim gone, the stone sits still and slightly sheepish, like a dog caught on the furniture.');
  else if (s === 5) msg('The stone idles, waiting for grain. It turns clockwise when you push it. That\'s new. That\'s correct.');
  else msg('Greaves Mill\'s stone, grinding frontwards, as the Choir intended. The flour is excellent.');
  return 'done';
});

// ============================================================
// Wheat fields east of the windmill — renewable wheat (Pick).
// ============================================================

registerObjectAction('wheat_field', 'Pick', (_o) => {
  if (freeSlots() === 0) {
    msg("You don't have enough inventory space.");
    return 'done';
  }
  void questbGrant('atg_pick_wheat').then((echo) => {
    if (!echo.ok) return;
    msg('You pick a sheaf of wheat.');
  });
  return 'done';
});

export {};
