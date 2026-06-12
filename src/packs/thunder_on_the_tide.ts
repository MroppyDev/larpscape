// Quest pack Q9: 'Thunder on the Tide' (thunder_on_the_tide, doneStage 6).
// Harbormaster Quill finds gunpowder grit in a "fish" crate; Sergeant Vex
// deputizes the player to break a thunder-shale smuggling run through
// Gullswreck Cove. New content (fragment q9_smugglers.json): items
// powder_grit / guild_writ / false_manifest / powder_keg / guild_deputy_badge,
// npc cove_fence (Tilly Two-Receipts), object smuggler_crate (3 on the cove
// docks). Aux quest keys: q9_crates (bitmask), q9_runners (kill counter).
// Imported for side effects via src/packs/index.ts (integrator wires it).

import {
  state, msg, invCount,
  registerNpcAction, registerObjectAction, onKill,
  startDialogue, showOptions,
  DialogueLine, Npc, ObjectHandler,
} from '../game';
import { registerQuest } from '../quests';
import { questStage, advanceQuestStage, claimQuestReward, questbGrant, auxCount, setAuxCount, setAuxBits } from '../quest-sync';

const QUEST = 'thunder_on_the_tide';
const CRATES = 'q9_crates';     // bitmask: bit per dockside crate searched
const RUNNERS = 'q9_runners';   // pirates downed during stage 4
const RUNNERS_NEEDED = 2;

// Crate identity by map coordinate (must match q9_smugglers.json mapObjects).
const CRATE_BITS: Record<string, number> = {
  '108,261': 1,
  '110,261': 2,
  '112,264': 4,
};

function stage(): number { return questStage(QUEST); }
function crateMask(): number { return auxCount(CRATES); }
function cratesSearched(): number {
  const m = crateMask();
  return (m & 1 ? 1 : 0) + (m & 2 ? 1 : 0) + (m & 4 ? 1 : 0);
}
function runnersDown(): number { return auxCount(RUNNERS); }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

const QUILL = 'Harbormaster Quill';
const VEX = 'Sergeant Vex';
const TILLY = 'Tilly Two-Receipts';

registerQuest({
  id: QUEST,
  name: 'Thunder on the Tide',
  doneStage: 6,
  journal: (s) => {
    if (s <= 0) return 'Harbormaster Quill is holding a crate labeled \'MISC. EEL\' at arm\'s length.';
    if (s === 1) return 'Quill found powder grit in a fish crate. Sergeant Vex in Aldgate will know the mill it came from.';
    if (s === 2) return `Vex deputized me. The trail runs through Gullswreck — search the crates on the Wreckers' docks. (${cratesSearched()}/3)`;
    if (s === 3) return 'Two crates of lies and one of paperwork. The manifest names a fence: \'Tilly — two receipts as always.\'';
    if (s === 4) {
      const k = Math.min(runnersDown(), RUNNERS_NEEDED);
      return `Tilly sold me the truth, which she insists is her best-moving product. The runners work the night shed — Wreckers, two of them. (${k}/${RUNNERS_NEEDED} dealt with; then see Tilly.)`;
    }
    if (s === 5) {
      const have = (invCount('powder_keg') >= 1 ? 1 : 0) + (invCount('false_manifest') >= 1 ? 1 : 0);
      return `The runners are dealt with and I have the keg and the manifest. Vex gets both. (${have}/2)`;
    }
    return 'The powder run through Gullswreck is broken — but the stamp says it started inside the Guild. Vex is keeping that page. Quest complete!';
  },
});

// ============================================================
// Harbormaster Quill (Port Brackwater) — quest start + post-quest.
// Her Talk-to (region_port) and Ask-about-work (quest6_b) are owned elsewhere.
// ============================================================

