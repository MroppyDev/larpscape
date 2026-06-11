// CH4 — 'The Gathering Discord' (gd4_gathering_discord) — implementer Q4.
// Finale of THE GATHERING DISCORD arc. Brogan wants the breach answered, not
// just opened: the player shuttles a written accord between Calder and Vesper
// (bitmask gd4_accord), descends through the Untuned Mine breach to the
// resonance stand, rings the tuning fork, meets the Conductor (dialogue only —
// no NPC entity), destroys his copyist-construct The Dissonant (aux gd4_boss),
// searches the conductors_lectern for the torn score page, and reports to
// Brogan. The Quiet Measure ends on-screen; nothing is resolved.
//
// Owned per QUEST-DESIGN §14: npc options slayer_master/'Ask-about-the-breach',
// imber_wizard + quiess_wizard /'Ask-about-the-plan'; item-on-object key
// 'tuning_fork|resonance_stand'; all options on objects resonance_stand and
// conductors_lectern. New ids ship in data/_fragments/q4_gd4.json.
//
// BOSS SPEC NOTE for server/sim team (the_dissonant, lvl 62, 140 hp, 4-tick
// cycle — see DESIGN-REFERENCE rule 12): its heavy hit (the "rest" — a
// crushing silence) should be telegraphed >=2 ticks on the target tile and
// dodgeable by moving 1-2 tiles; at half HP it shrieks in 2 `discord_wisp`
// adds (existing def from Q2's fragment — sim-side summon optional). A plain
// stat fight is the acceptable v1 fallback. It remains a repeatable mini-boss
// post-quest (respawnTicks 100; guaranteed coin + chaos rune drops, ~1/33
// `dissonant_baton`).
//
// RELOCATION NOTE: resonance_stand / conductors_lectern mapObjects and the
// the_dissonant npcSpawn are PLACEHOLDERS just inside the breach
// ((23,77)/(24,77)/(24,78)); the dungeon team moves them to the Resonance
// Gallery when the map ships. All logic below keys off object TYPE and npc
// def id only — never coordinates — so relocation is a data move.

