// 'Stonewatch Garrison' — duchy hill fort at dusk. 96 bpm march in D minor, 32 bars, form AA'BA'':
//   A (1-8) horn states the square theme over sidestick · A' (9-16) theme sequenced higher, snare in
//   · B (17-24) solo horn alone on the wall, band drops out · A'' (25-32) full march restate.
// PROGRESSION — A: Dm Bb F C | Dm Gm Bb-C Dm · A': Dm F Gm C | Bb Gm A7 Dm
//   B: Dm Bb Gm A | Dm Bb Gm-A Dm (V pickup) · A'': as A with a IV-V tag (Gm-A7) closing the seam.
// MOTIF: a duty-call cell D ^ F-G ^ A (up-the-steps) answered by a falling Bb-A-G-F "weathered" reply;
//   sequenced up to the octave D5 in A', stripped to long lonely tones in B, hammered home in A''.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Stonewatch Garrison', bpm: 96, loopBars: 32,
  channels: [
    // ---- LEAD: horn section — the square, honest garrison theme ----------
    { program: P.HORN, gain: 0.18, octave: 4, wave: 'sawtooth', pan: -0.15,
      notes: seq(`
        D:8 -   F:6 G:4 A:7 -   -   .
        Bb:6 A:5 G:5 F:4 D:6 -  -   .
        F:7 -   A:6 -   C5:8 -  A:5 F:4
        G:6 -   E:5 -   C:5 -   .   .
        D:8 -   F:6 G:4 A:7 -   -   .
        Bb:7 -  G:5 -   D:6 -   F:4 G:5
        F:6 -   D:5 F:5 E:6 -   C:4 D:5
        D:7 -   -   -   .   .   A3:3 C:4

        D:8 -   F:6 A:6 D5:8 -  -   .
        C5:7 -  A:5 F:4 C5:6 -  A:5 .
        Bb:7 -  D5:7 -  G:5 -   Bb:5 .
        G:6 E:5 C:5 -   E:6 G:6 -   .
        D5:8 -  C5:6 Bb:5 F:6 - -   .
        G:6 -   Bb:6 -  D5:7 -  Bb:5 G:4
        A:7 -   C#5:6 - E5:8 -  C#5:5 A:4
        D5:8 -  -   -   .   .   A:3 -

        D5:5 -  -   -   A:4 -   -   .
        Bb:5 -  -   -   F:3 -   -   .
        G:4 -   A:3 Bb:4 D5:5 - -   .
        C#5:4 - -   -   A:3 -   -   .
        D5:6 -  -   -   F:4 -   E:3 D:3
        Bb:5 -  -   -   D:4 -   -   .
        G:4 -   -   -   A:5 -   C#5:4 .
        D:6 -   -   -   .   .   A3:4 C:5

        D:9 -   F:7 G:5 A:8 -   -   .
        Bb:7 A:5 G:5 F:4 D:6 -  -   .
        F:8 -   A:7 -   C5:9 -  A:5 F:4
        G:7 -   E:5 -   C:5 D:4 E:5 .
        D:8 -   F:6 A:7 D5:9 -  -   .
        Bb:7 -  G:6 -   D:6 F:5 G:6 .
        F:7 D:5 Bb:6 -  E:7 -   C#5:5 .
        D:8 -   -   -   .   .   A3:3 .
      `) },
    // ---- COUNTER: trumpet — jabs answering the horn's rests; tacet in B --
    { program: P.TRUMPET, gain: 0.12, octave: 4, wave: 'square', pan: 0.35,
      notes: seq(`
        .   .   .   .   .   .   A:4 .
        .   .   .   .   .   .   F:4 A:5
        .   .   .   .   .   .   .   .
        .   .   .   .   E:4 -   G:5 .
        .   .   .   .   .   .   A:4 .
        .   .   .   .   .   .   Bb:4 .
        .   .   .   .   .   .   G:4 A:4
        .   .   F:5 E:4 D:5 -   .   .

        F:4 -   -   -   A:4 -   -   .
        A:4 -   -   -   F:4 -   -   .
        D5:4 -  -   -   Bb:4 -  -   .
        E:4 -   -   -   G:4 -   -   .
        F5:5 -  -   -   D5:4 -  -   .
        D5:4 -  -   -   Bb:4 -  -   .
        E5:5 -  -   -   C#5:4 - -   .
        F5:5 -  -   -   D5:4 .  .   .

        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .

        .   .   .   .   .   .   A:5 .
        .   .   .   .   .   .   F:5 A:5
        .   .   .   .   .   .   .   C5:4
        .   .   .   .   E:5 -   G:5 .
        .   .   .   .   .   .   A:5 F:4
        .   .   .   .   .   .   Bb:5 .
        .   .   A:4 .   .   .   G:5 A:5
        F:6 -   E:5 -   D:6 -   .   .
      `) },
    // ---- HARMONY: slow strings — one guide tone per bar, thinned in B ----
    { program: P.SLOW_STRINGS, gain: 0.08, octave: 3, wave: 'sine', pan: 0.2,
      notes: seq(`
        F:4 - - - - - - -    D:4 - - - - - - -    A:3 - - - - - - -    E:3 - - - - - - -
        F:3 - - - - - - -    Bb:3 - - - - - - -   D:3 - - - - - - -    F:3 - - - - - - -
        F:4 - - - - - - -    A:3 - - - - - - -    Bb:3 - - - - - - -   G:3 - - - - - - -
        F:3 - - - - - - -    Bb:3 - - - - - - -   C#4:3 - - - - - - -  A:3 - - - - - - -
        D:2 - - - - - - -    Bb:2 - - - - - - -   G:2 - - - - - - -    A:2 - - - - - - -
        D:2 - - - - - - -    F:2 - - - - - - -    G:2 - - - - - - -    A:2 - - - - - - -
        F:4 - - - - - - -    D:4 - - - - - - -    A:4 - - - - - - -    E:3 - - - - - - -
        F:4 - - - - - - -    Bb:4 - - - - - - -   D:4 - - - - - - -    D:3 - - - - - - -
      `) },
    // ---- BASS: bassoon — marching quarters with walking approach tones ---
    { program: P.BASSOON, gain: 0.15, octave: 2, wave: 'triangle', pan: 0,
      notes: seq(`
        D:7 .   A:4 .   D:6 .   C:4 .
        Bb:7 .  F:4 .   Bb:6 .  A:4 .
        F:7 .   C3:4 .  F:6 .   E:4 .
        C3:7 .  G:4 .   C3:6 .  A:4 .
        D:7 .   A:4 .   D:6 .   F:4 .
        G:7 .   D:4 .   G:6 .   A:4 .
        Bb:7 .  F:4 .   C3:7 .  G:4 .
        D:7 -   -   .   A:5 .   B:4 C#3:4

        D3:8 .  A:4 .   D:6 .   C3:4 .
        F:7 .   C3:4 .  F:6 .   E:4 .
        G:7 .   D:4 .   G:6 .   F:4 .
        C3:7 .  G:4 .   E:5 .   C3:4 .
        Bb:7 .  F:4 .   D:5 .   F:4 .
        G:7 .   D:4 .   Bb:5 .  G:4 .
        A:7 .   E:4 .   A:6 G:4 .   .
        D:8 .   A:4 .   D:6 .   .   .

        D:5 -   -   -   -   -   -   .
        Bb:4 -  -   -   -   -   -   .
        G:4 -   -   -   -   -   -   .
        A:4 -   -   -   C#3:3 - -   .
        D:5 -   -   -   -   -   -   .
        Bb:4 -  -   -   -   -   -   .
        G:4 -   -   -   A:4 -   -   .
        D:5 -   -   -   .   .   A:3 C#3:3

        D:8 .   A:5 .   D:7 .   C3:5 .
        Bb:8 .  F:5 .   Bb:6 .  A:5 .
        F:8 .   C3:5 .  F:6 .   E:5 .
        C3:8 .  G:5 .   C3:6 .  A:5 .
        D:8 .   A:5 .   D:6 .   F:5 .
        G:8 .   D:5 .   G:6 .   A:5 .
        Bb:8 .  F:5 .   A:8 .   E:5 .
        D:8 .   D3:5 .  A:6 G:4 F:4 E:4
      `) },
    // ---- COLOR: timpani — D-pedal punctuation, rolls at the turns --------
    { program: P.TIMPANI, gain: 0.1, octave: 2, wave: 'sine', pan: -0.3,
      notes: seq(`
        D:7 .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   D:5 .   .   .
        .   .   .   .   .   .   .   .
        D:7 .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   D:5 .   .   .
        D:5 D:6 D:7 .   A:6 .   .   .

        D:7 .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   D:5 .   .   .
        .   .   .   .   .   .   .   .
        D:7 .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        A:6 .   .   .   .   .   .   .
        D:7 .   .   .   .   .   .   .

        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   D:4 D:5 D:6 .

        D:8 .   .   .   A:5 .   .   .
        .   .   .   .   .   .   .   .
        .   .   .   .   D:6 .   .   .
        .   .   .   .   .   .   .   .
        D:8 .   .   .   .   .   .   .
        .   .   .   .   D:5 .   .   .
        A:6 .   .   .   .   .   .   .
        D:6 D:7 .   .   A:6 .   D:8 .
      `) },
    // ---- DRUMS: sidestick verses -> snare march; near-silence in B -------
    { program: 0, gain: 0.14, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        K:7 H:2 M:5 .   K:5 H:2 M:6 H:2
        K:7 H:2 M:5 M:2 K:5 H:2 M:6 .
        K:7 H:2 M:5 .   K:5 H:2 M:6 H:2
        K:7 H:2 M:5 M:2 K:5 M:3 M:6 M:4
        K:7 H:2 M:5 .   K:5 H:2 M:6 H:2
        K:7 H:2 M:5 M:2 K:5 H:2 M:6 .
        K:7 H:2 M:5 .   K:5 K:3 M:6 H:2
        K:7 M:3 M:5 M:4 S:5 S:6 T:5 .

        K:7 H:3 S:5 M:2 K:5 K:3 S:6 H:2
        K:7 H:3 S:5 S:2 K:5 H:2 S:6 H:2
        K:7 H:3 S:5 M:2 K:5 K:3 S:6 H:2
        K:7 H:3 S:5 S:2 K:5 S:3 S:6 O:3
        K:7 H:3 S:5 M:2 K:5 K:3 S:6 H:2
        K:7 H:3 S:5 S:2 K:5 H:2 S:6 H:2
        K:7 H:3 S:5 S:2 K:5 K:4 S:7 S:3
        K:7 S:4 S:5 S:6 T:6 T:5 U:6 .

        .   .   M:2 .   .   .   .   .
        .   .   .   .   .   .   M:2 .
        .   .   M:2 .   .   .   .   .
        .   .   .   .   .   .   .   .
        .   .   M:2 .   .   .   .   .
        .   .   .   .   .   .   M:2 .
        .   .   M:3 .   .   .   M:2 .
        .   .   .   .   S:3 S:4 S:5 S:6

        C:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:2 S:7 S:3
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:3 S:7 O:4
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:2 S:7 S:3
        K:8 H:3 S:6 K:4 K:6 K:5 S:7 S:5
        K:8 S:4 S:6 T:5 T:6 U:6 S:7 M:4
      `) },
  ],
};
