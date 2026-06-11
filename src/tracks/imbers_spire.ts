// 'Imber's Spire' — the fire wizard tower. C Lydian sparkle at 100 bpm, light swing;
// form AA'BA'' (32 bars): kalimba spark-theme, marimba ostinato, celesta embers, horn forge-blooms.
// Progression — A: C | D/C | C | D/C | Em7 | Bm7 | C | G · A': ...Am7 Bm7 C G(bloom)
//   B (forge breathing, leans into D-major brightness): G | A | Bm | A | G | A | C | D
//   A'': as A but cadencing C | D back into the loop. The II chord (D over C) is the lydian glow.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: "Imber's Spire", bpm: 100, loopBars: 32, swing: 0.12,
  channels: [
    // ---- LEAD: kalimba — the spark theme, syncopated rising cells --------
    // Motif: off-beat rise G^E^G-A, peak B, settling fall to F#/D (lydian #4
    // colours every cadence). Stated bars 1-2, varied higher in A', thinned
    // to long calls in B while the horns breathe, fullest in A''.
    { program: P.KALIMBA, gain: 0.16, octave: 5, wave: 'triangle', pan: 0.1,
      notes: seq(`
        .    G:5  .    E:6  G:7  .    A:6  .
        B:8  -    A:5  .    F#:6 .    D:4  .
        .    G:5  .    E:6  G:7  .    B:7  .
        A:7  -    -    .    E:4  F#:5 A:6  .
        B:7  .    G:5  .    E:6  .    G:5  B:6
        A:6  .    F#:5 D:4  .    .    F#:5 .
        E:6  G:6  A:7  .    G:5  E:4  .    .
        D:6  -    -    .    .    .    G:3  A:4

        .    G:6  .    E:6  G:7  .    A:6  B:7
        D6:8 -    B:6  A:5  F#:5 .    .    .
        .    E6:7 .    D6:6 B:6  .    G:5  .
        A:6  -    F#:5 .    E:4  F#:5 .    .
        C6:7 .    A:5  .    E:5  G:6  .    .
        D6:7 -    B:5  .    F#:4 .    A:5  .
        G:6  A:6  B:7  .    A:5  G:4  E:4  .
        D:5  -    -    -    .    .    .    .

        B:5  .    D6:6 .    G:5  .    .    .
        C#6:7 -   B:5  A:5  .    .    E:4  .
        D6:7 .    B:5  .    F#:5 .    D:4  .
        E6:8 -    C#6:6 .   A:5  .    .    .
        B:6  .    G:5  .    D:4  .    G:5  .
        A:5  B:6  C#6:7 .   E6:8 -    .    .
        E6:7 .    D6:5 .    B:5  G:4  .    .
        A:6  -    F#:5 E:4  D:4  .    .    .

        .    G:6  .    E:6  G:8  .    A:7  .
        B:8  -    A:6  .    F#:6 .    D:4  .
        .    G:5  .    E:6  G:7  .    B:7  .
        A:7  -    -    .    E:4  F#:5 A:6  B:6
        D6:8 -    B:6  .    G:5  .    E:5  .
        F#:5 .    A:6  .    D6:7 -    B:5  .
        E6:7 D6:6 B:5  A:5  G:6  .    E:4  .
        A:5  -    G:4  F#:4 .    .    G:3  A:4
      `) },
    // ---- HARMONY: marimba — syncopated rising arpeggio ostinato ----------
    { program: P.MARIMBA, gain: 0.12, octave: 4, wave: 'sine', pan: -0.35,
      notes: seq(`
        C:6  .   E:3  G:5  .   C5:4 G:3  .
        D:6  .   F#:3 A:5  .   D5:4 A:3  .
        C:6  .   E:3  G:5  .   C5:4 G:3  .
        D:6  .   F#:3 A:5  .   D5:4 A:3  .
        E:6  .   G:3  B:5  .   E5:4 B:3  .
        B3:6 .   D:3  F#:5 .   B:4  F#:3 .
        C:6  .   E:3  G:5  .   C5:4 G:3  .
        G3:6 .   B3:3 D:5  .   G:4  A:4  B:5

        C:6  .   E:3  G:5  .   C5:4 G:3  .
        D:6  .   F#:3 A:5  .   D5:4 A:3  .
        C:6  .   E:3  G:5  .   C5:4 A:4  .
        D:6  .   F#:3 A:5  .   D5:4 A:3  .
        A3:6 .   C:3  E:5  .   A:4  E:3  .
        B3:6 .   D:3  F#:5 .   B:4  F#:3 .
        C:6  .   E:3  G:5  .   C5:4 G:3  .
        G3:6 .   D:3  G:5  B:4 D5:5 G:3  .

        G3:6 .   B3:3 D:5  .   G:4  D:3  .
        A3:6 .   C#:3 E:5  .   A:4  E:3  .
        B3:6 .   D:3  F#:5 .   B:4  F#:3 .
        A3:6 .   C#:3 E:5  .   A:4  E:3  .
        G3:6 .   B3:3 D:5  .   G:4  D:3  .
        A3:6 .   C#:3 E:5  .   A:4  E:3  .
        C:6  .   E:3  G:5  .   C5:4 G:3  .
        D:6  .   F#:3 A:5  D5:5 .   A:3  B:3

        C:6  .   E:3  G:5  .   C5:4 G:3  .
        D:6  .   F#:3 A:5  .   D5:4 A:3  .
        C:6  .   E:3  G:5  .   C5:4 G:3  .
        D:6  .   F#:3 A:5  .   D5:4 A:3  .
        E:6  .   G:3  B:5  .   E5:4 B:3  .
        B3:6 .   D:3  F#:5 .   B:4  F#:3 .
        C:6  .   E:3  G:5  .   C5:4 G:3  .
        D:6  .   A:3  F#:5 E:4 D:4  .    B3:3
      `) },
    // ---- BLOOMS: warm horn swells — the forge breathing ------------------
    { program: P.HORN, gain: 0.1, octave: 3, wave: 'sawtooth', pan: -0.25,
      notes: seq(`
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . E:4 - - -
        D:6 - - - - - - .

        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . G:4 - - -
        G:7 - - - - - D:5 -

        B:4 - - - - - - -
        C#4:6 - - - - - - .
        D4:5 - - - - - - -
        E4:6 - - - - - - .
        B:4 - - - - - - -
        A:6 - - - - - - .
        G:5 - - - E:4 - - -
        F#4:6 - - - - - - .

        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . G:4 - - -
        F#4:5 - - - A:4 - - -
      `) },
    // ---- BASS: warm acoustic bass — syncopated, with walking approaches --
    { program: P.ACOUSTIC_BASS, gain: 0.15, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        C:7 .  G:4   .    C3:5  .    B:4   .
        D:7 .  A:4   .    F#:5  .    D:4   E:4
        C:7 .  G:4   .    A:5   .    B:5   .
        D:7 .  F#:4  .    A:5   .    D3:5  D#3:4
        E:7 .  B:4   .    G:5   .    E:4   .
        B:7 .  F#:4  .    D3:5  .    B:4   .
        C:7 .  G:4   .    E:5   .    A:4   .
        G:7 .  B:4   .    D3:5  .    G:4   .

        C:7 .  G:4   .    C3:5  .    B:4   .
        D:7 .  A:4   .    F#:5  .    E:4   .
        C:7 .  E:4   .    G:5   .    A:4   B:4
        D:7 .  A:4   .    D3:5  .    C3:4  B:4
        A:7 .  E:4   .    G:5   .    A:4   .
        B:7 .  F#:4  .    A:5   .    B:4   .
        C:7 .  G:4   .    E:5   .    D:4   .
        G:7 -  .     .    D:4   .    F#:4  .

        G:7 .  D:4   .    G:5   .    B:4   .
        A:7 .  E:4   .    A:5   .    C#3:4 .
        B:7 .  F#:4  .    B:5   .    A:4   .
        A:7 .  E:4   .    C#3:5 .    A:4   .
        G:7 .  D:4   .    B:5   .    G:4   .
        A:7 .  C#3:4 .    E:5   .    A:4   .
        C:7 .  G:4   .    C3:5  .    A:4   .
        D:7 .  A:4   .    F#:5  D:4  C:4   B:4

        C:8 .  G:4   .    C3:5  .    B:4   .
        D:7 .  A:4   .    F#:5  .    D:4   .
        C:7 .  G:4   .    A:5   .    B:5   .
        D:7 .  F#:4  .    A:5   .    D3:5  .
        E:7 .  B:4   .    G:5   .    E:4   .
        B:7 .  F#:4  .    D3:5  .    F#:4  .
        C:7 .  G:4   .    E:5   .    A:4   .
        D:7 .  A:4   .    F#:5  E:4  D:4   .
      `) },
    // ---- TEXTURE: celesta embers — 8-bar pentatonic flicker in the gaps --
    { program: P.CELESTA, gain: 0.06, octave: 6, wave: 'sine', pan: 0.5,
      notes: seq(`
        .    .  .    . .    .    E:3 G:3
        A:2  .  .    . .    .    .   .
        .    .  B:3  . F#:2 .    .   .
        .    .  .    . .    D:2  E:3 .
        .    .  G:3  . .    .    .   .
        .    .  .    . A:3  B:2  .   .
        D6:3 .  .    . .    .    .   .
        .    .  .    . E:2  G:3  .   .
      `) },
    // ---- DRUMS: hand-drum kit — dum/tek with shaker, fills at the turn ---
    { program: 0, gain: 0.13, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        K:7 X:3 M:5 X:2 K:5 X:3 M:6 X:3
        K:7 X:3 M:5 K:3 .   X:3 M:6 X:2
        K:7 X:3 M:5 X:2 K:5 X:3 M:6 B:4
        K:7 X:3 M:5 X:2 K:5 T:4 M:6 U:4
        K:7 X:3 M:5 X:2 K:5 X:3 M:6 X:3
        K:7 X:3 M:5 K:3 .   X:3 M:6 X:2
        K:7 X:3 M:5 X:2 K:5 X:3 M:6 M:3
        K:7 M:3 T:5 U:5 K:6 T:4 M:7 B:5
      `) },
  ],
};
