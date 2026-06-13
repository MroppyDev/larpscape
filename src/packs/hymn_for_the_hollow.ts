// Quest pack Q7: 'A Hymn for the Hollow' — Vesper Hollowell (quiess_wizard,
// option 'Ask-about-the-chapel') sends the player to the ruined chapel on the
// corridor road (altar 398,109). A Discord Wars chaplain's soul is snagged on
// a hymn that stopped one line short: bury his congregation's bones (x5 on the
// altar, aux 'q7_buried'), learn the closing verse from Vesper, and sing it.
// Zero required combat. Stages 0-6 per docs/QUEST-DESIGN.md §8 (doneStage 6).
// New ids (fragment data/_fragments/q7_hymn.json): hollow_verse,
// quiess_feather, chapel_echo (+ npcSpawn 278,110).
// Imported for side effects via src/packs/index.ts (integrator wires it).

import {
  state, msg, invCount, freeSlots,
  registerNpcAction, registerObjectAction, registerItemOnObject,
  startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';
import { questStage, advanceQuestStage, claimQuestReward, scriptedGrant, questbGrant, auxCount, questMark } from '../quest-sync';

const HYMN = 'hymn_for_the_hollow';
const BURIED = 'q7_buried';        // 0-5 burials; 6 = the echo has been heard out
const ALTAR_X = 398;
const ALTAR_Y = 109;
const BONES_NEEDED = 5;
const BONE_MARKS = ['hymn_bone_1', 'hymn_bone_2', 'hymn_bone_3', 'hymn_bone_4', 'hymn_bone_5'];

function stage(): number { return questStage(HYMN); }
function buried(): number { return Math.min(auxCount(BURIED), BONES_NEEDED); }
function echoConsulted(): boolean { return auxCount(BURIED) >= 6; }
function isChapelAltar(o: { type: string; x: number; y: number }): boolean {
  return o.type === 'altar' && o.x === ALTAR_X && o.y === ALTAR_Y;
}

const VESPER = 'Vesper Hollowell';
const ECHO = 'Chapel Echo';

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

registerQuest({
  id: HYMN,
  name: 'A Hymn for the Hollow',
  doneStage: 6,
  journal: (s) => {
    if (s <= 0) return 'Vesper Hollowell keeps glancing south-west, toward the broken chapel on the corridor road.';
    if (s === 1) return 'Listen at the broken chapel\'s altar — Vesper says the silence there has a shape.';
    if (s === 2) {
      const progress = Math.min(BONES_NEEDED, buried() + invCount('bones'));
      const laid = buried() > 0 ? ` Laid beneath the altar so far: ${buried()}.` : '';
      return `Five of the congregation's bones, gathered gently. (${progress}/${BONES_NEEDED})${laid}`;
    }
    if (s === 3) return 'The bones are laid. The chaplain\'s echo wants the closing verse — and doesn\'t know it.';
    if (s === 4) return 'Vesper wrote the closing verse out for me. Her handwriting is somehow also quiet.';
    if (s === 5) return 'The verse is sung and answered. The chapel is just a ruin now — the good kind.';
    return 'One of the war\'s last stray notes has gone home to Quiess. Quest complete!';
  },
});

// ============================================================
// Vesper Hollowell — quest giver ('Ask-about-the-chapel';
// her 'Talk-to' belongs to Q2)
// ============================================================

registerNpcAction('quiess_wizard', 'Ask-about-the-chapel', (_n: Npc) => {
  const s = stage();

  if (s === 0) {
    startDialogue([
      ...me('You keep looking south-west. What\'s out there?'),
      ...say(VESPER, '*Vesper speaks so softly you take a step closer without deciding to.* The broken chapel, on the corridor road. Most travellers walk past it. The silence there has a shape.'),
      ...say(VESPER, 'A chaplain held the last service of the Discord Wars in that room. The hymn stopped one line short, and so did he. A soul snagged on a verse, like wool on a nail.'),
      ...me('(a little quieter) And you want it... unsnagged?'),
      ...say(VESPER, 'I want it finished. Endings are my whole vocation — I would see to it myself, but the chapel and I whisper at the same volume, and we cancel out.'),
      ...say(VESPER, 'Go and listen at the altar. Truly listen. Tell me where the song stops.'),
    ], () => {
      showOptions([
        {
          label: 'I\'ll go and listen.',
          fn: () => {
            void advanceQuestStage(HYMN, 1).then((echo) => {
              if (!echo.ok) return;
              startDialogue([
                ...say(VESPER, 'Thank you. Walk gently — the dead are not fragile, but they are easily interrupted.'),
                ...say(VESPER, 'A rat has taken up residence in the nave. Ignore it. Squatters\' rights end at the altar rail.'),
              ]);
            });
          },
        },
        {
          label: 'I leave the dead to themselves.',
          fn: () => {
            startDialogue(say(VESPER, 'So does everyone. That is precisely how he ended up alone with an unfinished hymn. The chapel will keep — it has had a century of practice.'));
          },
        },
      ]);
    });
    return 'done';
  }

  if (s === 1) {
    startDialogue([
      ...say(VESPER, 'The chapel, south-west of the tower on the corridor road. Stand at the altar and listen until the silence shows you its edges.'),
      ...me('(quieter than you meant to be) On my way.'),
    ]);
    return 'done';
  }

  if (s === 2) {
    startDialogue([
      ...say(VESPER, 'A verse stopped one line short. Yes. That is the shape I kept hearing in my sleep, which is rude of it.'),
      ...say(VESPER, 'His congregation never left that ruin either — five of them lie unburied where they fell. The chapel keeps two of its own among the stones, and the wild keeps bones enough for the rest.'),
      ...say(VESPER, 'Lay five beneath the altar. Burial first, hymn after. The dead are particular about the order of service.'),
    ]);
    return 'done';
  }

  if (s === 3) {
    if (!echoConsulted()) {
      startDialogue([
        ...say(VESPER, 'The laying is done — I felt it from here, like a room going tidy.'),
        ...say(VESPER, 'But there is a voice in that chapel that has been waiting longer than either of us. Hear him out before you hear me. He has earned the telling.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('(very quietly) He was the caller. He never learned the answer.'),
      ...say(VESPER, 'No. Callers never do — that half belonged to the congregation. But Quiess\'s people keep all endings. We are, in a sense, a library of last lines.'),
      ...say(VESPER, '*She writes a single verse on a slip of paper, in handwriting that doesn\'t rustle.* This is theirs. I would sing it to him myself, but at my volume the dead lean in, and then they bump heads.'),
      ...say(VESPER, 'Take it to the altar and hum it once, plainly. No flourishes. He will know his cue.'),
      ...me('*You nod, having run out of audible.*'),
    ], () => {
      if (freeSlots() === 0) {
        startDialogue(say(VESPER, 'Your pack is full, and this is not a verse to fold into a pocket that already jingles. Make room and ask again.'));
        return;
      }
      void advanceQuestStage(HYMN, 4).then((stageEcho) => {
        if (!stageEcho.ok) return;
        void scriptedGrant(HYMN, 4).then((_grantEcho) => {});
      });
    });
    return 'done';
  }

  if (s === 4) {
    if (invCount('hollow_verse') < 1) {
      startDialogue([
        ...say(VESPER, 'You have mislaid the closing verse. Fortunately, endings are the one thing I never run out of.'),
      ], () => {
        if (freeSlots() === 0) {
          startDialogue(say(VESPER, 'Though your pack appears to be full of beginnings. Clear a space first.'));
          return;
        }
        void scriptedGrant(HYMN, 4).then((_echo) => {});
        startDialogue(say(VESPER, 'There. Hum it at the chapel altar, plainly. Endings don\'t need decorating.'));
      });
      return 'done';
    }
    startDialogue([
      ...say(VESPER, 'The verse is in your pack. Hum it at the chapel altar — plainly. Endings don\'t need decorating.'),
    ]);
    return 'done';
  }

  if (s === 5) {
    startDialogue([
      ...me('*You open your mouth to report, then simply point south-west, at the quiet.*'),
      ...say(VESPER, '*Vesper smiles like a held breath let go.* I know. I heard the answer all the way up the corridor road — which, for that hymn, is shouting.'),
      ...say(VESPER, 'He called for a hundred years and you carried the response. Caller and answer. That makes you the congregation, briefly. I hope you sang in tune.'),
    ], () => {
      void advanceQuestStage(HYMN, 6).then((echo) => {
        if (!echo.ok) return;
        void claimQuestReward(HYMN, 6);
        msg('Congratulations! Quest complete!', 'level');
        startDialogue([
          ...say(VESPER, 'Two hundred coins from the tower\'s alms box — the dead have no use for them, and say so constantly.'),
          ...say(VESPER, 'And this. A feather Quiess left on my windowsill the morning the Quiet Measure began. It weighs less than the silence between notes. Now, so do you. A little.'),
        ]);
      });
    });
    return 'done';
  }

  // Post-quest idle
  startDialogue([
    ...say(VESPER, 'The chapel sings one line at dusk now, every day, and stops on purpose. The good kind of ruin keeps its own hours.'),
  ]);
  return 'done';
});

// ============================================================
// The chapel altar — 'Listen' (coordinate-gated to 278,109;
// polite no-op at every other altar)
// ============================================================

registerObjectAction('altar', 'Listen', (o) => {
  if (!isChapelAltar(o)) {
    msg('You listen. The altar keeps the pitch and the room keeps its counsel.');
    return 'done';
  }
  const s = stage();
  if (s === 0) {
    msg('A held silence, like a room mid-prayer. Vesper Hollowell at the Quiess Tower keeps glancing this way — she may know its shape.');
    return 'done';
  }
  if (s === 1) {
    startDialogue([
      ...me('*You lean close to the altar and listen. Under the wind, far down, there is a hymn.*'),
      ...me('*Verse after verse, steady as footsteps — and then it stops. One line short. A breath. And it begins again.*'),
      ...me('*The silence after the last verse has a shape. An answer\'s shape.*'),
    ], () => {
      void advanceQuestStage(HYMN, 2).then((echo) => {
        if (!echo.ok) return;
        msg('The hymn stops one line short, over and over. Vesper was right: the silence has a shape.', 'level');
      });
    });
    return 'done';
  }
  if (s <= 3) {
    msg('The hymn circles below the wind, patient, still waiting on its last line.');
    return 'done';
  }
  if (s === 4) {
    msg('The hymn pauses at the gap, as if it knows the verse is standing right here.');
    return 'done';
  }
  msg('The chapel is quiet the ordinary way now. Dust, swallows, sun through the broken roof.');
  return 'done';
});

// ============================================================
// Bones on the altar — burial x5 (key bones|altar, strictly
// coordinate-gated; counts via q7_buried)
// ============================================================

const BURIAL_LINES = [
  'You lay the bones beneath the altar rail. The wind drops by one note.',
  'A second laying. Somewhere in the hymn, a voice stops waiting.',
  'Third. The chapel\'s shadow sits a little straighter.',
  'Fourth. The silence is very nearly in tune.',
];

registerItemOnObject('bones', 'altar', (_slot, o) => {
  if (!isChapelAltar(o)) {
    msg('You think better of it. This altar is not that kind of altar.');
    return;
  }
  const s = stage();
  if (s < 2) {
    msg('The ground here isn\'t ready for them. Something in the silence says: not yet, and not like this.');
    return;
  }
  if (s > 2) {
    msg('The congregation is all accounted for. These bones belong to some other story.');
    return;
  }
  void questbGrant('hymn_bury_bone').then((echo) => {
    if (!echo.ok) return;
    const n = buried() + 1;
    const mark = BONE_MARKS[n - 1];
    if (!mark) return;
    void questMark(mark).then((markEcho) => {
      if (!markEcho.ok) return;
      if (n < BONES_NEEDED) {
        msg(`${BURIAL_LINES[n - 1]} (${n}/${BONES_NEEDED})`);
        return;
      }
      void advanceQuestStage(HYMN, 3).then((stageEcho) => {
        if (!stageEcho.ok) return;
        startDialogue([
          ...me('*You lay the fifth beneath the altar rail and stand back.*'),
          ...me('*By the altar, the air gathers into the shape of a chaplain — threadbare, patient, and suddenly, unmistakably, present.*'),
          ...say(ECHO, '...full pews. Well. I shall need a longer sermon.'),
        ], () => {
          msg('The fifth is laid, and the chaplain\'s echo has found its voice. He seems to want a word.', 'level');
        });
      });
    });
  });
});

// ============================================================
// The Chapel Echo — non-attackable shade at (278,110)
// ============================================================

registerNpcAction('chapel_echo', 'Talk-to', (_n: Npc) => {
  const s = stage();

  if (s >= 5) {
    // Settled, content shade — he stays, the way a door stays open.
    startDialogue([
      ...say(ECHO, 'The hymn is whole. I heard the answer come back from five graves at once, which is more harmony than this parish ever managed alive.'),
      ...say(ECHO, 'I stay for the stragglers now — there are always stragglers. But I stay the way a door stays open. Not the way a man stays trapped.'),
      ...me('*He waits, unhurried. The chapel waits with him.*'),
    ]);
    return 'done';
  }

  if (s === 4 || (s === 3 && echoConsulted())) {
    startDialogue([
      ...say(ECHO, 'The verse — the Hollowell woman has it? Then it is nearly over. A century of nearly, and now an honest one.'),
      ...say(ECHO, 'Sing it at the altar. Plainly, mind. I will know my cue. I have been holding for it since the war.'),
    ]);
    return 'done';
  }

  if (s === 3) {
    startDialogue([
      ...say(ECHO, '*The echo focuses on you the way a candle focuses when a door closes.* You laid them down. All five. I counted. Counting is most of what I have left.'),
      ...me('(quietly) The hymn stops one line short. Why?'),
      ...say(ECHO, 'Because the last line was never mine. I was the caller; the congregation was the answer. Verse, then response — that is the whole architecture of a hymn, and of a parish, if you build either properly.'),
      ...say(ECHO, 'I called the final verse on the last night of the war. The response has been... delayed. I never learned their half — it would have been presumptuous. It is the one piece of foresight I regret.'),
      ...say(ECHO, 'The whisper at the tower. The Hollowell woman. Quiess\'s people keep all endings — ask her for mine.'),
      ...me('*You nod and leave on your toes, though he could not possibly be woken.*'),
    ], () => {
      void questMark('hymn_echo_heard');
    });
    return 'done';
  }

  if (s === 2) {
    startDialogue([
      ...me('*A thin shape drifts by the altar, mouthing the same line over and over.*'),
      ...say(ECHO, '...half the pews still empty... a hymn cannot end on empty pews...'),
      ...me('(He cannot hear you. Possibly he cannot hear anything that isn\'t the hymn.)'),
    ]);
    return 'done';
  }

  // Stage 0-1: barely there.
  startDialogue([
    ...me('*Something flickers by the altar — a suggestion of robes, a mouth shaping a verse with no sound in it.*'),
    ...me('(You decide not to interrupt. There may be nothing to interrupt.)'),
  ]);
  return 'done';
});

// ============================================================
// The closing verse on the altar (key hollow_verse|altar,
// same coordinate gate)
// ============================================================

registerItemOnObject('hollow_verse', 'altar', (_slot, o) => {
  if (!isChapelAltar(o)) {
    msg('The verse stays folded. It was written for one room only.');
    return;
  }
  if (stage() !== 4) {
    msg('Not yet. Order of service: burial first, hymn after.');
    return;
  }
  void advanceQuestStage(HYMN, 5).then((stageEcho) => {
    if (!stageEcho.ok) return;
    startDialogue([
      ...me('*You hum the closing verse at the altar — once, plainly, the way she wrote it.*'),
      ...say(ECHO, '*The echo straightens and takes a breath he has not needed in a century.* ...there it is. That is the line. That is the whole of it.'),
      ...me('*And the answer comes back — not from you. From beneath the altar rail, from five quiet places at once: one line, complete. The hymn ends.*'),
      ...me('*The chaplain does not vanish. He settles, like dust deciding to stay — a faint, content shade beside his altar.*'),
    ], () => {
      msg('The verse is sung and answered. The chapel is just a ruin now — the good kind. Vesper will want to know.', 'level');
    });
  });
});

export {};
