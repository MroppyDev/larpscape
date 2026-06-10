// 'Brackwater Tide' — the fishing port. Rolling 6/8 sea-song in D minor
// (dorian salt on the turns), jaunty but weather-beaten. Accordion carries a
// "heave and haul" hook — leap up a fifth, roll back down — stated in bars
// 1-2, then sequenced up a third in A', stretched into long swells in B, and
// peaked at D5 in A''. Form: A (8 bars) / A' (sequenced, half cadence on A7,
// deceptive resolve into F) / B (relative major, borrowed iv Bbm, the world
// leitmotif C E G A G E quoted by the fiddle transposed to F A C D C A) /
// A'' (peak + full cadence A7->Dm back into bar 1). 32 bars of 6/8 = 192
// steps. Tuba walks stepwise approaches into every chord change; fiddle
// answers in the lead's gaps; shaker/hat spray with a tambourine fill at
// each 8-bar turn.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Brackwater Tide', bpm: 116, loopBars: 32,
  channels: [
    // Lead — accordion, the singable hook.
    { program: P.ACCORDION, gain: 0.22, octave: 4, wave: 'square', pan: 0.1, notes: seq(
      // A — theme (bars 1-8): Dm C Dm Am | Dm F C A7
      'D:6  -    A:8   -    F:7  E:5  ' +
      'D:7  -    -     C:5  D:6  E:6  ' +
      'F:7  -    G:6   A:8  -    F:5  ' +
      'E:7  -    C:6   -    -    E:3  ' +
      'D:6  -    A:8   -    F:7  E:5  ' +
      'F:7  -    C5:8  -    A:7  G:5  ' +
      'E:7  -    G:7   E:6  D:6  -    ' +
      'E:7  -    C#:6  -    A3:5 -    ' +
      // A' — hook sequenced up a third (bars 9-16): F C Dm Bb | Gm Dm Bb/C A7
      'F:6  -    C5:8  -    A:7  G:5  ' +
      'F:7  -    -     E:5  F:6  G:6  ' +
      'A:7  -    Bb:6  C5:8 -    A:5  ' +
      'G:7  -    D:6   -    -    F:3  ' +
      'G:6  -    Bb:7  -    D5:8 C5:6 ' +
      'A:7  -    F:6   -    D:5  -    ' +
      'Bb:6 D5:7 C5:7  E:5  G:6  -    ' +
      'A:7  -    C#:6  E:6  G:7  -    ' +
      // B — long swells in F major, borrowed Bbm (bars 17-24): F Bb Dm C | Bb Bbm F A7
      'A:6  -    -     F:5  -    C:4  ' +
      'Bb:6 -    -     D5:7 -    F:4  ' +
      'A:7  -    F:6   -    D:5  -    ' +
      'G:6  -    E:6   -    C:5  -    ' +
      'F:6  -    Bb:7  -    D5:8 -    ' +
      'Db5:7 -   Bb:6  -    F:5  -    ' +
      'C5:7 -    A:6   -    F:5  -    ' +
      'E:6  -    C#:6  -    E:5  -    ' +
      // A'' — theme varied, peak at D5 (bars 25-32): Dm C Dm Am | Gm Bb A7 Dm
      'D:7  -    A:8   -    F:7  E:5  ' +
      'D:7  -    -     C:6  D:7  E:7  ' +
      'F:7  G:7  A:8   -    D5:9 C5:7 ' +
      'E:7  -    C5:6  -    A:5  -    ' +
      'G:6  -    Bb:7  D5:8 -    C5:6 ' +
      'Bb:7 -    F:6   -    D:5  -    ' +
      'E:7  -    C#:6  E:7  G:8  -    ' +
      'D:8  -    -     A:5  -    .    ') },
    // Counter — fiddle answering in the lead's gaps; quotes the world
    // leitmotif (C E G A G E -> F A C5 D5 C5 A) across bars 17-18.
    { program: P.FIDDLE, gain: 0.12, octave: 4, wave: 'sawtooth', pan: -0.35, notes: seq(
      '.    .    .     .    .    .    ' +
      '.    .    .     G:4  A:4  B:4  ' +
      '.    .    .     .    .    .    ' +
      'A:5  -    E:4   -    C:4  -    ' +
      '.    .    .     .    .    .    ' +
      'C:4  -    -     -    -    -    ' +
      '.    .    .     .    .    .    ' +
      '.    .    .     G:4  -    E:4  ' +
      '.    .    .     .    .    .    ' +
      '.    .    .     C:4  -    E:5  ' +
      '.    .    .     .    .    .    ' +
      'Bb3:5 -   D:4   -    F:5  -    ' +
      '.    .    .     .    .    .    ' +
      'D:4  -    -     A3:4 -    .    ' +
      '.    .    .     .    .    .    ' +
      '.    .    E:5   -    C#:5 A3:4 ' +
      'F:5  -    A:6   -    C5:6 -    ' +
      'D5:7 -    C5:6  -    A:5  -    ' +
      '.    .    .     F:4  -    .    ' +
      '.    .    E:4   -    G:4  -    ' +
      '.    .    .     Bb3:4 -   .    ' +
      'Db:5 -    -     Bb3:4 -   .    ' +
      '.    .    C:5   -    A3:4 -    ' +
      '.    .    .     E:5  C#:5 -    ' +
      '.    .    .     .    .    .    ' +
      '.    .    .     G:4  -    E:4  ' +
      '.    .    .     .    .    .    ' +
      'A:5  -    E:4   -    C:5  -    ' +
      '.    .    .     .    .    .    ' +
      '.    .    D:5   -    Bb3:4 -   ' +
      '.    .    .     E:5  -    C#:5 ' +
      'A:5  -    F:4   -    D:4  -    ') },
    // Swells — low strings holding one guide tone per bar, the Db on the
    // borrowed Bbm leaned into.
    { program: P.SLOW_STRINGS, gain: 0.07, octave: 3, wave: 'sine', pan: -0.15, notes: seq(
      'F:3 - - - - -   E:3 - - - - -   F:3 - - - - -   E:3 - - - - - ' +
      'F:3 - - - - -   A:3 - - - - -   G:3 - - - - -   G:3 - - - - - ' +
      'A:3 - - - - -   G:3 - - - - -   F:3 - - - - -   D:3 - - - - - ' +
      'Bb:3 - - - - -  F:3 - - - - -   D:3 - - E:3 - - C#:4 - - - - - ' +
      'A:3 - - - - -   D:3 - - - - -   F:3 - - - - -   E:3 - - - - - ' +
      'D:3 - - - - -   Db:4 - - - - -  C:3 - - - - -   C#:4 - - - - - ' +
      'F:3 - - - - -   E:3 - - - - -   F:3 - - - - -   E:3 - - - - - ' +
      'Bb:3 - - - - -  D:3 - - - - -   C#:4 - - - - -  D:3 - - - - - ') },
    // Bass — tuba lilt: root on the downbeat, fifth on beat 4, a stepwise
    // approach note walking into every chord change.
    { program: P.TUBA, gain: 0.16, octave: 2, wave: 'sine', pan: 0, notes: seq(
      'D3:7 - -    A:4  -    C3:3  ' +
      'C3:7 - -    G:4  -    C#3:3 ' +
      'D3:7 - -    A:4  -    G:3   ' +
      'A:7  - -    E3:4 -    C3:3  ' +
      'D3:7 - -    A:4  -    E3:3  ' +
      'F:7  - -    C3:4 -    B:3   ' +
      'C3:7 - -    G:4  -    A:3   ' +
      'A:7  - -    E3:4 -    G:3   ' +
      'F:7  - -    C3:4 -    D3:3  ' +
      'C3:7 - -    G:4  -    C#3:3 ' +
      'D3:7 - -    A:4  -    C3:3  ' +
      'Bb:7 - -    F:4  -    A:3   ' +
      'G:7  - -    D3:4 -    C#3:3 ' +
      'D3:7 - -    A:4  -    Bb:3  ' +
      'Bb:7 - -    C3:6 -    -     ' +
      'A:7  - C#3:5 -   E3:6 G:6   ' +
      'F:7  - -    C3:4 -    A:3   ' +
      'Bb:7 - -    F:4  -    C#3:3 ' +
      'D3:7 - -    A:4  -    B:3   ' +
      'C3:7 - -    G:4  -    Bb:3  ' +
      'Bb:7 - -    F:4  -    Bb:3  ' +
      'Bb:7 - -    F:4  -    Db3:3 ' +
      'F:7  - -    C3:4 -    G:3   ' +
      'A:7  - -    E3:4 -    C#3:3 ' +
      'D3:7 - -    A:4  -    C3:3  ' +
      'C3:7 - -    G:4  -    C#3:3 ' +
      'D3:7 - -    A:4  -    G:3   ' +
      'A:7  - -    E3:4 -    F:3   ' +
      'G:7  - -    D3:4 -    A:3   ' +
      'Bb:7 - -    F:4  -    G#:3  ' +
      'A:7  - E3:4 -    G:4  -     ' +
      'D3:8 - -    A:4  -    C3:3  ') },
    // Spray — shaker/hat 8-bar ostinato (loops 4x); tambourine + open-hat
    // fill lands at every section turn (bars 8/16/24/32).
    { program: 0, gain: 0.08, octave: 4, wave: 'square', pan: 0.3, drums: true, notes: seq(
      'X:6 X:2 H:3 X:5 X:2 H:3 ' +
      'X:5 X:2 H:3 X:6 X:2 H:3 ' +
      'X:6 X:2 H:3 X:5 X:2 H:3 ' +
      'X:6 X:2 H:3 X:5 B:4 H:3 ' +
      'X:6 X:2 H:3 X:5 X:2 H:3 ' +
      'X:5 X:2 H:3 X:6 X:2 H:3 ' +
      'X:6 X:2 H:3 X:5 B:4 X:3 ' +
      'X:6 H:3 B:5 X:5 B:6 O:4 ') },
  ],
};
