// 'Aldgate Streets' — the big city. Confident bustle with civic pride,
// orchestrated OSRS-style for the Sound Canvas font ("The Maze"/"Expanse"
// city grandeur). D major, 128 bpm, 32-bar form: A (trumpet theme, bars
// 1-8), A2 (theme sequenced up a third, borrowed iv colour, bars 9-16),
// B (relative B minor, slow strings take the tune with a breathy recorder
// doubling, bars 17-24), A' (full-cry restatement, bars 25-32). The world
// leitmotif (C E G A G E) appears transposed to D in the strings at bar 31.
// Orchestration: SC-88 trumpet hook over lush slow-string pads, a busy
// harpsichord running broken chords through the streets, woody acoustic
// bass walking underneath, timpani anchoring each phrase with a dominant
// roll into the turns, and light tambourine/sidestick/shaker percussion
// instead of a kit backbeat.
import { Track, seq, P } from './notation';

// ---- Lead: trumpet — the hook. Leap up a fifth, dance back down. 32 bars.
const LEAD =
  // A — theme (bars 1-8)
  'D:6 -  A:8  -  F#:6 G:6  A:7  - ' +
  'B:7 A:6 F#:6 D:6 E:7 - - . ' +
  'G:6 - D5:8 - B:6 C5:6 D5:7 - ' +
  'E5:8 D5:6 C#5:6 A:6 B:7 - - . ' +
  'B:6 - F#5:8 - D5:6 E5:6 F#5:7 - ' +
  'G5:8 F#5:7 E5:6 D5:6 B:6 - G:5 - ' +
  'G:5 A:6 B:6 - C#5:7 D5:7 E5:8 - ' +
  'D5:8 - - - F#:4 G:5 A:6 - ' +
  // A2 — sequenced up a third, Gm colour (bars 9-16)
  'F#:6 - D5:8 - A:6 B:6 D5:7 - ' +
  'C#5:7 B:6 A:6 F#:6 E:6 - - . ' +
  'G:6 - E5:8 - D5:6 C5:6 B:6 - ' +
  'A:6 C#5:7 E5:8 - D5:6 C#5:6 B:6 - ' +
  'D5:7 - B:6 - F#:6 A:6 B:7 - ' +
  'G:5 A#:6 D5:7 - C5:6 A#:6 G:6 - ' +
  'G:6 F#:6 E:6 - B:6 - G:5 - ' +
  'E5:6 - C#5:6 A:5 E:5 - A:5 - ' +
  // B — strings lead; trumpet answers with stabs (bars 17-24)
  '. . . . F#:5 - A:5 - ' +
  '. . . . . . . . ' +
  '. . . . G:5 - B:5 - ' +
  '. . . . . . . . ' +
  'D:5 - F#:5 - . . . . ' +
  '. . . . . . C#:4 - ' +
  '. . . . G:5 - - . ' +
  '. . . . A:5 B:6 C#5:7 - ' +
  // A' — full cry (bars 25-32), resolves cleanly into the loop seam
  'D:7 - A:9 - F#:7 G:7 A:8 - ' +
  'B:8 A:7 F#:7 D:7 E:8 - - . ' +
  'G:7 - D5:9 - B:7 C5:7 D5:8 - ' +
  'E5:9 D5:7 C#5:7 A:7 B:8 - - . ' +
  'B:7 - F#5:9 - D5:7 E5:7 F#5:8 - ' +
  'G5:9 - D5:8 - A#:7 C5:7 D5:8 - ' +
  'E5:8 D5:7 C#5:7 B:7 C#5:8 - E5:8 - ' +
  'D5:9 - - - A:5 - F#:4 - ';

// ---- Counter: lush slow strings — pads + answers in the lead's gaps;
// melody in B; leitmotif (C E G A G E -> D F# A B A F#) at bar 31. 32 bars.
const COUNTER =
  'A:3 - - - - - - - ' +
  'A:3 - - - . F#:4 G:4 A:5 ' +
  'B:3 - - - - - - - ' +
  'C#5:4 - - - . A:4 B:4 C#5:5 ' +
  'D5:4 - - - - - - - ' +
  'B:3 - - - - - G:3 - ' +
  'G:3 - - - E:4 - - - ' +
  'F#:4 - - - . D5:4 C#5:4 B:4 ' +
  'A:3 - - - - - - - ' +
  'A:3 - - - . C#5:4 B:4 A:4 ' +
  'B:3 - - - - - - - ' +
  'C#5:4 - - - E5:4 - - - ' +
  'D5:4 - - - - - - - ' +
  'D5:4 - - - A#:4 - - - ' +
  'B:3 - - - - G:4 - - ' +
  'A:3 - - - C#5:4 - E5:5 - ' +
  // B section: strings carry the tune
  'F#5:6 - D5:5 - B:4 C#5:5 D5:6 - ' +
  'E5:6 C#5:5 A:4 - F#:5 - - . ' +
  'B:5 - G5:7 - F#5:5 E5:5 D5:6 - ' +
  'E5:6 D5:5 B:5 G:4 F#:5 - - . ' +
  'F#5:6 - D5:5 - B:4 C#5:5 D5:6 - ' +
  'F#5:7 E5:6 C#5:6 - A#:5 - C#5:5 - ' +
  'B:4 C#5:5 D5:6 E5:6 F#5:7 - D5:5 - ' +
  'E5:7 - C#5:6 A:5 B:5 C#5:6 - . ' +
  // A' pads, then the leitmotif
  'A:3 - F#:3 - - - - - ' +
  'A:3 - - - . F#:4 G:4 A:5 ' +
  'B:3 - - - - - - - ' +
  'C#5:4 - - - E5:4 - - - ' +
  'D5:4 - - - - - - - ' +
  'D5:4 - - - A#:4 - - - ' +
  'D:4 F#:4 A:5 B:5 A:5 F#:4 - - ' + // leitmotif, transposed
  'F#:4 - - - A:3 - - - ';

