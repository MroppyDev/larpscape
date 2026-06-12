// The Gathering Discord, Ch3: 'The Sealed Wing' (gd3_sealed_wing) — quest slot Q3.
// Brogan sends the player after the Swamp Mine's north gallery, bricked from the
// inside in '88 by Foreman Wat Hollis. Survey from Carpenter Lenny (2 planks),
// breaching charge from Sergeant Vex (2 coal + 1 ember crystal), blast the seal,
// put the hollow miners to rest, recover Hollis's ledger, return to Brogan.
// Completion (stage 6) is THE dungeon gate for the Untuned Mine (§14.2):
//   (state.player.quests['gd3_sealed_wing'] ?? 0) >= 6
// This pack owns: slayer_master/'Ask-about-the-sealed-wing',
// carpenter/'Ask-about-the-survey', gun_trainer/'Ask-about-blasting',
// imber_wizard/'Buy-ember-crystal', all untuned_mine_door object actions,
// and the 'blasting_charge|untuned_mine_door' item-on-object key.
// New ids (def'd in data/_fragments/q3_gd3.json): mine_survey, blasting_charge,
// foreman_ledger, hollis_lamp, hollow_miner, untuned_mine_door.
// Imported for side effects via src/packs/index.ts (integrator wires it).

import {
  msg, invCount,
  registerNpcAction, registerObjectAction, registerItemOnObject,
  startDialogue, showOptions, DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';
import { enterUntunedMine } from './untuned_mine';
import {
  questStage,
  advanceQuestStage,
  claimQuestReward,
  scriptedGrant,
  questCraft,
  auxCount,
} from '../quest-sync';

const QUEST = 'gd3_sealed_wing';
const MINERS = 'gd3_miners';       // aux: hollow miners laid to rest (0–2)
const MINERS_NEEDED = 2;
const PREREQ = 'gd2_quarrel_of_wizards';
const PREREQ_DONE = 6;

const PLANKS_NEEDED = 2;
const COAL_NEEDED = 2;
const CRYSTAL_PRICE = 200;

function stage(): number { return questStage(QUEST); }
function miners(): number { return auxCount(MINERS); }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

const BROGAN = 'Brogan';
const LENNY = 'Carpenter Lenny';
const VEX = 'Sergeant Vex';
const CALDER = 'Calder Brightverse';

// What Vex is still owed at stage 3 (charge not yet milled / not in hand).
function chargeMissing(): string[] {
  const need: string[] = [];
  const coal = invCount('coal');
  if (coal < COAL_NEEDED) need.push(`${COAL_NEEDED - coal} coal`);
  if (invCount('ember_crystal') < 1) need.push('an ember crystal');
  return need;
}

registerQuest({
  id: QUEST,
  name: 'The Sealed Wing',
  doneStage: 6,
  journal: (s) => {
    if (s <= 0) return 'Brogan has the wizards\' writ on his desk and a face like the weather\'s turned.';
    if (s === 1) {
      return invCount('plank') >= PLANKS_NEEDED
        ? 'I have the 2 planks Carpenter Lenny wants for the old mine survey. His workshop is south of the castle.'
        : 'Carpenter Lenny has the old mine survey buried in his workshop. He wants 2 planks — for the shelf he\'s been meaning to fix since \'39.';
    }
    if (s === 2) return 'The survey marks a sealed gallery in the Swamp Mine — sealed on purpose. Sergeant Vex at the Aldgate Gun Guild can mill a breaching charge.';
    if (s === 3) {
      if (invCount('blasting_charge') >= 1) return 'Vex\'s blasting charge is packed and fused. The sealed gallery waits at the Swamp Mine\'s cave mouth.';
      const need = chargeMissing();
      return need.length
        ? `Vex wants 2 coal and an ember crystal to mill a breaching charge. Still to find: ${need.join(', ')}. (Coal: mine it or buy it. Crystal: cinder imps, the Shadow Drake — or Calder sells one.)`
        : 'I have the 2 coal and the ember crystal. Sergeant Vex in Aldgate will mill the breaching charge.';
    }
    if (s === 4) {
      return miners() >= MINERS_NEEDED
        ? 'The hollow miners are at rest. I should search the breached seal for whatever Hollis left behind.'
        : `The charge cracked the seal — and the seal answered. Put the hollow miners to rest. (${Math.min(miners(), MINERS_NEEDED)}/${MINERS_NEEDED})`;
    }
    if (s === 5) return 'Foreman Hollis sealed the wing because someone was down there — transcribing. Brogan has to see this ledger.';
    return 'The sealed wing is open and the duchy license covers it. Whatever Hollis walled in, it\'s mine to face now. Quest complete!';
  },
});

// ============================================================
// Brogan (slayer_master) — quest giver and turn-in
// ============================================================

registerNpcAction('slayer_master', 'Ask-about-the-sealed-wing', (_n: Npc) => {
  const s = stage();

  // Prereq: the wizards' writ has to reach the duchy first (Ch2 complete).
  if (s === 0 && questStage(PREREQ) < PREREQ_DONE) {
    startDialogue([
      ...say(BROGAN, 'Sealed wing? There\'s a wall in the Swamp Mine and a reason it\'s there. That\'s the whole story until somebody brings me a reason it shouldn\'t be.'),
      ...say(BROGAN, 'In writing. With seals on it. I don\'t open old graves on rumour.'),
    ]);
    return 'done';
  }

  if (s === 0) {
    startDialogue([
      ...say(BROGAN, 'You. Good. Flint sent the wizards\' writ up — both signatures, and three postscripts I\'ve chosen not to read.'),
      ...say(BROGAN, 'They triangulated your discord. West. Under the vale. Under the Swamp Mine — straight through the north gallery.'),
      ...me('The gallery that collapsed in \'88?'),
      ...say(BROGAN, 'It didn\'t collapse. Foreman Wat Hollis bricked it shut from the inside, and he never came out. Miners knock twice on the timbers going in. The second knock is his.'),
      ...say(BROGAN, 'If we\'re opening it, we open it right: find the gallery first. The duchy\'s old mine survey would mark it — but the archive copy\'s gone. Carpenter Lenny "borrowed" the shelf it sat on. Six years ago.'),
      ...say(BROGAN, 'Get the survey off Lenny. Then come back to me — or get ahead of it and see Sergeant Vex about a breaching charge. Slow and right, you hear?'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll dig the survey out of Lenny\'s workshop.',
          fn: () => {
            void advanceQuestStage(QUEST, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say(BROGAN, 'Mind the workshop. Lenny files everything under the leg of his workbench. Everything. There\'s a marriage certificate down there that\'s caused two feuds.'),
                ...say(BROGAN, 'Survey, then Vex, then the wall. And whatever Hollis shut in there — you don\'t turn your back on it.'),
              ]);
            });
          },
        },
        {
          label: 'A wall a dead man built? I\'ll leave it standing, thanks.',
          fn: () => {
            startDialogue(say(BROGAN, 'So would I, given the choice. The writ says we weren\'t given one. Come back when your nerve does.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    startDialogue([
      ...say(BROGAN, 'Survey first. Lenny has it — under two planks\' worth of shelf, by his own accounting.'),
      ...say(BROGAN, 'Sawmill or market, planks are planks. Don\'t let him start on the broom rota.'),
    ]);
    return 'done';
  }
  if (s === 2) {
    startDialogue([
      ...say(BROGAN, '"Not a cave-in. Don\'t let them dig." Aye, that\'s Hollis\'s hand. I\'d know it.'),
      ...say(BROGAN, 'Sergeant Vex at the Gun Guild mills the breaching charges. Show her the survey and stand where she tells you.'),
    ]);
    return 'done';
  }
  if (s === 3) {
    startDialogue([
      ...say(BROGAN, invCount('blasting_charge') >= 1
        ? 'Charge in hand? Then it\'s the cave mouth at the mine\'s south end. Knock twice on the timbers. Mean it.'
        : 'Vex won\'t pack a charge on promises — two coal and an ember crystal, that\'s her count. The mine has coal. Imps and worse have crystals. Calder sells them, if your purse is braver than you are.'),
    ]);
    return 'done';
  }
  if (s === 4) {
    startDialogue([
      ...say(BROGAN, miners() >= MINERS_NEEDED
        ? 'The echoes are down? Then whatever Hollis wanted us to know is through that gap. Search the breach.'
        : 'The seal answered, did it. Those are the \'88 crew — what the rock kept of them. Putting them down is the kindest thing anyone\'s done for that shift in forty years. Finish it.'),
    ]);
    return 'done';
  }
  if (s === 5) {
    if (invCount('foreman_ledger') >= 1) {
      startDialogue([
        ...me('Hollis kept writing, right up to the end. You should read it.'),
        ...say(BROGAN, '*Brogan takes the ledger like it might still be warm.* "It isn\'t a vein. It\'s a score. Someone is down here transcribing."'),
        ...say(BROGAN, '*He turns one more page, stops, and is quiet for longer than you have ever heard Brogan be quiet.* ...Aye. Well.'),
        ...say(BROGAN, 'He walled himself in with it so it couldn\'t follow him out. Forty years that held. The duchy owes him better than a torn page.'),
      ], finishQuest);
    } else {
      // Stage-gated completion: the ledger is evidence, not a key (Q1 precedent).
      startDialogue([
        ...me('I found Hollis\'s ledger in the breach. His last entry: "It isn\'t a vein. It\'s a score. Someone is down here transcribing."'),
        ...say(BROGAN, 'Transcribing. *He says the word like it owes him money.* That\'s why he sealed it. Not what was down there — who.'),
        ...say(BROGAN, 'He walled himself in with it so it couldn\'t follow him out. Forty years that held. The duchy owes him better than a torn page.'),
      ], finishQuest);
    }
    return 'done';
  }
  // Post-quest idle line.
  startDialogue([
    ...say(BROGAN, 'The wing\'s open and your name\'s on the license. Hollis\'s lamp still burning? Watch when it doesn\'t.'),
  ]);
  return 'done';
});

function finishQuest() {
  void advanceQuestStage(QUEST, 6).then((echo) => {
    if (!echo.ok) return;
    void claimQuestReward(QUEST, 6);
    msg('Congratulations! Quest complete!', 'level');
    msg('You have unlocked the Untuned Mine. The breach in the Swamp Mine\'s sealed gallery stands open.', 'level');
    startDialogue([
      ...say(BROGAN, 'Here\'s how it stands. The duchy license now covers the north gallery — the wing is yours to enter, and the duchy\'s six hundred coins say thank you for the privilege.'),
      ...say(BROGAN, 'And take his lamp. Hollis trimmed it the day he went in; it was still trying when we found it. It gutters near sour notes. Trust it over your ears.'),
      ...me('And the first name in your ledger? The one that tore the page?'),
      ...say(BROGAN, '*Brogan opens his ledger, uncrosses nothing, and writes today\'s date next to the hole in the paper.* Knock twice going in.'),
    ]);
  });
}

// ============================================================
// Carpenter Lenny — the survey under the workbench (stage 1 → 2)
// ============================================================

registerNpcAction('carpenter', 'Ask-about-the-survey', (_n: Npc) => {
  const s = stage();
  if (s === 0 || s > 1) {
    startDialogue([
      ...say(LENNY, s > 1
        ? 'Found it, didn\'t I! First thing to come off that workbench since \'41. The shelf\'s going up any day now. Any day.'
        : 'Survey? I\'ve got surveys, deeds, two wills and somebody\'s marriage lines down there. It\'s not lost, it\'s filed. Under the workbench. Load-bearing, see.'),
    ]);
    return 'done';
  }
  // Stage 1.
  if (invCount('plank') < PLANKS_NEEDED) {
    startDialogue([
      ...say(LENNY, 'Brogan wants the old mine survey? Oh, I know right where that is. Under the south leg of the workbench. Been holding the whole arrangement level since \'39.'),
      ...me('Can you get it out?'),
      ...say(LENNY, 'Course I can — once there\'s a shelf to move it all onto. Which there would be, if I had two planks. Which I\'ve been about to have since \'39.'),
      ...say(LENNY, `Bring me ${PLANKS_NEEDED} planks and I\'ll have your survey out before the sawdust settles. The sawmill cuts them, or the market sells them — I measure, I don\'t judge.`),
    ]);
    return 'done';
  }
  startDialogue([
    ...me('Two planks. Measure them twice if you like.'),
    ...say(LENNY, 'Already did, from here. *Lenny builds the shelf in roughly the time it takes to say so, then kneels at the workbench like a man defusing it.* Will... deed... marriage lines — ooh, that explains the feud — survey!'),
    ...say(LENNY, 'There. Six years of "about to" and it took a morning. Don\'t tell anyone, it\'d ruin me.'),
  ], () => {
    void advanceQuestStage(QUEST, 2).then((echo) => {
      if (!echo.ok) return;
      void scriptedGrant(QUEST, 2);
      startDialogue([
        ...say(LENNY, 'Hold up — there\'s writing on it. North gallery, circled. "Not a cave-in. Don\'t let them dig." That\'s the foreman\'s own hand, that is.'),
        ...say(LENNY, 'Walls I understand. Walls with opinions, that\'s Gun Guild business. Sergeant Vex, in Aldgate. Tell her the shelf\'s fixed.'),
      ]);
    });
  });
  return 'done';
});

// ============================================================
// Sergeant Vex — the breaching charge (stage 2 → 3 → charge in hand)
// ============================================================

registerNpcAction('gun_trainer', 'Ask-about-blasting', (_n: Npc) => {
  const s = stage();
  if (s < 2) {
    startDialogue([
      ...say(VEX, 'Blasting is a Guild service with a Guild form, and the form starts with "why". Bring me a why with paperwork attached.'),
    ]);
    return 'done';
  }
  if (s === 2) {
    startDialogue([
      ...me('Brogan needs a wall opened. The old survey marks it — the Swamp Mine\'s sealed north gallery.'),
      ...say(VEX, '*Vex reads the survey once, then again with a straightedge.* "Don\'t let them dig." And the duchy\'s answer is a breaching charge. There\'s a lesson about chains of command in there somewhere.'),
      ...say(VEX, 'Right. A wall that thick wants a milled charge, and I pack those myself. Materials are on you: two coal — honest fuel, mine it or buy it, I don\'t care which — and one ember crystal for the primer.'),
      ...say(VEX, 'Crystals turn up in cinder imps and the Shadow Drake, if you like your shopping violent. Otherwise the fire wizard at the Imber Spire sells them — Brightverse. Count your change.'),
    ], () => { void advanceQuestStage(QUEST, 3); });
    return 'done';
  }
  if (s === 3) {
    if (invCount('blasting_charge') >= 1) {
      startDialogue([
        ...say(VEX, 'You\'re still holding it and I\'m still watching you hold it. Swamp Mine, south cave mouth, charge against the masonry, then stand somewhere you\'d be happy to keep standing.'),
      ]);
      return 'done';
    }
    const need = chargeMissing();
    if (need.length > 0) {
      startDialogue([
        ...say(VEX, `Count\'s short. I still need ${need.join(' and ')}. The charge is only as honest as what goes in it.`),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('Two coal, one ember crystal. Counted twice.'),
      ...say(VEX, 'Counting twice is the whole curriculum. *She mills, packs and fuses the charge with the calm of a woman who has personally met every way this can go wrong.*'),
      ...say(VEX, 'One breaching charge. Set it against the gallery masonry and let the fuse do the talking. Everything on the far side of that wall was sealed in on purpose — so reload before you light it, not after.'),
    ], () => {
      void questCraft('gd3_blasting_charge').then((echo) => {
        if (echo.ok) msg('Sergeant Vex mills and packs a breaching charge.');
      });
    });
    return 'done';
  }
  // Stage 4+.
  startDialogue([
    ...say(VEX, s >= 6
      ? 'Clean breach, confirmed kills, paperwork filed. If the Guild gave marks, you\'d have mine.'
      : 'The charge did its job. Whatever\'s left at that wall is yours to finish — that part never came in a crate.'),
  ]);
  return 'done';
});

// ============================================================
// Calder Brightverse — the mercantile path to an ember crystal
// ============================================================

registerNpcAction('imber_wizard', 'Buy-ember-crystal', (_n: Npc) => {
  startDialogue([
    ...me('I\'m told you sell ember crystals.'),
    ...say(CALDER, `Sell! I rehome them. A live coal in a crystal lattice, burning forever — it is the only honest pet. ${CRYSTAL_PRICE} coins, and I shall want to know it\'s going somewhere warm.`),
  ], () => {
    showOptions([
      {
        label: `Here\'s ${CRYSTAL_PRICE} coins. It\'s going in a bomb.`,
        fn: () => {
          if (invCount('coins') < CRYSTAL_PRICE) {
            startDialogue(say(CALDER, 'That is fewer coins than the number we discussed. Fire forgives much. Arithmetic, nothing.'));
            return;
          }
          void questCraft('gd3_buy_crystal').then((echo) => {
            if (!echo.ok) return;
            startDialogue([
              ...say(CALDER, 'A bomb! *Calder\'s eyes shine in a way that explains the eyebrows.* The finest of all the warm somewheres. Tell it Calder said burn well.'),
            ]);
          });
        },
      },
      {
        label: 'Too rich for me. I\'ll go shake one out of an imp.',
        fn: () => {
          startDialogue(say(CALDER, 'Thrift and violence — the classical economy. Do give the imp my regards; we\'ve corresponded.'));
        },
      },
    ]);
  });
  return 'done';
});

// ============================================================
// The sealed gallery (untuned_mine_door) — blast, search, enter
// ============================================================

// Use blasting charge on the seal: stage 3 → 4 (the breach; the seal answers).
registerItemOnObject('blasting_charge', 'untuned_mine_door', (_slot, _o) => {
  if (stage() !== 3) {
    msg('Not without Brogan\'s say-so and Vex\'s instructions. Walls like this get one chance to be opened right.');
    return;
  }
  void advanceQuestStage(QUEST, 4).then((echo) => {
    if (!echo.ok) return;
    msg('You set the charge against the masonry and light the fuse...', 'game');
    msg('The blast cracks the seal! A beat later, something in the rock answers — and two shapes peel away from the stone.', 'level');
    startDialogue([
      ...say('The breach', '*The masonry splits along a seam no chisel made. From the scarred rock, two figures shrug free — miners in the fashion of forty years ago, the colour of ash, knocking twice on nothing.*'),
    ]);
  });
});

// Search the seal: pre-blast flavor; stage 4 progress; stage 4-complete → ledger (stage 5).
registerObjectAction('untuned_mine_door', 'Search', () => {
  const s = stage();
  if (s < 4) {
    msg('Mine masonry, laid fast and laid well. The trowel marks face the wrong way — this wall was built from the other side.');
    return 'done';
  }
  if (s === 4) {
    if (miners() < MINERS_NEEDED) {
      msg('The breach is open a hand\'s width — but the hollow miners still hold their shift. Put them to rest first.');
      return 'done';
    }
    void advanceQuestStage(QUEST, 5).then((echo) => {
      if (!echo.ok) return;
      void scriptedGrant(QUEST, 5);
      msg('Through the gap, within arm\'s reach of the seal — set where a hand could find it — lies a ledger.', 'level');
      startDialogue([
        ...say('Foreman\'s ledger', '*The entries thin from ore counts to a single line, written over and over in a steadying hand:*'),
        ...say('Foreman\'s ledger', '"It isn\'t a vein. It\'s a score. Someone is down here transcribing."'),
        ...me('Brogan has to see this.'),
      ]);
    });
    return 'done';
  }
  // Stage 5+: the breach stands; the ledger spot is empty.
  msg(s >= 6
    ? 'The breach stands open. Cold air keeps time against your face.'
    : 'The gap where the ledger lay. Hollis left it where a hand could find it. Brogan has to see it.');
  return 'done';
});

// Enter: THE DUNGEON GATE (§14.2 contract — the >= 6 check is binding; the
// open branch delegates to the dungeon client (src/packs/untuned_mine.ts),
// which validates again server-side and teleports into the private run).
registerObjectAction('untuned_mine_door', 'Enter', () => {
  if (questStage('gd3_sealed_wing') >= 6) {
    void enterUntunedMine();
  } else if (stage() >= 4) {
    msg('The breach is too raw to pass, and the duchy license isn\'t yours yet. Brogan first.');
  } else {
    msg('The gallery is bricked shut — from the inside. It would take a blasting charge and a duchy writ.');
  }
  return 'done';
});

// Open: politely redirects — this was never a door that opens.
registerObjectAction('untuned_mine_door', 'Open', () => {
  if (questStage('gd3_sealed_wing') >= 6) {
    msg('There is nothing left to open. The breach stands, and it isn\'t closing again.');
  } else if (stage() >= 4) {
    msg('The blast did the opening. What\'s left is rubble, duty, and paperwork — in that order.');
  } else {
    msg('There is no handle, no hinge, no keyhole. Whoever built this wasn\'t expecting to use it again.');
  }
  return 'done';
});

