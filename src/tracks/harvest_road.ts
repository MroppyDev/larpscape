// 'Harvest Road' — the farm belt on the Aldgate-Eldermere road. Golden,
// content, mid-morning. D major, 104 bpm, gentle 4/4 with a brushed kit.
//
// FORM (32 bars, AA'BA''): A (1-8) flute states the "golden morning" motif
//   (rise D-F#-A, settle G-F#-E-D) over nylon-guitar arpeggios — A' (9-16)
//   motif varied and lifted to a D6 peak, closing on a half cadence — B
//   (17-24) the wistful passage: relative-minor duet (flute + oboe in
//   thirds) remembering the Discord Wars, with one borrowed minor iv (Gm)
//   glow at bar 22 — A'' (25-32) fullest return, rising farewell, loops on
//   a soft A pickup.
//
// PROGRESSION (IV-heavy, one bar each):
//   A:   D | G | D/F# | G | D | Gmaj7 | A | D
//   A':  D | G | Bm | G | D | G | Em7 | A      (half cadence)
//   B:   Bm | F#m | G | D/F# | Em | Gm | D/A | A7   (Gm = borrowed iv)
//   A'': D | G | D/F# | G | D | Em7 | A7 | D
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Harvest Road', bpm: 104, loopBars: 32, swing: 0.05,
  channels: [
    // ---- LEAD: warm flute — the golden-morning melody. Defines the loop. -
    { program: P.FLUTE, gain: 0.15, octave: 5, wave: 'triangle', pan: 0.1,
      notes: seq(`
        D:6 -    F#:7 -   A:6 -    F#:4 -
        G:7 -    F#:5 E:4 D:5 -    -    .
        A:6 -    B:7 -    A:5 F#:4 -    -
        E:6 -    D:5 -    B4:4 -   D:5  -
        D:6 -    F#:7 -   A:6 B:7  -    -
        A:6 -    G:5 F#:4 E:5 -    -    -
        E:6 -    C#:5 -   A4:4 B4:5 C#:5 -
        D:7 -    -    -   -    .   A4:3 -

        D:6 -    F#:7 -   A:6 -    B:7  -
        A:6 G:5  F#:4 -   G:5 -    -    .
        B:7 -    A:5 F#:4 D:5 -    F#:5 -
        G:6 -    -    -   A:5 B:6  -    -
        D6:8 -   A:6 -    F#:5 -   A:5  -
        B:7 -    A:5 G:4  -    -   F#:4 -
        G:5 -    F#:4 E:4 -    -   D:4  -
        E:6 -    -    -   -    -   C#:4 E:4

        B4:5 -   D:6 -    F#:6 -   -    E:4
        F#:6 -   E:5 C#:4 A4:4 -   -    -
        B4:4 -   D:5 -    G:6 -    F#:5 -
        F#:6 -   -    -   D:4 E:4  F#:5 -
        G:6 -    F#:5 E:4 B4:4 -   -    -
        A#4:5 -  D:5 -    G:6 -    -    -
        F#:6 -   D:5 -    A4:4 -   -    -
        E:5 -    C#:4 -   A4:3 -   C#:4 E:5

        D:7 -    F#:8 -   A:7 -    F#:5 -
        G:7 -    F#:5 E:4 D:5 -    -    .
        A:6 -    B:7 -    D6:8 -   -    -
        E:6 -    D:5 -    B4:4 -   G:5  -
        A:7 -    F#:6 -   D:5 F#:6 A:6  -
        B:7 -    A:5 G:4  -    -   E:4  -
        E:6 -    F#:5 G:6 -    -   E:4  C#:4
        D:6 -    -    -   -    -   A4:3 -
      `) },
    // ---- COUNTER: oboe — answers in the flute's breaths; duets in B ------
    { program: P.OBOE, gain: 0.1, octave: 4, wave: 'square', pan: -0.3,
      notes: seq(`
        .   .   .   .   .    .   .    .
        .   .   .   .   B:4  -   G:3  -
        .   .   .   .   .    .   .    .
        .   .   .   .   .    .   A:3  -
        .   .   .   .   .    .   .    .
        .   .   .   .   E:4  -   D:3  -
        .   .   A:3 -   .    .   E:3  -
        .   .   F#:4 -  E:3  D:3 .    .

        .   .   .   .   .    .   .    .
        .   .   .   .   .    .   D:3  B3:3
        .   .   .   .   .    .   .    .
        .   .   B3:3 -  D:4  -   -    -
        .   .   .   .   .    .   .    .
        .   .   .   .   D:4  -   B3:3 -
        .   .   .   .   G:3  -   -    -
        C#:4 -  -   -   A3:3 -   -    -

        B3:4 -  -   -   D:4  -   -    -
        A3:4 -  -   -   C#:3 -   -    -
        D:4 -   -   -   B3:3 -   -    -
        A3:3 -  -   -   D:4  -   -    -
        E:4 -   -   -   G:3  -   -    -
        D:4 -   -   -   A#3:4 -  -    -
        A3:3 -  -   -   D:4  -   -    -
        C#:4 -  -   -   E:3  G:3 -    -

        .   .   .   .   .    .   .    .
        .   .   .   .   B:4  -   G:3  -
        .   .   .   .   .    .   .    .
        .   .   .   .   .    .   B3:3 -
        .   .   .   .   .    .   D:4  -
        .   .   .   .   G:3  -   E:3  -
        .   .   C#:4 -  .    .   G:3  -
        F#:4 -  D:3 -   A3:2 -   -    -
      `) },
    // ---- TEXTURE: nylon guitar — fingerpicked arpeggios, root-5-8-10 -----
    { program: P.NYLON_GUITAR, gain: 0.13, octave: 3, wave: 'triangle',
      pan: 0.35,
      notes: seq(`
        D:6 A:3   D4:4 F#4:3 A4:5  F#4:3 D4:4 A:3
        G:6 B:3   D4:4 G4:3  B4:5  G4:3  D4:4 B:3
        F#:6 A:3  D4:4 F#4:3 A4:5  F#4:3 D4:4 A:3
        G:6 B:3   D4:4 G4:3  B4:5  G4:3  D4:4 B:3
        D:6 A:3   D4:4 F#4:3 A4:5  F#4:3 D4:4 A:3
        G:6 B:3   D4:4 F#4:3 B4:5  F#4:3 D4:4 B:3
        A:6 C#4:3 E4:4 G4:3  A4:5  G4:3  E4:4 C#4:3
        D:6 A:3   D4:4 F#4:3 A4:5  F#4:3 D4:4 A:2

        D:6 A:3   D4:4 F#4:3 A4:5  F#4:3 D4:4 A:3
        G:6 B:3   D4:4 G4:3  B4:5  G4:3  D4:4 B:3
        B:6 D4:3  F#4:4 B4:3 D5:5  B4:3  F#4:4 D4:3
        G:6 B:3   D4:4 G4:3  B4:5  G4:3  D4:4 B:3
        D:7 A:3   D4:4 F#4:3 A4:6  F#4:3 D4:4 A:3
        G:6 B:3   D4:4 G4:3  B4:5  G4:3  D4:4 B:3
        E:6 G:3   B:4  D4:3  G4:5  D4:3  B:4  G:3
        A:6 C#4:3 E4:4 G4:3  A4:5  G4:3  E4:4 C#4:3

        B:5 D4:3  F#4:3 B4:2 D5:4  B4:2  F#4:3 D4:2
        F#:5 A:3  C#4:3 F#4:2 A4:4 F#4:2 C#4:3 A:2
        G:5 B:3   D4:3  G4:2 B4:4  G4:2  D4:3  B:2
        F#:5 A:3  D4:3  F#4:2 A4:4 F#4:2 D4:3  A:2
        E:5 G:3   B:3   D4:2 G4:4  D4:2  B:3   G:2
        G:6 A#:3  D4:4  G4:3 A#4:5 G4:3  D4:4  A#:3
        A:5 D4:3  F#4:3 A4:2 D5:4  A4:2  F#4:3 D4:2
        A:5 C#4:3 E4:3  G4:2 A4:4  G4:2  E4:3  C#4:2

        D:7 A:3   D4:4 F#4:3 A4:6  F#4:3 D4:4 A:3
        G:6 B:3   D4:4 G4:3  B4:5  G4:3  D4:4 B:3
        F#:6 A:3  D4:4 F#4:3 A4:5  F#4:3 D4:4 A:3
        G:6 B:3   D4:4 G4:3  B4:5  G4:3  D4:4 B:3
        D:6 A:3   D4:4 F#4:3 A4:5  F#4:3 D4:4 A:3
        E:6 G:3   B:4  D4:3  G4:5  D4:3  B:4  G:3
        A:6 C#4:3 E4:4 G4:3  A4:5  G4:3  E4:4 C#4:3
        D:6 A:3   D4:4 F#4:3 A4:4  F#4:2 D4:3 A:2
      `) },
    // ---- BASS: upright — half-note roots with walking approach tones -----
    { program: P.ACOUSTIC_BASS, gain: 0.13, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        D:6 -  - - A:3   - -     -
        G:5 -  - - D3:3  - -     -
        F#:5 - - - A:3   - D3:3  -
        G:5 -  - - B:3   - A:3   -
        D:6 -  - - A:3   - F#:3  -
        G:5 -  - - D3:3  - B:3   -
        A:5 -  - - E3:3  - C#3:3 -
        D:5 -  - - A:3   - D3:3  -

        D:6 -  - - A:3   - -     -
        G:5 -  - - D3:3  - A:3   -
        B:5 -  - - F#3:3 - -     -
        G:5 -  - - D3:3  - B:3   -
        D:6 -  - - A:3   - F#:3  -
        G:5 -  - - D3:3  - E3:3  -
        E:5 -  - - B:3   - G:3   -
        A:5 -  - - E3:3  - A:3   -

        B:5 -  - - F#3:3 - -     -
        F#:5 - - - C#3:3 - -     -
        G:5 -  - - D3:3  - -     -
        F#:5 - - - A:3   - F#:3  -
        E:5 -  - - B:3   - -     -
        G:5 -  - - D3:3  - A#:3  -
        A:5 -  - - D3:3  - -     -
        A:5 -  - - G:3   - C#3:3 -

        D:6 -  - - A:3   - D3:3  -
        G:5 -  - - D3:3  - B:3   -
        F#:5 - - - A:3   - D3:3  -
        G:5 -  - - B:3   - A:3   -
        D:6 -  - - A:3   - F#:3  -
        E:5 -  - - B:3   - G:3   -
        A:5 -  - - E3:3  - G:3   -
        D:5 -  - - A:3   - A:2   -
      `) },
    // ---- HALO: soft strings — one guide tone per bar (mostly thirds) -----
    { program: P.STRINGS, gain: 0.05, octave: 3, wave: 'sine', pan: -0.15,
      notes: seq(
        'F#:3 - - - - - - -  B:3 - - - - - - -   A:3 - - - - - - -   B:3 - - - - - - -  ' + //  1-4
        'F#:3 - - - - - - -  D4:3 - - - - - - -  C#4:3 - - - - - - - F#:3 - - - - - - - ' + //  5-8
        'F#:3 - - - - - - -  B:3 - - - - - - -   D4:3 - - - - - - -  B:3 - - - - - - -  ' + //  9-12
        'A:3 - - - - - - -   B:3 - - - - - - -   G:3 - - - - - - -   C#4:3 - - - - - - -' + // 13-16
        'D4:3 - - - - - - -  C#4:3 - - - - - - - B:3 - - - - - - -   A:3 - - - - - - -  ' + // 17-20
        'G:3 - - - - - - -   A#:4 - - - - - - -  A:3 - - - - - - -   G:3 - - - - - - -  ' + // 21-24 Gm glow at 22
        'F#:4 - - - - - - -  B:3 - - - - - - -   A:3 - - - - - - -   B:3 - - - - - - -  ' + // 25-28
        'F#:3 - - - - - - -  G:3 - - - - - - -   E:3 - - - - - - -   F#:2 - - - - - - - '   // 29-32
      ) },
    // ---- DRUMS: brushes feel — ghost hats, sidestick 2 & 4 (8-bar loop) --
    { program: 0, gain: 0.09, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        K:5 H:2 M:5 H:2 K:3 H:2 M:5 H:2
        K:4 H:2 M:5 H:3 K:3 H:2 M:5 X:3
        K:5 H:2 M:5 H:2 K:3 H:2 M:5 H:2
        K:4 H:2 M:5 H:2 K:3 M:2 M:5 H:3
        K:5 H:2 M:5 H:2 K:3 H:2 M:5 H:2
        K:4 H:2 M:5 H:3 K:3 H:2 M:5 X:3
        K:5 H:2 M:5 H:2 K:3 H:2 M:5 M:3
        K:4 H:2 M:5 M:3 K:3 M:4 M:5 H:3
      `) },
  ],
};