// ---- Inner line: harpsichord — busy broken chords rolling up and down,
// the clatter of the streets. Chord-aware, octave base 3. 32 bars.
const hD   = 'D:5 A:3 D4:4 F#4:3 A4:5 F#4:3 D4:4 A:3 ';
const hG   = 'G:5 B:3 D4:4 G4:3 B4:5 G4:3 D4:4 B:3 ';
const hA   = 'A:5 C#4:3 E4:4 A4:3 C#5:5 A4:3 E4:4 C#4:3 ';
const hBm  = 'B:5 D4:3 F#4:4 B4:3 D5:5 B4:3 F#4:4 D4:3 ';
const hEm  = 'E:5 G:3 B:4 E4:3 G4:5 E4:3 B:4 G:3 ';
const hFsm = 'F#:5 A:3 C#4:4 F#4:3 A4:5 F#4:3 C#4:4 A:3 ';
const hGm  = 'G:5 A#:3 D4:4 G4:3 A#4:5 G4:3 D4:4 A#:3 ';
const hEmA = 'E:5 G:3 B:4 G4:3 A:5 C#4:3 E4:4 C#5:3 ';
// B-section ghosts (quieter filigree under the string melody)
const gBm  = 'B:3 D4:2 F#4:3 D4:2 B:3 D4:2 F#4:3 D4:2 ';
const gFsm = 'F#:3 A:2 C#4:3 A:2 F#:3 A:2 C#4:3 A:2 ';
const gG   = 'G:3 B:2 D4:3 B:2 G:3 B:2 D4:3 B:2 ';
const gEm  = 'E:3 G:2 B:3 G:2 E:3 G:2 B:3 G:2 ';
const gFs7 = 'F#:3 A#:2 C#4:3 A#:2 F#:3 A#:2 E4:3 A#:2 ';
const gA   = 'A:3 C#4:2 E4:3 C#4:2 A:3 C#4:2 E4:3 C#4:2 ';
const HARPSI =
  hD + hD + hG + hA + hBm + hG + hEmA + hD +          // A
  hD + hFsm + hG + hA + hBm + hGm + hEm + hA +        // A2
  gBm + gFsm + gG + gEm + gBm + gFs7 + gG + gA +      // B (ghosted)
  hD + hD + hG + hA + hBm + hGm + hEmA + hD;          // A'

// ---- Descant: breathy recorder doubles the string tune in B only —
// the classic OSRS woodwind shadowing. 32 bars, silent outside B.
const r8 = '. . . . . . . . ';
const DESCANT =
  r8 + r8 + r8 + r8 + r8 + r8 + r8 + r8 +             // A (tacet)
  r8 + r8 + r8 + r8 + r8 + r8 + r8 + r8 +             // A2 (tacet)
  'F#5:5 - D5:4 - B:3 C#5:4 D5:5 - ' +                // B (unison double)
  'E5:5 C#5:4 A:3 - F#:4 - - . ' +
  'B:4 - G5:6 - F#5:4 E5:4 D5:5 - ' +
  'E5:5 D5:4 B:4 G:3 F#:4 - - . ' +
  'F#5:5 - D5:4 - B:3 C#5:4 D5:5 - ' +
  'F#5:6 E5:5 C#5:5 - A#:4 - C#5:4 - ' +
  'B:3 C#5:4 D5:5 E5:5 F#5:6 - D5:4 - ' +
  'E5:6 - C#5:5 A:4 B:4 C#5:5 - . ' +
  r8 + r8 + r8 + r8 + r8 + r8 + r8 + r8;              // A' (tacet)

