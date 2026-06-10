// 'Quiet Meadow' — the hunter meadow. Calm pastoral in G major, 64 bpm.
//
// Form (32 bars): A (1-8) theme · A' (9-16) theme varied, borrowed iv (Cm)
// · B (17-24) Em contrast w/ deceptive cadence and borrowed bIII (Bb)
// · A'' (25-32) return, resolving back into the loop on a pickup D.
//
// Motif: a two-bar "rise-reach-settle" pan-flute hook (D ^ G ^ A-B | A v G-E),
// sequenced up a third in bar 3, re-stated higher in A', re-harmonized over
// Cm in bar 14/28, and inverted in feel through the B section.
// The world leitmotif (C E G A G E) appears ONCE, transposed to G major
// (G B D E D B) in the harp at bar 16, filling the lead's breath.
// Counterpoint: harp answers the flute in its gaps (call-and-response).
// Bass: cello half-note roots with walking approach tones and one octave pop.
// Birdsong: sparse ocarina flicks at vel 2-3, octave 6, 8-bar ostinato.
// No drums — the meadow stays quiet.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Quiet Meadow', bpm: 64, loopBars: 32,
  channels: [
    // Lead — pan flute, the hook. 32 bars (256 steps); defines the loop.
    { program: P.PAN_FLUTE, gain: 0.17, octave: 5, wave: 'triangle', pan: 0, notes: seq(
      // A — theme
      'D:4 -   G:6 -   A:5 B:7 -   -  ' + //  1 G    motif a: rise, reach
      'A:6 -   G:5 E:4 G:5 -   -   -  ' + //  2 Cmaj7 settle
      'B:5 -   E6:7 -  D6:6 B:5 -  -  ' + //  3 Em7  motif sequenced up a third
      'A:6 -   -   -   F#:4 G:5 A:5 - ' + //  4 D
      'D:4 -   G:6 -   A:5 B:7 -   -  ' + //  5 G    restatement
      'C6:7 -  B:6 A:5 -   -   G:4 -  ' + //  6 Am7
      'E:5 -   G:6 -   A:6 -   B:5 -  ' + //  7 C
      'A:6 -   -   -   -   -   D:3 -  ' + //  8 D    breath; ghost pickup
      // A' — varied, climbing higher
      'D:4 -   G:6 -   A:6 B:8 -   -  ' + //  9 G    accented peak
      'D6:7 -  B:5 -   A:5 G:4 -   -  ' + // 10 Cmaj7
      'E6:7 -  D6:6 B:5 G:4 -  B:5 -  ' + // 11 Em7
      'F#:5 -  -   -   D:4 E:4 F#:5 - ' + // 12 Bm
      'G:6 -   A:5 B:6 -   -   A:5 -  ' + // 13 C
      'G:5 -   -   -   D#:4 -  D:4 -  ' + // 14 Cm   borrowed iv — Eb shadow
      'D:5 -   B:5 -   A:5 -   F#:4 - ' + // 15 G/D D
      'G:6 -   -   -   -   -   .   .  ' + // 16 G    lead rests; harp leitmotif
      // B — Em contrast, lower and more lyrical
      'E:5 -   G:5 -   B:6 -   -   -  ' + // 17 Em
      'C6:6 -  B:5 -   A:4 -   G:4 -  ' + // 18 C
      'B:5 -   D6:6 -  G:4 -   -  A:4 ' + // 19 G/B
      'B:6 -   A:5 -   F#:4 -  -   -  ' + // 20 D    (V… )
      'E:5 -   G:5 B:6 E6:8 -  -   -  ' + // 21 Em   deceptive cadence, peak
      'D6:7 -  -   -   C6:5 -  A#:4 - ' + // 22 Bb   borrowed bIII glow
      'C6:6 -  A:5 -   G:4 E:4 -   -  ' + // 23 Am7
      'A:5 -   -   -   F#:4 -  D:4 -  ' + // 24 D    turns home
      // A'' — return, fullest statement, then settle
      'D:4 -   G:7 -   A:6 B:8 -   -  ' + // 25 G
      'A:6 -   G:5 E:4 G:5 -   -   -  ' + // 26 Cmaj7
      'B:5 -   E6:7 -  D6:6 B:5 -  -  ' + // 27 Em7
      'G:5 -   -   -   D#:3 -  D:4 -  ' + // 28 Cm   motif re-harmonized, hushed
      'G:6 -   B:6 -   D6:7 -  -   -  ' + // 29 G    rising farewell
      'E6:7 -  D6:5 -  C6:5 -  A:4 -  ' + // 30 C
      'B:6 -   G:5 -   A:5 -   F#:4 - ' + // 31 G/D D
      'G:6 -   -   -   -   -   D:3 -  '   // 32 G    pickup D loops into bar 1
    ) },
    // Counter — harp answering in the lead's gaps; carries the leitmotif once.
    { program: P.HARP, gain: 0.11, octave: 4, wave: 'sine', pan: -0.4, notes: seq(
      '.   .   .   .   .   .   B:3 .  ' + //  1
      '.   .   .   .   A:4 G:3 E:3 -  ' + //  2 echo of the settle
      '.   .   .   .   .   .   E:3 .  ' + //  3
      '.   .   D:3 E:3 F#:4 -  A:4 -  ' + //  4 climbing answer
      'G:3 -   B:3 -   D5:4 -  B:3 -  ' + //  5
      '.   .   .   .   E:3 G:4 A:3 -  ' + //  6
      'C5:4 -  B:3 -   G:3 -   E:3 -  ' + //  7
      'F#:3 -  A:4 -   D5:4 -  C5:3 - ' + //  8 D7 color
      '.   .   .   .   .   .   B:3 .  ' + //  9
      '.   .   .   .   G:4 E:3 C:3 -  ' + // 10
      '.   .   .   .   G:3 -   B:3 -  ' + // 11
      'F#:3 -  -   -   D:3 -   B3:3 - ' + // 12
      'C:3 -   E:3 -   G:4 -   E:3 -  ' + // 13
      'C:3 -   D#:3 -  G:4 -   D#:2 - ' + // 14 Cm arpeggio
      'D:3 -   F#:3 -  A:4 -   C5:3 - ' + // 15
      'G:4 B:4 D5:5 E5:5 D5:4 B:3 - - ' + // 16 LEITMOTIF (C E G A G E -> G)
      'E:3 -   G:3 -   B:4 -   G:3 -  ' + // 17
      'C:3 -   -   -   G:3 -   -   -  ' + // 18
      'B3:3 -  -   -   D:3 -   G:4 -  ' + // 19
      'A:3 -   C5:3 -  F#:3 -  D:3 -  ' + // 20
      'E:3 -   -   -   B:4 -   G:3 -  ' + // 21
      'A#3:3 - -   -   D:3 -   F:3 -  ' + // 22 Bb arpeggio
      'A3:3 -  C:3 -   E:3 -   G:4 -  ' + // 23
      'F#:3 -  -   -   A:4 -   C5:3 - ' + // 24
      '.   .   .   .   .   .   B:3 .  ' + // 25
      '.   .   .   .   A:4 G:3 E:3 -  ' + // 26
      '.   .   .   .   .   .   E:3 .  ' + // 27
      'C:3 -   D#:3 -  G:4 -   -   -  ' + // 28
      '.   .   B:3 -   D5:4 -  G:3 -  ' + // 29
      'C:3 -   E:3 -   G:4 -   A:3 -  ' + // 30
      'D:3 -   F#:3 -  A:4 -   C5:3 - ' + // 31
      'G:4 -   D:3 -   B3:2 -  -   -  '   // 32 fading roll into the seam
    ) },
    // Pad — slow string swells, one guide tone per bar (mostly chord thirds).
    { program: P.SLOW_STRINGS, gain: 0.07, octave: 4, wave: 'sine', pan: 0.3, notes: seq(
      'B3:3 - - - - - - -   E:3 - - - - - - -   G:3 - - - - - - -   F#:3 - - - - - - - ' + //  1-4
      'B3:3 - - - - - - -   C:3 - - - - - - -   E:3 - - - - - - -   F#:3 - - - - - - - ' + //  5-8
      'D:4 - - - - - - -    E:3 - - - - - - -   G:3 - - - - - - -   F#:3 - - - - - - - ' + //  9-12
      'E:3 - - - - - - -    D#:3 - - - - - - -  F#:3 - - - - - - -  G:3 - - - - - - -  ' + // 13-16
      'G:3 - - - - - - -    E:3 - - - - - - -   D:3 - - - - - - -   F#:3 - - - - - - - ' + // 17-20
      'G:3 - - - - - - -    D:3 - - - - - - -   C:3 - - - - - - -   F#:3 - - - - - - - ' + // 21-24
      'B3:3 - - - - - - -   E:3 - - - - - - -   G:3 - - - - - - -   D#:3 - - - - - - - ' + // 25-28
      'B3:4 - - - - - - -   E:4 - - - - - - -   F#:3 - - - - - - -  B3:2 - - - - - - - '   // 29-32
    ) },
    // Bass — cello, moving half-note line with walking approach tones.
    { program: P.CELLO, gain: 0.12, octave: 2, wave: 'sine', pan: 0, notes: seq(
      'G:5 -  - - D3:3 -  -    -   ' + //  1 G
      'C3:5 - - - G:3 -   -    -   ' + //  2 C
      'E:5 -  - - B:3 -   D3:3 -   ' + //  3 Em
      'D3:5 - - - F#:3 -  A:3  -   ' + //  4 D, walks up into G
      'G:5 -  - - B:3 -   D3:3 -   ' + //  5 G
      'A:5 -  - - E3:3 -  G:3  -   ' + //  6 Am7
      'C3:5 - - - E3:3 -  G:3  -   ' + //  7 C
      'D3:5 - - - C3:3 -  A:3  -   ' + //  8 D7 walk-down
      'G:5 -  - - D3:3 -  -    -   ' + //  9 G
      'C3:5 - - - B:3 -   A:3  -   ' + // 10 C, stepwise descent
      'E:5 -  - - G:3 -   A:3  -   ' + // 11 Em
      'B:5 -  - - F#3:3 - -    -   ' + // 12 Bm
      'C3:5 - - - G:3 -   -    -   ' + // 13 C
      'C3:5 - - - D#3:3 - G:3  -   ' + // 14 Cm — minor iv underneath
      'D3:5 - - - D:4 -   -    -   ' + // 15 D — octave pop down
      'G:5 -  - - -   -   F#3:2 E3:2 ' + // 16 G, ghost run into B section
      'E:5 -  - - B:3 -   -    -   ' + // 17 Em
      'C3:5 - - - G:3 -   -    -   ' + // 18 C
      'B:5 -  - - D3:3 -  -    -   ' + // 19 G/B
      'D3:5 - - - A:3 -   C3:3 -   ' + // 20 D7
      'E:5 -  - - G:3 -   B:3  -   ' + // 21 Em (deceptive landing)
      'A#:5 - - - F3:3 -  -    -   ' + // 22 Bb
      'A:5 -  - - E3:3 -  -    -   ' + // 23 Am7
      'D3:5 - - - C3:4 -  A:3  -   ' + // 24 D7, leaning home
      'G:6 -  - - D3:3 -  B:3  -   ' + // 25 G — warmest downbeat
      'C3:5 - - - G:3 -   -    -   ' + // 26 C
      'E:5 -  - - B:3 -   -    -   ' + // 27 Em
      'C3:5 - - - G:3 -   D#3:3 -  ' + // 28 Cm
      'G:5 -  - - B:3 -   D3:3 -   ' + // 29 G
      'C3:5 - - - A:3 -   -    -   ' + // 30 C
      'D3:5 - - - A:3 -   C3:3 -   ' + // 31 D
      'G:5 -  - - D:3 -   -    -   '   // 32 G, low D breath before the loop
    ) },
    // Birdsong — ocarina flicks, octave 6, G-pentatonic, 8-bar ostinato (loops 4x).
    { program: P.OCARINA, gain: 0.05, octave: 6, wave: 'sine', pan: 0.5, notes: seq(
      '.   .   .   .   .   .   G:2 A:3 ' +
      'B:2 .   .   .   .   .   .   .   ' +
      '.   .   .   .   D:2 E:3 D:2 .   ' +
      '.   .   .   .   .   .   .   .   ' +
      '.   .   G:3 .   A:2 .   .   .   ' +
      '.   .   .   .   .   .   B:3 .   ' +
      'A:2 G:2 .   .   .   .   .   .   ' +
      '.   .   .   .   .   E:2 G:3 .   '
    ) },
  ],
};