import {
  state, msg, addItem, addXp,
  registerNpcAction, registerObjectAction, registerItemOnObject, onKill,
  startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

const GD4 = 'gd4_gathering_discord';
const ACCORD = 'gd4_accord'; // bitmask, see below
const BOSS = 'gd4_boss';

// gd4_accord bits:
//   1 = carrying Calder's demand (the source must be destroyed)
//   2 = carrying Vesper's demand (it must be heard first)
//   4 = Vesper has conceded (signed Calder's clause)
//   8 = Calder has conceded (signed Vesper's clause)
// When 4 and 8 are both set, the wizard who conceded last drafts and hands
// over the joint_writ (stage 1 -> 2). If the player's pack is full at that
// moment, re-talking to either wizard retries the handover.
const C_DEMAND = 1;
const V_DEMAND = 2;
const V_SIGNED = 4;
const C_SIGNED = 8;

function stage(): number { return state.player.quests[GD4] ?? 0; }
function setStage(s: number) { state.player.quests[GD4] = s; }
function accord(): number { return state.player.quests[ACCORD] ?? 0; }
function setAccord(bits: number) { state.player.quests[ACCORD] = bits; }
function bossSlain(): boolean { return (state.player.quests[BOSS] ?? 0) >= 1; }
function prereqMet(): boolean { return (state.player.quests['gd3_sealed_wing'] ?? 0) >= 6; }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

const BROGAN = 'Brogan';
const CALDER = 'Calder';
const VESPER = 'Vesper';
const CONDUCTOR = 'The Conductor';

registerQuest({
  id: GD4,
  name: 'The Gathering Discord',
  doneStage: 5,
  journal: (s) => {
    if (s <= 0) return 'Brogan wants the breach answered, not just opened. He\'s assembling opinions. He hates opinions.';
    if (s === 1) {
      const a = accord();
      const parts: string[] = [];
      if (!(a & V_SIGNED)) parts.push((a & C_DEMAND) ? 'Vesper still has to sign Calder\'s clause — I\'m carrying his demand now' : 'I should hear Calder\'s demand at the Imber Spire');
      if (!(a & C_SIGNED)) parts.push((a & V_DEMAND) ? 'Calder still has to sign Vesper\'s clause — I\'m carrying her demand now' : 'I should hear Vesper\'s demand at the Quiess Tower');
      const track = parts.length ? ` ${parts.join('; ')}.` : ' Both have signed — one of them owes me the writ.';
      return `Calder and Vesper must sign one plan. Currently they have signed several complaints.${track}`;
    }
    if (s === 2) return 'The writ is signed. Time to go through the breach and find what\'s been keeping tempo down there.';
    if (s === 3) {
      return bossSlain()
        ? 'The Dissonant lies in pieces of slate and wire. Whatever the Conductor left behind, it\'s on that lectern.'
        : 'Something down here calls itself the Conductor — and it says thank you. Its copyist disagrees. Destroy the Dissonant.';
    }
    if (s === 4) return 'The Conductor walked into the stone like a door. He left a page of his score — and every waystone in the realm just chimed at once. Brogan must hear this.';
    return 'The Quiet Measure is over. The Conductor is loose with his unfinished score, and Brogan\'s new ledger has exactly one name in it. Quest complete!';
  },
});

// ============================================================
// Brogan — quest giver and turn-in. (slayer_master 'Ask-about-the-breach')
// ============================================================

registerNpcAction('slayer_master', 'Ask-about-the-breach', (_n: Npc) => {
  const s = stage();

  if (s === 0) {
    if (!prereqMet()) {
      startDialogue([
        ...say(BROGAN, 'The breach? There is no breach. There\'s a bricked-up gallery in the Swamp Mine and a lot of people with theories about it.'),
        ...say(BROGAN, 'Come back when that wall\'s a door. Until then it\'s a wall, and I don\'t assign walls.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('The sealed wing is open. What now?'),
      ...say(BROGAN, 'Now? Now everyone with a hat has an opinion. The Duke wants it surveyed. The Concord wants it taxed. Mira wants it studied. I keep one ledger of monsters and it has never once let me down. I now keep a second ledger, of opinions. It\'s thicker.'),
      ...say(BROGAN, 'Whatever\'s ringing down there has been calling every sliver in the vale to heel. I\'m not sending anyone through that breach on a maybe. I want a plan. One plan. Signed.'),
      ...say(BROGAN, 'Which means the duchy\'s two consulting wizards have to agree on something, in writing, for the first time since the year seven-twenty. Calder Brightverse at the Imber Spire. Vesper Hollowell at the Quiess Tower.'),
      ...say(BROGAN, 'Calder will say burn it. Vesper will say listen to it. You\'re going to carry their letters back and forth until those are the same sentence.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll get you your one plan.',
          fn: () => {
            setStage(1);
            setAccord(0);
            startDialogue([
              ...say(BROGAN, 'Good. Ask them about the plan and nothing else — give either of them an opening and you\'ll be there until the next Measure.'),
              ...say(BROGAN, 'When you\'ve got one piece of paper with two signatures and a plan somewhere on it, you go through that breach and you answer what\'s down there. Then you come back to me. Alive. It\'s in the ledger that way and I hate corrections.'),
            ]);
          },
        },
        {
          label: 'Two wizards, one plan? I\'d sooner fight the breach barehanded.',
          fn: () => {
            startDialogue(say(BROGAN, 'So would I. That\'s why I\'m sending you to the wizards. The offer stands — the ringing isn\'t getting quieter, and neither are they.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    startDialogue([
      ...say(BROGAN, 'No writ, no breach. Calder\'s at the Imber Spire, Vesper\'s at the Quiess Tower, and the road between them is shorter than their grudge.'),
      ...say(BROGAN, 'One paper. Two signatures. Go.'),
    ]);
    return 'done';
  }

  if (s === 2) {
    startDialogue([
      ...say(BROGAN, 'They signed? Both of them? The same document?'),
      ...me('Forty-one clauses of it.'),
      ...say(BROGAN, 'Then it\'s official. Through the breach, find what\'s keeping tempo down there, and answer it. Take food. Take more food than that.'),
    ]);
    return 'done';
  }

  if (s === 3) {
    startDialogue(bossSlain()
      ? [
        ...say(BROGAN, 'You\'re back above ground and the ringing\'s changed. What did you leave down there?'),
        ...me('Pieces. But there was a lectern, by the stand — I haven\'t searched it yet.'),
        ...say(BROGAN, 'Then you\'re not done. Whatever it left behind, I want it on my desk, not in a hole.'),
      ]
      : [
        ...say(BROGAN, 'Still breathing. The thing at the bottom of the breach isn\'t, I hope?'),
        ...me('It\'s made of slate and wire and it objects to me.'),
        ...say(BROGAN, 'Then un-make it. That\'s the whole job, that sentence.'),
      ]);
    return 'done';
  }

  if (s === 4) {
    startDialogue([
      ...me('It called itself the Conductor. It thanked me for opening the wing. Then it walked into the rock — and left this.'),
      ...say(BROGAN, '*Brogan takes the torn page and reads it the way a man reads a debt.* One bar. This is one bar of it. Mira looked at your fork-readings and went quiet, which Mira does not do. Flint\'s fizzle rates dropped to nothing the hour every waystone chimed — the Guild\'s instruments all agree and Flint hates that they agree.'),
      ...say(BROGAN, 'Calder wants it burned. Vesper says you can\'t burn a thing that\'s already left the room. For the first time in twenty-three years, I have no opinion to file. The slivers weren\'t waking up. They were being rehearsed.'),
    ], () => {
      setStage(5);
      addXp('Slayer', 1500);
      addXp('Magic', 800);
      addItem('coins', 1000);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say(BROGAN, 'A thousand coins from the duchy, and the duchy got a bargain. Keep the page — I\'ve copied it, and I\'d rather the original was somewhere that moves.'),
        ...say(BROGAN, '*He closes the old ledger. From the drawer he takes a new one, unbent, and writes a single line on the first page.* The Quiet Measure\'s over. Forty-two years, and it ends with a thank-you and a bow.'),
        ...me('What\'s the name?'),
        ...say(BROGAN, 'The only one on the list. For now.'),
      ]);
    });
    return 'done';
  }

  // Post-quest idle line.
  startDialogue(say(BROGAN, 'New ledger\'s still got the one name. Every morning I check the waystones haven\'t chimed again, and every morning they haven\'t. Yet. You\'ll be the first I send when they do.'));
  return 'done';
});

// ============================================================
// Shuttle diplomacy — 'Ask-about-the-plan' on both wizards (stage 1).
// ============================================================

// Hands the joint_writ if both concessions are signed. Returns true if the
// quest advanced (or the handover line ran), false to fall through.
function tryHandWrit(wizard: string): boolean {
  const a = accord();
  if (!((a & V_SIGNED) && (a & C_SIGNED))) return false;
  if (!addItem('joint_writ', 1)) {
    startDialogue(say(wizard, 'The writ is drafted, signed, and witnessed by a kettle. It is also forty-one clauses, and you have nowhere to put it. Make room and come back.'));
    return true;
  }
  setStage(2);
  if (wizard === CALDER) {
    startDialogue([
      ...say(CALDER, 'There. Signed, sealed, and only slightly scorched. Forty-one clauses. Clauses one through thirty-seven establish that I was right; clause thirty-eight is the plan; the rest concern Vesper\'s handwriting.'),
      ...say(CALDER, 'The plan, since you carried it: descend, find the thing keeping tempo, let it say its piece — ONE piece — and then end it. Tell Brogan the Spire considers the matter settled. Pre-emptively.'),
    ]);
  } else {
    startDialogue([
      ...say(VESPER, '*Vesper signs without looking, the way one signs for a delivery.* There. One plan, two signatures, forty-one clauses. Calder numbered them. Of course he numbered them.'),
      ...say(VESPER, '*She presses the writ into your hands and her voice drops below the wind.* Go down. Let it finish its sentence. Then finish yours. And — listen on the way back up. The mine will tell you if you got it right.'),
    ]);
  }
  return true;
}

registerNpcAction('imber_wizard', 'Ask-about-the-plan', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue(say(CALDER, 'The plan? The plan is fire, the plan has always been fire, and nobody has commissioned me to say so. Come back when somebody official is asking.'));
    return 'done';
  }
  if (s === 1) {
    if (tryHandWrit(CALDER)) return 'done';
    const a = accord();
    if ((a & V_DEMAND) && !(a & C_SIGNED)) {
      // Deliver Vesper's demand — Calder concedes (and states his own if he hasn't).
      const next = a | C_SIGNED | C_DEMAND;
      setAccord(next);
      startDialogue([
        ...me('Vesper\'s condition: nothing burns until it has been heard. She wants your signature on that.'),
        ...say(CALDER, '"Heard." We are conducting a siege and she wants a recital. *He stares into the brazier for a long moment. The brazier, sensibly, says nothing.* ...And yet. The fizzle rates, the waystones, the tempo. A thing with a tempo is saying something. Fine. FINE. I concede it — in writing, before I recover my senses.'),
        ...((a & C_DEMAND)
          ? say(CALDER, 'She has my clause, I now have hers. Which means one of us drafts the writ, and the duchy help us both.')
          : [
            ...say(CALDER, 'But she signs MY clause in exchange: whatever is down there, once it has been heard, it BURNS. No appeals, no encores, no "but its phrasing". Carry that to her tower and watch her face do the thing.'),
            ...me('I\'ll watch closely.'),
          ]),
      ], () => { tryHandWrit(CALDER); });
      return 'done';
    }
    if (!(a & C_DEMAND)) {
      setAccord(a | C_DEMAND);
      startDialogue([
        ...me('Brogan needs one signed plan from you and Vesper before anyone goes through the breach.'),
        ...say(CALDER, 'Then this is mercifully simple, because there is only one plan. Whatever is gathering the slivers under that mine gets destroyed. Burned, broken, and the ashes raked for sharps. Imber doctrine: a wrong note left ringing only gets louder.'),
        ...say(CALDER, 'My signature is yours the moment Vesper Hollowell concedes — in writing — that the source must be destroyed. Not "soothed". Not "heard out". DESTROYED. Take her my demand. And take a scarf; her tower is emotionally draughty.'),
      ]);
      return 'done';
    }
    startDialogue(say(CALDER, 'You still have my demand and I still have my patience, though only one of those is renewable. The Quiess Tower. Vesper. A signature. Go.'));
    return 'done';
  }
  if (s === 2) {
    startDialogue(say(CALDER, 'The writ is signed and my eyebrows are committed. Stop standing in my spire and go answer the breach.'));
    return 'done';
  }
  // Stage 3+ / post-quest.
  startDialogue(say(CALDER, bossSlain() || s >= 4
    ? 'Every instrument in this spire heard the waystones chime, and not one of them can tell me the key. I have written to Vesper about it. Voluntarily. Do not tell anyone.'
    : 'You rang the fork at the stand, then? Then it knows you\'re there. Burn whatever answers.'));
  return 'done';
});

registerNpcAction('quiess_wizard', 'Ask-about-the-plan', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue(say(VESPER, '*Vesper does not look up.* There is no plan yet. Only a ringing, and a great many people deciding what it means before it has finished. Come back when Brogan sends you properly.'));
    return 'done';
  }
  if (s === 1) {
    if (tryHandWrit(VESPER)) return 'done';
    const a = accord();
    if ((a & C_DEMAND) && !(a & V_SIGNED)) {
      // Deliver Calder's demand — Vesper concedes (and states her own if she hasn't).
      const next = a | V_SIGNED | V_DEMAND;
      setAccord(next);
      startDialogue([
        ...me('Calder\'s condition: you concede, in writing, that the source must be destroyed.'),
        ...say(VESPER, '*A long quiet. Somewhere above, the tower\'s chimes shift without wind.* He is not wrong. That is the worst of Calder — he is so rarely wrong, only early. Whatever is gathering the slivers cannot be allowed to keep them. I will sign his clause.'),
        ...((a & V_DEMAND)
          ? say(VESPER, '*She writes.* He has mine; I have his. Then the writ can exist. How strange, that it can exist.')
          : [
            ...say(VESPER, '*Her voice drops, and you lean in.* But he signs mine first: nothing is destroyed until it has been heard. Everything that sings is trying to finish something. Even the wrong ones. ESPECIALLY the wrong ones. Carry that to his spire — and don\'t flinch when he shouts. The shouting is how he listens.'),
            ...me('...I\'ll try not to flinch.'),
          ]),
      ], () => { tryHandWrit(VESPER); });
      return 'done';
    }
    if (!(a & V_DEMAND)) {
      setAccord(a | V_DEMAND);
      startDialogue([
        ...me('Brogan needs one signed plan from you and Calder before anyone goes through the breach.'),
        ...say(VESPER, '*She sets down her pen as if it were sleeping.* Then he will want fire, and Brogan will want signatures, and nobody will have asked the obvious question: what is it trying to finish? The slivers aren\'t waking. They are being gathered, the way a choir is gathered. Someone down there is taking attendance.'),
        ...say(VESPER, 'My signature has one price. Calder concedes — in ink, not in shouting — that the source is HEARD before anything is burned. A thing\'s last words are evidence. Take him my demand. Speak softly; it confuses him.'),
      ]);
      return 'done';
    }
    startDialogue(say(VESPER, '*Quietly.* You still carry my condition. The Imber Spire is east of cold and north of patience. Calder will sign. He just has to shout first.'));
    return 'done';
  }
  if (s === 2) {
    startDialogue(say(VESPER, '*Barely above breath.* The writ is real. Go down, and listen before you swing. Both are in the clauses.'));
    return 'done';
  }
  // Stage 3+ / post-quest.
  startDialogue(say(VESPER, bossSlain() || s >= 4
    ? '*She touches the tower wall as if taking a pulse.* Every waystone, the same chime, the same instant. Not an ending. A downbeat. Whatever begins now, we are already inside it.'
    : 'The dark answered your fork, didn\'t it. Then it is honest, whatever else it is. Finish it gently, if it lets you.'));
  return 'done';
});

// ============================================================
// The resonance stand — the Conductor scene (stage 2 -> 3).
// Keys off object TYPE; the dungeon team relocates the mapObject freely.
// ============================================================

registerObjectAction('resonance_stand', 'Inspect', () => {
  const s = stage();
  if (s < 2) {
    msg('A music stand of black stone, far older than the mine. It is waiting to be given the pitch. You have no business giving it one. Yet.');
    return 'done';
  }
  if (s === 2) {
    msg('The stand is tuned to receive a single true note. Your tuning fork hums in your pack, a half-beat behind itself, eager.');
    return 'done';
  }
  msg('The stand is silent now — the satisfied silence of a thing that finally heard its note.');
  return 'done';
});

registerItemOnObject('tuning_fork', 'resonance_stand', (_slot, _o) => {
  const s = stage();
  if (s < 2) {
    msg('You raise the fork — and lower it. Whatever this stand wants, you don\'t yet have the standing to give it. Brogan would want paperwork first. There is always paperwork first.');
    return;
  }
  if (s >= 3) {
    msg('You sound the fork. The stand answers, true and steady. Down here, that no longer feels like good news.');
    return;
  }
  // Stage 2: the Conductor speaks. Dialogue only — no NPC entity.
  msg('You strike the fork against the black stone stand...');
  startDialogue([
    ...me('*The fork rings — and for the first time since Mira handed it to you, something rings BACK. In tune. In time. From the dark.*'),
    { speaker: 'A voice', text: '*At the edge of your light stands a figure that was not there. Robes of pale temple silk, the kind the sand swallowed with Sarrash. It does not step closer.* Ah. The ear. I hoped it would be you.' },
    ...say(CONDUCTOR, 'Forgive the seating. The acoustics here are exquisite and the furniture is rock. You opened my wing for me — the masons of \'88 sealed it from the inside, you know, brave of them, futile of them — and I have not had the chance to say it. Thank you.'),
    ...me('You\'re the one calling the slivers. Gathering them.'),
    ...say(CONDUCTOR, 'Transcribing them. Each sliver remembers one note of what it was. Alone they are noise. Assembled — *he turns a page you cannot see* — they are a score. The First Chord was sung without me. The Second will not be.'),
    ...me('Brogan\'s writ says you get heard, and then you get destroyed. You\'ve been heard.'),
    ...say(CONDUCTOR, 'A writ! With clauses! How the Measure flatters itself. No — I don\'t fight, friend. I keep time. My copyist handles... corrections.'),
  ], () => {
    setStage(3);
    msg('Across the gallery, something of slate and stretched wire sets down its work — and turns to you.', 'level');
    msg('The Dissonant has noticed you. It is making corrections.');
  });
});

// ============================================================
// Kill tracking — server youKilled event (killer gets the credit).
// ============================================================

onKill((defId) => {
  if (!state.player || defId !== 'the_dissonant') return;
  if (stage() !== 3 || bossSlain()) return;
  state.player.quests[BOSS] = 1;
  msg('The Dissonant collapses into slate and slack wire. Its last sound is, at last, a rest. The lectern by the stand is unguarded.', 'level');
});

// ============================================================
// The conductor's lectern — farewell + torn score page (stage 3 -> 4).
// ============================================================

registerObjectAction('conductors_lectern', 'Search', () => {
  const s = stage();
  if (s < 3) {
    msg('A travelling lectern draped in pale silk. The dust around it is disturbed in the shape of nothing at all. It is best not to touch other people\'s sheet music.');
    return 'done';
  }
  if (s === 3 && !bossSlain()) {
    msg('The copyist objects to your interest in the lectern. Violently. Deal with the Dissonant first.');
    return 'done';
  }
  if (s >= 4) {
    msg('The lectern keeps a faint, patient beat, like a metronome heard through a wall. The score is gone. So is its writer.');
    return 'done';
  }
  // Stage 3, boss dead.
  if (!addItem('torn_score_page', 1)) {
    msg('There is a single torn page on the lectern — and no room in your pack to carry history. Make space.');
    return 'done';
  }
  startDialogue([
    ...me('*The Conductor stands beyond the lectern, already half in shadow. He looks at the wreck of his copyist the way one looks at a broken pen.*'),
    ...say(CONDUCTOR, 'Well corrected. I shall have to write the next one a better ending — that is, after all, the whole of my work.'),
    ...say(CONDUCTOR, '*He bows — unhurried, precise, the bow of a performer who knows the hall will wait.* You\'ve an ear. We\'ll want it, when the Measure ends.'),
    ...me('*He steps back into the rock — not through a crack, not into a tunnel. Into the stone, the way one walks through a door. The stone does not remark on it.*'),
  ], () => {
    setStage(4);
    msg('You take the torn score page from the lectern. One bar. It is one bar of something vast.');
    msg('Far above and all across Cantorne, every waystone chimes — once, together, perfectly in time.', 'level');
  });
  return 'done';
});

export {};
