// Quest pack Q6: "Cold Comfort" (`cold_comfort`, doneStage 5) — Imber Spire.
// Calder Brightverse's scorch ring is shrinking: Maraza's cold is creeping
// DOWNHILL for the first time in 341 years. Fetch 5 coal (mine or buy), relight
// the two braziers flanking the spire door (Q6-owned object action
// `brazier`/`Relight`, coordinate-gated — Q2 owns the `tinderbox|brazier`
// item-on-object key, so we deliberately do not touch it), drive off the two
// ice wolves the light draws, then hear what the doubled flame says about the
// summit. Plants the Maraza-stirs hook.
// Aux quest-state keys: `q6_braziers` (bitmask), `q6_wolves` (kill counter).
// Imported for side effects via src/packs/index.ts (integrator wires it).

import {
  state, msg, invCount, hasTool,
  registerNpcAction, registerObjectAction, registerItemAction,
  startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { WorldObject } from '../world';
import { registerQuest } from '../quests';
import { audio } from '../audio';
import { questStage, advanceQuestStage, claimQuestReward, auxCount, questMark } from '../quest-sync';

const QUEST = 'cold_comfort';
const BRAZIERS = 'q6_braziers'; // bitmask: bit 1 = west brazier, bit 2 = east brazier
const WOLVES = 'q6_wolves';     // ice wolves driven off while stage 3

const COAL_NEEDED = 5;
const WOLVES_NEEDED = 2;

// The two braziers flanking the spire door (Calder stands at 270,17; the
// third spire brazier at 269,11 is intentionally NOT part of the reading).
const DOOR_BRAZIERS: { x: number; y: number; bit: number; mark: string }[] = [
  { x: 268, y: 16, bit: 1, mark: 'cc_brazier_west' },
  { x: 272, y: 16, bit: 2, mark: 'cc_brazier_east' },
];

function stage(): number { return questStage(QUEST); }
function brazierBits(): number { return auxCount(BRAZIERS); }
function braziersLit(): number {
  const b = brazierBits();
  return (b & 1 ? 1 : 0) + (b & 2 ? 1 : 0);
}
function wolvesDriven(): number { return auxCount(WOLVES); }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

registerQuest({
  id: QUEST,
  name: 'Cold Comfort',
  doneStage: 5,
  journal: (s) => {
    if (s <= 0) return 'The melted ring around the Imber Spire is smaller than it was last month, and Calder has noticed.';
    if (s === 1) {
      const have = Math.min(invCount('coal'), COAL_NEEDED);
      return `Calder needs ${COAL_NEEDED} coal — honest fuel — to read the cold properly. (${have}/${COAL_NEEDED})`;
    }
    if (s === 2) return `Relight both braziers flanking the spire door. (${braziersLit()}/2)`;
    if (s === 3) return `The braziers are lit and the cold sent wolves to argue. Drive off two ice wolves. (${Math.min(wolvesDriven(), WOLVES_NEEDED)}/2)`;
    if (s === 4) return 'The flame bends toward Frostpeak. Calder needs a moment. And possibly eyebrows.';
    return 'Calder is writing to Vesper voluntarily, which frightens me more than the wolves did. Quest complete!';
  },
});

const CALDER = 'Calder Brightverse';

// ============================================================
// Calder — Q6-owned option `Ask-about-the-cold` (his Talk-to belongs to Q2)
// ============================================================

registerNpcAction('imber_wizard', 'Ask-about-the-cold', (_n: Npc) => {
  const s = stage();

  if (s === 0) {
    startDialogue([
      ...me('Is something wrong? You keep glaring at the snow.'),
      ...say(CALDER, 'Not the snow. The ring. Observe the melt-line around my spire — the frontier where my warmth defeats the mountain\'s opinion of itself. Last month it reached that boulder. Today, demonstrably, it does not.'),
      ...say(CALDER, 'The cold is creeping downhill. Maraza\'s cold, mind — not honest weather. And in three hundred and forty-one years it has never once crept downhill. Uphill cold I tolerate. Downhill cold is a statement.'),
      ...me('Couldn\'t you just make the fire bigger?'),
      ...say(CALDER, 'Obviously the answer is more fire. The answer is always more fire. The question — and this is where the professional comes in — is how much more, and pointed where. For that I must read the cold properly, and for that I need fuel.'),
      ...say(CALDER, 'Bring me five lumps of coal. Honest fuel. Magic fire lies about the temperature — flattery, mostly. Coal has never flattered anyone in its life.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll fetch your coal.',
          fn: () => {
            void advanceQuestStage(QUEST, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say(CALDER, 'Good. The Swamp Mine gives coal to anyone with a pick and a grudge, and the Frostpeak rocks do too, if you enjoy irony. Or the Aldgate Exchange sells it to people who would rather pay than swing.'),
                ...say(CALDER, 'Five lumps. No fewer. A four-coal reading is just a guess wearing a scarf.'),
              ]);
            });
          },
        },
        {
          label: 'It\'s a mountain. Mountains are cold.',
          fn: () => {
            startDialogue(say(CALDER, 'A popular theory, held mainly by people who have never had their melt-line insulted. When the cold reaches your boots, the offer stands. It will reach your boots.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    const have = invCount('coal');
    if (have < COAL_NEEDED) {
      startDialogue([
        ...say(CALDER, `Coal, adventurer. Five lumps. I count ${have} on you, and I am extremely good at counting fuel.`),
        ...say(CALDER, 'Swamp Mine, Frostpeak rocks, or the Exchange if your arms are ornamental. The cold is not waiting politely, whatever it pretends.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('Five lumps of coal. Honest as requested.'),
      ...say(CALDER, '*Calder weighs each lump like a jeweller.* Yes. Surly. Uncommunicative. Burns at exactly the temperature it burns at. Perfect.'),
    ], () => {
      // Server validates + consumes the 5 coal on the 1->2 advance (requiredItems).
      void advanceQuestStage(QUEST, 2).then((echo) => {
        if (!echo.ok) return;
        startDialogue([
          ...say(CALDER, 'I\'ve packed the charge into the two braziers flanking my door. Now set your tinderbox to each — your spark, not mine. If I light them, the reading reads me, and I already know what I think.'),
          ...say(CALDER, 'Light both, then stand somewhere unimportant.'),
        ]);
      });
    });
    return 'done';
  }

  if (s === 2) {
    const lit = braziersLit();
    startDialogue([
      ...say(CALDER, lit === 0
        ? 'The braziers, adventurer. Both of them. That is the other virtue of honest fuel — it does nothing whatsoever until asked.'
        : 'One lit, one cold. A half-reading is worse than none; the flames argue and I\'m left transcribing the quarrel. Light the other.'),
    ]);
    return 'done';
  }

  if (s === 3) {
    if (wolvesDriven() < WOLVES_NEEDED) {
      startDialogue([
        ...say(CALDER, 'Don\'t look at me — I\'m reading. The wolves are your department. Two of them, and do hurry; the flame is just getting to the good part.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('The wolves are dealt with.'),
      ...say(CALDER, 'I noticed. Very educational, watching you work. Now — eyes on the flame, and say nothing.'),
      ...say(CALDER, '*Both brazier-flames lean, slow and deliberate, to the north-east. Toward the summit.* There. Fire doesn\'t point, adventurer. Fire climbs. For two honest flames to bend like that, something up there is pulling the warmth out of the world.'),
      ...say(CALDER, 'Her note is slipping. The Rimebound is going to finish her Solo or die failing, and I genuinely cannot tell you which is worse.'),
    ], () => {
      void advanceQuestStage(QUEST, 4).then((echo) => { if (echo.ok) finale(); });
    });
    return 'done';
  }

  if (s === 4) {
    finale();
    return 'done';
  }

  // Post-quest idle
  startDialogue([
    ...say(CALDER, '*Calder is mid-letter, quill smoking faintly.* "Dear Vesper. It has come to my attention—" no. "Dear Vesper. Against every instinct—" hm. This may take more drafts than the spire has paper.'),
    ...say(CALDER, 'The braziers stay lit, by the way. Your spark. The melt-line approves, and so, grudgingly, do I.'),
  ]);
  return 'done';
});

function finale() {
  startDialogue([
    ...me('So what now? More fire?'),
    ...say(CALDER, 'Eventually, yes — it remains the answer to most things. But a note that size wants listening to before burning, and listening means... *he closes his eyes briefly* ...writing to Vesper Hollowell. Voluntarily. In ink.'),
    ...say(CALDER, 'If she asks, I lost a bet.'),
  ], () => {
    // 4->5 advance (narrative), then claim the data-defined completion reward
    // (Firemaking xp + coins + Calder's brand) from the server.
    void advanceQuestStage(QUEST, 5).then((echo) => {
      if (!echo.ok) return;
      void claimQuestReward(QUEST, 5);
      msg('Congratulations! Quest complete!', 'level');
      finaleEpilogue();
    });
  });
}

function finaleEpilogue() {
  startDialogue([
    ...say(CALDER, 'Your fee — three hundred coins, and this: my own brand. Never quite goes out, much like the argument it came from. Keep it somewhere flammable.'),
    ...say(CALDER, 'You\'ve also absorbed a firemaking lesson, whether you wanted one or not. I can smell it. That part was free.'),
  ]);
}

// ============================================================
// Brazier relighting — Q6-owned object action `brazier`/`Relight`,
// coordinate-gated to the two spire-door braziers. NOTE: Q2 owns the
// `tinderbox|brazier` item-on-object key; this action is the sanctioned
// Q6 mechanism and never registers that key.
// ============================================================

registerObjectAction('brazier', 'Relight', (o: WorldObject) => {
  const door = DOOR_BRAZIERS.find((b) => b.x === o.x && b.y === o.y);
  if (!door) {
    msg('Nothing about this brazier needs relighting.');
    return 'done';
  }
  const s = stage();
  if (s < 2) {
    msg('The brazier sits cold, but it isn\'t yours to fuss with.');
    return 'done';
  }
  if (s > 2) {
    msg('The brazier burns steady and honest. The reading is underway.');
    return 'done';
  }
  if (brazierBits() & door.bit) {
    msg('This brazier is already burning honestly.');
    return 'done';
  }
  if (!hasTool('tinderbox')) {
    msg('You need a tinderbox to relight the brazier — your spark, Calder insisted, not his.');
    return 'done';
  }
  void questMark(door.mark).then((echo) => {
    if (!echo.ok) return;
    audio.sfx('fire');
    msg('You strike a spark and the coal catches — slow, sullen, and exactly as warm as it claims to be.');
    if (braziersLit() >= 2) {
      msg('Both braziers blaze, and the doubled light glitters far up the snow. Something out there turns toward it — wolves, lean and winter-coloured. Drive off two ice wolves.', 'level');
    } else {
      msg('One brazier lit. Its twin across the door still sits cold.');
    }
  });
  return 'done';
});

// ============================================================
// Calder's brand — keepsake firelighter. The firemaking tool check
// (hasTool('tinderbox') in game.ts/skills_production.ts) is keyed to the
// tinderbox id and isn't extensible from a pack, so the brand stays flavor.
// ============================================================

registerItemAction('calder_brand', 'Light', () => {
  audio.sfx('fire');
  msg('You wave the brand. It flares up cheerfully, warms nothing in particular, and settles back to its patient smoulder.');
});

export {};