// ---- Bass: woody acoustic bass walking, runs at the phrase turns. 32 bars.
const BASS =
  'D:7 - F#:5 - A:6 - B:6 - ' +
  'D3:6 - C#3:5 - B:5 - A:5 - ' +
  'G:7 - B:5 - D3:6 - B:5 - ' +
  'A:7 - C#3:6 - E3:5 - A:6 - ' +
  'B:7 - D3:5 - F#3:6 - D3:5 - ' +
  'G:7 - B:5 - D3:6 - B:5 - ' +
  'E3:7 - G3:5 - A:6 - C#3:5 - ' +
  'D:7 F#:4 A:5 B:4 D3:6 C#3:5 B:5 A:5 ' + // eighth-note run
  'D:7 - F#:5 - A:6 - B:5 - ' +
  'F#:7 - A:5 - C#3:6 - A:5 - ' +
  'G:7 - B:5 - D3:6 - B:5 - ' +
  'A:7 - C#3:6 - E3:5 - A:6 - ' +
  'B:7 - D3:5 - F#3:6 - D3:5 - ' +
  'G:7 - A#:5 - D3:6 - A#:5 - ' +
  'E3:7 - D3:5 - B:5 - G:5 - ' +
  'A:6 B:5 C#3:5 D3:5 E3:6 F#3:5 G3:5 A3:6 ' + // climb into B
  'B:7 - D3:5 - F#3:6 - B3:5 - ' +
  'F#3:7 - C#3:5 - A:5 - F#:5 - ' +
  'G:7 - B:5 - D3:6 - E3:5 - ' +
  'E3:7 - B:5 - G:5 - E:5 - ' +
  'B:7 - D3:5 - F#3:6 - D3:5 - ' +
  'F#:7 - A#:5 - C#3:6 - E3:5 - ' +
  'G:7 - B:5 - D3:6 - E3:5 - ' +
  'A:7 - E3:5 - C#3:5 - A:5 - ' +
  'D:7 - F#:5 - A:6 - B:6 - ' +
  'D3:6 - C#3:5 - B:5 - A:5 - ' +
  'G:7 - B:5 - D3:6 - B:5 - ' +
  'A:7 - C#3:6 - E3:5 - A:6 - ' +
  'B:7 - D3:5 - F#3:6 - D3:5 - ' +
  'G:7 - A#:5 - D3:6 - A#:5 - ' +
  'E3:7 - G3:5 - A:6 - C#3:5 - ' +
  'D:7 F#:4 A:5 B:4 D3:6 C#3:5 B:5 A:5 '; // run back into bar 1

// ---- Timpani: tonic hits at each phrase head, dominant roll into the
// turn — the orchestral floor under the city. 8-bar loop, octave 2.
const TIMP =
  'D:8 - - . . . . . ' +
  '. . . . . . . . ' +
  '. . . . . . . . ' +
  '. . . . . . . . ' +
  'D:6 - - . . . . . ' +
  '. . . . . . . . ' +
  '. . . . . . . . ' +
  '. . . . A:4 A:5 A:6 A:8 ';

// ---- Percussion: light orchestral street-bustle — sidestick and shaker
// with tambourine lift, tom fill into each turn. No kit backbeat. 8 bars.
const DRUMS =
  'K:5 X:3 M:5 X:2 B:4 X:3 M:5 X:2 ' +
  'K:5 X:3 M:5 X:2 B:4 X:2 M:5 X:3 ' +
  'K:5 X:3 M:5 X:2 B:4 X:3 M:5 X:2 ' +
  'K:5 X:3 M:5 M:2 B:4 X:2 M:5 X:3 ' +
  'K:5 X:3 M:5 X:2 B:4 X:3 M:5 X:2 ' +
  'K:5 X:3 M:5 X:2 B:4 X:2 M:5 X:3 ' +
  'K:5 X:3 M:5 X:2 B:4 M:2 M:5 X:2 ' +
  'K:5 X:3 M:5 M:3 T:5 T:6 U:6 B:6 ';

export const track: Track = {
  name: 'Aldgate Streets', bpm: 128, loopBars: 32,
  channels: [
    { program: P.TRUMPET, gain: 0.18, octave: 4, wave: 'square', pan: 0.05,
      notes: seq(LEAD) },
    { program: P.SLOW_STRINGS, gain: 0.14, octave: 4, wave: 'sawtooth', pan: -0.4,
      notes: seq(COUNTER) },
    { program: P.HARPSICHORD, gain: 0.11, octave: 3, wave: 'triangle', pan: 0.45,
      notes: seq(HARPSI) },
    { program: P.RECORDER, gain: 0.08, octave: 4, wave: 'sine', pan: 0.25,
      notes: seq(DESCANT) },
    { program: P.ACOUSTIC_BASS, gain: 0.17, octave: 2, wave: 'triangle', pan: 0,
      notes: seq(BASS) },
    { program: P.TIMPANI, gain: 0.13, octave: 2, wave: 'sine', pan: -0.15,
      notes: seq(TIMP) },
    { program: 0, gain: 0.1, octave: 3, wave: 'square', pan: 0.1, drums: true,
      notes: seq(DRUMS) },
  ],
};
