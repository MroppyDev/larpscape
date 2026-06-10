// 'Shepherd's Rest' — sheep farms at dawn.
// A tender lilting waltz in F major, 32 bars of 3/4 (6 eighth-note steps/bar).
// Form: A (theme, b1-8) / A' (motif sequenced up a third, b9-16, half cadence)
//       B (D minor contrast, b17-24, deceptive cadence C7->Dm) / A'' (b25-32,
//       borrowed minor iv Bbm at b30, settles home for the loop seam).
// Lead: oboe. Counter: celesta music-box answers in the lead's gaps; it quotes
// the world leitmotif (C E G A G E) once across b25-26. Accordion pah-pah
// afterbeats, walking waltz bass, whisper-quiet shaker/sidestick color.
import { Track, seq, P } from './notation';

// ---- Lead (oboe): the hook is b1-2 — a lilting rise A->C6, sighing back. ----
const lead =
  // A — theme
  'A:7 - - C6:8 - A:6 ' +      // b1  F      motif: rise and settle
  'G:6 - - - E:3 F:4 ' +       // b2  C7     sigh, ghost pickup
  'G:7 - - Bb:8 - G:6 ' +      // b3  Bb     motif echoed a step up
  'F:6 - - - - . ' +           // b4  F      breath
  'D:6 - - F:7 - D:5 ' +       // b5  Dm
  'E:6 - - G:7 - E:5 ' +       // b6  C7
  'F:6 - D:5 - C:5 E:5 ' +     // b7  Gm-C7  turning figure
  'F:6 - - - A:3 Bb:3 ' +      // b8  F      ghost pickup climbs to A'
  // A' — motif sequenced up a third, brighter
  'C6:8 - - E6:9 - C6:7 ' +    // b9  Fmaj7  motif up a third (phrase peak)
  'Bb:7 - - - G:3 A:4 ' +      // b10 Gm
  'Bb:7 - - D6:8 - Bb:6 ' +    // b11 Bb
  'A:7 - - - - . ' +           // b12 Dm
  'D:6 - - F:6 - A:7 ' +       // b13 Dm     rising
  'G:7 - - E:5 - C:4 ' +       // b14 C7     falling answer
  'F:4 G:5 A:6 Bb:7 C6:8 D6:8 ' + // b15 Bb-C7 written-in crescendo run
  'C6:7 - A:5 - G:4 E:4 ' +    // b16 C7     half cadence into B
  // B — D minor, dusk-grey nostalgia
  'D:7 - - A:8 - F:5 ' +       // b17 Dm
  'G:6 - - - Bb:5 - ' +        // b18 Gm
  'Bb:7 - - D6:8 - Bb:5 ' +    // b19 Bb
  'A:7 - - C#6:8 - A:6 ' +     // b20 A7     leading-tone glint
  'D6:8 - - C6:6 - A:5 ' +     // b21 Dm
  'Bb:6 - G:5 - D:4 - ' +      // b22 Gm     winding down
  'E:5 - G:6 - Bb:7 - ' +      // b23 C7     arpeggio swells...
  'D:6 - - - E:3 G:3 ' +       // b24 Dm     ...deceptive cadence, soft pickup
  // A'' — theme returns at full warmth; celesta sings the leitmotif above
  'A:8 - - C6:9 - A:7 ' +      // b25 F      theme, peak dynamics
  'G:7 - - - E:4 F:5 ' +       // b26 C7
  'G:8 - - Bb:9 - G:7 ' +      // b27 Bb
  'F:7 - - - - . ' +           // b28 F
  'D:7 - - F:7 - A:8 ' +       // b29 Dm
  'Bb:7 - - Db6:8 - Bb:6 ' +   // b30 Bbm    borrowed minor iv — the ache
  'C6:8 - A:6 - G:5 - ' +      // b31 C7
  'F:7 - - - E:2 G:2';         // b32 F      home; ghost pickup loops into b1