registerNpcAction('harbormaster', 'Ask-about-the-crates', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...me('What\'s in the crate?'),
      ...say(QUILL, 'Officially? "MISC. EEL." Forty years on these docks, and I have never once met an eel that was miscellaneous. An eel is the most specific fish there is.'),
      ...say(QUILL, 'So I opened it. No eel. Salt straw, fish-paper — and this, in the bottom seam.'),
      ...say(QUILL, '*She tips a pinch of black grit into your palm.* That\'s not bilge dirt. It\'s milled. Something put it through a stone, and stones leave signatures.'),
      ...me('Milled into what?'),
      ...say(QUILL, 'That\'s the question I don\'t want the answer to. The crate came off a cove lighter, manifest says Gullswreck, and the only thing the Wreckers mill is trouble.'),
      ...say(QUILL, 'I keep the tide schedule in my head and the docks in line. What I can\'t do is leave my harbour to chase grit. Take it to Sergeant Vex at the Aldgate Gun Guild — if anyone can read a mill-stamp, it\'s her.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll take it to Vex.',
          fn: () => {
            void advanceQuestStage(QUEST, 1).then((stageEcho) => {
              if (!stageEcho.ok) return;
              void questbGrant('ttt_lost_grit').then((grantEcho) => {
                if (!grantEcho.ok) return;
                startDialogue([
                  ...say(QUILL, 'Good. Gun Guild, Aldgate — ask for Vex, and don\'t sneeze on the evidence.'),
                  ...say(QUILL, 'And if anyone asks, you\'re carrying eel. Miscellaneous eel. It\'s done wonders for everyone else.'),
                ]);
              });
            });
          },
        },
        {
          label: 'Sounds like a customs problem, not a me problem.',
          fn: () => {
            startDialogue(say(QUILL, 'Everything on a dock is a customs problem until it goes bang. Then it\'s everyone\'s. The grit keeps — come back if your curiosity does.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    if (invCount('powder_grit') === 0) {
      void questbGrant('ttt_lost_grit').then((echo) => {
        if (!echo.ok) return;
        startDialogue([
          ...say(QUILL, 'You\'ve lost the grit? Lucky for you the crate had seams to spare. *She taps out another pinch.*'),
          ...say(QUILL, 'Sergeant Vex. Aldgate. Try to arrive holding it this time.'),
        ]);
      });
      return 'done';
    }
    startDialogue([
      ...say(QUILL, 'Still here? Aldgate\'s north, the Guild\'s loud, and Vex is the one who looks like she\'s already counted your mistakes.'),
    ]);
    return 'done';
  }
  if (s < 6) {
    startDialogue([
      ...say(QUILL, 'Vex has you running her trail through the cove, I hear. Mind the boards over there — the Wreckers don\'t maintain theirs.'),
      ...say(QUILL, 'And mind the labels. The day they ship "FRESH SHARK (DO NOT OPEN)", believe the parenthesis.'),
    ]);
    return 'done';
  }
  // Post-quest: the grateful idle line.
  startDialogue([
    ...say(QUILL, '*Quill nods at a fresh stack of crates, every label boringly honest.* Cod. Herring. One actual eel, properly specified.'),
    ...say(QUILL, 'Forty years I\'ve kept this harbour\'s name clean on the trade charts. You just saved me the forty-first. The tide table\'s got a line in it for you — high water, no exceptions.'),
  ]);
  return 'done';
});

// ============================================================
// Sergeant Vex (gun_trainer, Aldgate) — ID the grit, deputize, turn-in.
// Her Talk-to/Trade (gun_guild) and Ask-about-blasting (Q3) are owned elsewhere.
// ============================================================

registerNpcAction('gun_trainer', 'Show-powder-sample', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...say(VEX, 'Sample of what? Recruit, if you\'re about to open your hand and show me lint, save us both the drill.'),
      ...me('Never mind. Wrong sergeant.'),
      ...say(VEX, 'There is no wrong sergeant. There are only people who haven\'t found anything worth showing me yet.'),
    ]);
    return 'done';
  }
  if (s === 1) {
    if (invCount('powder_grit') === 0) {
      startDialogue([
        ...say(VEX, 'You came to show me a powder sample. Without the powder sample.'),
        ...say(VEX, 'Harbormaster Quill will have more — the stuff sheds like a guilty conscience. Go back to Brackwater and this time keep your hand closed.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('Harbormaster Quill found this in a fish crate out of Gullswreck.'),
      ...say(VEX, '*Vex takes the grit, rolls it between finger and thumb, and holds it to the light.* Milled thunder-shale. Guild grind — see the grain? Even as a drumline.'),
      ...say(VEX, '*She is quiet for a moment. It is not a comfortable quiet.*'),
      ...me('You\'ve gone very calm.'),
      ...say(VEX, 'I lost a watch commission proving the armoury sold powder to a bandit king. I was loud about it. Loud got me a hearing, a discharge, and a Guild contract, in that order. So no — this time I\'m calm.'),
      ...say(VEX, 'Guild powder moving through Gullswreck means somebody\'s skipping Aldgate\'s ledgers. Off the books, off the charter, onto whoever pays. I will not watch that happen twice.'),
    ], () => {
      void advanceQuestStage(QUEST, 2).then((stageEcho) => {
        if (!stageEcho.ok) return;
        void questbGrant('ttt_lost_writ').then((grantEcho) => {
          if (!grantEcho.ok) return;
          startDialogue([
            ...say(VEX, '*She writes three lines, signs once, and stamps it hard enough to wake the desk.* That\'s a Guild writ. As of now you\'re my deputy. Congratulations; the pay is justice.'),
            ...say(VEX, 'Take Wick\'s ferry from Brackwater to the cove. The Wreckers stack their cargo on the dockside by the landing — search the crates. All of them. Powder leaves a trail, and so does paperwork.'),
            ...say(VEX, 'Count your rounds out there, deputy. The cove doesn\'t lend you any back.'),
          ]);
        });
      });
    });
    return 'done';
  }
  if (s >= 2 && s <= 4) {
    if (invCount('guild_writ') === 0) {
      void questbGrant('ttt_lost_writ').then((echo) => {
        if (!echo.ok) return;
        startDialogue([
          ...say(VEX, 'You lost the writ. *She writes another, slower, so you can watch each word being judged.* Deputies who lose their second writ become civilians who owe me a stamp.'),
        ]);
      });
      return 'done';
    }
    startDialogue([
      ...say(VEX, s === 2
        ? 'The crates won\'t search themselves, deputy. Wick\'s ferry, the cove, the dockside by the landing. Every crate.'
        : 'You\'re mid-trail. Follow it to the end and bring me what it\'s carrying. All of it.'),
    ]);
    return 'done';
  }
  if (s === 5) {
    const haveKeg = invCount('powder_keg') >= 1;
    const haveManifest = invCount('false_manifest') >= 1;
    if (!haveKeg || !haveManifest) {
      const missing = !haveKeg && !haveManifest ? 'the keg and the manifest'
        : !haveKeg ? 'the keg' : 'the manifest';
      startDialogue([
        ...say(VEX, `Report stands incomplete, deputy. I need ${missing} on this desk, not in a story about this desk.`),
        ...say(VEX, !haveKeg
          ? 'Tilly Two-Receipts will still be sitting on the keg — she holds stock better than nerve.'
          : 'The manifest came out of the dockside crates. Go shake them again.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('One keg of Guild powder, one manifest, two runners who\'ve retired from running.'),
      ...say(VEX, '*Vex sets the keg on the floor like it\'s asleep, and reads the manifest twice. Then she reads it a third time, and stops being a person who blinks.*'),
      ...me('What is it?'),
      ...say(VEX, 'The routing hand. I know it. It\'s not a Wrecker\'s — Wreckers can\'t spell "lamprey", let alone requisition it. This was written inside our supply chain.'),
      ...me('Inside the Guild? Shouldn\'t you tell Master Flint?'),
      ...say(VEX, 'I\'ll tell him what he can act on. The rest... *she folds the manifest once, precisely, and puts it inside her coat* ...the rest I\'m keeping. Last time I shouted, the rot just changed addresses. This time I\'ll be standing next to it when it turns around.'),
    ], () => {
      void advanceQuestStage(QUEST, 6).then((echo) => {
        if (!echo.ok) return;
        void claimQuestReward(QUEST, 6);
        msg('Congratulations! Quest complete!', 'level');
        startDialogue([
          ...say(VEX, 'Five hundred coins, drawn from the Guild\'s enforcement purse — which exists now, because I just invented it. And this.'),
          ...say(VEX, '*She presses a deputy\'s badge into your hand.* That isn\'t a souvenir. The Guild knows your name and so does its powder. Wear it, count your rounds, and when I need a deputy again — and I will — don\'t make me write a third writ.'),
        ]);
      });
    });
    return 'done';
  }
  // Post-quest.
  startDialogue([
    ...say(VEX, 'Deputy. The Gullswreck run is dead — Quill\'s lighters come up clean, and somewhere a fence is writing one receipt like an honest woman.'),
    ...say(VEX, 'The page in my coat keeps. So do I. Carry on.'),
  ]);
  return 'done';
});

// ============================================================
// Smuggler crates (Gullswreck dockside) — stage 2 search, bitmask q9_crates.
// ============================================================

const searchCrate: ObjectHandler = (o) => {
  const s = stage();
  if (s < 2) {
    msg('The crate is nailed shut, labelled "PICKLED LAMPREY (ASSORTED)". The Wreckers would object to an audit.');
    return 'done';
  }
  if (s === 2) {
    const bit = CRATE_BITS[`${o.x},${o.y}`] ?? 0;
    if (!bit) {
      // A crate that isn't one of the three on Vex's trail (future placements).
      msg('Splinters, sand and an honest absence of eel. Not one of the crates on Vex\'s trail.');
      return 'done';
    }
    if (bit && (crateMask() & bit)) {
      msg('You\'ve already been through this one. The lies don\'t improve on a second reading.');
      return 'done';
    }
    setAuxBits(CRATES, crateMask() | bit);
    const n = cratesSearched();
    if (n === 1) {
      startDialogue([
        ...say('', 'The crate is stencilled "PICKLED LAMPREY (ASSORTED)". You pry the lid: sand, salt straw, and a single boot. No lamprey has ever been less assorted.'),
      ]);
      return 'done';
    }
    if (n === 2) {
      startDialogue([
        ...say('', 'This one says "FRESH SHARK (DO NOT OPEN)". You open it. The shark is sand. The sand is not fresh. The warning, you decide, was aspirational.'),
      ]);
      return 'done';
    }
    // Third crate: the manifest.
    void advanceQuestStage(QUEST, 3).then((stageEcho) => {
      if (!stageEcho.ok) return;
      void questbGrant('ttt_lost_manifest').then((grantEcho) => {
        if (!grantEcho.ok) return;
        startDialogue([
          ...say('', '"MISC. EEL" again — the classics travel. Under a false bottom you find no eel, but paperwork: a shipping manifest written in two different hands.'),
          ...say('', 'One hand routes Guild powder through the cove in tidy, practised lines. The other has scrawled across the bottom: "Tilly — two receipts as always."'),
        ]);
        msg('You found a false manifest. The fence\'s name is Tilly.', 'level');
      });
    });
    return 'done';
  }
  if (s < 6 && invCount('false_manifest') === 0) {
    void questbGrant('ttt_lost_manifest').then((echo) => {
      if (!echo.ok) return;
      msg('Tucked beneath the false bottom is the manifest you mislaid. The smugglers file better copies than you keep.');
    });
    return 'done';
  }
  msg('Sand, straw, and fictional fish. You have what the crates were hiding.');
  return 'done';
};

registerObjectAction('smuggler_crate', 'Search', searchCrate);

// ============================================================
// Tilly Two-Receipts (cove_fence) — the confrontation, the runners, the keg.
// ============================================================

registerNpcAction('cove_fence', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s < 3) {
    startDialogue([
      ...say(TILLY, 'Buying or selling? I do both, often with the same item.'),
      ...me('What exactly do you deal in?'),
      ...say(TILLY, 'Goods, sundries, certainties. Everything comes with a receipt, and for a little extra, a second receipt saying something nicer.'),
      ...say(TILLY, 'No? Then mind the boards on your way out, love. They\'re sold too.'),
    ]);
    return 'done';
  }
  if (s === 3) {
    startDialogue([
      ...me('Tilly Two-Receipts? Your name\'s on a manifest. The bottom of one, next to some Guild powder.'),
      ...say(TILLY, '*Tilly doesn\'t blink. Professionals never do; it smudges the ink.* Lots of Tillys on this coast. Tilly One-Receipt, Tilly No-Receipts — terrible bookkeeper, that one.'),
      ...me('It says "two receipts as always."'),
      ...say(TILLY, '...That does narrow it. All right, love. The question isn\'t whether I know things. It\'s what you\'re presenting by way of persuasion.'),
    ], () => {
      showOptions([
        {
          label: 'Show her the Guild writ.',
          fn: () => {
            if (invCount('guild_writ') === 0) {
              startDialogue([
                ...say(TILLY, '*You pat your pockets with the confidence of someone who definitely owns a writ, somewhere.*'),
                ...say(TILLY, 'A blank hand and a meaningful look. I\'ve sold worse, but I don\'t buy it. Come back with paper or coin.'),
              ]);
              return;
            }
            void advanceQuestStage(QUEST, 4).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say(TILLY, '*She reads the writ at arm\'s length, the same way Quill holds eel.* Vex\'s stamp. Hm. That woman stamps like the desk owes her testimony.'),
                ...say(TILLY, 'Here\'s the trouble with a writ: it\'s the one document I can\'t write a nicer second copy of. Fine. The truth — no charge, which means you got the discount of a lifetime.'),
                ...say(TILLY, 'Two Wreckers run the powder. Night shed crowd, down among the camp on the south shore. I move the boxes; they move the boxes that matter. Settle them, and you and I can discuss a certain keg.'),
              ]);
            });
          },
        },
        {
          label: 'Pay the second receipt. (100 coins)',
          fn: () => {
            if (invCount('coins') < 100) {
              startDialogue([
                ...say(TILLY, '*She counts your coin from across the room, which is a skill.* That\'s not a hundred, love. I\'d write you a receipt for it, but the receipt would cost more.'),
              ]);
              return;
            }
            void questbGrant('ttt_pay_tilly').then((payEcho) => {
              if (!payEcho.ok) return;
              void advanceQuestStage(QUEST, 4).then((stageEcho) => {
                if (!stageEcho.ok) return;
                startDialogue([
                  ...say(TILLY, '*The coins vanish. Two slips of paper appear: one says "INFORMATION — 100gp", the other says "DONATION TO THE FUND FOR RETIRED FISHERMEN".* You keep whichever audits better.'),
                  ...say(TILLY, 'Now. The truth, which is my best-moving product and the only one I never discount twice: two Wreckers run the powder. Night shed crowd, down in the camp on the south shore.'),
                  ...say(TILLY, 'I move boxes; they move the boxes that matter. Settle them, and you and I can discuss a certain keg.'),
                ]);
              });
            });
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 4) {
    const k = Math.min(runnersDown(), RUNNERS_NEEDED);
    if (k < RUNNERS_NEEDED) {
      startDialogue([
        ...say(TILLY, `The runners are still running, love — ${RUNNERS_NEEDED - k} of them, by my count, and my counting is the one honest thing about me.`),
        ...say(TILLY, 'South shore, with the rest of the Wreckers. Come back when the night shed\'s gone quiet.'),
      ]);
      return 'done';
    }
    void advanceQuestStage(QUEST, 5).then((stageEcho) => {
      if (!stageEcho.ok) return;
      void questbGrant('ttt_lost_keg').then((grantEcho) => {
        if (!grantEcho.ok) return;
        startDialogue([
          ...me('The night shed\'s out of staff.'),
          ...say(TILLY, '*Tilly listens to the quiet for a moment, then sighs like a closing ledger.* So I heard. Word travels fast when it\'s the only thing left moving.'),
          ...say(TILLY, 'Right. *She drags a keg out from under the floorboards — "FRESH SHARK (DO NOT OPEN)".* Take it. I\'m surrendering this before it surrenders me.'),
          ...say(TILLY, 'For the record — the official record, I\'ll write the other one later — I sell things. I don\'t sell bangs. Bangs are bad for repeat custom.'),
          ...say(TILLY, 'Give Vex my regards. Better yet, don\'t. Give her the keg and forget my face; it\'s the freshest thing in this cove.'),
        ]);
      });
    });
    return 'done';
  }
  if (s === 5) {
    if (invCount('powder_keg') === 0) {
      void questbGrant('ttt_lost_keg').then((echo) => {
        if (!echo.ok) return;
        startDialogue([
          ...say(TILLY, 'You lost a keg of gunpowder. A keg. Of gunpowder. *She produces another from under the floor.* Last one in stock, love, and I am NEVER restocking.'),
        ]);
      });
      return 'done';
    }
    startDialogue([
      ...say(TILLY, 'Still here? The keg goes to Aldgate, with the manifest. The longer it sits in your pack, the more it counts as my inventory.'),
    ]);
    return 'done';
  }
  if (s >= 6) {
    startDialogue([
      ...say(TILLY, 'The fence formerly known as Two-Receipts is exploring honest retail. One item, one price, one receipt. It\'s harrowing.'),
      ...say(TILLY, 'If you ever need something certified, love, you know where I am. And so does Vex, which is the problem.'),
    ]);
    return 'done';
  }
  return 'done';
});

// ============================================================
// Runner tracking — pirate kills count only during stage 4.
// ============================================================

onKill((defId) => {
  if (!state.player) return;
  if (defId !== 'pirate') return;
  if (stage() !== 4) return;
  const k = runnersDown();
  if (k >= RUNNERS_NEEDED) return;
  setAuxCount(RUNNERS, k + 1);
  if (k + 1 >= RUNNERS_NEEDED) {
    msg('The second powder runner goes down. The night shed is out of business — Tilly will want to hear it.', 'level');
  } else {
    msg(`One powder runner dealt with. ${RUNNERS_NEEDED - k - 1} to go.`);
  }
});

export {};
