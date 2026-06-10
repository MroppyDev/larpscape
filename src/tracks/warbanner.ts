// 'Warbanner' — the warlord's fort.
// A menacing war-march in E Phrygian, 32 bars, straight time (no swing).
//
// FORM (8-bar sections): A (low trombone riff states the motif) —
//   A2 (motif sequenced up, peak driven to E4) — B (trumpet's defiant
//   theme over a descending Em-F-Dm-Am-G-F progression, closing on an
//   E-major Phrygian-dominant cadence with G#) — A' (full-band restate,
//   chromatic bass walk seam back into bar 1).
//
// MOTIF: a snarling step-up cell E..F G(accent)-F E answered by a coiling
//   D E F - E D E turn — stated bar 1, sequenced up a third to G in bar 3,
//   re-peaked to E4 in A2 (bars 13-14), and hammered home in A'. The
//   Phrygian b2 (F over E) is the menace; cadences fall F -> E.
// LEITMOTIF: the world theme "rise, reach, settle" (C E G A G E) opens
//   section B transformed to E minor — E G B C B G — as the defiant
//   trumpet's first phrase (bars 17-18).
// COUNTERPOINT: trumpet jabs answer the trombone in its rests through A
//   and A'; in B the roles flip and the trombone pulses low root-fifth
//   answers under the trumpet. Tremolo strings carry the harmony,
//   timpani hammers an E pedal (8-bar ostinato), tuba drives eighths
//   with octave pops and chromatic walk-up turnarounds; snare-led march
//   kit with ghost-note drags and tom fills at every section turn.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Warbanner', bpm: 112, loopBars: 32,
  channels: [
    // ---- LEAD: trombone — the war-march riff -----------------------------
    { program: P.TROMBONE, gain: 0.22, octave: 3, wave: 'sawtooth', pan: -0.15,
      notes: seq(`
        E:8 . E:4 F:6 G:9 - F:6 E:5
        D:6 E:7 F:8 - E:6 D:5 E:8 .
        G:8 . G:4 A:6 B:9 - A:6 G:5
        F:6 G:7 A:8 - G:6 F:5 E:8 .
        E:8 . E:4 F:6 G:9 - F:6 G:5
        A:7 G:6 F:7 E:6 D:7 - E:8 .
        F:8 - G:7 A:8 B:9 - A:6 B:7
        C4:9 B:7 A:6 G:5 F:7 - E:8 .

        E:8 . E:4 F:6 G:9 - F:6 E:5
        D:6 E:7 F:8 - G:6 A:5 B:8 .
        C4:8 . B:5 C4:6 D4:9 - C4:6 B:5
        A:6 B:7 C4:8 - B:6 A:5 G:7 .
        E:8 . G:5 A:6 B:9 - C4:7 B:6
        A:7 B:8 C4:8 D4:7 E4:9 - - .
        D4:8 C4:7 B:6 A:5 G:6 F:5 E:6 F:7
        E:9 - - . . . B2:4 D:5

        E:7 . . . B2:6 . . .
        E:7 . E:4 E:4 G:6 . . .
        F:7 . . . C:6 . . .
        D:7 . D:4 E:5 F:6 . . .
        A2:7 . . . E:6 . . .
        G2:7 . . . D:6 . B2:5 .
        F:7 . . . C:6 . D:6 .
        E:7 F:6 E:6 D:5 E:8 - G#:6 B:7

        E:8 . E:5 F:7 G:9 - F:6 E:5
        D:6 E:7 F:8 - E:6 D:5 E:8 .
        G:8 . G:5 A:7 B:9 - A:6 G:5
        F:7 G:8 A:8 - G:6 F:5 E:8 .
        E:8 . G:6 A:7 B:9 - C4:8 B:7
        A:8 B:8 C4:9 - B:7 A:6 G:7 F:6
        C4:8 B:7 A:6 G:7 F:8 - D:6 -
        F:8 G:7 F:6 D:5 E:9 - - .
      `) },
    // ---- COUNTER: trumpet jabs in the gaps; defiant lead in B ------------
    { program: P.TRUMPET, gain: 0.15, octave: 4, wave: 'square', pan: 0.35,
      notes: seq(`
        . . . . . . . .
        . . . . . . E:4 G:5
        . . . . . . . .
        . . . . . . G:4 B:5
        . . . . . . . .
        . . . . B:5 - G:4 .
        . . . . . . . D5:5
        E5:7 - B:5 . . . . .

        . . . . . . . .
        . . . . . . B:5 D5:6
        . . . . . . . .
        . . . . E5:6 D5:5 B:5 .
        . . . . . . . .
        . . . . G5:6 - E5:5 .
        . . B:4 . . . B:5 C5:5
        B:6 - - . . . E:4 G:5

        E5:8 - G5:7 - B5:9 - C6:8 -
        B5:7 - G5:6 - E5:7 - . .
        F5:7 A5:8 C6:9 - A5:7 F5:6 C5:6 .
        D5:7 E5:8 F5:8 - E5:7 D5:6 C5:6 B:6
        A:7 C5:8 E5:9 - C5:7 A:6 E:6 .
        G:7 B:8 D5:9 - B:7 G:6 D5:6 E5:7
        F5:8 - E5:7 D5:6 C5:7 - B:6 A:6
        G#:7 - B:7 - E5:9 - - .

        . . . . . . . .
        . . . . . . B:5 E5:6
        . . . . . . . .
        . . . . . . D5:5 B:5
        . . . . . . E5:6 D5:5
        . . . . . . G5:6 F5:6
        . . C5:6 . . . A:5 .
        B:6 D5:6 B:5 G:5 E:7 - - .
      `) },
    // ---- HARMONY: tremolo strings — sustained chord roots ----------------
    { program: P.TREMOLO_STRINGS, gain: 0.08, octave: 3, wave: 'sawtooth',
      pan: 0.15,
      notes: seq(`
        E:5 - - - - - - -
        E:4 - - - - - - -
        G:5 - - - - - - -
        F:4 - - - - - - -
        E:5 - - - - - - -
        D:4 - - - - - - -
        F:5 - - - - - - -
        F:4 - - - E:4 - - -

        E:5 - - - - - - -
        E:4 - - - - - - -
        C:5 - - - - - - -
        A2:4 - - - - - - -
        E:5 - - - - - - -
        A2:5 - - - C:5 - - -
        F:4 - - - - - - -
        E:5 - - - - - - -

        E:5 - - - - - - -
        E:4 - - - - - - -
        F:5 - - - - - - -
        D:4 - - - - - - -
        A2:5 - - - - - - -
        G2:4 - - - - - - -
        F:5 - - - - - - -
        E:5 - - - E:4 - - -

        E:6 - - - - - - -
        E:4 - - - - - - -
        G:5 - - - - - - -
        F:5 - - - - - - -
        E:5 - - - - - - -
        A2:5 - - - - - - -
        F:6 - - - - - - -
        E:5 - - - - - - -
      `) },
    // ---- BASS: tuba — driving eighths, octave pops, chromatic walks ------
    { program: P.TUBA, gain: 0.18, octave: 2, wave: 'triangle', pan: 0,
      notes: seq(`
        E:8 . E:4 E:5 B2:6 . E:5 .
        E:8 . E:4 E:5 D:6 . E:5 .
        G:8 . G:4 G:5 D:6 . G:5 .
        F:8 . F:4 F:5 C3:6 . B2:5 .
        E:8 . E:4 E:5 B2:6 . E:5 G:5
        D:8 . D:4 D:5 A2:6 . D:6 .
        F:8 . F:4 F:5 C3:6 . F:5 .
        F:7 E:6 D:5 C:5 B2:6 C3:5 D:6 D#:6

        E:8 . E:4 E:5 B2:6 . E:5 .
        E:8 . E:4 E:5 G:5 A:5 B:6 .
        C3:8 . C3:4 C3:5 G:6 . C3:5 .
        A2:8 . A2:4 A2:5 E:6 . A2:5 .
        E:8 . E:4 E:5 B2:6 . E:5 .
        A2:8 . A2:4 A2:5 C3:6 . G:5 .
        F:8 . F:4 F:5 C3:6 . F:5 .
        E:8 . E:4 . E:7 D:5 C:5 B2:5

        E:7 - - . B2:5 - - .
        E:7 - - . G:5 - - .
        F:7 - - . C3:5 - - .
        D:7 - - . A2:5 - - .
        A2:7 - - . E:5 - - .
        G2:7 - - . D:5 - - .
        F:7 - . F:4 C3:5 . D:5 .
        E:7 . E:4 G#:5 B2:6 B2:5 D#:6 .

        E:8 . E:5 E3:6 B2:6 . E:5 .
        E:8 . E:5 E3:6 D:6 . E:5 .
        G:8 . G:5 G3:6 D:6 . G:5 .
        F:8 . F:5 F3:6 C3:6 . B2:5 .
        E:8 . E:5 E3:6 B2:6 . G:5 .
        A:8 . A:5 A3:6 E:6 . G:5 .
        F:8 . F:5 F3:6 C3:6 . F:5 .
        F:7 E:6 D:6 C:5 B2:7 . D#:6 .
      `) },
    // ---- COLOR: timpani E-pedal hammer (8-bar ostinato) ------------------
    { program: P.TIMPANI, gain: 0.12, octave: 2, wave: 'sine', pan: -0.3,
      notes: seq(`
        E:7 . . . . . . .
        . . . . . . . .
        . . . . . . . .
        . . . . . . B2:5 .
        E:7 . . . . . . .
        . . . . . . . .
        . . . . . . . .
        E:6 . . . B2:5 . E:7 .
      `) },
    // ---- DRUMS: snare-led march with ghost drags, fills at the turns -----
    { program: 0, gain: 0.16, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:2 S:7 S:3
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:3 S:7 O:4
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:2 S:7 S:3
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 S:4
        K:8 S:3 S:5 S:6 T:6 T:7 U:6 S:8

        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:2 S:7 S:3
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:3 S:7 O:4
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        C:8 H:3 S:6 S:2 K:6 S:2 S:7 S:3
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 S:4
        S:4 S:5 S:6 S:4 T:6 T:7 U:7 S:8

        C:8 H:2 S:5 H:2 K:5 H:2 S:6 H:2
        K:7 H:2 S:5 H:2 K:5 S:2 S:6 H:2
        K:7 H:2 S:5 H:2 K:5 H:2 S:6 H:2
        K:7 H:2 S:5 H:2 K:5 S:2 S:6 O:3
        K:7 H:2 S:5 H:2 K:5 H:2 S:6 H:2
        K:7 H:2 S:5 H:2 K:5 S:2 S:6 H:2
        K:7 H:2 S:5 S:2 K:5 K:4 S:6 S:3
        K:7 S:4 S:5 S:6 S:7 T:6 T:7 U:7

        C:9 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:2 S:7 S:3
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:3 S:7 O:4
        K:8 H:3 S:6 S:2 K:6 K:4 S:7 H:3
        K:8 S:2 S:6 H:3 K:6 S:2 S:7 S:3
        K:8 H:3 S:6 K:4 K:6 K:5 S:7 S:5
        K:8 S:4 S:6 T:5 T:6 U:6 S:8 C:7
      `) },
  ],
};
