// 'Ravenmoor' — the brooding manor. An elegant gothic waltz in D major that keeps
// leaning into Bb — the borrowed flat-6 from D minor — so the genteel surface is
// always slightly wrong underneath. 3/4 time (6 eighth-note steps per bar), 88 bpm.
//
// FORM (32 bars): A (1-8) harpsichord states the waltz theme, pizzicato keeps the
//   "pah-pah" on beats 2-3 — D | A/C# | Bm | Gm(iv!) | D | Bb(bVI!) | Em7 | A7.
//   A' (9-16) theme varied and driven a third higher, V/V colour —
//   D | A/C# | Bm | E7/G# | Gm | D/A | Bb->A7 | D.
//   B (17-24) strings take the melody, darker, relative-minor ballroom —
//   Bm | F#7 | Bm | G | Gm | D/A | Bb | A7; harpsichord ghosts broken chords.
//   C (25-32) MUSIC-BOX REPRISE: the A theme an octave up at half volume over
//   hushed string/choir sustains — a memory of the ballroom — same changes as A,
//   closing on a bare A7 breath that loops back into the downbeat of bar 1.
//
// MOTIF: a rising "curtsy" arpeggio D F# A (accent on the top) answered by a
//   falling G E C# bow; the third phrase reaches Bm and the fourth lands on the
//   accented Bb — the manor's wrong note — every section restates or shadows it.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Ravenmoor', bpm: 88, loopBars: 32,
  channels: [
    // ---- LEAD: harpsichord — the genteel waltz theme; rests for the reprise ---
    { program: P.HARPSICHORD, gain: 0.18, octave: 5, wave: 'square', pan: -0.15,
      notes: seq(`
        D:6   -    F#:5  A:7   -     F#:4
        G:5   -    E:4   -     C#:4  -
        F#:6  -    B:7   -     D6:6  C#6:4
        Bb:7  -    -     A:5   -     -
        D:6   -    F#:5  A:7   -     D6:5
        Bb:7  -    A:5   G:4   F:5   -
        G:6   -    F#:5  E:4   -     B:4
        A:6   -    -     -     .     C#:3

        D:6   -    F#:6  A:8   -     B:5
        A:6   -    G:5   E:4   C#:4  -
        F#:6  -    B:7   D6:6  -     F#6:6
        E6:7  -    D6:5  -     B:4   -
        Bb:6  -    G:5   -     D:4   -
        F#:5  -    A:6   -     D:4   -
        Bb:7  A:6  -     G:4   -     C#:4
        D:6   -    -     -     .     .

        .     .    F#4:3 .     B4:3  .
        .     .    A#4:3 .     C#:2  .
        .     .    F#4:3 .     D:3   .
        .     .    G4:3  .     B4:2  .
        .     .    G4:3  .     Bb4:3 .
        .     .    F#4:3 .     A4:2  .
        .     .    F:3   .     D:2   .
        .     .    E:3   C#:3  A4:2  G4:2

        .     .    .     .     .     .
        .     .    .     .     .     .
        .     .    .     .     .     .
        .     .    .     .     .     .
        .     .    .     .     .     .
        .     .    .     .     .     .
        .     .    .     .     .     .
        .     .    .     .     C#4:2 .
      `) },
    // ---- ANSWER: string section — replies in the lead's breaths, owns B ------
    { program: P.STRINGS, gain: 0.1, octave: 4, wave: 'sawtooth', pan: 0.3,
      notes: seq(`
        .     .     .     .     .     .
        .     .     .     A:4   -     -
        .     .     .     .     .     .
        G:3   -     -     Bb:4  -     -
        .     .     .     .     .     .
        D:4   -     -     F:4   -     -
        .     .     .     E:3   -     -
        C#:4  -     -     E:4   -     G:3

        .     .     .     .     .     .
        .     .     .     C#:4  -     -
        .     .     .     .     F#:3  -
        G#:4  -     -     B:3   -     -
        Bb:4  -     -     G:3   -     -
        D:3   -     -     F#:3  -     -
        F:4   -     -     E:4   -     -
        F#:5  -     E:4   D:4   A3:3  -

        B:6   -     C#5:5 D5:7  -     -
        C#5:6 -     A#:5  -     F#:4  -
        B:6   -     F#:5  -     D:4   -
        B:5   -     -     A:4   G:4   -
        Bb:7  -     -     G:5   -     -
        A:6   -     F#:5  -     D:4   -
        F:6   -     Bb:7  -     D5:5  -
        E5:6  C#5:5 A:4   -     G:3   -

        F#:3  -     -     -     -     -
        E:2   -     -     -     -     -
        D:3   -     -     -     -     -
        Bb3:3 -     -     -     -     -
        F#:3  -     -     -     -     -
        F:3   -     -     -     -     -
        E:2   -     -     -     -     -
        D:2   -     -     -     -     -
      `) },
    // ---- BASS: cello — waltz "oom" on the downbeat, fifths and walks ---------
    { program: P.CELLO, gain: 0.13, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        D:7   -  -    -    A:4   -
        C#:6  -  -    -    E:4   -
        B:6   -  -    -    F#:4  -
        G:7   -  -    -    Bb:4  -
        D:6   -  -    -    A:4   -
        Bb:7  -  -    -    F:4   -
        E:6   -  -    -    G:4   B:3
        A:6   -  C#:4 -    E:4   -

        D:7   -  -    -    A:4   -
        C#:6  -  -    -    E:4   -
        B:6   -  -    -    F#:4  -
        G#:6  -  -    -    B:4   -
        G:7   -  -    -    D3:4  -
        A:6   -  -    -    D3:4  -
        Bb:7  -  -    A:5  -     E:4
        D3:6  -  -    -    D:4   -

        B:6   -  -    -    F#:4  A:3
        F#:6  -  -    -    C#:4  -
        B:6   -  -    -    D3:4  -
        G:6   -  -    -    B:4   -
        G:7   -  -    -    Bb:5  -
        A:6   -  -    -    F#:4  -
        Bb:7  -  -    -    F:4   -
        A:6   -  G:4  -    E:4   C#:4

        D:4   -  -    -    -     -
        C#:3  -  -    -    -     -
        B:3   -  -    -    -     -
        G:4   -  -    -    Bb:2  -
        D:3   -  -    -    -     -
        Bb:4  -  -    -    -     -
        E:3   -  -    -    A:3   -
        D:4   -  -    -    A:2   -
      `) },
    // ---- TEXTURE: pizzicato "pah-pah" on beats 2-3; ghosts under the reprise -
    { program: P.PIZZICATO, gain: 0.07, octave: 3, wave: 'triangle', pan: -0.4,
      notes: seq(`
        . . F#:4  . A:3  .
        . . E:4   . A:3  .
        . . F#:4  . B:3  .
        . . Bb:5  . D:3  .
        . . F#:4  . A:3  .
        . . F:5   . Bb:3 .
        . . G:4   . B:3  .
        . . G:4   . C#:3 .

        . . F#:4  . A:3  .
        . . E:4   . A:3  .
        . . F#:4  . B:3  .
        . . G#:4  . B:3  .
        . . Bb:5  . G:3  .
        . . F#:4  . A:3  .
        . . F:5   . E:3  .
        . . F#:4  . A:2  .

        . . F#:4  . B:3  .
        . . A#:4  . C#:3 .
        . . F#:4  . B:3  .
        . . G:4   . B:3  .
        . . G:5   . Bb:4 .
        . . F#:4  . A:3  .
        . . F:5   . Bb:3 .
        . . G:4   . C#:3 .

        . . F#:2  . .    .
        . . .     . .    .
        . . F#:2  . .    .
        . . Bb:2  . .    .
        . . F#:2  . .    .
        . . .     . .    .
        . . .     . .    .
        . . .     . .    .
      `) },
    // ---- HALO: low choir — one guide tone per bar, the manor's cold air ------
    { program: P.CHOIR, gain: 0.05, octave: 3, wave: 'sine', pan: 0.2,
      notes: seq(`
        F#:3 - - - - -   E:3 - - - - -    D:3 - - - - -    Bb:3 - - - - -
        F#:2 - - - - -   F:3 - - - - -    G:2 - - - - -    G:3 - - - - -
        F#:3 - - - - -   E:2 - - - - -    D:3 - - - - -    D:3 - - - - -
        Bb:3 - - - - -   F#:2 - - - - -   F:3 - - E:2 - -  D:2 - - - - -
        D:3 - - - - -    A#:3 - - - - -   D:3 - - - - -    B:2 - - - - -
        Bb:3 - - - - -   A:2 - - - - -    D:3 - - - - -    C#:3 - - G:2 - -
        F#:2 - - - - -   E:2 - - - - -    D:2 - - - - -    Bb:2 - - - - -
        F#:2 - - - - -   F:2 - - - - -    E:2 - - - - -    D:2 - - - - -
      `) },
    // ---- MEMORY: music box — the A theme an octave up at half volume (C only)
    { program: P.MUSIC_BOX, gain: 0.05, octave: 6, wave: 'sine', pan: 0.45,
      notes: seq(`
        . . . . . .   . . . . . .   . . . . . .   . . . . . .
        . . . . . .   . . . . . .   . . . . . .   . . . . . .
        . . . . . .   . . . . . .   . . . . . .   . . . . . .
        . . . . . .   . . . . . .   . . . . . .   . . . . . .
        . . . . . .   . . . . . .   . . . . . .   . . . . . .
        . . . . . .   . . . . . .   . . . . . .   . . . . . .

        D:4   -   F#:3  A:5  -     F#:3
        G:3   -   E:3   -    C#:3  -
        F#:4  -   B:5   -    D7:4  C#7:3
        Bb:5  -   -     A:3  -     -
        D:4   -   F#:3  A:5  -     D7:3
        Bb:5  -   A:3   G:3  F:3   -
        G:4   -   F#:3  E:3  -     B:3
        A:4   -   -     -    -     .
      `) },
  ],
};
