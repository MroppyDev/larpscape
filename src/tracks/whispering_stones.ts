// 'Whispering Stones' — the rune altar standing stones.
//
// C lydian, 64 bpm, 32 bars. Form: A (1-8) theme over C–D–Am–G/Bm,
// A' (9-16) motif sequenced up a third, ending on a half cadence with a
// rising bass run; B (17-24) drifts to borrowed Ab-lydian / Bb, then a
// whole-tone shimmer over C augmented before Dsus opens the door home;
// A'' (25-32) restates the theme fortissimo and hides the world leitmotif
// (C E G A G E), augmented, in the counter-line over Am–Fmaj7.
//
// OSRS-style orchestration (think "Spooky" / "Crystal Cave" through the
// SC-88 font): the "glint and hang" motif moves to CELESTA music-box
// twinkles; a breathy PAN FLUTE answers in the phrase tails and carries
// the leitmotif; CHOIR aahs swell the chord thirds while SLOW STRINGS
// hold the dark sevenths underneath; a quiet HARP rolls one arpeggio per
// harmony; CELLO keeps the long pedals and walking turns. Percussion is
// just sparse ride taps, shaker breaths and a soft low tom.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Whispering Stones', bpm: 64, loopBars: 32,
  channels: [
    // Lead — celesta music-box glints (full 32-bar form; defines loop length)
    { program: P.CELESTA, gain: 0.16, octave: 5, wave: 'triangle', pan: 0.25, notes: seq(`
      G:7 - B - F#:8 - - -    E:6 - D:5 - E - - -
      A:6 - C6:8 - G:7 - - -  F#:6 - E:4 - F#:5 - - -
      E:7 - C:5 - B4:4 - - -  A4:5 - - - - - - -
      D:5 - G:6 - B:7 - - -   F#:6 - - - - - . .
      B:7 - D6 - A:8 - - -    G:6 - F#:5 - G - - -
      A:7 - C6:8 - G:7 - - -  F#:6 - G:5 - A:6 - - -
      D6:7 - B:6 - F#:5 - - - B4:4 - - - D:5 - - -
      E:6 - G:7 - A:8 - - -   B:7 - - - A:5 - G:4 -
      D#6:6 - C6:4 - G:5 - - - . . . . D6:3 - - -
      D6:6 - - - F:4 - - -    C6:5 - - - - - - -
      C:3 D:4 E:5 F#:6 G#:7 - - -  A#:8 - G#:6 - E:5 - - -
      A:6 - - - G:5 - - -     F#:5 - - - A:4 - B:5 -
      G:8 - B - F#:9 - - -    E:6 - D:5 - E - - -
      A:7 - C6:8 - G:7 - - -  F#:6 - E:4 - F#:5 - - -
      E:7 - C:5 - - - - -     . . . . C:5 - E:6 -
      G:6 - - - D:5 - B4:4 -  E:5 - - - - - D:3 -`) },
    // Counter — breathy pan flute answering in the phrase tails; quotes the
    // leitmotif (C E G A G E) augmented at bars 29-30.
    { program: P.PAN_FLUTE, gain: 0.12, octave: 4, wave: 'sine', pan: -0.35, notes: seq(`
      . . . . . . . .         . . . . G:3 - B:4 -
      . . . . . . . .         . . . . F#:3 - A:4 -
      C:4 - - - - - - -       B3:3 - - - - - - -
      . . . . . . . .         . . D:3 - E:4 - F#:4 -
      . . . . . . . .         . . . . E:3 - G:4 -
      . . . . . . . .         . . . . . . . .
      D:4 - - - - - - -       F#:3 - - - - - - -
      . . . . . . . .         . . . . . . . .
      D#:4 - - - - - - -      D:3 - - - - - - -
      F:4 - - - - - - -       C:3 - - - - - - -
      . . . . . . . .         . . . . . . . .
      E:4 - - - - - - -       . . . . . . . .
      . . . . . . . .         . . . . G:3 - B:4 -
      . . . . . . . .         . . . . F#:3 - A:4 -
      C:4 - E:4 - G:5 - A:5 - G:4 - E:3 - - - - -
      D:4 - - - - - - -       E:3 - - - D:2 - - -`) },
    // Choir aahs — chord thirds, slow swells
    { program: P.CHOIR, gain: 0.10, octave: 4, wave: 'sine', pan: 0.2, notes: seq(`
      E:3 - - - - - - -       - - - - - - - -
      F#:3 - - - - - - -      - - - - - - - -
      C:3 - - - - - - -       - - - - - - - -
      B3:3 - - - - - - -      D:3 - - - - - - -
      G:4 - - - - - - -       - - - - - - - -
      F#:3 - - - - - - -      - - - - - - - -
      D:3 - - - - - - -       - - - - - - - -
      E:4 - - - - - - -       F#:4 - - - - - - -
      C:4 - - - - - - -       - - - - - - - -
      D:4 - - - - - - -       - - - - - - - -
      E:5 - - - - - - -       - - - - - - - -
      G:4 - - - - - - -       F#:4 - - - - - - -
      E:4 - - - - - - -       - - - - - - - -
      F#:4 - - - - - - -      - - - - - - - -
      C:4 - - - - - - -       A3:3 - - - - - - -
      B3:3 - - - - - - -      E:3 - - - - - - -`) },
    // Slow strings — dark sevenths and fifths; the augmented G# in B section
    { program: P.SLOW_STRINGS, gain: 0.09, octave: 3, wave: 'sine', pan: -0.2, notes: seq(`
      B:2 - - - - - - -       - - - - - - - -
      A:2 - - - - - - -       - - - - - - - -
      G:3 - - - - - - -       - - - - - - - -
      D:3 - - - - - - -       F#:3 - - - - - - -
      D:3 - - - - - - -       - - - - - - - -
      A:3 - - - - - - -       - - - - - - - -
      F#:3 - - - - - - -      - - - - - - - -
      B:3 - - - - - - -       A:3 - - - - - - -
      G:3 - - - - - - -       - - - - - - - -
      F:3 - - - - - - -       - - - - - - - -
      G#:4 - - - - - - -      - - - - - - - -
      A:3 - - - - - - -       - - - - - - - -
      B:4 - - - - - - -       - - - - - - - -
      A:3 - - - - - - -       - - - - - - - -
      G:3 - - - - - - -       E:3 - - - - - - -
      D:3 - - - - - - -       G:2 - - - - - - -`) },
    // Harp — one rolled arpeggio per harmony, mystical and sparse
    { program: P.HARP, gain: 0.08, octave: 4, wave: 'triangle', pan: -0.45, notes: seq(`
      C:3 - E:3 - G:4 - B:3 - . . . . . . . .
      D:3 - F#:3 - A:4 - D5:3 - . . . . . . . .
      A3:3 - C:3 - E:4 - G:3 - . . . . . . . .
      G3:3 - B3:3 - D:4 - F#:3 - . . . . . . . .
      E3:3 - G:3 - B:4 - D5:3 - . . . . . . . .
      D:3 - F#:3 - A:4 - D5:3 - . . . . . . . .
      B3:3 - D:3 - F#:4 - B:3 - . . . . . . . .
      C:3 - E:3 - G:4 - B:3 - . . . . . . . .
      G#3:3 - C:3 - D#:4 - G:3 - . . . . . . . .
      A#3:3 - D:3 - F:4 - A:3 - . . . . . . . .
      C:3 - E:3 - G#:4 - C5:3 - . . . . . . . .
      D:3 - E:3 - A:4 - D5:3 - . . . . . . . .
      C:3 - E:3 - G:4 - B:3 - . . . . . . . .
      D:3 - F#:3 - A:4 - D5:3 - . . . . . . . .
      A3:3 - C:3 - E:4 - G:3 - F:3 - A:3 - C5:3 - - -
      G3:3 - B3:3 - D:4 - G:3 - . . . . . . . .`) },
    // Bass — cello pedals with quiet walking turns and one rising run
    { program: P.CELLO, gain: 0.12, octave: 2, wave: 'sine', notes: seq(`
      C:5 - - - - - - -       C:3 - - - - - E:4 -
      D:5 - - - - - - -       D:3 - - - A:4 - - -
      A:5 - - - - - - -       A:3 - - - E:3 - G:4 -
      G:5 - - - - - - -       B:4 - - - - - F#:4 -
      E:5 - - - - - - -       E:3 - - - B:3 - C:4 -
      D:5 - - - - - - -       D:3 - F#:3 - A:4 - B:4 -
      B:5 - - - - - - -       B:3 - - - F#:3 - - -
      C:5 - - - - - - -       D:4 - - - E:4 F:5 G:6 -
      G#:5 - - - - - - -      G#:3 - - - D#:3 - - -
      A#:5 - - - - - - -      A#:3 - - - F:3 - - -
      C:5 - - - - - - -       C:3 - - - - - - -
      D:5 - - - - - - -       D:3 - - - A:3 - B:4 -
      C:6 - - - - - - -       C:3 - - - - - E:4 -
      D:5 - - - - - - -       D:3 - F#:3 - A:4 - - -
      A:5 - - - - - - -       F:5 - - - - - - -
      G:5 - - - - - - -       C:4 - - - G:3 - B:4 -`) },
    // Sparse color percussion — ride taps, shaker breaths, soft toms; 8-bar loop
    { program: 0, gain: 0.05, octave: 3, wave: 'square', drums: true, pan: 0.1, notes: seq(`
      R:3 . . . . . . .       . . . . X:2 . . .
      R:2 . . . . . . .       . . . . . . T:3 .
      R:3 . . . . . . .       . . . . X:2 . . .
      R:3 . . . T:2 . U:2 .   R:2 . . . . . . .`) },
  ],
};
