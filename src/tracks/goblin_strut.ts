// 'Goblin Strut' — the goblin field.
// A mischievous, bouncy comedy-march in G minor, 32 bars, swung.
//
// FORM (8-bar sections): A (theme) — A2 (theme varied, rising peak) —
//   B (Eb-major contrast, trumpet takes the lead and quotes the world
//   leitmotif "rise, reach, settle" transposed into Eb: Eb G Bb C Bb G) —
//   A' (theme up an octave, full band, walk-down seam back into bar 1).
//
// MOTIF: a strutting up-leap G→Bb→C→D answered by a chromatic tumble
//   Eb-D-Db-C-Bb-G — stated in bar 1, sequenced to the IV in bars 3-4,
//   re-peaked to F in A2, inverted into a climb at bar 14, and restated
//   an octave up in A'. Trumpet jabs answer in the bassoon's gaps
//   (call-and-response) throughout A; bassoon flips to oom-pah comping
//   under the trumpet in B. Harmony leans on bVI (Eb), a borrowed C7
//   (bar 23) and a V7 walk-up turnaround. Tuba oom-pah with chromatic
//   walking turnarounds and octave pops; xylophone off-beat clacks;
//   march kit with sidestick B-section and tom fills at every turn.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Goblin Strut', bpm: 118, loopBars: 32, swing: 0.18,
  channels: [
    // ---- LEAD: staccato bassoon — the strut itself -----------------------
    { program: P.BASSOON, gain: 0.22, octave: 3, wave: 'square', pan: -0.2,
      notes: seq(`
        G:8 . A#:5 C4:6 D4:9 . D4:4 .
        D#4:7 D4:6 C#4:5 C4:6 A#:7 . G:6 .
        C4:7 . D#4:5 C4:4 G4:9 . G4:4 .
        F#4:6 G4:7 F#4:5 D4:6 A:7 . F#:5 .
        G:8 . A#:5 C4:6 D4:9 . F4:8 .
        D#4:7 . A#:6 . G4:8 D#4:5 A#:6 G:5
        C4:7 D#4:6 G4:8 . A4:7 F#4:6 D4:5 C4:4
        A#:6 A:5 G:9 . . . D4:3 F4:4

        G:8 . A#:5 C4:6 D4:9 . D4:4 .
        F4:7 D#4:6 D4:5 C4:6 A#:7 . G:6 .
        C4:7 . D#4:5 F4:6 G4:9 . F4:5 D#4:4
        D4:7 . C4:5 . A:7 C4:5 F#:6 .
        G4:8 . F4:5 D#4:6 D4:9 . A#:5 .
        A:6 C4:7 D4:8 F#4:6 A4:9 . . .
        G4:8 F4:6 D#4:7 D4:5 C4:6 A#:5 A:6 F#:5
        G:9 . D:4 . G:7 . . .

        D#:6 . G:4 . A#:6 . G:4 .
        D:6 . F:4 . A#:6 . F:4 .
        D#:6 . G:4 . C4:6 . G:4 .
        F:6 . A:4 . C4:6 . D#4:5 .
        D#:6 . A#:4 . G:6 . A#:4 .
        D:6 . G:4 . A#:6 . D4:5 .
        E:6 . G:4 . A#:6 . C4:5 .
        D:6 F#:5 A:6 C4:7 D4:8 . . .

        G4:9 . A#4:6 C5:7 D5:9 . D5:5 .
        D#5:8 D5:7 C#5:6 C5:6 A#4:7 . G4:6 .
        C5:8 . D#5:6 C5:5 G4:9 . G4:5 .
        F#4:6 G4:7 F#4:6 D4:6 A4:8 . F#4:5 .
        G4:8 . F4:6 D#4:6 D4:9 . A#:6 .
        C4:7 D#4:6 G4:8 A4:6 A#4:9 G4:6 D#4:5 C4:4
        D4:7 C4:5 A:6 F#:5 A:7 C4:6 D4:8 F#4:6
        G:9 . A#:4 G:3 G:8 . . .
      `) },
    // ---- COUNTER: cheeky trumpet answers (leads section B) ---------------
    { program: P.TRUMPET, gain: 0.15, octave: 4, wave: 'sawtooth', pan: 0.35,
      notes: seq(`
        . . . . . . . .
        . . . . . D5:5 D5:6 .
        . . . . . . . .
        . . . . . C5:5 A4:6 .
        . . . . . . . .
        . . . . . . F5:6 D#5:5
        . . . . . . . .
        . . D5:6 A#4:5 G4:7 . . .

        . . . . . . A#4:4 D5:6
        . . . . D5:6 C5:5 A#4:6 .
        . . . . . . . .
        . . . . . D5:5 C5:6 A4:5
        . . . . . . . .
        . . . . . . D5:6 F#5:7
        G5:7 - - - - - - -
        F#5:5 G5:8 - - . . D5:4 .

        D#5:6 . G5:7 . A#5:8 . C6:9 .
        A#5:7 - G5:6 - . F5:4 D5:5 .
        D#5:7 C5:6 D#5:5 G5:8 . D#5:4 C5:5 .
        D5:6 C5:5 A4:6 C5:5 D#5:7 D5:6 C5:5 A4:4
        A#4:6 . D#5:7 . G5:8 . D#5:5 G5:6
        D5:7 . A#4:5 G4:6 A#4:5 D5:7 G5:8 .
        E5:7 G5:8 E5:6 C5:5 G4:6 . A#4:5 C5:6
        A4:7 . F#5:8 . A5:9 . . .

        . . . . . . . A5:4
        G5:6 . . . . . D5:5 .
        . . . . D#5:6 . C5:5 .
        . . . . C5:5 . A4:5 .
        . . . . . . F5:5 D5:4
        D#5:6 . . . D5:6 . . .
        . . C5:5 . . . F#5:6 .
        G5:8 . . . D5:5 A#4:4 G4:6 .
      `) },
    // ---- BASS: tuba oom-pah with walking turnarounds ---------------------
    { program: P.TUBA, gain: 0.18, octave: 2, wave: 'triangle', pan: 0,
      notes: seq(`
        G:8 . D:5 . G:7 . D:5 .
        G:8 . D:5 . G:7 A#:4 C3:5 C#3:5
        C3:8 . G:5 . C3:7 . G:5 .
        D:8 . A:5 . D:6 D:4 F#:6 .
        G:8 . D:5 . G:7 . D:5 .
        D#:8 . A#:5 . D#:7 . A#:5 .
        C3:8 . G:5 . D:7 . A:5 .
        G:8 . D:5 . G:7 F:4 D#:5 D:5

        G:8 . D:5 . G:7 . D:5 .
        G:8 . D:5 . G:7 . D:5 .
        C3:8 . G:5 . C3:7 . D#:5 .
        D:8 . A:5 . D:7 . F#:5 .
        D#:8 . A#:5 . D#:7 . A#:5 .
        D:8 . A:5 . D:7 . A:5 .
        G:8 . D:5 . C3:6 . D:6 .
        G:8 . D:5 . G:6 A#1:4 C3:5 D:6

        D#:8 . D#3:5 . A#:6 . D#3:5 .
        A#1:8 . A#:5 . F:6 . A#:5 .
        C3:8 . G:5 . C3:6 . G:5 .
        F:8 . A:5 . C3:6 . A:5 F:4
        D#:8 . A#:5 . D#3:7 . A#:5 .
        G:8 . D:5 . G:6 . A#:5 .
        C3:8 . G:5 . E:6 . G:5 .
        D:8 D:4 F#:5 A:6 C3:6 . D3:7 .

        G:8 . D:5 . G:7 . D:5 .
        G:8 . D:5 . G:7 . F:5 .
        C3:8 . G:5 . C3:7 . G:5 .
        D:8 . A:5 . D:7 . F#:5 .
        D#:8 . A#:5 . D#:7 . A#:5 .
        C3:8 . G:5 . C3:7 . D:5 .
        D:8 . A:5 D:5 F#:6 A:5 C3:6 D3:6
        G:9 . D:5 . G:8 F:4 D#:5 D:6
      `) },
    // ---- COLOR: xylophone off-beat goblin clacks -------------------------
    { program: P.XYLOPHONE, gain: 0.07, octave: 5, wave: 'square', pan: -0.45,
      notes: seq(`
        . D:3 . A#:4 . D:3 . A#:4
        . D:3 . A#:4 . D:3 . A#:4
        . D#:3 . G:4 . D#:3 . G:4
        . C:3 . F#:4 . C:3 . F#:4
        . D:3 . A#:4 . D:3 . A#:4
        . G:3 . A#:4 . G:3 . A#:4
        . D#:3 . G:4 . C:3 . F#:4
        . D:3 . A#:4 . D:3 . .

        . D:3 . A#:4 . D:3 . A#:4
        . D:3 . A#:4 . D:3 . A#:4
        . D#:3 . G:4 . D#:3 . G:4
        . C:3 . F#:4 . C:3 . F#:4
        . G:3 . A#:4 . G:3 . A#:4
        . C:3 . F#:4 . C:3 . F#:4
        . D:3 . A#:4 . D#:3 . C:4
        . D:3 . A#:4 . . . .

        . G:3 . A#:4 . G:3 . A#:4
        . D:3 . F:4 . D:3 . F:4
        . D#:3 . G:4 . D#:3 . G:4
        . C:3 . A:4 . C:3 . A:4
        . G:3 . A#:4 . G:3 . A#:4
        . D:3 . A#:4 . D:3 . A#:4
        . E:3 . G:4 . E:3 . G:4
        . C:3 . F#:4 . . . .

        . D:3 . A#:4 . D:3 . A#:4
        . D:3 . A#:4 . D:3 . A#:4
        . D#:3 . G:4 . D#:3 . G:4
        . C:3 . F#:4 . C:3 . F#:4
        . G:3 . A#:4 . G:3 . A#:4
        . D#:3 . G:4 . D#:3 . G:4
        . C:3 . F#:4 . C:3 . F#:4
        . D:3 . A#:4 . . . .
      `) },
    // ---- DRUMS: swung march groove, fills at every section turn ----------
    { program: 0, gain: 0.16, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 K:4 K:6 H:3 S:7 O:4
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 H:2 K:5 K:4 S:7 O:4
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 K:4 K:6 H:3 S:7 H:3
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 O:4
        K:7 H:3 S:6 S:3 T:5 T:6 U:6 S:7

        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 K:4 K:6 H:3 S:7 O:4
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 H:2 K:5 K:4 S:7 O:4
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 K:4 K:6 H:3 S:7 H:3
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 . S:6 S:4 S:5 T:5 T:6 U:7

        C:8 H:2 M:5 H:2 K:4 H:2 M:5 H:3
        K:6 H:2 M:5 H:2 K:4 H:2 M:5 H:3
        K:6 H:2 M:5 H:2 K:4 H:2 M:5 H:3
        K:6 H:2 M:5 H:2 K:4 K:3 M:5 O:4
        K:6 H:2 M:5 H:2 K:4 H:2 M:5 H:3
        K:6 H:2 M:5 H:2 K:4 H:2 M:5 H:3
        K:6 H:2 M:5 K:3 K:5 H:2 M:5 H:3
        S:4 S:5 S:6 T:6 T:7 U:6 S:8 O:5

        C:8 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 K:4 K:6 H:3 S:7 O:4
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 H:2 K:5 K:4 S:7 O:4
        K:7 H:3 S:6 H:2 K:5 H:3 S:7 H:3
        K:7 H:3 S:6 K:4 K:6 H:3 S:7 H:3
        K:7 H:3 S:6 K:4 K:5 K:5 S:7 S:5
        K:7 . S:6 T:5 T:6 U:6 S:7 S:8
      `) },
  ],
};
