// 'Stonecourt' — the castle. Proud fanfare-into-processional in D major.
//
// FORM (32 bars, 8 steps/bar = 256 steps on channel 0):
//   A  (bars 1-8)  : fanfare theme, dotted "long-long-short" rhythms,
//                    deceptive cadence (V -> vi) at bar 8.
//   A2 (bars 9-16) : theme restated, new climbing tail to a half cadence.
//   B  (bars 17-24): lyrical strings take the lead in B minor (relative),
//                    brass answers softly; F# major (V/vi) turns it home.
//   A' (bars 25-32): full-company return — horn quotes the world leitmotif
//                    (C E G A G E transposed to D: D F# A B A F#) in bars
//                    25-26, timpani + snare roll the seam back to bar 1.
import { Track, seq, P } from './notation';

// Lead trumpet — the hook: a dotted-rhythm rise D->F#->A answered by a fall,
// sequenced and developed; rests through B except muted echoes.
const LEAD = seq(`
  D:8  -    -    A4:3 D:7  -    F#:7 -
  A:8  -    -    F#:4 G:7  -    E:6  -
  F#:8 -    -    D:4  G:7  -    A:7  -
  B:9  -    -    A:5  F#:7 -    D:5  -
  G:8  -    -    F#:4 E:7  -    G:7  -
  F#:7 -    F#:5 G    A:8  -    -    -
  B:8  -    A:6  G    F#:7 -    E:6  -
  D:9  -    -    -    -    -    A4:3 C#:5
  D:8  -    -    A4:3 D:7  -    F#:7 -
  A:8  -    -    F#:4 G:7  -    E:6  -
  F#:8 -    -    D:4  G:7  -    A:7  -
  B:9  -    -    A:5  F#:7 -    D:5  -
  G:8  -    -    B:6  A:7  -    G:6  -
  F#:7 -    D:5  F#   A:8  -    B:7  -
  E:7  -    F#:7 -    G:8  -    A:8  -
  B:9  -    -    -    A:8  -    -    -
  .    .    .    .    .    .    .    .
  .    .    .    .    D:4  -    E:4  -
  .    .    .    .    .    .    .    .
  .    .    .    .    G:4  -    F#:4 -
  .    .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  .    .    F#:5 -    E:5  -    C#:5 -
  D:5  -    -    -    E:6  -    F#:6 -
  D:9  -    -    A4:4 D:8  -    F#:8 -
  A:9  -    -    F#:5 G:8  -    E:7  -
  F#:8 -    -    D:5  G:8  -    A:8  -
  B:9  -    -    A:6  F#:8 -    D:6  -
  G:9  -    -    E:5  A:8  -    -    F#:6
  B:9  -    A:8  -    G:8  -    E:7  -
  F#:8 -    -    D:5  E:7  -    C#:6 -
  D:9  -    -    -    -    -    -    A4:3
`);

// French horn — counter-line answering in the lead's gaps; sustains harmony
// through B; carries the leitmotif quote (D F# A B A F#) in bars 25-26.
const HORN = seq(`
  A3:5 -    -    -    -    -    -    -
  C#:5 -    -    -    -    -    D:4  -
  D:5  -    -    -    -    -    E:4  -
  G:5  -    -    -    F#:5 -    -    -
  E:5  -    -    -    G:4  -    -    -
  D:5  -    -    -    C#:4 -    A3:4 -
  G:5  -    -    -    A3:5 -    -    -
  F#:5 G:5  A:6  B:6  A:5  -    F#:4 -
  A3:5 -    -    -    -    -    -    -
  C#:5 -    -    -    -    -    D:4  -
  D:5  -    -    -    -    -    E:4  -
  G:5  -    -    -    F#:5 -    -    -
  E:5  -    -    -    D:5  -    -    -
  D:5  -    -    -    C#:5 -    D:5  -
  G:5  -    -    -    E:5  -    -    -
  C#:5 -    -    -    E:5  -    -    -
  D:4  -    -    -    -    -    -    -
  D:4  -    -    -    -    -    B3:3 -
  A3:4 -    -    -    -    -    -    -
  C#:4 -    -    -    -    -    -    -
  G:4  -    -    -    -    -    -    -
  E:4  -    -    -    C#:4 -    -    -
  C#:4 -    -    -    A#3:4 -   -    -
  B3:4 -    -    -    F#:5 -    -    -
  D:5  -    -    F#:5 -    A:6  -    -
  B:6  -    -    A:5  -    F#:5 -    -
  D:5  -    -    -    E:4  -    -    -
  G:5  -    -    -    F#:5 -    D:4  -
  B3:5 -    -    -    C#:5 -    -    -
  D:5  -    -    -    B3:4 -    -    -
  A3:5 -    -    -    C#:5 -    -    -
  F#:6 -    -    -    -    -    -    -
`);

