// 'Wraithrun' — the danger corridor: broken chapel, dead trees, wraiths.
// Form AA'BA'' (32 bars, 84 bpm) over an unbroken E pedal-drone. Progression:
//   A:  Em — Em — Bb°/E (tritone shadow) — F/E (bII) — Em
//   A': Em — Gm(#4) — Em — Bb°/E — F/E — Em
//   B:  Em — Gm — C — B — Bb (chromatic fall) — Em
//   A'': as A, peaking bII -> tritone, dying on D# (leading-tone seam into loop).
// Motif: a cold two-note tritone E -> Bb on music box, inverted (Bb -> E),
// sequenced up a minor third (G -> C#), and extended through the b2 (E F Bb).
// Percussion is an out-of-phase 7-bar grid (no steady kick); chapel bell tolls
// on a 10-bar grid so the strikes never land in the same place twice.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Wraithrun', bpm: 84, loopBars: 32,
  channels: [
    // ---- LEAD: music box — the cold tritone motif. 32 bars; defines loop. -
    { program: P.MUSIC_BOX, gain: 0.15, octave: 5, wave: 'sine', pan: 0.3,
      notes: seq(`
        E:5  -   .   .   A#:7 -   .   .
        .    .   .   .   .    .   .   .
        E:4  -   .   .   A#:6 -   .   .
        .    .   .   .   .    .   E6:3 .
        A#:6 -   .   .   E:4  -   .   .
        .    .   .   .   .    .   .   .
        E:5  -   F:6 -   A#:7 -   -   .
        .    .   .   .   .    .   .   .

        E:5  -   .   .   A#:7 -   .   .
        .    .   B:4 -   .    .   .   .
        G:5  -   .   .   C#6:7 -  .   .
        .    .   .   .   .    .   .   .
        E6:6 -   D#6:4 - E6:3 .   .   .
        .    .   .   .   A#:5 -   .   .
        F:6  -   E:5 -   .    .   .   .
        .    .   .   .   .    .   .   .

        .    .   .   .   .    .   .   .
        E6:5 -   A#:4 -  .    .   .   .
        .    .   .   .   .    .   .   .
        G:5  -   .   .   C#6:6 -  .   .
        .    .   .   .   .    .   .   .
        C6:6 -   B:5 -   A#:5 -   .   .
        .    .   .   .   E:4  -   .   .
        .    .   .   .   .    .   .   .

        E:5  -   .   .   A#:7 -   .   .
        .    .   .   .   .    .   .   .
        A#:6 -   .   .   E:5  -   .   .
        .    .   .   .   .    .   F:3 .
        E:6  -   F:6 -   A#:8 -   E6:9 -
        .    .   .   .   .    .   .   .
        A#:4 -   .   .   E:3  -   .   .
        .    .   .   .   .    .   .   .
      `) },
    // ---- DRONE: bowed pad — E pedal, creeping to bII and back. -----------
    { program: P.BOWED_PAD, gain: 0.1, octave: 2, wave: 'sawtooth', pan: -0.2,
      notes: seq(`
        E:4 - - - - - - -   - - - - - - - -
        E:3 - - - - - - -   - - - - - - - -
        E:4 - - - - - - -   - - - - - - - -
        F:4 - - - - - - -   E:3 - - - - - - -

        E:4 - - - - - - -   - - - - - - - -
        G:3 - - - - - - -   - - - - - - - -
        E:3 - - - - - - -   - - - - - - - -
        F:3 - - - - - - -   E:3 - - - - - - -

        E:4 - - - - - - -   - - - - - - - -
        G:4 - - - - - - -   - - - - - - - -
        C3:4 - - - - - - -  B:3 - - - - - - -
        E:4 - - - - - - -   - - - - - - - -

        E:4 - - - - - - -   - - - - - - - -
        E:3 - - - - - - -   - - - - - - - -
        F:4 - - - - - - -   E:4 - - - - - - -
        E:3 - - - - - - -   D#:2 - - - - - - -
      `) },
    // ---- BASS: contrabass — slow chromatic creep around the pedal. -------
    { program: P.CONTRABASS, gain: 0.14, octave: 2, wave: 'triangle', pan: 0,
      notes: seq(`
        E:5  - - - - - -    -
        E:3  - - - - - D:3  -
        E:4  - - - - - -    -
        E:3  - - - - - D#:4 -
        A#:5 - - - - - -    -
        E:4  - - - - - -    -
        F:5  - - - - - -    -
        E:4  - - - - - F:3  D#:3

        E:5  - - - - - -    -
        E:3  - - - - - G:3  -
        G:5  - - - - - -    -
        G:3  - - - - - A#:3 -
        E:4  - - - - - -    -
        A#:5 - - - - - -    -
        F:5  - - - - - E:4  -
        E:3  - - - - - -    -

        E:5  - - - - - -    -
        E:3  - - - D:3 - -  -
        G:5  - - - - - -    -
        G:3  - - - F:3 - -  -
        C3:5 - - - - - -    -
        B:5  - - - - - A#:4 -
        E:4  - - - - - -    -
        E:3  - - - F:3 - D#:3 -

        E:5  - - - - - -    -
        E:3  - - - - - D:3  -
        A#:5 - - - - - -    -
        E:4  - - - - - -    -
        F:5  - - - - - -    -
        F:3  - - - E:4 - -  -
        E:4  - - - - - -    -
        E:3  - - - - - D#:2 -
      `) },
    // ---- SWELLS: distant low trombone — long tones at the phrase seams. --
    { program: P.TROMBONE, gain: 0.07, octave: 3, wave: 'sawtooth', pan: -0.4,
      notes: seq(`
        . - - - - - - -   . - - - - - - -
        . - - - - - - -   . - - - - - - -
        . - - - - - - -   . - - - - - - -
        E:4 - - - - - - - - - - - - - - -

        . - - - - - - -   . - - - - - - -
        . - - - - - - -   . - - - - - - -
        . - - - - - - -   . - - - - - - -
        F:5 - - - - - - - E:4 - - - - - - -

        E:5 - - - - - - - - - - - - - - -
        G:4 - - - - - - - - - - - - - - -
        A#:6 - - - - - - - - - - - - - - -
        E:4 - - - - - - - - - - - - - - -

        . - - - - - - -   . - - - - - - -
        . - - - - - - -   . - - - - - - -
        F:5 - - - - - - - - - - - - - - -
        E:3 - - - - - - - - - - - - - - -
      `) },
    // ---- BELL: chapel toll — 10-bar grid, phases against the 32-bar form. -
    { program: P.TUBULAR_BELLS, gain: 0.05, octave: 4, wave: 'sine', pan: 0.5,
      notes: seq(`
        .   .   .   .   .    .   .   .
        E:3 .   .   .   .    .   .   .
        .   .   .   .   .    .   .   .
        .   .   .   .   A#:2 .   .   .
        .   .   .   .   .    .   .   .
        .   .   .   .   .    .   .   .
        .   .   E:2 .   .    .   .   .
        .   .   .   .   .    .   .   .
        .   .   .   .   .    .   A#:3 .
        .   .   .   .   .    .   .   .
      `) },
    // ---- DRUMS: irregular 7-bar grid — toms and sidestick, no steady kick.
    { program: 0, gain: 0.08, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        T:5 .   .   .   .   .   M:3 .
        .   .   .   .   T:3 .   .   .
        .   .   .   .   .   .   .   .
        M:2 .   .   T:6 .   .   .   X:2
        .   .   .   .   .   .   .   .
        .   .   T:4 .   .   M:3 .   .
        .   .   .   .   K:5 .   .   T:3
      `) },
  ],
};