// ---- Counter (celesta): music-box answers in the lead's held bars. ----
const counter =
  '. . . . . . ' +             // b1
  '. . E6:4 . G6:3 . ' +       // b2  answers the sigh
  '. . . . . . ' +             // b3
  '. C6:4 A:3 - F:3 . ' +      // b4  echoes the motif, descending
  '. . . . . . ' +             // b5
  '. . G6:4 . E6:3 . ' +       // b6
  '. . . . . . ' +             // b7
  '. A:3 C6:4 - F6:4 . ' +     // b8  chimes up into A'
  '. . . . . . ' +             // b9
  '. . D6:4 . Bb:3 . ' +       // b10
  '. . . . . . ' +             // b11
  '. . F6:4 - D6:3 . ' +       // b12
  '. . . . . . ' +             // b13
  '. . E6:4 . G6:3 . ' +       // b14
  '. . . . . . ' +             // b15 (lead's run owns this bar)
  '. . . E6:3 . G6:3 ' +       // b16 sparkle into B
  '. . F6:4 - E6:3 . ' +       // b17 closer dialogue in B
  '. . D6:4 - Bb:3 . ' +       // b18
  '. . . . F6:3 . ' +          // b19
  '. . E6:4 - C#6:3 . ' +      // b20
  '. . . . . . ' +             // b21
  '. . D6:4 - Bb:3 . ' +       // b22
  '. . . . . . ' +             // b23
  '. . A:3 G:3 . . ' +         // b24
  'C6:4 - E6:5 - G6:6 - ' +    // b25 LEITMOTIF: C E G...
  'A6:7 - G6:5 - E6:4 - ' +    // b26 ...A G E (rise, reach, settle)
  '. . . . . . ' +             // b27
  '. C6:4 A:4 - F:3 . ' +      // b28
  '. . . . . . ' +             // b29
  '. . Db6:4 - F6:3 . ' +      // b30 mirrors the Bbm color
  '. . . . . . ' +             // b31
  '. C6:3 . A:2 . .';          // b32 last chime before the loop

// ---- Accordion afterbeats (two voices = real chords on beats 2 & 3). ----
const accLow =
  '. . A:4 . A:3 . ' + '. . E:4 . E:3 . ' + '. . D:4 . D:3 . ' + '. . A:4 . A:3 . ' +       // b1-4   F C7 Bb F
  '. . F:4 . F:3 . ' + '. . E:4 . E:3 . ' + '. . D:4 . E:3 . ' + '. . A:4 . A:3 . ' +       // b5-8   Dm C7 Gm>C7 F
  '. . A:4 . A:3 . ' + '. . D:4 . D:3 . ' + '. . D:4 . D:3 . ' + '. . F:4 . F:3 . ' +       // b9-12  F Gm Bb Dm
  '. . F:4 . F:3 . ' + '. . E:4 . E:3 . ' + '. . D:4 . E:3 . ' + '. . E:4 . E:3 . ' +       // b13-16 Dm C7 Bb>C7 C7
  '. . F:4 . F:3 . ' + '. . D:4 . D:3 . ' + '. . D:4 . D:3 . ' + '. . C#:4 . C#:3 . ' +     // b17-20 Dm Gm Bb A7
  '. . F:4 . F:3 . ' + '. . D:4 . D:3 . ' + '. . E:4 . E:3 . ' + '. . F:4 . F:3 . ' +       // b21-24 Dm Gm C7 Dm
  '. . A:5 . A:4 . ' + '. . E:5 . E:4 . ' + '. . D:5 . D:4 . ' + '. . A:4 . A:3 . ' +       // b25-28 F C7 Bb F (fuller)
  '. . F:4 . F:3 . ' + '. . Db:4 . Db:3 . ' + '. . E:4 . E:3 . ' + '. . A:3 . A:2 .';       // b29-32 Dm Bbm C7 F (fading)

const accHigh =
  '. . C5:4 . C5:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . F:4 . F:3 . ' + '. . C5:4 . C5:3 . ' + // b1-4
  '. . A:4 . A:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . C5:4 . C5:3 . ' + // b5-8
  '. . C5:4 . C5:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . F:4 . F:3 . ' + '. . A:4 . A:3 . ' +   // b9-12
  '. . A:4 . A:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . F:4 . Bb:3 . ' + '. . Bb:4 . Bb:3 . ' +  // b13-16
  '. . A:4 . A:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . F:4 . F:3 . ' + '. . G:4 . G:3 . ' +     // b17-20
  '. . A:4 . A:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . A:4 . A:3 . ' +   // b21-24
  '. . C5:5 . C5:4 . ' + '. . Bb:5 . Bb:4 . ' + '. . F:5 . F:4 . ' + '. . C5:4 . C5:3 . ' + // b25-28
  '. . A:4 . A:3 . ' + '. . F:4 . F:3 . ' + '. . Bb:4 . Bb:3 . ' + '. . C5:3 . C5:2 .';     // b29-32

