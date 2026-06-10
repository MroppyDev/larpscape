// 'Rimewind' — the snow mountains.
//
// A minor, 66 bpm, 32 bars. Form: A (1-8) theme over Am-F-C-G, minor iv (Dm)
// and a full cadence; A' (9-16) motif sequenced up a third over C major,
// peaking on a high A and slipping into a DECEPTIVE cadence (E7 -> F);
// B (17-24) the vista — Neapolitan Bb and Gm under horn swells, lead thins
// to glints, Esus opens the pass home; A'' (25-32) restates fortissimo and
// hides the world leitmotif (C E G A G E) transposed to minor (A C E F E C)
// in the tremolo-string counter-line over Dm-Am.
//
// Motif: "rime climb" — celesta climbs A->C->E (each step brighter), then
// drifts back down D->C->B like settling snow. Answered by tremolo strings
// in the phrase tails; bass alternates pedal tones with quiet two-step
// walks and a chromatic run (E-G-G#) back into each return.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Rimewind', bpm: 66, loopBars: 32,
  channels: [
    // Lead — celesta, full 32-bar form (defines loop length)
    { program: P.CELESTA, gain: 0.18, octave: 5, wave: 'triangle', pan: 0.2, notes: seq(`
      A:6 - C6:7 - E6:8 - - -    D6:6 - C6:5 - B:6 - - -
      G:5 - B:6 - D6:7 - - -     C6:6 - B:4 - A:5 - - -
      A:6 - C6:7 - E6:8 - - -    F6:7 - E6:5 - D6:6 - - -
      E6:7 - B:5 - G#:6 - - -    A:6 - - - - - E:3 -
      C6:6 - E6:7 - G6:8 - - -   F6:6 - E6:5 - D6:6 - - -
      B:5 - D6:6 - F6:7 - - -    E6:6 - D6:4 - C6:5 - - -
      C6:6 - E6:7 - G6:8 - - -   A6:8 - G6:6 - F6:5 - - -
      E6:7 - D6:5 - B:6 - - -    C6:6 - - - A:4 - - -
      F:5 - A:6 - C6:7 - - -     . . . . D6:4 - C6:5 -
      A#:6 - D6:7 - F6:8 - - -   . . . . G6:4 - F6:5 -
      D6:6 - A:5 - F:4 - - -     . . . . . . . .
      E6:5 - - - B:4 - - -       G#:5 - - - E:4 - B:3 -
      A:7 - C6:8 - E6:9 - - -    D6:7 - C6:5 - B:6 - - -
      G:6 - B:7 - D6:8 - - -     C6:7 - B:5 - A:6 - - -
      F6:7 - E6:6 - D6:5 - - -   C6:6 - B:5 - A:5 - - -
      E6:7 - G#:5 - B:6 - D6:5 - A:6 - - - E:4 - - -`) },
    // Counter — tremolo strings answering in the gaps; quotes the leitmotif
    // (C E G A G E) transposed to minor (A C E F E C) at bars 29-30.
    { program: P.TREMOLO_STRINGS, gain: 0.10, octave: 4, wave: 'sawtooth', pan: -0.3, notes: seq(`
      . . . . . . . .           . . . . E:3 - G:4 -
      . . . . . . . .           . . . . D:3 - E:4 -
      . . . . . . . .           . . . . F:4 - A:5 -
      B:4 - - - G#:4 - - -      A:4 - - - C5:3 - B:3 -
      . . . . . . . .           . . . . G:3 - A:4 -
      . . . . . . . .           . . . . G:3 - E:4 -
      . . . . . . . .           F5:5 - - - C5:4 - - -
      B:4 - - - D5:4 - - -      C5:4 - - - A:3 - - -
      A:4 - - - - - - -         C5:4 - - - - - - -
      D5:5 - - - - - - -        F5:5 - - - - - - -
      F:4 - - - - - - -         A:4 - - - G:3 - F:3 -
      B:4 - - - - - - -         B:3 - - - G#:3 - - -
      . . . . . . . .           . . . . E:4 - G:5 -
      . . . . . . . .           . . . . E:4 - D:4 -
      A:4 - C5:5 - E5:6 - F5:6 - E5:5 - - - C5:4 - - -
      B:4 - - - D5:4 - - -      A:4 - - - E:3 - - -`) },
    // Horn — silent through A, swells for the vista in B, root calls in A''
    { program: P.HORN, gain: 0.12, octave: 3, wave: 'sine', pan: -0.1, notes: seq(`
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      E:4 - - - - - - -         E:5 - - - - - - -
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      F:4 - - - A:5 - - -       C4:6 - - - - - - -
      D4:6 - - - F4:7 - - -     D4:5 - - - C4:4 - - -
      A:5 - - - - - - -         F:4 - - - - - - -
      E:5 - - - - - - -         E:4 - - - - - - -
      A:4 - - - - - - -         . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      E:4 - - - - - - -         A:3 - - - - - - -`) },
    // Pad — slow strings, one chord color per bar, soft swells
    { program: P.SLOW_STRINGS, gain: 0.08, octave: 4, wave: 'sine', pan: 0.15, notes: seq(`
      C:3 - - - - - - -         A3:3 - - - - - - -
      E:3 - - - - - - -         D:3 - - - - - - -
      C:3 - - - - - - -         F:3 - - - - - - -
      G#:3 - - - - - - -        C:3 - - - - - - -
      G:3 - - - - - - -         A:3 - - - - - - -
      F:3 - - - - - - -         E:3 - - - - - - -
      G:3 - - - - - - -         A:4 - - - - - - -
      G#:3 - - - - - - -        C:3 - - - - - - -
      A:3 - - - - - - -         G:3 - - - - - - -
      D:3 - - - - - - -         A#:3 - - - - - - -
      F:3 - - - - - - -         D:3 - - - - - - -
      A:3 - - - - - - -         G#:3 - - - - - - -
      C:4 - - - - - - -         A3:3 - - - - - - -
      B3:3 - - - - - - -        E:3 - - - - - - -
      F:3 - - - - - - -         E:3 - - - - - - -
      D:3 - - - - - - -         C:3 - - - - - - -`) },
    // Bass — cello pedals with two-step walks; chromatic E-G-G# run home
    { program: P.CELLO, gain: 0.12, octave: 2, wave: 'sine', notes: seq(`
      A:5 - - - E:3 - A:4 -     F:5 - - - C:3 - F:4 -
      C:5 - - - G:3 - E:4 -     G:5 - - - B:4 - D:4 -
      A:5 - - - - - G:4 -       D:5 - - - A:4 - F:4 -
      E:5 - - - B:4 - G#:4 -    A:5 - - - A:3 - B:3 C:4
      C:5 - - - G:3 - C:4 -     F:5 - - - A:4 - C:4 -
      G:5 - - - F:4 - D:4 -     A:5 - - - E:3 - A:4 -
      C:5 - - - - - B:3 -       F:5 - - - C:3 - A:3 -
      E:5 - - - D:4 - B:3 -     F:7 - - - - - C:4 -
      F:5 - - - C:4 - F:4 -     E:5 - - - - - C:4 -
      A#:5 - - - F:4 - A#:4 -   G:5 - - - A#:4 - D:4 -
      D:5 - - - A:4 - D:4 -     A#:5 - - - F:4 - - -
      E:5 - - - - - - -         E:5 - - - E:3 G:3 G#:4 -
      A:7 - - - E:4 - A:5 -     F:6 - - - C:4 - F:4 -
      G:6 - - - D:4 - B:4 -     C:6 - - - G:4 - E:4 -
      D:6 - - - A:4 - F:4 -     A:5 - - - E:4 - C:4 -
      E:6 - - - D:4 - B:3 -     A:5 - - - - - E:3 G#:3`) },
    // Sparse cold percussion — ride taps, shaker dust, soft toms (8-bar loop)
    { program: 0, gain: 0.05, octave: 3, wave: 'square', drums: true, pan: 0.1, notes: seq(`
      R:3 . . . . . . .         . . . . X:2 . . .
      R:3 . . . . . . .         . . . . . . T:2 .
      R:3 . . . . . . .         . . . . X:2 . . .
      R:4 . . . B:2 . . .       . . T:3 . U:2 . . .`) },
  ],
};