// Strings — soft sustained guide tones under the fanfare; step into the
// spotlight for the lyrical B-minor melody (bars 17-24), then pad A'.
const STRINGS = seq(`
  F#:4 -    -    -    -     -    -    -
  E:4  -    -    -    -     -    -    -
  D:4  -    -    -    -     -    -    -
  D:4  -    -    -    -     -    -    -
  G:4  -    -    -    -     -    -    -
  F#:4 -    -    -    -     -    -    -
  D:4  -    -    -    C#:4  -    -    -
  D:4  -    -    -    -     -    -    -
  F#:4 -    -    -    -     -    -    -
  E:4  -    -    -    -     -    -    -
  D:4  -    -    -    -     -    -    -
  D:4  -    -    -    -     -    -    -
  G:4  -    -    -    -     -    -    -
  F#:4 -    -    -    -     -    -    -
  G:4  -    -    -    A:4   -    -    -
  E:4  -    -    -    F#:4  -    -    -
  F#5:7 -   -    -    D5:6  -    E5:6 -
  F#5:7 -   G5:6 -    A5:8  -    -    -
  B5:8 -    -    A5:5 F#5:7 -    D5:6 -
  E5:7 -    -    -    -     -    C#5:4 D5:5
  E5:7 -    -    -    G5:7  -    F#5:6 -
  E5:6 -    D5:6 -    C#5:6 -    B4:5 -
  C#5:7 -   -    -    A#4:6 -    -    -
  B4:6 -    C#5:6 -   D5:7  -    E5:8 -
  F#:5 -    -    -    -     -    -    -
  E:5  -    -    -    -     -    -    -
  D:5  -    -    -    -     -    -    -
  D:5  -    -    -    -     -    -    -
  B:5  -    -    -    C#5:5 -    -    -
  D5:5 -    -    -    B:4   -    -    -
  C#5:5 -   -    -    -     -    -    -
  D5:6 -    -    -    -     -    -    -
`);

// Tuba — processional bass: root on the downbeat, dotted answer, walking
// approaches into every bar change, octave pops at phrase peaks.
const TUBA = seq(`
  D:7  -    -    D3:4 D:6  -    A:5  -
  A:7  -    -    A:4  C#3:5 -   A:5  -
  G:7  -    -    G:4  B:5  -    G:5  -
  D:7  -    -    F#:4 D:6  -    D3:6 -
  E:7  -    -    E:4  G:5  -    B:5  -
  D:7  -    -    D:4  F#:5 -    A:5  -
  G:7  -    -    G:4  A:7  -    A:5  -
  B:7  -    -    A:4  G:5  -    F#:5 -
  D:7  -    -    D3:4 D:6  -    A:5  -
  A:7  -    -    A:4  C#3:5 -   A:5  -
  G:7  -    -    G:4  B:5  -    G:5  -
  D:7  -    -    F#:4 D:6  -    D3:6 -
  E:7  -    -    E:4  G:5  -    B:5  -
  D:7  -    -    D:4  F#:5 -    A:5  -
  E:7  -    -    G:4  A:6  -    A:4  -
  A:7  -    -    A:4  G:5  -    F#:5 -
  B:6  -    -    -    F#:4 -    B:5  -
  G:6  -    -    -    D3:4 -    G:5  -
  D:6  -    -    -    A:4  -    D3:5 -
  A:6  -    -    -    C#3:4 -   D3:4 -
  E:6  -    -    -    G:4  -    B:4  -
  A:6  -    -    -    C#3:4 -   E3:4 -
  F#:7 -    -    -    F#:4 -    A#:4 -
  B:7  -    -    F#:4 G:6  -    A:6  -
  D:8  -    -    D3:5 D:7  -    A:6  -
  A:8  -    -    A:5  C#3:6 -   A:6  -
  G:8  -    -    G:5  B:6  -    G:6  -
  D:8  -    -    F#:5 D:7  -    D3:7 -
  G:8  -    -    G:5  A:7  -    A:5  -
  G:8  -    -    G:5  E:6  -    E3:5 -
  A:8  -    -    A:5  G:6  -    A:5  -
  D:8  -    -    D3:5 A:5  -    A:4  -
`);

