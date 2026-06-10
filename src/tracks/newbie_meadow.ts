// 'Newbie Meadow' — the game's main theme.
//
// Form: A (8) A' (8) B (8) A'' (8) = 32 bars in C major, ~100 bpm, pastoral folk.
// The lead hook IS the world leitmotif (C E G A G E, "rise reach settle"),
// stated in bars 1-2, sequenced up a third in bars 3-4 (E G B C, over Em),
// rhythmically varied in A' (passing-tone pickup, extended peak to D6),
// turned minor and reflective in B (Am, with a borrowed iv — Fm — at bar 22),
// and restated fortissimo in A'' with a deceptive cadence (G -> Am, bar 31)
// before F-G resolves the loop seam back into the opening C.
//
// Orchestration (classic OSRS / SC-88 palette, à la Jagex 2004-2007):
//   - Breathy RECORDER lead carries the leitmotif (the quintessential OSRS voice).
//   - OBOE counter-line answers in the gaps and joins in sixths at the A'' climax.
//   - HARP plays a flowing rise-and-fall broken-chord figure each bar.
//   - SLOW STRINGS hold guide tones (rising A-B-C line under the final cadence).
//   - CHOIR "aahs" enter at the minor B section and swell through the A'' climax.
//   - CELLO walking bass with octave drops and the chromatic F#->G push (bar 23).
//   - Soft TIMPANI rolls mark the section cadences and the return of the theme.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Newbie Meadow',
  bpm: 100,
  loopBars: 32,
  channels: [
    // Lead — recorder, the leitmotif hook. Channel 0 defines the 32-bar form.
    {
      program: P.RECORDER, gain: 0.20, octave: 5, wave: 'triangle', pan: 0,
      notes: seq(`
        C:6  -    E:6  -    G:7  -    A:8  -
        G:7  -    -    -    E:5  -    -    .
        E:6  -    G:6  -    B:7  -    C6:8 -
        B:7  -    -    -    G:5  -    -    .
        A:7  -    G:6  -    F:6  -    A:6  -
        G:7  -    E:5  -    -    -    .    .
        D:5  E:5  F:6  G:6  A:7  -    B:7  -
        C6:8 -    -    -    G:5  -    E:3  -

        C:5  D:5  E:6  -    G:7  -    A:8  -
        G:7  -    E:6  -    C:5  -    A4:5 -
        E:6  -    G:6  -    B:7  -    C6:8 -
        D6:8 -    B:6  -    G:5  -    -    .
        A:7  -    -    C6:7 -    A:6  G:6  -
        G:6  -    E:5  -    C:4  -    -    .
        D:5  E:5  F:6  G:6  A:7  -    B:7  -
        C6:8 -    -    -    G:4  -    .    .

        A:6  -    C6:7 -    B:6  -    A:5  -
        A:7  G:6  F:6  -    -    -    C:4  -
        F:6  -    A:6  -    D6:8 -    C6:6 -
        B:7  -    G#:6 -    E:5  -    -    .
        A:5  -    B:5  -    C6:6 -    E6:7 -
        C6:7 -    G#:6 -    F:6  -    -    .
        F:5  -    E:5  -    D:5  -    A:6  -
        D6:7 -    B:5  -    G:4  A:5  B:6  -

        C:7  -    E:7  -    G:8  -    A:9  -
        G:8  -    -    -    E:6  -    -    .
        E:7  -    G:7  -    B:8  -    C6:9 -
        C6:8 -    B:7  A:6  -    -    E:5  -
        F:6  G:6  A:7  -    C6:8 -    A:6  -
        D6:8 -    B:7  -    G:6  -    -    .
        C6:9 -    -    B:7  A:7  -    E:5  -
        F:5  -    A:6  -    G:6  A:5  B:6  -
      `),
    },
    // Counter-melody — oboe answering the recorder in the gaps; held lyrical
    // lines in B; parallel sixths/thirds beneath the lead at the A'' climax.
    {
      program: P.OBOE, gain: 0.10, octave: 4, wave: 'sine', pan: 0.35,
      notes: seq(`
        .    .    .    .    .    .    .    .
        .    .    C:4  E:4  G:5  -    -    .
        .    .    .    .    .    .    .    .
        .    .    E:4  G:4  B:5  -    -    .
        .    .    .    .    .    .    .    .
        .    .    .    .    E:4  D:4  C:4  .
        .    .    .    .    .    .    .    .
        .    .    E:4  -    D:3  -    C:4  -

        .    .    .    .    .    .    .    .
        .    .    .    .    C:4  -    A3:4 -
        .    .    .    .    .    .    .    .
        .    .    .    .    G:4  -    B:4  -
        .    .    .    .    .    .    .    .
        .    .    .    E:3  F:3  G:4  -    .
        .    .    .    .    .    .    .    .
        .    .    E:4  -    G:4  -    A:4  -

        E:4  -    -    -    -    -    -    -
        F:4  -    -    -    -    -    C:3  -
        A:4  -    -    -    -    -    -    -
        G#:4 -    -    -    B:4  -    -    .
        A:4  -    -    -    E:4  -    -    -
        C:4  -    -    -    -    -    G#3:3 -
        F:4  -    -    -    -    -    E:3  -
        D:4  -    -    -    F:4  -    -    -

        E:5  -    G:5  -    B:6  -    C5:6 -
        E:5  -    -    -    C:4  -    -    .
        C:5  -    E:5  -    G:6  -    A:6  -
        E:4  -    -    C:4  -    -    A3:4 -
        A:5  -    -    -    F:5  -    -    -
        G:5  -    -    -    -    -    -    -
        E:5  -    -    -    C:5  -    -    -
        C:4  -    -    -    B3:5 -    -    -
      `),
    },
    // Harp — a rise-and-fall broken-chord figure each bar, peaking mid-bar.
    {
      program: P.HARP, gain: 0.12, octave: 3, wave: 'triangle', pan: -0.35,
      notes: seq(`
        C:5  G:3  C4:4 E4:4 G4:5 E4:3 C4:4 G:3
        C:5  G:3  C4:4 E4:4 G4:5 E4:3 C4:4 G:3
        E:5  B:3  E4:4 G4:4 B4:5 G4:3 E4:4 B:3
        E:5  B:3  E4:4 G4:4 B4:5 G4:3 E4:4 B:3
        F:5  C4:3 F4:4 A4:4 C5:5 A4:3 F4:4 C4:3
        E:5  G:3  C4:4 E4:4 G4:5 E4:3 C4:4 G:3
        D:5  A:3  D4:4 F4:4 G:5  B:3  D4:4 G4:4
        C:5  G:3  C4:4 E4:4 G4:5 E4:3 C4:4 G:3

        C:5  G:3  C4:4 E4:4 G4:5 E4:3 C4:4 G:3
        A:5  E4:3 A4:4 C5:4 E5:5 C5:3 A4:4 E4:3
        E:5  B:3  E4:4 G4:4 B4:5 G4:3 E4:4 B:3
        G:5  D4:3 G4:4 B4:4 D5:5 B4:3 G4:4 D4:3
        F:5  C4:3 F4:4 A4:4 C5:5 A4:3 F4:4 C4:3
        E:5  G:3  C4:4 E4:4 G4:5 E4:3 C4:4 G:3
        D:5  A:3  D4:4 F4:4 G:5  B:3  D4:4 G4:4
        C:5  G:3  C4:4 E4:4 G4:5 E4:3 C4:4 G:3

        A:5  E4:3 A4:4 C5:4 E5:5 C5:3 A4:4 E4:3
        F:5  C4:3 F4:4 A4:4 C5:5 A4:3 F4:4 C4:3
        D:5  A:3  D4:4 F4:4 A4:5 F4:3 D4:4 A:3
        E:5  B:3  E4:4 G#4:4 B4:5 G#4:3 E4:4 B:3
        A:5  E4:3 A4:4 C5:4 E5:5 C5:3 A4:4 E4:3
        F:5  C4:3 F4:4 G#4:4 C5:5 G#4:3 F4:4 C4:3
        D:5  A:3  D4:4 F4:4 A4:5 F4:3 D4:4 A:3
        G:5  D4:3 G4:4 B4:4 D5:5 B4:3 G4:4 D4:3

        C:6  G:4  C4:5 E4:5 G4:6 E4:4 C4:5 G:4
        C:6  G:4  C4:5 E4:5 G4:6 E4:4 C4:5 G:4
        E:6  B:4  E4:5 G4:5 B4:6 G4:4 E4:5 B:4
        A:6  E4:4 A4:5 C5:5 E5:6 C5:4 A4:5 E4:4
        F:6  C4:4 F4:5 A4:5 C5:6 A4:4 F4:5 C4:4
        G:6  D4:4 G4:5 B4:5 D5:6 B4:4 G4:5 D4:4
        A:6  E4:4 A4:5 C5:5 E5:6 C5:4 A4:5 E4:4
        F:5  C4:3 F4:4 A4:4 G:5  D4:4 G4:4 B4:4
      `),
    },
    // Slow strings — long guide tones; rising A-B-C under the final cadence.
    {
      program: P.SLOW_STRINGS, gain: 0.08, octave: 4, wave: 'sawtooth', pan: -0.15,
      notes: seq(`
        E:3  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        G:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A:4  -    -    -    -    -    -    -
        G:3  -    -    -    -    -    -    -
        F:4  -    -    -    D:4  -    -    -
        E:3  -    -    -    -    -    -    -

        E:3  -    -    -    -    -    -    -
        C:4  -    -    -    -    -    -    -
        B3:3 -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A3:4 -    -    -    -    -    -    -
        G3:3 -    -    -    -    -    -    -
        F:4  -    -    -    B3:4 -    -    -
        E:3  -    -    -    -    -    -    -

        C:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        D:4  -    -    -    -    -    -    -
        B3:5 -    -    -    -    -    -    -
        C:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        D:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -

        E:5  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        G:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A3:5 -    -    -    -    -    -    -
        B3:5 -    -    -    -    -    -    -
        C:5  -    -    -    -    -    -    -
        A3:4 -    -    -    B3:5 -    -    -
      `),
    },
    // Choir "aahs" — tacet through A/A', a hushed inner voice through the
    // minor B section, then a full swell beneath the A'' restatement.
    {
      program: P.CHOIR, gain: 0.08, octave: 4, wave: 'sine', pan: 0.2,
      notes: seq(`
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .

        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .

        C:3  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        D:4  -    -    -    -    -    -    -
        B3:4 -    -    -    -    -    -    -
        C:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        D:4  -    -    -    -    -    -    -
        D:3  -    -    -    B3:4 -    -    -

        G:5  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        G:5  -    -    -    -    -    -    -
        A:5  -    -    -    -    -    -    -
        A:5  -    -    -    -    -    -    -
        B:5  -    -    -    -    -    -    -
        C5:6 -    -    -    -    -    -    -
        A:5  -    -    -    B:5  -    -    -
      `),
    },
    // Bass — cello: roots with walking approaches, octave drops, and a
    // chromatic F#->G push into the dominant at bar 23.
    {
      program: P.CELLO, gain: 0.13, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        C:6  -    -    -    G:4  -    -    -
        C:5  -    -    -    A:4  -    B:5  -
        E:6  -    -    -    B:4  -    -    -
        E:5  -    -    -    D:4  -    E:4  -
        F:6  -    -    -    C:4  -    -    -
        E:5  -    -    -    C:4  -    -    -
        D:5  -    F:4  -    G:6  -    B:4  -
        C:6  -    C3:5 -    G:4  -    E:4  -

        C:6  -    -    -    G:4  -    -    -
        A:6  -    -    -    E:4  -    -    -
        E:6  -    -    -    B:4  -    -    -
        G:6  -    -    -    D:4  -    E:4  -
        F:6  -    -    -    C:4  -    -    -
        E:5  -    -    -    C:4  -    -    -
        D:5  -    F:4  -    G:6  -    G:4  -
        C:6  -    -    -    C3:5 -    B:4  -

        A:6  -    -    -    E:4  -    -    -
        F:6  -    -    -    C:4  -    -    -
        D:6  -    -    -    A:4  -    -    -
        E:6  -    -    -    B:4  -    G#:4 -
        A:6  -    -    -    E:4  -    G:4  -
        F:6  -    -    -    C:4  -    -    -
        D:6  -    -    -    F:4  -    F#:4 -
        G:6  -    -    -    D:4  -    B:5  -

        C:6  -    -    -    G:4  -    -    -
        C:5  -    -    -    E:4  -    G:4  -
        E:6  -    -    -    B:4  -    -    -
        A:6  -    -    -    E:4  -    G:4  -
        F:6  -    -    -    C:4  -    -    -
        G:6  -    -    -    D:4  -    -    -
        A:6  -    -    -    C:4  -    E:4  -
        F:6  -    -    -    G:6  -    B:5  -
      `),
    },
    // Timpani — soft rolls at the section cadences and a strike under the
    // fortissimo return of the theme at bar 25.
    {
      program: P.TIMPANI, gain: 0.10, octave: 2, wave: 'sine', pan: -0.1,
      notes: seq(`
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        C:5  .    .    .    G:4  .    .    .

        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        C:5  .    .    .    .    .    G:3  G:4

        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        G:5  .    .    .    G:3  G:4  G:5  G:6

        C:7  .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        .    .    .    .    .    .    .    .
        A:5  .    .    .    .    .    .    .
        .    .    .    .    G:5  .    G:6  .
      `),
    },
  ],
};