// ---- Bass (acoustic): downbeat roots, moving fifths/thirds, walking turns. ----
const bass =
  'F:6 - - - C3:4 - ' +        // b1
  'C3:5 - - - G:3 - ' +        // b2
  'Bb:6 - - - F:4 - ' +        // b3
  'F:5 - - - A:3 - ' +         // b4  walk-up third
  'D3:6 - - - A:4 - ' +        // b5
  'C3:5 - - - Bb:3 - ' +       // b6
  'G:5 - - C3:5 - - ' +        // b7  two-chord bar
  'F:6 - A:3 - C3:4 - ' +      // b8  arpeggio climb into A'
  'F:6 - - - C3:4 - ' +        // b9
  'G:6 - - - D3:4 - ' +        // b10
  'Bb:6 - - - F:4 - ' +        // b11
  'D3:6 - - - A:4 - ' +        // b12
  'D3:6 - F3:3 - A3:4 - ' +    // b13 walking triad
  'C3:6 - - - G:4 - ' +        // b14
  'Bb:5 - - C3:6 - - ' +       // b15 under the crescendo run
  'C3:6 - G:3 - E3:4 - ' +     // b16 steps down into Dm
  'D3:6 - - - A:4 - ' +        // b17
  'G:6 - - - D3:4 - ' +        // b18
  'Bb:6 - - - F:4 - ' +        // b19
  'A:6 - - - E3:4 - ' +        // b20
  'D3:6 - - - C3:4 - ' +       // b21
  'Bb:6 - - - G:4 - ' +        // b22 Gm/Bb
  'C3:6 - - - G:3 - ' +        // b23
  'D3:6 - C3:4 - Bb:4 A:4 ' +  // b24 walking descent home to F
  'F:6 - - - C3:4 - ' +        // b25
  'C3:5 - - - G:3 - ' +        // b26
  'Bb:6 - - - F:4 - ' +        // b27
  'F:5 - - - A:3 - ' +         // b28
  'D3:6 - - - A:4 - ' +        // b29
  'Bb:6 - - - Db3:4 - ' +      // b30 minor iv
  'C3:6 - - - G:3 - ' +        // b31
  'F:6 - C3:4 - F:5 -';        // b32 settles; loops to b1

// ---- Percussion: dawn-quiet shaker/sidestick, tiny tom fills at turns. ----
const drums =
  '. . . . . . '.repeat(4) +           // b1-4   silence, just the farm
  '. . . . X:2 . '.repeat(4) +         // b5-8   shaker whisper enters
  '. . M:3 . X:2 . '.repeat(7) +       // b9-15  sidestick lilt
  '. . M:3 . T:3 U:3 ' +               // b16    soft tom turn into B
  '. . X:2 . X:2 . '.repeat(7) +       // b17-23 thinner in B
  '. T:2 . T:3 U:3 . ' +               // b24    fill back into A''
  '. . M:3 . X:2 . '.repeat(7) +       // b25-31
  '. . X:2 . . .';                     // b32    breath before the loop

export const track: Track = {
  name: 'Shepherd\'s Rest', bpm: 108, loopBars: 32, swing: 0.06,
  channels: [
    { program: P.OBOE, gain: 0.20, octave: 5, wave: 'triangle', pan: 0.1, notes: seq(lead) },
    { program: P.CELESTA, gain: 0.11, octave: 5, wave: 'sine', pan: -0.45, notes: seq(counter) },
    { program: P.ACCORDION, gain: 0.07, octave: 4, wave: 'triangle', pan: -0.2, notes: seq(accLow) },
    { program: P.ACCORDION, gain: 0.06, octave: 4, wave: 'triangle', pan: 0.35, notes: seq(accHigh) },
    { program: P.ACOUSTIC_BASS, gain: 0.16, octave: 2, wave: 'sine', pan: -0.05, notes: seq(bass) },
    { program: 0, gain: 0.06, octave: 3, wave: 'square', pan: 0.15, drums: true, notes: seq(drums) },
  ],
};
