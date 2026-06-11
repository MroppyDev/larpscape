// "Quiess' Rest" — the pale tower of the Thin Voice. A minor, 56 bpm, 32 bars.
// Form AA'BA'' (8-bar sections): A states the piano's falling-third sigh over
// long choir tones; A' compresses it and the flute's breath-phrase reaches a
// 9th (D) and exhales unresolved; B the piano leads alone through the relative
// major light; A'' returns hushed, a single G# whisper in bar 32 pulling the
// loop home — the only resolution is the downbeat of bar 1.
// Progression (2 bars/chord): Am Fmaj7 Cmaj7 G/B | Am Dm7 Fmaj7 Esus4 |
//   Fmaj7 Cmaj7 Dm7 Em7 | Am Fmaj7 Dm9 Esus4(->E) — the sus never opens
//   except at the seam. One low tom every 4 bars: a heartbeat, almost still.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: "Quiess' Rest", bpm: 56, loopBars: 32,
  channels: [
    // ---- LEAD: piano — single struck tones, the falling-third sigh -------
    // Theme: E5 .. C5 (sigh) .. A4 .. G4 ghost. Stated A, compressed in A',
    // sung outright in B, returned verbatim-but-quieter in A''.
    { program: P.PIANO, gain: 0.16, octave: 5, wave: 'sine', pan: 0.1,
      notes: seq(`
        E:5  .   .   .   .   .   .   .
        .    .   C:4 .   .   .   .   .
        .    .   .   .   A4:4 .  .   .
        .    .   .   .   .   .   G4:3 .
        G:4  .   .   .   .   .   .   .
        .    .   .   .   E:3 .   .   .
        .    .   .   .   .   .   D:4 .
        B4:3 .   .   .   .   .   .   .

        E:5  .   .   .   C:4 .   .   .
        .    .   A4:4 .  .   .   .   .
        F:5  .   .   .   .   .   D:4 .
        .    .   .   .   A4:3 .  .   .
        .    .   .   .   .   .   C:3 .
        .    .   .   .   .   .   .   .
        B4:4 .   .   .   .   .   .   .
        .    .   .   .   E:3 .   .   .

        A:5  .   .   .   G:4 .   E:4 .
        F:4  .   .   .   .   .   .   .
        G:5  .   .   .   E:4 .   .   .
        .    .   D:4 .   .   .   .   .
        F:5  .   .   .   A:6 .   .   .
        G:5  .   .   .   .   .   F:4 .
        E:5  .   .   .   D:4 .   .   .
        B4:3 .   .   .   .   .   .   .

        E:5  .   .   .   .   .   .   .
        .    .   C:4 .   .   .   .   .
        .    .   .   .   A4:4 .  .   .
        .    .   .   .   .   .   G4:2 .
        F:4  .   .   .   E:4 .   .   .
        .    .   D:3 .   .   .   .   .
        B4:4 .   .   .   .   .   .   .
        .    .   .   .   G#4:3 . .   .
      `) },
    // ---- BREATH: flute — a rising phrase that always exhales on B or D,
    // never on A; the resolution it wants is the loop point itself ---------
    { program: P.FLUTE, gain: 0.12, octave: 5, wave: 'triangle', pan: -0.25,
      notes: seq(`
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   E:3 -   G:4 -   -   -
        A:5  -   -   -   B:4 -   -   -
        -    -   -   -   .   .   .   .
        .    .   .   .   .   .   .   .

        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   A:3 -   C6:4 -  -   -
        D6:5 -   -   -   B:4 -   -   -
        -    -   -   -   .   .   .   .
        .    .   .   .   .   .   .   .

        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   A:4 -   C6:5 -
        D6:6 -   -   -   E6:7 -  -   -
        -    -   -   -   D6:4 -  B:3 -
        -    -   -   -   .   .   .   .

        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   .   .   .   .   .   .
        .    .   E:3 -   G:4 -   -   -
        A:4  -   -   -   B:3 -   -   -
        -    -   -   -   -   -   -   -
        -    -   .   .   .   .   .   .
      `) },
    // ---- HARMONY: choir pad — one guide tone every two bars, thirds and
    // sevenths so the chords stay translucent ------------------------------
    { program: P.CHOIR_PAD, gain: 0.07, octave: 4, wave: 'sine', pan: 0.3,
      notes: seq(`
        E:3 - - - - - - -   - - - - - - - -
        C:3 - - - - - - -   - - - - - - - -
        E:3 - - - - - - -   - - - - - - - -
        D:3 - - - - - - -   - - - - - - - -
        C:3 - - - - - - -   - - - - - - - -
        F:3 - - - - - - -   - - - - - - - -
        A:4 - - - - - - -   - - - - - - - -
        B3:3 - - - - - - -  - - - - - - - -
        A:4 - - - - - - -   - - - - - - - -
        G:3 - - - - - - -   - - - - - - - -
        F:4 - - - - - - -   - - - - - - - -
        G:3 - - - - - - -   - - - - - - - -
        E:3 - - - - - - -   - - - - - - - -
        C:3 - - - - - - -   - - - - - - - -
        E:3 - - - - - - -   - - - - - - - -
        B3:3 - - - - - - -  - - - - - - . .
      `) },
    // ---- BASS: cello — whole-bar roots, the fifth answering late in the
    // second bar; descends E-B into each return of Am ----------------------
    { program: P.CELLO, gain: 0.1, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        A:4  - - - - - - -    - - - - E:3 - - -
        F:4  - - - - - - -    - - - - C3:3 - - -
        C3:4 - - - - - - -    - - - - G:3 - - -
        B:4  - - - - - - -    - - - - G:3 - - -
        A:4  - - - - - - -    - - - - E:3 - - -
        D:4  - - - - - - -    - - - - A:3 - - -
        F:4  - - - - - - -    - - - - C3:3 - - -
        E:4  - - - - - - -    - - - - B:3 - - -
        F:4  - - - - - - -    - - - - C3:3 - - -
        C3:4 - - - - - - -    - - - - G:3 - - -
        D:4  - - - - - - -    - - - - F:3 - - -
        E:4  - - - - - - -    - - - - B:3 - - -
        A:4  - - - - - - -    - - - - C3:3 - - -
        F:4  - - - - - - -    - - - - C3:3 - - -
        D:4  - - - - - - -    - - - - F:3 - - -
        E:4  - - - - - - -    - - - - - - E:2 -
      `) },
    // ---- TEXTURE: halo pad — pale light, two high tones per 16 bars,
    // looping independently against the 32-bar form ------------------------
    { program: P.HALO_PAD, gain: 0.04, octave: 6, wave: 'sine', pan: -0.45,
      notes: seq(`
        . . . . . . . .   . . . . . . . .
        E:2 - - - - - - -  - - - - - - - -
        . . . . . . . .   . . . . . . . .
        . . . . . . . .   . . . . . . . .
        . . . . . . . .   . . . . . . . .
        D:2 - - - - - - -  - - - - - - - -
        . . . . . . . .   . . . . . . . .
        . . . . . . . .   . . . . . . . .
      `) },
    // ---- HEARTBEAT: one soft low tom every 4 bars (lub-dub), nothing else
    { program: 0, gain: 0.05, octave: 3, wave: 'sine', drums: true,
      notes: seq(`
        T:3 . T:2 . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . . .
      `) },
  ],
};
