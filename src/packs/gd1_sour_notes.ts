// THE GATHERING DISCORD — Chapter 1: "Sour Notes" (quest id: gd1_sour_notes).
// Bellmeadow novice quest, the opening of the main arc. Mira the magic tutor
// hears the vale singing a half-beat flat; the player sounds her tuning fork
// at stone (chapel altar) and green (riverside willow), clears Dr. Ticksworth's
// rat problem, and carries the first written proof toward Aldgate.
// Stage contract (binding, see docs/QUEST-DESIGN.md §2/§14):
//   0 not started · 1 sound fork at altar+willow (bitmask gd1_rings: 1=altar,
//   2=willow) · 2 return to Mira · 3 Ticksworth's rats (counter gd1_rats, 2x
//   giant_rat) · 4 bring clinic_note to Mira · 5 COMPLETE (Ch2 checks >= 5).
// New items (fragment data/_fragments/q1_gd1.json): tuning_fork (permanent key
// item, reused by Ch2/Ch4), clinic_note, mira_letter.
// Imported for side effects via src/packs/index.ts (integrator wires it).

import {
  msg, hasItem,
  registerNpcAction, registerItemOnObject,
  startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
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

const QUEST = 'gd1_sour_notes';
const RINGS = 'gd1_rings';   // bitmask: 1 = chapel altar, 2 = riverside willow
const RATS = 'gd1_rats';     // kill counter, 0..2
const RATS_NEEDED = 2;
const BIT_ALTAR = 1;
const BIT_WILLOW = 2;

function stage(): number { return questStage(QUEST); }
function rings(): number { return auxCount(RINGS); }
function rats(): number { return auxCount(RATS); }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

const MIRA = 'Mira';
const TICK = 'Dr. Ticksworth';

registerQuest({
  id: QUEST,
  name: 'Sour Notes',
  doneStage: 5,
  journal: (s) => {
    if (s <= 0) return 'Mira the magic tutor keeps tilting her head at nothing, like she\'s hearing a fly nobody else can.';
    if (s === 1) {
      const r = rings();
      const left: string[] = [];
      if (!(r & BIT_ALTAR)) left.push('the castle chapel altar');
      if (!(r & BIT_WILLOW)) left.push('a willow by the River Murmur');
      return `Mira gave me a tuning fork. I should sound it at the chapel altar and at a willow by the River Murmur. Still to sound: ${left.join(' and ')}.`;
    }
    if (s === 2) return 'Both readings are flat by the same half-beat. Mira needs to hear this.';
    if (s === 3) return `Dr. Ticksworth's discord-mote ticks have doubled. First: deal with the rats in his larder. (${rats()}/${RATS_NEEDED})`;
    if (s === 4) return 'I have Dr. Ticksworth\'s note. Mira will want to see it.';
    return 'The vale is singing flat and the motes are rising. Mira\'s letter is for Master Flint in Aldgate. Quest complete!';
  },
});

// ============================================================
// Mira the Magic Tutor — option `Ask-about-the-hum` (Q1-owned;
// her Talk-to / Trade belong to other packs).
// ============================================================

registerNpcAction('magic_tutor', 'Ask-about-the-hum', (_n: Npc) => {
  const s = stage();

  if (s === 0) {
    startDialogue([
      ...me('You keep tilting your head. Is something humming?'),
      ...say(MIRA, 'Yes. No. The vale is humming. It always hums — that\'s what a vale is. But for three weeks it has been humming a half-beat flat, and I appear to be the only person bothered by it.'),
      ...say(MIRA, 'My air runes have started casting slightly to the left. I\'ve been compensating by standing slightly to the right, which works, and which I would prefer no one in Aldgate ever learns about.'),
      ...say(MIRA, 'This morning my kettle sang flat. The same half-beat. A kettle, mind you, has no opinions. When a kettle goes flat, the water is flat, and water takes its pitch from the world.'),
      ...me('So what do you want done about it?'),
      ...say(MIRA, 'Nothing dramatic. I want data. Take this tuning fork and sound it twice: once on the castle chapel altar — Aulden\'s stone — and once on a willow down by the River Murmur — Syla\'s green. If both come back flat, it isn\'t my kettle, and it isn\'t me.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll sound your fork. Stone and green.',
          fn: () => {
            void advanceQuestStage(QUEST, 1).then((echo) => {
              if (!echo.ok) return;
              void scriptedGrant(QUEST, 1);
              startDialogue([
                ...say(MIRA, 'Good. Strike it against the thing itself — altar, trunk, doesn\'t matter which order — and listen to what comes back. Don\'t hum along. You\'ll skew the reading and I\'ll have to pretend your results are useful.'),
                ...say(MIRA, 'The chapel is in the castle, north of the courtyard. The willows trail in the river east of town, by the old bridge. Off you go.'),
              ]);
              msg('Mira hands you a tuning fork. It hums before you strike it.', 'level');
            });
          },
        },
        {
          label: 'Sounds like a problem for someone with a fork.',
          fn: () => {
            startDialogue(say(MIRA, 'It is. I\'m offering you the fork. But suit yourself — the kettle will still be flat tomorrow, and so will the offer.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    const r = rings();
    const lines: DialogueLine[] = [
      ...say(MIRA, 'Readings. Have you got them?'),
    ];
    if (r === 0) lines.push(...me('Not yet. Where were they again?'), ...say(MIRA, 'The chapel altar in the castle, and a willow by the River Murmur east of town. Strike the fork on each and listen. The fork does the work; you do the walking.'));
    else if (!(r & BIT_ALTAR)) lines.push(...me('The willow\'s done. Flat as a floor.'), ...say(MIRA, 'Half a result is a rumour. The chapel altar in the castle — Aulden\'s stone. Then we\'ll talk.'));
    else lines.push(...me('The altar\'s done. It rang sour.'), ...say(MIRA, 'Stone confirmed, green pending. A willow by the River Murmur, east of town. One more strike and we have a fact.'));
    if (!hasItem('tuning_fork')) {
      lines.push(
        ...me('Small thing. I appear to have mislaid the fork.'),
        ...say(MIRA, 'Of course you have. Fortunately I make them in batches — ask me sometime how my evenings are going. Here. Try to let this one grow old.'),
      );
      startDialogue(lines, () => {
        void questbGrant('gd1_lost_tuning_fork').then((echo) => {
          if (echo.ok) msg('Mira hands you another tuning fork.');
        });
      });
      return 'done';
    }
    startDialogue(lines);
    return 'done';
  }

  if (s === 2) {
    startDialogue([
      ...me('Both readings are in. The altar and the willow — flat. The same half-beat.'),
      ...say(MIRA, '*Mira goes very still, which from her is a shout.* The same interval in Aulden\'s stone and Syla\'s green. Two singers don\'t drift flat together. Not unless something is pulling them.'),
      ...say(MIRA, 'So it isn\'t local, and it isn\'t me, and my kettle is owed an apology. What I need now is a second instrument — something that measures the Offnote without knowing it\'s doing magic.'),
      ...say(MIRA, 'Dr. Ticksworth. The tick clinic, south district. His whole practice runs on discord-mote ticks — if the vale is souring, his intake will say so in numbers. Ask him about his motes. Try to keep a straight face about the ticks. He can tell.'),
    ], () => { void advanceQuestStage(QUEST, 3); });
    return 'done';
  }

  if (s === 3) {
    startDialogue([
      ...say(MIRA, 'You\'ve the look of someone who hasn\'t been to the tick clinic yet.'),
      ...me('There were... complications. Rat-shaped ones.'),
      ...say(MIRA, 'There usually are. Dr. Ticksworth, south district. I need his mote numbers in writing — verbal evidence from a man who sells tick cuisine doesn\'t carry in Aldgate.'),
    ]);
    return 'done';
  }

  if (s === 4) {
    startDialogue([
      ...me('Ticksworth\'s note. Mote intake doubled this bar. In writing.'),
      ...say(MIRA, '*She reads it twice, then once more, slower.* Flat stone. Flat green. Doubled motes. The slivers in this vale are ringing — not waking, ringing. In sympathy. Like strings answering a note from another room.'),
      ...me('In sympathy with what?'),
      ...say(MIRA, 'That is exactly the question I am not qualified to answer, and I find I dislike the feeling. So we hand it up. The Aldgate Gun Guild measures the Offnote every single day — they grind it into powder and write down how hard it misbehaves. They just call it quality control.'),
    ], () => {
        void advanceQuestStage(QUEST, 5).then((echo) => {
          if (!echo.ok) return;
          void claimQuestReward(QUEST, 5);
          msg('Congratulations! Quest complete!', 'level');
          startDialogue([
            ...say(MIRA, 'This letter is for Master Flint at the Gun Guild. It says what we found, what it means, and that the bearer is worth listening to — which is not a sentence I write often, so don\'t lose it before he\'s read it.'),
            ...say(MIRA, 'Keep the fork. It\'s tuned now — to whatever this is. If I\'m right, you\'ll be striking it on stranger things than willows before the year is out.'),
            ...say(MIRA, 'And here — a hundred coins for the walking, and a lesson\'s worth of songcraft for the listening. You did the second part better than most of my students. Don\'t let it go to your head; the bar is on the floor.'),
          ]);
        });
    });
    return 'done';
  }

  // Post-quest (s >= 5): one idle line, plus fork replacement — Ch2 and Ch4 need it.
  if (!hasItem('tuning_fork')) {
    startDialogue([
      ...say(MIRA, 'Flint will be expecting you in Aldgate, if my letter survived your pockets.'),
      ...me('About pockets. The fork—'),
      ...say(MIRA, '*Mira closes her eyes for exactly one breath.* Batches. I make them in batches. Here.'),
    ], () => {
      void questbGrant('gd1_lost_tuning_fork').then((echo) => {
        if (echo.ok) msg('Mira hands you another tuning fork.');
      });
    });
    return 'done';
  }
  startDialogue(say(MIRA, 'The kettle is still flat, but at least now it\'s evidence. Aldgate, when you\'re ready — Master Flint, Gun Guild. Stand slightly to the right of whatever he says first.'));
  return 'done';
});

// ============================================================
// Tuning fork soundings — stage 1, order-independent, coordinate-free
// (any altar / any willow; generosity beats pedantry at novice tier).
// Keys `tuning_fork|altar` and `tuning_fork|willow` are Q1-owned (§14.4).
// ============================================================

function ringAt(bit: number, sourLine: string, doneLine: string) {
  if (stage() !== 1) {
    msg('The tuning fork hums a half-beat behind itself, as if waiting for a reason.');
    return;
  }
  const r = rings();
  if (r & bit) {
    msg(doneLine);
    return;
  }
  const mark = bit === BIT_ALTAR ? 'gd1_altar' : 'gd1_willow';
  void questMark(mark).then((echo) => {
    if (!echo.ok) return;
    msg(sourLine, 'level');
    if (questStage(QUEST) >= 2) msg('Both readings are flat by the same half-beat. Mira needs to hear this.', 'level');
    else msg('One reading down. One to go.');
  });
}

registerItemOnObject('tuning_fork', 'altar', () => {
  ringAt(
    BIT_ALTAR,
    'You strike the fork on the altar. Aulden\'s stone answers — flat, sour, a half-beat low, like a bell rung underwater.',
    'The altar already gave its reading. It has nothing flatter to add.',
  );
});

registerItemOnObject('tuning_fork', 'willow', () => {
  ringAt(
    BIT_WILLOW,
    'You strike the fork on the willow\'s trunk. Syla\'s green answers — flat, sour, the same half-beat low. The leaves shiver like they heard it too.',
    'The willow already gave its reading. It droops a little lower, embarrassed.',
  );
});

// ============================================================
// Dr. Ticksworth — option `Ask-about-motes` (Q1-owned).
// ============================================================

registerNpcAction('dentist_dr_tick', 'Ask-about-motes', (_n: Npc) => {
  const s = stage();

  if (s < 3) {
    startDialogue([
      ...me('How\'s the mote business?'),
      ...say(TICK, 'Remediation. It\'s artisanal discord-mote remediation, and it is thriving, thank you. If you\'re here for the tasting flight, Glen is ahead of you in the queue. Glen is always ahead of you in the queue.'),
    ]);
    return 'done';
  }

  if (s === 3) {
    const k = rats();
    if (k >= RATS_NEEDED) {
      startDialogue([
        ...me('Your larder is rat-free. Both of them. Now — the mote numbers?'),
        ...say(TICK, '*Dr. Ticksworth peers into the larder, then at you, with new respect.* Efficient. Brutal, but efficient. Very well — the numbers, as promised, and in writing, because I gather Aldgate doesn\'t believe in dentists.'),
        ...say(TICK, 'Intake of discord-mote ticks: doubled this bar. Not risen. Doubled. The ticks are drinking more mote than they\'ve any right to, which means there\'s more mote to drink. I\'ve charted it. There\'s a small graph. I\'m rather proud of the graph.'),
        ...say(TICK, 'A voice from the back: "Doctor! Doubled means a bigger cracker, surely!" ...That\'s Glen. The answer is no, Glen. Standard cracker.'),
      ], () => {
        void advanceQuestStage(QUEST, 4).then((echo) => {
          if (!echo.ok) return;
          void scriptedGrant(QUEST, 4);
          msg('Dr. Ticksworth hands you a signed clinic note. There is a small graph.', 'level');
          startDialogue([
            ...say(TICK, 'Signed, dated, and notarised by the only medical professional in this vale who counts his ticks. Tell your tutor: if Aldgate wants the raw figures, the clinic\'s door is open and the menu is seasonal.'),
          ]);
        });
      });
      return 'done';
    }
    if (k === 0) {
      startDialogue([
        ...me('Mira sent me. She needs your mote numbers — in writing.'),
        ...say(TICK, 'Ah, the tutor. Yes. The numbers are remarkable and she shall have them — the moment my evidence stops being eaten.'),
        ...me('Eaten?'),
        ...say(TICK, 'Something rat-shaped has been raiding the tick larder behind the clinic. Two of them, big as boots, bold as bailiffs. My ticks are carefully provenanced remediation stock, not rat fodder. Deal with the pair of them and the numbers are yours, graph included.'),
        ...say(TICK, 'They\'re just behind the building. Level three, the both of them — a stern look and a sharp stick should do it.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...say(TICK, `One down, by my count. The other is still in my larder, eating my evidence. ${RATS_NEEDED - k} to go, then we talk numbers.`),
    ]);
    return 'done';
  }

  if (s === 4) {
    startDialogue([
      ...say(TICK, 'You still have my note? Good. Take it to your tutor before Glen offers to eat it. He\'s offered twice.'),
    ]);
    return 'done';
  }

  // Post-quest
  startDialogue([
    ...say(TICK, 'The larder is secure, the graph is in Aldgate-bound hands, and Glen remains on the standard cracker. As far as this clinic is concerned, you are practically staff.'),
  ]);
  return 'done';
});

