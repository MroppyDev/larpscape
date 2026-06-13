// The Gathering Discord, Ch2: 'A Quarrel of Wizards' — gd2_quarrel_of_wizards.
// Master Flint (Aldgate Gun Guild) sends the player to the realm's two consulting
// wizards — Calder Brightverse (Imber Spire, 270,17) and Vesper Hollowell (Quiess
// Tower, 284,86) — who agree the slivers are ringing and on absolutely nothing
// else. The tuning fork (Q1's keepsake) triangulates the source at three road
// waystones: west, under the vale, at the Swamp Mine.
//
// Owned handlers (per QUEST-DESIGN §14.3/§14.4):
//   gun_guild_master / 'Ask-about-the-fizzles'
//   imber_wizard     / 'Talk-to'
//   quiess_wizard    / 'Talk-to'
//   itemOnObject 'tinderbox|brazier'    (coord-gated to the Imber Spire braziers)
//   itemOnObject 'tuning_fork|waystone'
// Aux quest keys (gd2_ prefix): gd2_rings (waystone bitmask),
//   gd2_brazier (0 = unstoked, 1 = stoked, 2 = Calder's verdict heard).
// Fragment data/_fragments/q2_gd2.json: wizards_writ, guild_powder_horn,
//   discord_wisp def + 2 spawns (262,128)/(277,112).
// Imported for side effects via src/packs/index.ts (integrator wires it).

