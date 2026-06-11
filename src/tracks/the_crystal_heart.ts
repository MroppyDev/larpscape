// 'The Crystal Heart' — boss theme for the resonating crystal heart of the
// Untuned Mine. Notated at bpm 280 so each 8th-note step sounds as a 16th at
// a perceived 140: the string ostinato churns in true 16ths. Every line below
// is ONE musical bar (16 steps); 28 musical bars (= 56 notated bars) per loop.
//
// FORM: A (1-8, theme stated low, the "wrong note" Bb snarls over Em) —
//   A' (9-16, theme sequenced up through Am/F, hammered B7 half-cadence) —
//   BREAK (17-18, near-silence: only the wrong-note motif Bb..E, the boss
//   telegraph window) — C (19-24, build, theme re-peaked an octave up) —
//   RETUNE (25-28, triumphant E MAJOR: Bb finally resolves up to B natural).
// PROGRESSION: A: | Em | Em | C | B7 | x2 · A': | Am | F | C | B7 | Am | F |
//   B7 | B7 | · C: | Em | C | Am | B7 | Em | B7 | · RETUNE: | E | A | B | E |
//   (i–VI–V7 minor grind, bII-color F, tritone Bb as the untuned crystal;
//   picardy blaze I–IV–V–I at the end, then bar 28's D-natural bass pivots
//   the loop back into darkness.)
// MOTIF: rise-to-the-wrong-note E G Bb / fall A G E. The BREAK strips it to
//   bare Bb–E (tritone); the RETUNE answers it as B–G#–B–E5 (tuned at last).
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'The Crystal Heart', bpm: 280, loopBars: 56,
  channels: [
    // ---- LEAD: saw synth — soaring, dissonant; resolves only in RETUNE ----
    { program: P.SAW_LEAD, gain: 0.15, octave: 4, wave: 'sawtooth', pan: 0.1,
      notes: seq(`
        E:7 - - -      G:6 - Bb:8 -    - - A:6 -      G:5 - E:5 -
        F:7 - E:6 -    - - D:5 -      E:6 - - -      - - . .
        G:7 - - -      B:6 - C5:8 -    - - B:6 -      G:5 - E:5 -
        F#:6 - - -     D#:5 - F:7 -    E:6 - - -      B3:5 - . .
        E5:8 - - -     G5:7 - Bb5:9 -  - - A5:7 -     G5:6 - E5:5 -
        F5:7 - E5:6 -  D5:5 - C5:5 -   B:6 - - -      - - . .
        C5:6 - B:6 -   G:5 - A:5 -     B:7 - - -      G:4 - E:4 -
        D#:5 - F#:6 -  A:7 - F:6 -     D#:5 - B3:4 -  . . . .

        A:7 - - -      C5:6 - E5:8 -   - - D5:6 -     C5:5 - A:5 -
        F:7 - - -      A:6 - C5:8 -    - - Bb:7 -     A:5 - F:5 -
        G:5 - A:6 -    B:6 - C5:7 -    E5:8 - - -     D5:6 - - -
        D#5:7 - - -    B:6 - F5:8 -    E5:7 - D#5:6 - B:5 - . .
        A5:8 - - -     E5:6 - C5:6 -   A:5 - - -      . . . .
        F5:8 - - -     C5:6 - A:6 -    F:5 - - -      . . . .
        B:6 - D#5:7 -  F#5:7 - A5:8 -  - - F5:7 -     D#5:6 - B:5 -
        F5:8 - E5:6 -  F5:7 - E5:6 -   Bb:7 - - -     - - . .

        Bb:3 - - -     . . . .        E:2 - - -      . . . .
        Bb:4 - A:3 -   Bb:5 - - -     - - . .        . . . .

        E:6 - - -      G:6 - Bb:7 -    - - A:6 -      G:5 - E:5 -
        G:6 - B:6 -    C5:7 - B:6 -    G:5 - E:5 -    - - . .
        A:6 - C5:7 -   E5:8 - D5:7 -   C5:6 - A:5 -   - - . .
        F:6 - E:6 -    D#:6 - F#:7 -   A:7 - B:8 -    - - . .
        E5:8 - - -     G5:8 - Bb5:9 -  - - A5:8 -     G5:7 - F5:6 -
        F#5:7 - A5:8 - D#5:7 - F5:8 -  E5:8 - B:7 -   A:6 - F#:6 -

        B:9 - - -      G#:8 - B:8 -    E5:9 - - -     - - - -
        C#5:8 - B:7 -  A:7 - B:8 -     E5:9 - - -     - - - -
        D#5:8 - E5:8 - F#5:9 - - -     B:7 - G#:7 -   F#:6 - G#:7 -
        E5:9 - - -     - - - -        B:6 - G#:5 -   E:5 - - -
      `) },
    // ---- OSTINATO: strings — relentless 16ths, accents on the beat, ------
    //      ghosted in-betweens; the "wrong note" Bb flicks inside Em bars.
    { program: P.STRINGS, gain: 0.09, octave: 3, wave: 'sawtooth', pan: -0.4,
      notes: seq(`
        E:8 E:3 E:5 B:3   E:7 E:3 G:5 E:3   E:8 E:3 E:5 B:3   G:6 F#:4 E:5 D:3
        E:8 E:3 G:5 E:3   B:7 E:3 G:5 E:3   E:8 E:3 G:5 E:3   Bb:6 A:4 G:5 F#:3
        C:8 C:3 C:5 G:3   C:7 C:3 E:5 C:3   C:8 C:3 C:5 G:3   E:6 D:4 C:5 B2:3
        B2:8 B2:3 B2:5 F#:3 B2:7 B2:3 D#:5 B2:3 B2:8 B2:3 B2:5 F#:3 A:6 G:4 F#:5 D#:3
        E:8 E:3 E:5 B:3   E:7 E:3 G:5 E:3   E:8 E:3 E:5 B:3   G:6 F#:4 E:5 D:3
        E:8 E:3 G:5 E:3   B:7 E:3 G:5 E:3   E:8 E:3 G:5 E:3   Bb:6 A:4 G:5 F#:3
        C:8 C:3 C:5 G:3   C:7 C:3 E:5 C:3   C:8 C:3 C:5 G:3   E:6 D:4 C:5 B2:3
        B2:8 B2:3 B2:5 F#:3 B2:7 B2:3 D#:5 B2:3 B2:8 B2:3 B2:5 F#:3 A:6 G:4 F#:5 D#:3

        A:8 A:3 A:5 E:3   A:7 A:3 C:5 A:3   A:8 A:3 A:5 E:3   C:6 B2:4 A:5 G:3
        F:8 F:3 F:5 C:3   F:7 F:3 A:5 F:3   F:8 F:3 F:5 C:3   A:6 G:4 F:5 E:3
        C:8 C:3 C:5 G:3   C:7 C:3 E:5 C:3   C:8 C:3 C:5 G:3   E:6 D:4 C:5 B2:3
        B2:8 B2:3 B2:5 F#:3 B2:7 B2:3 D#:5 B2:3 B2:8 B2:3 B2:5 F#:3 A:6 G:4 F#:5 D#:3
        A:8 A:3 A:5 E:3   A:7 A:3 C:5 A:3   A:8 A:3 A:5 E:3   C:6 B2:4 A:5 G:3
        F:8 F:3 F:5 C:3   F:7 F:3 A:5 F:3   F:8 F:3 F:5 C:3   A:6 G:4 F:5 E:3
        B2:8 B2:3 B2:5 F#:3 B2:7 B2:3 D#:5 B2:3 B2:8 B2:3 B2:5 F#:3 A:6 G:4 F#:5 D#:3
        B2:8 B2:3 D#:5 B2:3 F#:7 B2:3 A:5 B2:3 B:8 F#:4 D#:5 B2:3 F:7 F:5 F:6 F:4

        . . . .          . . . .          . . . .          . . . .
        . . . .          . . . .          . . . .          . . . .

        E:8 E:3 E:5 B:3   E:7 E:3 G:5 E:3   E:8 E:3 E:5 B:3   G:6 F#:4 E:5 D:3
        C:8 C:3 C:5 G:3   C:7 C:3 E:5 C:3   C:8 C:3 C:5 G:3   E:6 D:4 C:5 B2:3
        A:8 A:3 A:5 E:3   A:7 A:3 C:5 A:3   A:8 A:3 A:5 E:3   C:6 B2:4 A:5 G:3
        B2:8 B2:3 B2:5 F#:3 B2:7 B2:3 D#:5 B2:3 B2:8 B2:3 B2:5 F#:3 A:6 G:4 F#:5 D#:3
        E:8 E:3 G:5 E:3   B:7 E:3 G:5 E:3   E:8 E:3 G:5 E:3   Bb:6 A:4 G:5 F#:3
        B2:8 B2:3 D#:5 B2:3 F#:7 B2:3 A:5 B2:3 B:8 A:4 F#:5 D#:3 C#:6 D#:6 D#:7 B2:4

        E:8 E:3 G#:5 B:3  E:7 E:3 G#:5 B:3  E:8 E:3 B:5 G#:3  E4:7 B:4 G#:5 E:3
        A:8 A:3 C#:5 E:3  A:7 A:3 C#:5 E:3  A:8 A:3 E:5 C#:3  A:7 E:4 C#:5 A:3
        B2:8 B2:3 D#:5 F#:3 B2:7 B2:3 D#:5 F#:3 B2:8 B2:3 F#:5 D#:3 B:7 F#:4 D#:5 B2:3
        E:8 E:3 G#:5 B:3  E:7 E:3 G#:5 B:3  E:8 E:3 B:5 G#:3  E4:8 B:5 G#:5 E:4
      `) },
    // ---- COUNTER: brass stabs in the lead's gaps; harmonized in RETUNE ----
    { program: P.BRASS, gain: 0.1, octave: 3, wave: 'square', pan: 0.35,
      notes: seq(`
        . . . .          . . . .          . . . .          . . B:5 .
        . . . .          . . . .          . . G:5 -        E:4 - . .
        . . . .          . . . .          . . . .          . . C4:5 .
        . . . .          . . . .          . . F#:5 -       D#:4 - . .
        . . . .          . . . .          . . . .          . . B:6 .
        . . . .          . . . .          . . D4:6 -       B:5 - G:4 .
        . . E:4 .        . . F:4 .        . . G:5 -        - - . .
        F#:6 - D#:5 -    B2:5 - . .       . . A:5 -        F#:4 - . .

        . . . .          . . . .          . . E:5 -        C4:4 - . .
        . . . .          . . . .          . . F:5 -        C4:4 - . .
        . . . .          . . . .          . . G:5 -        E:4 - . .
        . . F#:5 .       . . F#:5 .       A:6 - F#:5 -     D#:4 - . .
        . . . .          C4:5 - A:4 -     E:4 - . .        . . . .
        . . . .          C4:5 - A:4 -     F:5 - . .        . . . .
        D#:5 - F#:5 -    A:6 - . .        . . B:6 -        - - . .
        F:6 - - -        D#:5 - - -       B2:5 - - -       - - . .

        . . . .          . . . .          . . . .          . . . .
        . . . .          . . . .          . . . .          . . . .

        . . . .          . . . .          . . E:5 -        B2:4 - . .
        . . E:4 .        . . G:5 .        . . C4:5 -       - - . .
        . . A:4 .        . . C4:5 .       E4:6 - - -       - - . .
        . . D#:5 .       . . F#:5 .       A:6 - B:6 -      - - . .
        E:6 - - -        G:6 - - -        Bb:7 - - -       A:6 - G:5 -
        F#:6 - - -       A:6 - - -        B:7 - - -        D#:6 - F#:6 -

        G#:7 - - -       E:6 - G#:6 -     B:7 - - -        - - - -
        A:7 - G#:6 -     F#:6 - G#:6 -    C#4:7 - - -      - - - -
        B:7 - C#4:7 -    D#4:8 - - -      F#:6 - E:6 -     D#:5 - E:6 -
        B:7 - - -        - - - -          G#:5 - E:5 -     B2:4 - - -
      `) },
    // ---- HALO: low choir — one sustained guide tone per bar (mostly 3rds) -
    { program: P.CHOIR, gain: 0.07, octave: 3, wave: 'triangle', pan: -0.2,
      notes: seq(`
        G:4 - - -  - - - -  - - - -  - - - -
        B:4 - - -  - - - -  - - - -  - - - -
        E:4 - - -  - - - -  - - - -  - - - -
        D#:4 - - -  - - - -  - - - -  - - - -
        G:5 - - -  - - - -  - - - -  - - - -
        B:5 - - -  - - - -  - - - -  - - - -
        E:4 - - -  - - - -  - - - -  - - - -
        F#:4 - - -  - - - -  - - - -  - - - -

        C4:4 - - -  - - - -  - - - -  - - - -
        A:4 - - -  - - - -  - - - -  - - - -
        E:4 - - -  - - - -  - - - -  - - - -
        D#:4 - - -  - - - -  - - - -  - - - -
        C4:5 - - -  - - - -  - - - -  - - - -
        A:5 - - -  - - - -  - - - -  - - - -
        D#:5 - - -  - - - -  - - - -  - - - -
        F:5 - - -  - - - -  - - - -  - - - -

        . . . .  . . . .  . . . .  . . . .
        . . . .  . . . .  . . . .  . . . .

        G:3 - - -  - - - -  - - - -  - - - -
        E:4 - - -  - - - -  - - - -  - - - -
        C4:4 - - -  - - - -  - - - -  - - - -
        D#:4 - - -  - - - -  - - - -  - - - -
        G:5 - - -  - - - -  - - - -  - - - -
        F#:5 - - -  - - - -  - - - -  - - - -

        G#:6 - - -  - - - -  - - - -  - - - -
        C#4:6 - - -  - - - -  - - - -  - - - -
        D#4:6 - - -  - - - -  - - - -  - - - -
        G#:5 - - -  - - - -  - - - -  - - - -
      `) },
    // ---- BASS: synth bass — driving 8ths, approach tones at every seam ----
    { program: P.SYNTH_BASS1, gain: 0.16, octave: 2, wave: 'triangle', pan: 0,
      notes: seq(`
        E:8 . E:4 .   E:7 . D:4 .   E:8 . E:4 .   G:6 . A:4 .
        E:8 . E:4 .   B:6 . E:4 .   E:8 . D:4 .   E:7 . E:4 .
        C3:8 . C3:4 . G:6 . C3:4 .  C3:8 . E:4 .  C3:7 . D:5 .
        B:8 . B:4 .   F#:6 . B:4 .  B:8 . A:4 .   B:7 . B:4 .
        E:8 . E:4 .   E:7 . D:4 .   E:8 . E:4 .   G:6 . A:4 .
        E:8 . E:4 .   G:6 . E:4 .   E:8 . F#:4 .  G:7 . E:4 .
        C3:8 . C3:4 . E:6 . C3:4 .  C3:8 . G:4 .  A:6 . B:5 .
        B:8 . B:4 .   D#3:6 . B:4 . B:8 . F#:4 .  A:6 G:5 F#:5 E:5

        A:8 . A:4 .   E:6 . A:4 .   A:8 . G:4 .   A:7 . B:4 .
        F:8 . F:4 .   C3:6 . F:4 .  F:8 . E:4 .   F:7 . G:4 .
        C3:8 . C3:4 . G:6 . C3:4 .  C3:8 . B:4 .  C3:7 . C3:4 .
        B:8 . B:4 .   F#:6 . B:4 .  B:8 . A:4 .   B:7 . D#3:4 .
        A:8 . A:4 .   C3:6 . A:4 .  A:8 . E:4 .   A:7 . G:4 .
        F:8 . F:4 .   A:6 . F:4 .   F:8 . C3:4 .  F:7 . E:4 .
        B:8 . B:4 .   D#3:6 . B:4 . F#:7 . B:4 .  B:8 . A:4 .
        B:8 . B:4 .   B:8 . B:4 .   B:8 B:4 B:5 B:4  B:9 . . .

        . . . .       . . . .       . . . .       . . . .
        . . . .       . . . .       . . . .       . . . .

        E:8 . E:4 .   E:7 . D:4 .   E:8 . E:4 .   G:6 . A:4 .
        C3:8 . C3:4 . G:6 . C3:4 .  C3:8 . E:4 .  C3:7 . D:5 .
        A:8 . A:4 .   E:6 . A:4 .   A:8 . G:4 .   A:7 . B:4 .
        B:8 . B:4 .   F#:6 . B:4 .  B:8 . A:4 .   B:7 . B:4 .
        E:8 . E:4 .   E:7 . D:4 .   E:8 . E:4 .   E:8 E:5 E:5 E:5
        B:8 . B:4 .   B:8 . A:4 .   B:8 . B:4 .   B:6 C#3:6 D#3:7 .

        E3:9 . E:4 .  B:6 . E:4 .   E:8 . E:4 .   G#:6 . A:5 .
        A:9 . A:4 .   E:6 . A:4 .   A:8 . G#:4 .  A:7 . B:5 .
        B:9 . B:4 .   F#:6 . B:4 .  B:8 . A:4 .   B:7 . D#3:5 .
        E3:9 . E:4 .  B:6 . E:4 .   E:8 . D:4 .   E:7 . E:4 .
      `) },
    // ---- DRUMS: big toms + kick; fills at the turns; ride in the RETUNE; --
    //      dead silent through the BREAK (the telegraph window).
    { program: 0, gain: 0.17, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        C:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 T:3  K:7 . S:8 .  K:8 T:3 T:4 .   S:8 T:4 U:5 S:6
        K:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 T:3  K:7 . S:8 .  K:8 T:3 T:4 .   S:8 T:4 U:5 S:6
        K:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:8 T:5 T:6 U:5  S:7 . T:6 U:6  S:8 T:6 U:6 .  S:9 T:7 U:7 C:8

        C:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 T:3  K:7 . S:8 .  K:8 T:3 T:4 .   S:8 T:4 U:5 S:6
        K:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 T:3  K:7 . S:8 .  K:8 T:3 T:4 .   S:8 T:4 U:5 S:6
        K:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 T:3  K:7 . S:8 .  K:8 T:3 T:4 .   S:8 T:4 U:5 S:6
        K:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 K:5 . .   S:8 . . .     T:6 T:7 U:7 .   S:9 . . C:8

        . . . .       . . . .       . . . .       . . . .
        . . . .       . . . .       . . . .       . . . .

        C:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 T:3  K:7 . S:8 .  K:8 T:3 T:4 .   S:8 T:4 U:5 S:6
        K:9 . T:3 .   K:7 . S:8 .   K:8 . T:4 T:3   S:8 . T:5 U:4
        K:9 . T:3 T:3  K:7 . S:8 .  K:8 T:3 T:4 .   S:8 T:4 U:5 S:6
        K:9 . T:3 .   K:7 . S:8 .   K:8 K:5 T:4 T:4  S:8 S:5 T:6 U:5
        K:9 . T:4 T:4  S:8 . T:5 U:5  S:8 T:5 T:6 U:6  S:9 U:7 U:8 C:8

        C:9 R:3 R:4 R:3  S:8 R:3 K:6 R:3  K:8 R:3 R:4 R:3  S:8 R:3 T:5 U:5
        K:9 R:3 R:4 R:3  S:8 R:3 K:6 R:3  K:8 R:3 R:4 R:3  S:8 R:3 T:5 U:5
        C:9 R:3 R:4 R:3  S:8 R:3 K:6 R:3  K:8 R:3 R:4 R:3  S:8 R:3 T:5 U:5
        K:9 R:3 R:4 .   S:8 . T:5 T:6   K:8 T:5 U:5 T:6  S:9 U:6 C:8 .
      `) },
  ],
};
