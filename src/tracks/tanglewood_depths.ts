// 'Tanglewood Depths' — the haunted forest west of Eldermere. Hushed 3/4 at
// 70 bpm in E minor, drifting between E aeolian (C natural) and E dorian
// (the C# "sunlight-through-canopy" chord). Pan flute sighs over a plucked
// harp ostinato; a low cello root moves underneath; a glassy tinkle-bell
// blinks like eyes in the dark; deep tom + shaker breathe a sparse pulse.
// A faint hopeful counter-whistle (the Tanglewood Toll theme) peeks through
// the lead's rests and takes over the B section before the dark returns.
//
// FORM (32 bars, AA'BA''): A states the falling "sigh" motif (B-A-G / F#-E);
//   A' sequences it up to an E6 peak and halts on a half cadence; B flips
//   roles — the whistle sings a rising major-leaning answer while the flute
//   holds low pedal tones; A'' restates fullest, then thins into the seam.
// PROGRESSION: A:  Em Em G A | Em C D Em      (A maj = dorian IV)
//              A': Em G C A | Em Bm C D       (half cadence)
//              B:  G D/F# Em A | G Bm C D     (the hopeful turn)
//              A'': Em G C A | Em C D Em      (home)
// MOTIF: two-bar sigh (B - A G | F# - E), echoed inverted by the whistle
//   (G A B — rising) — the forest falls, the toll-payer climbs.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Tanglewood Depths', bpm: 70, loopBars: 32,
  channels: [
    // ---- LEAD: pan flute — the falling sigh. 32 bars of 3/4 (192 steps). -
    { program: P.PAN_FLUTE, gain: 0.16, octave: 5, wave: 'triangle', pan: 0,
      notes: seq(`
        B:6   -  A:4  G:5  -    .
        F#:5  -  E:4  -    -    .
        G:4   -  B:6  -    D6:7 -
        C#6:6 -  B:5  A:4  -    .
        B:6   -  A:4  G:5  -    -
        C6:6  -  B:5  G:4  -    .
        A:5   -  F#:5 -    D:4  -
        E:5   -  -    -    -    .

        B:6   -  D6:7 -    E6:8 -
        D6:6  -  B:5  -    G:4  -
        A:5   -  G:4  E:4  -    .
        C#:5  -  -    -    E:4  F#:5
        G:6   -  F#:5 E:4  -    .
        F#:5  -  D:4  -    -    .
        E:5   -  G:6  -    A:5  -
        F#:5  -  -    -    .    .

        D:4   -  -    -    -    .
        .     .  .    .    .    .
        E:4   -  -    -    G:5  -
        A:5   -  -    -    .    .
        B:6   -  -    -    A:4  -
        F#:4  -  -    -    .    .
        G:5   -  A:5  -    B:6  -
        A:5   -  -    -    F#:3 .

        B:7   -  A:5  G:6  -    .
        F#:5  -  E:4  -    D:4  -
        E:5   -  G:6  -    A:6  -
        C#6:7 -  B:5  -    A:5  -
        B:6   -  D6:7 -    E6:7 -
        D6:6  -  B:5  -    G:4  -
        A:5   -  F#:4 -    D:4  -
        E:5   -  -    -    -    .
      `) },
    // ---- COUNTER: faint hopeful whistle — the Tanglewood Toll theme. -----
    // Rests through most of A/A', peeks in the lead's breaths, carries B.
    { program: P.WHISTLE, gain: 0.07, octave: 5, wave: 'sine', pan: -0.4,
      notes: seq(`
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . G:3 -  B:3 .

        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . G:3 A:3
        B:4 - A:3 - F#:2 .

        G:4   -  A:4  B:5  -    -
        A:5   -  F#:4 -    D:4  -
        B:5   -  G:4  -    E:4  -
        C#6:5 -  E6:6 -    -    -
        D6:6  -  B:5  -    G:4  -
        F#:4  -  B:5  -    D6:5 -
        E6:6  -  C6:4 -    G:4  -
        A:5   -  F#:4 -    D:3  -

        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
        . . . D:3 E:3 F#:3
        G:4 - E:3 - -   .
      `) },
    // ---- TEXTURE: plucked harp ostinato — root / 3rd / 5th / octave, -----
    // pulsing 1, 2&, 3& with ghosted tops; fills at each section turn.
    { program: P.HARP, gain: 0.13, octave: 3, wave: 'sine', pan: 0.35,
      notes: seq(`
        E:5 . G:3   B:4   . E4:2
        E:4 . G:3   B:4   . E4:2
        G:5 . B:3   D4:4  . G4:2
        A:5 . C#4:3 E4:4  . A4:2
        E:5 . G:3   B:4   . E4:2
        C:5 . E:3   G:4   . C4:2
        D:5 . F#:3  A:4   . D4:2
        E:5 . B:3   G:3   E:4 D:2

        E:5 . G:3   B:4   . E4:3
        G:5 . B:3   D4:4  . G4:2
        C:5 . E:3   G:4   . C4:2
        A:5 . C#4:3 E4:4  . A4:2
        E:5 . G:3   B:4   . E4:2
        B:5 . D4:3  F#4:4 . B4:2
        C:5 . E:3   G:4   . C4:2
        D:5 . A:3   F#:3  E:3 D:2

        G:5  . B:3   D4:4  . G4:2
        F#:5 . A:3   D4:4  . F#4:2
        E:5  . G:3   B:4   . E4:2
        A:5  . C#4:3 E4:4  . A4:2
        G:5  . B:3   D4:4  . G4:2
        B:5  . D4:3  F#4:4 . B4:2
        C:5  . E:3   G:4   . C4:2
        D:5  F#:3 A:4 D4:4 A:3 F#:2

        E:6 . G:4   B:5   . E4:3
        G:6 . B:4   D4:5  . G4:3
        C:6 . E:4   G:5   . C4:3
        A:6 . C#4:4 E4:5  . A4:3
        E:6 . G:4   B:5   . E4:3
        C:5 . E:3   G:4   . C4:2
        D:5 . F#:3  A:4   . D4:2
        E:5 . B:3   .     E4:3 .
      `) },
    // ---- BASS: cello — dotted-half roots with walking approach tones. ----
    { program: P.CELLO, gain: 0.12, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        E:6  - - - -    .
        E:4  - - - F#:3 .
        G:5  - - - -    .
        A:5  - - - G:3  F#:3
        E:5  - - - B2:3 .
        C3:5 - - - -    .
        D3:5 - - - A:3  .
        E:6  - - - -    D:3

        E:5  - - - G:3  .
        G:5  - - - B2:3 .
        C3:5 - - - -    .
        A:5  - - - E:3  .
        E:5  - - - F#:3 G:3
        B2:5 - - - -    .
        C3:5 - - - D3:3 .
        D3:5 - - - C3:3 B2:3

        G:5  - - - -    .
        F#:5 - - - -    .
        E:5  - - - -    .
        A:5  - - - G:3  .
        G:5  - - - D:3  .
        B2:5 - - - -    .
        C3:5 - - - -    .
        D3:5 - - - D3:4 .

        E:6  - - - B2:3 .
        G:5  - - - -    .
        C3:5 - - - -    .
        A:5  - - - G:3  .
        E:5  - - - -    .
        C3:5 - - - B2:3 .
        D3:5 - - - A:3  .
        E:5  - - - -    .
      `) },
    // ---- COLOR: glassy bell — something watching. 8-bar independent loop -
    // on E-dorian-safe tones (E F# A B), drifting against the harmony.
    { program: P.TINKLE_BELL, gain: 0.05, octave: 6, wave: 'sine', pan: 0.55,
      notes: seq(`
        . . .    . B:3 .
        . . .    . .   .
        . . F#:3 . .   .
        . . .    . .   E:2
        . . .    . A:3 .
        . . .    . .   .
        . B:2 .  . .   .
        . . .    E:3 .  .
      `) },
    // ---- DRUMS: deep sparse pulse — low tom heartbeat, shaker ghosts. ----
    // 4-bar independent loop.
    { program: 0, gain: 0.08, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        T:6 . .   .   X:2 .
        .   . X:2 .   .   K:3
        T:5 . .   X:2 .   .
        .   . K:3 .   X:2 .
      `) },
  ],
};