import {
  state, msg, hasItem,
  registerNpcAction, registerItemOnObject, registerItemAction,
  startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { WorldObject } from '../world';
import { registerQuest } from '../quests';
import {
  questStage,
  advanceQuestStage,
  claimQuestReward,
  scriptedGrant,
  questbGrant,
  questMark,
  auxCount,
} from '../quest-sync';

const QUEST = 'gd2_quarrel_of_wizards';
const RINGS = 'gd2_rings';       // bitmask: 1 = Aldgate east road, 2 = corridor road, 4 = Stonewatch south road
const BRAZIER = 'gd2_brazier';   // 0 = unstoked, 1 = stoked, 2 = verdict heard

const FLINT = 'Master Flint';
const CALDER = 'Calder Brightverse';
const VESPER = 'Vesper Hollowell';

function stage(): number { return questStage(QUEST); }
function rings(): number { return auxCount(RINGS); }
function brazier(): number { return auxCount(BRAZIER); }
function gd1Done(): boolean { return questStage('gd1_sour_notes') >= 5; }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

// The three road waystones (existing map objects).
const STONES: { bit: number; x: number; y: number; name: string }[] = [
  { bit: 1, x: 356, y: 38, name: 'the Aldgate east road' },
  { bit: 2, x: 383, y: 130, name: 'the corridor road' },
  { bit: 4, x: 361, y: 202, name: 'the Stonewatch south road' },
];
function ringCount(): number {
  return STONES.filter((s) => (rings() & s.bit) !== 0).length;
}
function stonesLeft(): string {
  return STONES.filter((s) => (rings() & s.bit) === 0).map((s) => s.name).join(', ');
}

// Imber Spire footprint — gates the tinderbox|brazier key so hearth braziers
// elsewhere in the world stay decorative.
function atSpire(o: WorldObject): boolean {
  return o.x >= 383 && o.x <= 397 && o.y >= 5 && o.y <= 23;
}

// ============================================================
// Quest registration
// ============================================================

registerQuest({
  id: QUEST,
  name: 'A Quarrel of Wizards',
  doneStage: 6,
  journal: (s) => {
    if (s <= 0) return 'Master Flint has been frowning at the Guild\'s powder ledger and muttering about fizzle rates.';
    if (s === 1) return 'Master Flint wants the wizards consulted. Calder Brightverse keeps the Imber Spire in the eastern snows.';
    if (s === 2) {
      if (brazier() === 0) return 'Calder refuses to scry over a cold brazier. I should stoke one of the spire braziers with a tinderbox.';
      if (brazier() === 1) return 'The spire brazier is roaring. Calder can hardly refuse to scry now.';
      return 'Calder says the Offnote is waking and the answer is fire. He insists Vesper will say something soggy about listening. She keeps the Quiess Tower, south along the coast.';
    }
    if (s === 3) {
      const left = stonesLeft();
      return `Ring the tuning fork at the three road waystones: the Aldgate east road, the corridor road, the Stonewatch south road. (${ringCount()}/3${left ? ` — still to sound: ${left}` : ''})`;
    }
    if (s === 4) return 'I have all three readings. Either wizard can read them — preferably without the other in the room.';
    if (s === 5) return 'West. Under Bellmeadow itself. The wizards co-signed a writ for Master Flint — the postscripts are mostly about each other.';
    return 'The discord is coming from under the Swamp Mine. Flint is taking the writ to the duchy. Quest complete!';
  },
});

// ============================================================
// Master Flint — 'Ask-about-the-fizzles' (start + turn-in)
// ============================================================

registerNpcAction('gun_guild_master', 'Ask-about-the-fizzles', (_n: Npc) => {
  const s = stage();

  if (s === 0) {
    if (!gd1Done()) {
      // Prereq brush-off: Ch1 not complete.
      startDialogue([
        ...me('I hear the Guild\'s powder has been misbehaving.'),
        ...say(FLINT, 'It has, and I have a ledger, a theory, and no patience for sightseers. Guild business stays Guild business.'),
        ...say(FLINT, 'If you turn up with a reason for me to talk — a letter, a credential, a tuning fork that means something — we\'ll talk.'),
      ]);
      return 'done';
    }
    const hasLetter = hasItem('mira_letter');
    startDialogue([
      ...me('Mira of Bellmeadow sent me. About the hum.'),
      ...(hasLetter
        ? say(FLINT, '*Flint reads Mira\'s letter twice, folds it along the existing crease, and sets it on the ledger like a paperweight.* She writes a tidy hand for someone delivering bad news.')
        : say(FLINT, 'Mira\'s rider got here ahead of you — word of a flat vale and rising motes. I\'d hoped she was wrong. She is not usually wrong.')),
      ...say(FLINT, 'Here\'s mine to add to it. The Guild logs every misfire — date, batch, weather, mood of the armourer. Fizzle rate has held at one in two hundred since the charter.'),
      ...say(FLINT, 'This bar it\'s one in forty. The powder isn\'t damp and the patterns haven\'t changed. The milled Offnote is *livelier*. Our quality control is, accidentally, the realm\'s best discord gauge.'),
      ...me('So what does the Guild do with a lively ledger?'),
      ...say(FLINT, 'The Guild forwards the problem to the consulting wizards, per charter. Both of them. They haven\'t agreed since F.S. 720, and they keep meticulous records of it — I have a drawer of their correspondence and a fire bucket beside the drawer.'),
      ...say(FLINT, 'Start with Calder Brightverse at the Imber Spire, in the eastern snows past Frostpeak\'s shoulder. Then Vesper Hollowell at the Quiess Tower, down the coast. Get me one answer between the two of them. In writing.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll go consult your wizards.',
          fn: () => {
            void advanceQuestStage(QUEST, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say(FLINT, 'Good. Two warnings, free of charge. Calder will demand a fee in firewood and certainty. Vesper will not raise her voice, which is worse.'),
                ...say(FLINT, 'And whatever they tell you, do not mention the other one\'s name first. It adds a full day to the conversation.'),
              ]);
            });
          },
        },
        {
          label: 'Two feuding wizards? I\'d rather face the misfires.',
          fn: () => {
            startDialogue(say(FLINT, 'That is, statistically, the safer choice. The ledger will keep counting either way. So will whatever\'s making it count.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    startDialogue([
      ...say(FLINT, 'Still here? The Imber Spire is east, past the snows — Calder Brightverse, all eyebrows and opinions. Well. Opinions.'),
      ...say(FLINT, 'Then Vesper Hollowell at the Quiess Tower on the south coast. One answer, in writing. I\'ll be with the ledger.'),
    ]);
    return 'done';
  }
  if (s === 2 || s === 3 || s === 4) {
    startDialogue([
      ...say(FLINT, 'No writ yet, I see. The fizzle count went up by two while you were out — I\'m charting it on the wall now. The line points up and to the right, which in powder terms is down and to the left.'),
      ...say(FLINT, 'Keep at the wizards. One answer. In writing.'),
    ]);
    return 'done';
  }

  if (s === 5) {
    if (!hasItem('wizards_writ')) {
      startDialogue([
        ...say(FLINT, 'You have the answer and not the paper? In the Guild we call that a fizzle.'),
        ...say(FLINT, 'Either wizard will copy the writ out again — they never throw away anything they\'ve signed. Go fetch it.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('One answer, in writing. Co-signed.'),
      ...say(FLINT, '*Flint reads the writ. Then the postscripts. He ages slightly during the postscripts.* "The source sits west, beneath the Bellmeadow vale, at the Swamp Mine workings." Both signatures. Three complaints.'),
      ...say(FLINT, 'Forty years that mine\'s been the duchy\'s quiet little coal pocket, and the realm\'s trouble has been keeping time underneath it.'),
      ...say(FLINT, 'You realise what you\'ve done? You got Brightverse and Hollowell to agree on paper. The duchy will believe the *that* before they believe the *what*.'),
    ], () => {
      void advanceQuestStage(QUEST, 6).then((echo) => {
        if (!echo.ok) return;
        void claimQuestReward(QUEST, 6);
        msg('Congratulations! Quest complete!', 'level');
        startDialogue([
          ...say(FLINT, 'I\'ll stamp the Guild seal on this and put it before Brogan and the Duke myself. Whatever\'s under that mine gets answered properly — with paperwork first, then with everything else.'),
          ...say(FLINT, 'For the Guild\'s thanks: four hundred coins, and my own powder horn. Never fizzled once in twenty years. If it ever does — run west, because it means the thing under the vale is singing louder.'),
        ]);
      });
    });
    return 'done';
  }

  // Post-quest idle.
  startDialogue([
    ...say(FLINT, 'The writ\'s gone up the chain with the Guild seal on it. Brogan read it standing up, which for Brogan is a panic.'),
    ...say(FLINT, 'Fizzle rate\'s still climbing, by the by. I\'ve stopped charting it on the wall. Ran out of wall.'),
  ]);
  return 'done';
});

// ============================================================
// Calder Brightverse — 'Talk-to' (Imber Spire)
// ============================================================

registerNpcAction('imber_wizard', 'Talk-to', (_n: Npc) => {
  const s = stage();

  // Pre-quest ambient.
  if (s === 0) {
    startDialogue([
      ...say(CALDER, 'Visitors. Excellent. Stand near the brazier — not for your comfort, for my reading. Everything reads better near fire.'),
      ...say(CALDER, 'If you\'ve come about the cold, the snow, or the correspondence of a certain coastal *mumbler*, the answers are: fire, more fire, and I have filed her latest letter under kindling.'),
    ]);
    return 'done';
  }

  if (s === 1) {
    startDialogue([
      ...me('Master Flint sent me. The Guild\'s powder is misfiring — one in forty. He wants the consulting wizards\' answer.'),
      ...say(CALDER, 'One in forty! *Calder\'s eyes gleam. Where his eyebrows would be, the skin attempts to rise.* Of course it is. The milled percussion is waking up in the cartridges. I have been saying this since midwinter.'),
      ...say(CALDER, 'I\'ll scry it properly and give Flint his answer. But I scry by flame, and some *draught* has had the temerity to sulk my doorway braziers down to embers.'),
      ...say(CALDER, 'Stoke one. A tinderbox will do — honest spark, honest flame. Then we\'ll see what the fire sees.'),
      ...me('You\'re a fire wizard. You can\'t light your own brazier?'),
      ...say(CALDER, 'I can ignite it from here along with most of the doorframe. *Stoking* is a craft. Mind the difference and you may yet amount to something.'),
    ], () => {
      void questMark('gd2_brazier_stoke');
      void advanceQuestStage(QUEST, 2);
    });
    return 'done';
  }

  if (s === 2) {
    if (brazier() === 0) {
      startDialogue([
        ...say(CALDER, 'The brazier, traveller. Tinderbox, fuel, patience — in that order. The fire will not read for an audience that can\'t be bothered to seat it.'),
      ]);
      return 'done';
    }
    if (brazier() === 1) {
      startDialogue([
        ...say(CALDER, '*Calder spreads his hands over the roaring brazier and goes quiet — the first quiet of the visit. The flame leans, all one way, like grass under wind that isn\'t blowing.*'),
        ...say(CALDER, 'There. You see it? The fire is listening to something. The slivers — the Offnote\'s little leavings, the ones we politely call inert — are ringing. All of them. Together.'),
        ...say(CALDER, 'It is *waking*. And here is the part I\'ll thank you to carry exactly: they ring louder at night. The same hours Korr hammers in the deep rock. The world\'s percussion section is finding its beat.'),
        ...me('And the answer is?'),
        ...say(CALDER, 'Fire. Find the source and burn it out before it finishes waking. This is not doctrine, it is *hygiene*.'),
        ...say(CALDER, 'But Flint will want both opinions — the charter\'s one genuinely cruel clause. Go and see Vesper Hollowell at the Quiess Tower. She will say something soggy about listening. Endure it, and come back with whatever she scribbles.'),
      ], () => { void questMark('gd2_brazier_verdict'); });
      return 'done';
    }
    // brazier() === 2 — verdict heard, reminder.
    startDialogue([
      ...say(CALDER, 'The Quiess Tower, south along the coast. Tell Hollowell the fire says *waking*. Watch her pretend not to have heard you — she does it beautifully, it\'s her one volume.'),
    ]);
    return 'done';
  }

  if (s === 3) {
    startDialogue([
      ...say(CALDER, 'Triangulation. Hmph. Her idea, which means it is slow, damp, and — *Calder grinds the admission out* — correct.'),
      ...say(CALDER, `Sound your fork at the three road waystones: the Aldgate east road, the corridor road, the Stonewatch south road. (${ringCount()}/3 so far.) Then bring me the offsets. ME. The stones keep Aulden\'s pitch; the lag in their answer points the way.`),
    ]);
    return 'done';
  }

  if (s === 4) {
    startDialogue([
      ...me('Three stones, three readings. The lag leans the same way at every one.'),
      ...say(CALDER, '*Calder chalks three marks on the hearthstone, strikes lines between them, and stops talking mid-syllable — a first.* West. The bearings cross west of here. Under the vale. Under *Bellmeadow*.'),
      ...say(CALDER, 'The Swamp Mine workings. The duchy has been pulling coal out of the lid of it for forty years.'),
      ...say(CALDER, 'This goes to Flint in writing, and it goes co-signed, because the duchy will not move for one wizard and I will not have them dawdle for the want of a *signature*. I have drafted. I have even left room for hers.'),
      ...say(CALDER, '*He signs, adds a postscript about coastal scrying methods, reads an imagined reply, and adds two more.* There. Deliver it to Flint. If Hollowell objects to my phrasing, tell her the fire stands by every word.'),
    ], () => {
      void advanceQuestStage(QUEST, 5).then((echo) => {
        if (!echo.ok) return;
        void scriptedGrant(QUEST, 5);
        msg('Calder co-signs the wizards\' writ. The postscripts outnumber the paragraphs.');
      });
    });
    return 'done';
  }

  if (s === 5) {
    if (!hasItem('wizards_writ')) {
      startDialogue([
        ...say(CALDER, 'You LOST the writ? Forty-two years of not agreeing with that woman, undone by a pocket. *Calder copies it out from memory, postscripts included, in a single furious motion.* Here. Sewn to your hand, ideally.'),
      ], () => { void questbGrant('gd2_lost_wizards_writ'); });
      return 'done';
    }
    startDialogue([
      ...say(CALDER, 'The writ goes to Master Flint at the Aldgate Gun Guild. Walk fast. Whatever is under that mine is not waiting for the post.'),
    ]);
    return 'done';
  }

  // Post-quest idle.
  startDialogue([
    ...say(CALDER, 'Flint has the writ; the duchy has the fright it deserves. And I have a letter from Hollowell that opens "Dear colleague" with no visible irony. The fire and I are both unsettled.'),
  ]);
  return 'done';
});

// ============================================================
// Vesper Hollowell — 'Talk-to' (Quiess Tower)
// ============================================================

registerNpcAction('quiess_wizard', 'Talk-to', (_n: Npc) => {
  const s = stage();

  if (s < 2 || (s === 2 && brazier() < 2)) {
    // Ambient / polite redirect until Calder's verdict is heard.
    startDialogue([
      ...say(VESPER, '*Vesper speaks barely above the sound of the tide.* Welcome to the tower. Mind the stairs — the dead use them too, and they don\'t look where they\'re going.'),
      ...(s >= 1
        ? say(VESPER, 'If the Guild sent you, you\'ll have been to Calder first. Go to Calder first. He counts the order of things, and I would rather he counted in your favour.')
        : say(VESPER, 'Listen on the landings, if you stay. The tower hums on quiet nights. Lately it hums... early.')),
    ]);
    return 'done';
  }

  if (s === 2) {
    // brazier() >= 2 — Calder's verdict heard; her counter-verdict + the task.
    startDialogue([
      ...me('Calder Brightverse says the Offnote is waking. He says the answer is fire.'),
      ...say(VESPER, '*Vesper closes her eyes, the way other people sigh.* Of course he does. He said fire when the Exchange flooded. The man would prescribe fire for a fire.'),
      ...say(VESPER, 'It is not waking. Waking is what a thing does on its own. The slivers are *gathering* — being called in, the way a verger calls stray notes home after a service. Something is doing the calling.'),
      ...say(VESPER, 'Here is what he won\'t have noticed, because flames don\'t count: the ringing keeps *tempo*. Random noise doesn\'t keep time, traveller. Someone is keeping it.'),
      ...me('You and Calder don\'t agree on anything, then.'),
      ...say(VESPER, 'We agree on one thing, this once, and you may tell him I said so quietly: triangulate. Your tuning fork against Aulden\'s waystones — the road-shrines hold true pitch, so the lag in each answer gives a bearing.'),
      ...say(VESPER, 'Three stones: on the Aldgate east road, on the corridor road past Eldermere, on the Stonewatch south road. The corridor keeps wolves and worse — you needn\'t fight anything that doesn\'t insist. Ring all three, and bring the readings to either of us. The arithmetic doesn\'t care which of us does it. We do, but it doesn\'t.'),
    ], () => {
      void advanceQuestStage(QUEST, 3);
    });
    return 'done';
  }

  if (s === 3) {
    startDialogue([
      ...say(VESPER, `The waystones: Aldgate east road, corridor road, Stonewatch south road. (${ringCount()}/3.) Strike, then *wait* — the answer is in how late the stone is, not how loud.`),
    ]);
    return 'done';
  }

  if (s === 4) {
    startDialogue([
      ...me('Three stones, three readings. Every answer drags the same direction.'),
      ...say(VESPER, '*Vesper lays the readings out on the windowsill and is silent long enough that the tide comes in slightly.* West. All three bearings close on the west. Under the vale. Under the Swamp Mine.'),
      ...say(VESPER, 'Forty years of coal carts rolling over it like a lullaby. And underneath, something keeping time.'),
      ...say(VESPER, 'This must reach the Guild co-signed — Calder\'s name and mine on one page, or the duchy will spend a season asking which of us to believe. *She writes the finding in a hand like falling snow, signs, and pauses over his signature line.* He will have drafted his own version. Tell him mine was shorter.'),
      ...say(VESPER, '*She adds one postscript, very small.* There. Take the writ to Master Flint. And traveller — walk softly past the mine, on your way to anywhere. Whatever conducts down there has just heard us listening.'),
    ], () => {
      void advanceQuestStage(QUEST, 5).then((echo) => {
        if (!echo.ok) return;
        void scriptedGrant(QUEST, 5);
        msg('Vesper co-signs the wizards\' writ. Her postscript is one line. It is the politest knife you have ever read.');
      });
    });
    return 'done';
  }

  if (s === 5) {
    if (!hasItem('wizards_writ')) {
      startDialogue([
        ...say(VESPER, 'The writ has wandered? Paper does that, near the coast. *She copies it out again without complaint, which is somehow more chastening than complaint.* To Master Flint, at the Guild. Hold it like it matters. It does.'),
      ], () => { void questbGrant('gd2_lost_wizards_writ'); });
      return 'done';
    }
    startDialogue([
      ...say(VESPER, 'Master Flint, at the Aldgate Gun Guild. He will read it twice and act once — the correct ratio. Go well.'),
    ]);
    return 'done';
  }

  // Post-quest idle.
  startDialogue([
    ...say(VESPER, 'The duchy has our writ, and Calder has written to me voluntarily — about *methods*, of course, but he spelled my name right. The world really is ending.'),
    ...say(VESPER, 'Keep your fork close. The tempo under the vale hasn\'t slowed. If anything, it\'s learned a second hand.'),
  ]);
  return 'done';
});

// ============================================================
// Tinderbox on brazier — stoking Calder's doorway braziers (spire-gated)
// ============================================================

registerItemOnObject('tinderbox', 'brazier', (_slot, o) => {
  if (!atSpire(o)) {
    msg('The brazier crackles along on its own. Nothing about it needs you.');
    return;
  }
  if (stage() === 2 && brazier() === 0) {
    void questMark('gd2_brazier_stoke').then((echo) => {
      if (!echo.ok) return;
      msg('You rake the embers, feed the coals, and coax the spire brazier up to a proper roar.');
      startDialogue([
        ...say(CALDER, '*From the doorway:* THERE. You hear that? A fire with its chest out. Come inside — let\'s see what it sees.'),
      ]);
    });
    return;
  }
  if (stage() === 2 && brazier() >= 1) {
    msg('The brazier is already roaring with professional pride. Calder is waiting.');
    return;
  }
  msg('You nurse the spire brazier a little brighter. Somewhere inside, Calder approves on principle.');
});

// ============================================================
// Tuning fork on waystones — the triangulation leg
// ============================================================

registerItemOnObject('tuning_fork', 'waystone', (_slot, o) => {
  const s = stage();
  if (s < 3) {
    msg('You ring the fork against the waystone. It hums, flat and sour — but you don\'t yet know what to listen for in the answer.');
    return;
  }
  if (s > 3) {
    msg('The waystone has given its reading. The fork hums against it, satisfied — or as close as it gets.');
    return;
  }
  const stone = STONES.find((st) => st.x === o.x && st.y === o.y);
  if (!stone) {
    msg('You sound the fork. The stone answers true and on time — this one isn\'t on the wizards\' list.');
    return;
  }
  if ((rings() & stone.bit) !== 0) {
    msg(`You already have this stone\'s reading. It answers exactly as late as before, which is the point of stones.`);
    return;
  }
  const markByBit: Record<number, string> = {
    1: 'gd2_waystone_east',
    2: 'gd2_waystone_corr',
    4: 'gd2_waystone_south',
  };
  void questMark(markByBit[stone.bit]).then((echo) => {
    if (!echo.ok) return;
    const flavor: Record<number, string> = {
      1: 'You strike the fork on the Aldgate east road stone. It answers a quarter-beat late, and the lag leans west, toward the vale.',
      2: 'You strike the fork on the corridor road stone. The answer drags half a beat, hauling westward like a tide.',
      4: 'You strike the fork on the Stonewatch south road stone. The reply comes late and low, bending away north and west.',
    };
    const n = ringCount();
    msg(`${flavor[stone.bit]} (${n}/3)`);
    if (questStage(QUEST) >= 4) {
      msg('Three stones, three late answers — every bearing leans the same way. Either wizard can read these.', 'level');
    }
  });
});

// ============================================================
// Guild powder horn keepsake — 'Strike' flavor action
// ============================================================

registerItemAction('guild_powder_horn', 'Strike', (_slot) => {
  msg('You strike the powder horn\'s flint. One clean spark, no fizzle. Somewhere in Aldgate, a ledger relaxes.');
});

export {};
