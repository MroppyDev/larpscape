// 'Rimewind' — the snow mountains, scored OSRS-style for the SC-88 soundfont.
//
// A minor, 66 bpm, 32 bars. Form: A (1-8) theme over Am-F-C-G, minor iv (Dm)
// and a full cadence; A' (9-16) motif sequenced up a third over C major,
// peaking on a high A and slipping into a DECEPTIVE cadence (E7 -> F);
// B (17-24) the vista — Neapolitan Bb and Gm under horn swells, lead thins
// to glints, Esus opens the pass home; A'' (25-32) restates fortissimo and
// hides the world leitmotif (C E G A G E) transposed to minor (A C E F E C)
// in the counter-line over Dm-Am.
//
// Orchestration (think Ice Melody / Wintumber): glassy CELESTA carries the
// "rime climb" (A->C->E up, D->C->B settling like snow), echoed by sparse
// GLOCKENSPIEL glints two beats behind each peak. A breathy FLUTE takes the
// old counter-line — wind threading the pass — answering in the phrase tails
// and quoting the leitmotif at bars 29-30. Distant HORN swells only for the
// B-section vista; cold SLOW STRINGS hold one chord color per bar with a
// CHOIR shimmer ghosting them an octave up from bar 17 to the end. Woody
// CELLO pedals and two-step walks (chromatic E-G-G# run home) underpin all;
// soft TIMPANI replaces the drum kit, marking only the section cadences.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Rimewind', bpm: 66, loopBars: 32,
  channels: [
    // Lead — glassy celesta, full 32-bar form (defines loop length)
    { program: P.CELESTA, gain: 0.16, octave: 5, wave: 'triangle', pan: 0.2, notes: seq(`
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
    // Glockenspiel — icy glints echoing each rime-climb peak two beats late
    { program: P.GLOCKENSPIEL, gain: 0.07, octave: 6, wave: 'triangle', pan: 0.45, notes: seq(`
      . . . . . . E6:4 -         . . . . . . . .
      . . . . . . D6:3 -         . . . . . . . .
      . . . . . . E6:4 -         . . . . . . . .
      . . . . . . B5:3 -         . . . . . . . .
      . . . . . . G6:4 -         . . . . . . . .
      . . . . . . F6:3 -         . . . . . . . .
      . . . . . . G6:4 -         . . . . . . . .
      . . . . . . B5:3 -         . . . . . . . .
      . . . . . . C6:4 -         . . . . . . . .
      . . . . . . F6:4 -         . . . . . . . .
      . . . . . . D6:3 -         . . . . . . . .
      . . . . . . B5:3 -         . . . . . . . .
      . . . . . . E6:5 -         . . . . . . . .
      . . . . . . D6:4 -         . . . . . . . .
      . . . . . . F6:4 -         . . . . . . . .
      . . . . . . B5:3 -         . . . . . . E6:4 -`) },
    // Flute — breathy wind line answering in the gaps; quotes the leitmotif
    // (C E G A G E) transposed to minor (A C E F E C) at bars 29-30.
    { program: P.FLUTE, gain: 0.10, octave: 4, wave: 'sine', pan: -0.35, notes: seq(`
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
    // Horn — distant; silent through A, swells for the vista in B, root calls in A''
    { program: P.HORN, gain: 0.11, octave: 3, wave: 'sine', pan: -0.1, notes: seq(`
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
    // Pad — cold slow strings, one chord color per bar, soft swells
    { program: P.SLOW_STRINGS, gain: 0.08, octave: 4, wave: 'sine', pan: -0.15, notes: seq(`
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
    // Choir — shimmer ghosting the pad an octave up; enters at the B vista,
    // carries through the A'' restatement, fades on the final cadence
    { program: P.CHOIR, gain: 0.07, octave: 5, wave: 'sine', pan: 0.3, notes: seq(`
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      A:4 - - - - - - -         G:4 - - - - - - -
      D:4 - - - - - - -         A#:5 - - - - - - -
      F:5 - - - - - - -         D:4 - - - - - - -
      A:4 - - - - - - -         G#:3 - - - - - - -
      C:5 - - - - - - -         A4:4 - - - - - - -
      B4:4 - - - - - - -        E:4 - - - - - - -
      F:4 - - - - - - -         E:3 - - - - - - -
      D:3 - - - - - - -         C:3 - - - - - - -`) },
    // Bass — woody cello pedals with two-step walks; chromatic E-G-G# run home
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
    // Timpani — soft cadence strokes only, marking the section boundaries
    { program: P.TIMPANI, gain: 0.09, octave: 2, wave: 'sine', pan: 0.1, notes: seq(`
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      E:3 . . . . . . .         A:5 - - - - - - -
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      E:3 . . . . . . .         F:4 - - - - - - -
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           E:3 . E:3 . E:4 . . .
      A:6 - - - - - - -         . . . . . . . .
      . . . . . . . .           . . . . . . . .
      . . . . . . . .           . . . . . . . .
      E:3 . . . . . . .         A:5 - - - E:3 . . .`) },
  ],
};