// Timpani — tonic/dominant strokes on the strong beats, crescendo rolls at
// every section turn (bars 8, 16, 24, 32) so the seams feel intentional.
const TIMPANI = seq(`
  D:8  .    .    .    A:5  .    .    .
  A:6  .    .    .    .    .    .    .
  D:6  .    .    .    .    .    .    .
  D:7  .    .    .    A:5  .    .    .
  D:5  .    .    .    .    .    .    .
  D:6  .    .    .    A:4  .    .    .
  D:6  .    .    .    A:6  .    .    .
  D:5  D:5  D:6  D:6  D:7  D:7  D:8  D:8
  D:8  .    .    .    A:5  .    .    .
  A:6  .    .    .    .    .    .    .
  D:6  .    .    .    .    .    .    .
  D:7  .    .    .    A:5  .    .    .
  D:5  .    .    .    .    .    .    .
  D:6  .    .    .    A:4  .    .    .
  D:6  .    .    .    A:6  .    .    .
  A:4  A:4  A:5  A:5  A:6  A:6  A:7  A:8
  B2:6 .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  D:5  .    .    .    .    .    .    .
  A:5  .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  F#:6 .    .    .    .    .    .    .
  B2:5 .    .    A:4  A:5  A:6  A:7  A:8
  D:9  .    .    .    A:6  .    .    .
  A:7  .    .    .    .    .    .    .
  D:7  .    .    .    .    .    .    .
  D:8  .    .    .    A:6  .    .    .
  D:6  .    .    .    A:6  .    .    .
  D:7  .    .    .    .    .    .    .
  A:7  .    .    .    A:5  .    .    .
  D:9  .    .    .    A:5  A:6  A:7  A:8
`);

// Field snare + crash — ceremonial march pattern that breathes: ghost-note
// taps through the verses, silent in B, rolls into each section turn.
const DRUMS = seq(`
  C:6  .    S:2  .    .    S:2  S:4  .
  .    .    S:2  .    .    .    S:4  S:2
  .    .    S:2  .    .    S:2  S:4  .
  .    .    S:2  .    .    .    S:4  S:2
  .    .    S:2  .    .    S:2  S:4  .
  .    .    S:2  .    .    .    S:4  S:2
  .    .    S:2  .    .    S:2  S:4  .
  S:3  S:3  S:4  S:4  S:5  S:6  S:7  S:8
  C:5  .    S:2  .    .    S:2  S:4  .
  .    .    S:2  .    .    .    S:4  S:2
  .    .    S:2  .    .    S:2  S:4  .
  .    .    S:2  .    .    .    S:4  S:2
  .    .    S:2  .    .    S:2  S:4  .
  .    .    S:2  .    .    .    S:4  S:2
  .    .    S:2  .    .    S:2  S:4  .
  S:3  S:4  S:4  S:5  S:5  S:6  S:7  S:8
  .    .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  .    .    .    .    .    .    .    .
  .    .    .    .    .    .    S:2  S:3
  S:3  S:3  S:4  S:5  S:5  S:6  S:7  S:8
  C:7  .    S:3  .    .    S:2  S:5  .
  .    .    S:3  .    .    .    S:5  S:2
  .    .    S:3  .    .    S:2  S:5  .
  .    .    S:3  .    .    .    S:5  S:2
  .    .    S:3  .    .    S:2  S:5  .
  .    .    S:3  .    .    .    S:5  S:2
  .    .    S:3  .    .    S:2  S:5  .
  C:6  .    S:4  S:4  S:5  S:6  S:7  S:8
`);

export const track: Track = {
  name: 'Stonecourt', bpm: 100, loopBars: 32,
  channels: [
    { program: P.TRUMPET, gain: 0.21, octave: 5, wave: 'square',   pan: 0.05,  notes: LEAD },
    { program: P.HORN,    gain: 0.13, octave: 4, wave: 'triangle', pan: -0.35, notes: HORN },
    { program: P.STRINGS, gain: 0.11, octave: 4, wave: 'sawtooth', pan: 0.35,  notes: STRINGS },
    { program: P.TUBA,    gain: 0.16, octave: 2, wave: 'triangle', pan: -0.1,  notes: TUBA },
    { program: P.TIMPANI, gain: 0.14, octave: 2, wave: 'sine',     pan: -0.15, notes: TIMPANI },
    { program: 0,         gain: 0.11, octave: 3, wave: 'square',   pan: 0.15,  notes: DRUMS, drums: true },
  ],
};
