// 'Riverside' — the river banks. Wistful 6/8 in A minor, water-borne harp
// arpeggios under a lyrical flute. Form: A (theme, 8 bars) / A' (sequenced up
// a third, deceptive cadence E7->F) / B (turn to C major, borrowed Fm, the
// world leitmotif C E G A G E quoted in the violin) / A'' (theme varied,
// peak at A5, cadence resolving back into bar 1). 32 bars of 6/8 = 192 steps.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Riverside', bpm: 78, loopBars: 32,
  channels: [
    // Lead — flute, the singable hook: a rise A-C-E that settles back, stated
    // in bars 1-2, sequenced up a third in A', floated in B, peaked in A''.
    { program: P.FLUTE, gain: 0.22, octave: 4, wave: 'triangle', pan: 0.15, notes: seq(
      // A — theme (bars 1-8): Am Em F C | Dm Am E7 Am
      'A:6 -    C5:7 -    E5:8 D5:6 ' +
      'C5:7 -   A:6  -    -    E:3  ' +
      'A:6 -    C5:7 -    F5:8 E5:6 ' +
      'E5:7 -   C5:6 -    -    G:3  ' +
      'F:6 -    A:7  -    D5:8 C5:6 ' +
      'C5:7 -   A:6  -    E:5  -    ' +
      'B:5 -    G#:6 -    B:7  D5:8 ' +
      'C5:8 -   A:7  -    -    .    ' +
      // A' — theme sequenced up a third (bars 9-16): Am G F C | Dm E7 F(!) E7
      'C5:6 -   E5:7 -    G5:8 F5:6 ' +
      'D5:7 -   B:6  -    G:5  -    ' +
      'C5:6 -   F5:7 A5:8 G5:7 F5:6 ' +
      'E5:7 -   C5:6 -    G:4  -    ' +
      'F5:7 E5:6 D5:7 -   A:6  -    ' +
      'G#:5 -   B:6  -    E5:7 -    ' +
      'F5:8 -   C5:7 -    A:6  -    ' +
      'B:5 -    D5:6 -    G#:4 B:5  ' +
      // B — brighter, C major with borrowed iv (bars 17-24): C G Am Em | F Fm C E7
      'G5:6 -   -    E5:5 -    C5:4 ' +
      'D5:6 -   -    B:5  -    G:4  ' +
      'E5:7 -   C5:6 -    A:5  -    ' +
      'B:6 -    G:5  -    E:4  -    ' +
      'A:5 C5:6 F5:7 -    G5:7 -    ' +
      'G#5:8 -  F5:7 -    C5:5 -    ' +
      'E5:7 -   G5:6 -    C5:5 -    ' +
      'B:5 D5:6 E5:7 -    G#:5 B:6  ' +
      // A'' — theme varied, peak at A5 (bars 25-32): Am Em F C | Dm F E7 Am
      'A:6 -    C5:7 -    E5:8 D5:6 ' +
      'C5:7 -   A:6  -    G:4  E:3  ' +
      'A:6 C5:7 F5:8 -    A5:9 G5:7 ' +
      'E5:7 -   C5:6 -    -    G:3  ' +
      'F:6 A:7  D5:8 -    C5:6 A:5  ' +
      'C5:7 -   A:6  F:5  -    -    ' +
      'B:5 -    G#:6 B:7  D5:8 E5:8 ' +
      'C5:8 -   A:7  -    -    E:3  ') },
    // Counter — violin answering in the lead's gaps; quotes the world
    // leitmotif (C E G A G E) across bars 17-18 of the B section.
    { program: P.VIOLIN, gain: 0.12, octave: 4, wave: 'sawtooth', pan: -0.3, notes: seq(
      '. .      .    .    .    .    ' +
      '. .      E:4  F:5  E:4  D:4  ' +
      'C:4 -    -    .    .    .    ' +
      '. .      G:4  A:5  B:5  -    ' +
      'A:4 -    -    .    .    .    ' +
      '. .      E:4  -    C:4  -    ' +
      '. G#3:4  -    B3:5 -    .    ' +
      'A3:5 -   .    C:4  E:5  A:6  ' +
      '. .      .    .    .    .    ' +
      '. .      D:4  -    B3:4 -    ' +
      'A3:4 -   -    .    .    .    ' +
      '. .      E:4  G:5  C5:5 -    ' +
      'D:4 -    -    F:4  -    .    ' +
      '. G#3:4  B3:5 -    E:5  -    ' +
      'C:5 -    A3:4 -    F:4  -    ' +
      '. .      E:4  -    D:4  B3:4 ' +
      'C:5 -    E:5  -    G:6  -    ' +
      'A:6 -    G:5  -    E:4  -    ' +
      '. .      C:4  -    E:5  -    ' +
      '. .      B3:4 -    G3:3 -    ' +
      'F:4 -    -    A:5  -    .    ' +
      'C:5 -    -    G#3:4 -   .    ' +
      '. .      E:4  -    G:5  -    ' +
      '. D:4    -    E:5  G#:5 -    ' +
      '. .      .    .    .    .    ' +
      '. .      E:4  F:5  E:4  D:4  ' +
      'C:5 -    -    F:5  -    .    ' +
      '. .      G:4  -    E:4  -    ' +
      'D:4 -    -    F:4  -    .    ' +
      '. A3:4   -    C:5  -    .    ' +
      '. G#3:4  -    B3:5 -    .    ' +
      'A3:5 -   -    E:4  -    .    ') },
    // Water — harp arpeggios rippling through every bar of the harmony.
    { program: P.HARP, gain: 0.12, octave: 3, wave: 'triangle', pan: 0.35, notes: seq(
      'A:5 E4:3 A4:4 C5:5 E4:3 C5:3 ' +    // Am
      'E:5 B:3  E4:4 G4:5 B:3  G4:3 ' +    // Em
      'F:5 C4:3 F4:4 A4:5 C4:3 A4:3 ' +    // F
      'C:5 G:3  C4:4 E4:5 G4:3 E4:3 ' +    // C
      'D:5 A:3  D4:4 F4:5 A4:3 F4:3 ' +    // Dm
      'A:5 E4:3 A4:4 C5:5 E4:3 C5:3 ' +    // Am
      'E:5 B:3  D4:4 G#4:5 B4:3 G#4:3 ' +  // E7
      'A:5 E4:3 A4:4 C5:5 E4:3 C5:3 ' +    // Am
      'A:5 E4:3 A4:4 C5:5 E4:3 C5:3 ' +    // Am
      'G:5 D4:3 G4:4 B4:5 D4:3 B4:3 ' +    // G
      'F:5 C4:3 F4:4 A4:5 C4:3 A4:3 ' +    // F
      'C:5 G:3  C4:4 E4:5 G4:3 E4:3 ' +    // C
      'D:5 A:3  D4:4 F4:5 A4:3 F4:3 ' +    // Dm
      'E:5 B:3  D4:4 G#4:5 B4:3 G#4:3 ' +  // E7
      'F:6 C4:3 F4:4 A4:5 C4:3 A4:3 ' +    // F (deceptive)
      'E:5 B:3  D4:4 G#4:5 B4:3 G#4:3 ' +  // E7
      'C:5 G:3  C4:4 E4:5 G4:3 E4:3 ' +    // C
      'G:5 D4:3 G4:4 B4:5 D4:3 B4:3 ' +    // G
      'A:5 E4:3 A4:4 C5:5 E4:3 C5:3 ' +    // Am
      'E:5 B:3  E4:4 G4:5 B:3  G4:3 ' +    // Em
      'F:5 C4:3 F4:4 A4:5 C4:3 A4:3 ' +    // F
      'F:5 C4:3 F4:4 G#4:5 C4:3 G#4:3 ' +  // Fm (borrowed iv)
      'C:5 G:3  C4:4 E4:5 G4:3 E4:3 ' +    // C
      'E:5 B:3  D4:4 G#4:5 B4:3 G#4:3 ' +  // E7
      'A:5 E4:3 A4:4 C5:5 E4:3 C5:3 ' +    // Am
      'E:5 B:3  E4:4 G4:5 B:3  G4:3 ' +    // Em
      'F:6 C4:3 F4:4 A4:5 C4:3 A4:3 ' +    // F
      'C:5 G:3  C4:4 E4:5 G4:3 E4:3 ' +    // C
      'D:5 A:3  D4:4 F4:5 A4:3 F4:3 ' +    // Dm
      'F:5 C4:3 F4:4 A4:5 C4:3 A4:3 ' +    // F
      'E:5 B:3  D4:4 G#4:5 B4:3 G#4:3 ' +  // E7
      'A:5 E4:3 A4:4 C5:5 E4:3 C5:3 ') },  // Am
    // Mist — slow strings holding one smooth guide-tone per bar.
    { program: P.SLOW_STRINGS, gain: 0.07, octave: 4, wave: 'sine', pan: -0.15, notes: seq(
      'C:3 - - - - -  B3:3 - - - - -  A3:3 - - - - -  G3:3 - - - - - ' +
      'A3:3 - - - - - C:3 - - - - -   B3:3 - - - - -  A3:3 - - - - - ' +
      'E:3 - - - - -  D:3 - - - - -   C:3 - - - - -   C:3 - - - - - ' +
      'D:3 - - - - -  D:3 - - - - -   C:3 - - - - -   B3:3 - - - - - ' +
      'E:4 - - - - -  D:3 - - - - -   C:3 - - - - -   B3:3 - - - - - ' +
      'A3:3 - - - - - G#3:3 - - - - - G3:3 - - - - -  G#3:3 - - - - - ' +
      'C:3 - - - - -  B3:3 - - - - -  A3:3 - - - - -  G3:3 - - - - - ' +
      'A3:3 - - - - - A3:3 - - - - -  B3:3 - - - - -  A3:4 - - - - - ') },
    // Bass — plucked upright in a dotted-quarter lilt, walking approaches
    // into each new chord, a small run-up at the end of B.
    { program: P.ACOUSTIC_BASS, gain: 0.15, octave: 2, wave: 'sine', pan: 0, notes: seq(
      'A:6 -   -    E:4  -    G:2  ' +
      'E:6 -   -    B:4  -    E:2  ' +
      'F:6 -   -    C3:4 -    A:2  ' +
      'C3:6 -  -    G:4  -    E:2  ' +
      'D:6 -   -    A:4  -    G:2  ' +
      'A:6 -   -    E:4  -    D:2  ' +
      'E:6 -   -    G#:4 -    B:3  ' +
      'A:7 -   -    C3:4 E3:3 -    ' +
      'A:6 -   -    C3:4 -    E3:3 ' +
      'G:6 -   -    B:4  -    D3:3 ' +
      'F:6 -   -    A:4  -    C3:3 ' +
      'C3:6 -  -    G:4  -    E:2  ' +
      'D:6 -   -    F:4  -    A:3  ' +
      'E:6 -   -    G#:4 -    B:3  ' +
      'F:7 -   -    C3:4 -    A:3  ' +
      'E:6 -   G#:4 -    B:3  D3:4 ' +
      'C3:6 -  -    G:4  -    E:3  ' +
      'G:6 -   -    D3:4 -    B:3  ' +
      'A:6 -   -    E:4  -    C3:3 ' +
      'E:6 -   -    G:4  -    B:3  ' +
      'F:6 -   -    C3:4 -    A:3  ' +
      'F:6 -   -    G#:4 -    C3:3 ' +
      'C3:6 -  -    G:4  -    E:3  ' +
      'E:6 -   G#:4 B:5  D3:5 E3:6 ' +
      'A:7 -   -    E:4  -    G:2  ' +
      'E:6 -   -    B:4  -    E:2  ' +
      'F:6 -   -    C3:4 -    A:2  ' +
      'C3:6 -  -    G:4  -    E:2  ' +
      'D:6 -   -    A:4  -    G:2  ' +
      'F:6 -   -    C3:4 -    D:3  ' +
      'E:6 -   -    G#:4 -    B:3  ' +
      'A:7 -   -    E:4  G:3  -    ') },
  ],
};
