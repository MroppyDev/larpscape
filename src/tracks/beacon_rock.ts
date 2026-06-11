// 'Beacon Rock' — the coastal lighthouse. Slow noble 4/4 in D major, 76 bpm.
// Form AA'BA'' (32 bars): horn states the "beam" motif (wide 5th/octave leaps),
// A' climbs and shadows it with the borrowed iv (Gm — salt-spray darkening),
// B sinks to the relative minor for the keeper's lonely verse, A'' returns at
// full light and exhales home. Harp arpeggios are the undertow (velocity rises
// and falls inside every bar like swell), slow strings re-attack soft->loud as
// waves, low choir breathes the roots, cello walks the tide, cymbals wash in
// 8-bar surf cycles.
// PROGRESSION — A: D Bm G A | D G Em7 Asus-A · A': D Bm G Gm | D/F# G Em7-A D
//   B: Bm G D/F# A | Bm Gm Em7 Asus-A · A'': D Bm G Gm | D/F# G Asus D
// The world leitmotif (C E G A G E) appears once, in D (D F# A B A F#),
// in the harp at bar 16 while the horn rests.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Beacon Rock', bpm: 76, loopBars: 32,
  channels: [
    // ---- LEAD: noble horn — the "beam" motif, wide intervals, long breaths --
    { program: P.HORN, gain: 0.17, octave: 4, wave: 'triangle', pan: 0,
      notes: seq(`
        D:5 -   A:8 -   -   -    F#:5 -
        B:6 -   A:5 F#:4 D:4 -   -   -
        G:6 -   D5:8 -  -   -    B:5 -
        A:6 -   -   -   E:4 F#:4 G:5 -
        F#:6 -  A:7 -   D5:8 -   -   -
        B:6 -   A:5 G:4 -   -    F#:4 -
        E:5 -   G:6 -   B:6 -    A:5 -
        A:6 -   -   -   -   -    D:3 E:3

        D:5 -   A:8 -   B:6 -    D5:7 -
        C#5:6 - B:6 -   F#:5 -   -   -
        G:6 -   D5:8 -  E5:7 D5:6 B:5 -
        Bb:6 -  -   -   A:4 -    G:4 -
        A:6 -   D5:7 -  -   -    F#:5 -
        G:6 -   B:6 -   A:5 -    G:4 -
        E:5 -   G:5 -   A:6 -    C#5:5 -
        D5:7 -  -   -   .   .    .   .

        F#:6 -  B:7 -   D5:6 -   C#5:5 -
        B:6 -   -   -   G:4 -    A:4 -
        A:6 -   F#:5 -  D:4 -    -   -
        E:5 -   A:6 -   C#5:6 -  E5:7 -
        D5:7 -  B:6 -   F#:5 -   -   -
        G:6 -   Bb:6 -  D5:8 -   -   -
        D5:6 -  B:5 A:5 G:4 -    E:4 -
        A:6 -   -   -   C#:4 -   E:4 -

        D:5 -   A:8 -   B:7 -    D5:9 -
        C#5:7 - B:6 A:5 F#:4 -   -   -
        G:6 -   D5:8 -  -   -    B:5 -
        Bb:6 -  -   -   G:4 -    -   -
        F#:5 -  A:6 -   D5:7 -   E5:8 -
        D5:6 -  B:5 -   G:4 -    A:5 -
        A:6 -   -   -   G:5 -    E:4 -
        D:6 -   -   -   -   -    A:3 -
      `) },
    // ---- UNDERTOW: harp arpeggios, velocity swells inside every bar --------
    { program: P.HARP, gain: 0.12, octave: 3, wave: 'sine', pan: -0.4,
      notes: seq(`
        D:3 A:4 D4:5 F#4:6 A4:5 F#4:4 D4:3 A:3
        B2:3 F#:4 B:5 D4:6 F#4:5 D4:4 B:3 F#:3
        G:3 D4:4 G4:5 B4:6 G4:5 D4:4 B:3 G:3
        A2:3 E:4 A:5 C#4:6 E4:5 C#4:4 A:3 E:3
        D:3 A:4 D4:5 F#4:7 A4:6 F#4:4 D4:3 A:3
        G:3 D4:4 G4:5 B4:6 G4:5 D4:4 B:3 G:3
        E:3 B:4 E4:5 G4:6 D4:5 B:4 G:3 E:3
        A2:3 E:4 A:5 D4:6 C#4:5 A:4 E:3 A2:2

        D:3 A:4 D4:5 F#4:6 A4:6 F#4:4 D4:3 A:3
        B2:3 F#:4 B:5 D4:6 F#4:5 D4:4 B:3 F#:3
        G:3 D4:4 G4:6 B4:7 G4:5 D4:4 B:3 G:3
        G:3 D4:4 G4:5 Bb4:6 G4:5 D4:4 Bb:3 G:2
        F#:3 D4:4 F#4:5 A4:6 F#4:5 D4:4 A:3 F#:3
        G:3 D4:4 G4:5 B4:6 G4:5 D4:4 B:3 G:3
        E:3 B:4 E4:5 G4:6 A2:4 E:5 A:5 C#4:4
        D4:5 F#4:6 A4:7 B4:7 A4:6 F#4:5 D4:4 -

        B2:3 F#:4 B:5 D4:6 F#4:5 D4:4 B:3 F#:3
        G:3 D4:4 G4:5 B4:6 G4:5 D4:4 B:3 G:3
        F#:3 D4:4 F#4:5 A4:6 F#4:5 D4:4 A:3 F#:3
        A2:3 E:4 A:5 C#4:6 E4:5 C#4:4 A:3 E:3
        B2:3 F#:4 B:5 D4:7 F#4:5 D4:4 B:3 F#:3
        G:3 D4:4 G4:5 Bb4:7 G4:5 D4:4 Bb:3 G:3
        E:3 B:4 E4:5 G4:6 D4:5 B:4 G:3 E:3
        A2:3 E:4 A:5 D4:6 C#4:5 A:4 E:3 A2:2

        D:4 A:5 D4:6 F#4:7 A4:6 F#4:5 D4:4 A:3
        B2:3 F#:4 B:5 D4:6 F#4:5 D4:4 B:3 F#:3
        G:3 D4:4 G4:6 B4:7 G4:5 D4:4 B:3 G:3
        G:2 D4:3 G4:4 Bb4:4 G4:3 D4:3 Bb:2 G:2
        F#:3 D4:4 F#4:5 A4:6 F#4:5 D4:4 A:3 F#:3
        G:3 D4:4 G4:5 B4:6 G4:5 D4:4 B:3 G:3
        A2:3 E:4 A:5 D4:6 C#4:5 A:4 E:3 A2:3
        D:4 A:3 F#:3 -    D4:3 -   A:2 -
      `) },
    // ---- WAVES: slow strings — one guide tone per bar, soft->loud re-attack
    //      swells (in) alternating with loud->soft (out): the tide breathing.
    { program: P.SLOW_STRINGS, gain: 0.09, octave: 4, wave: 'sine', pan: 0.3,
      notes: seq(`
        F#:3 - - -  F#:5 - - -    D:5 - - -   D:3 - - -
        B3:3 - - -  B3:5 - - -    C#:5 - - -  C#:3 - - -
        F#:3 - - -  F#:6 - - -    B3:5 - - -  B3:3 - - -
        G:3 - - -   G:5 - - -     E:5 - - -   C#:4 - - -

        F#:4 - - -  F#:6 - - -    D:6 - - -   D:4 - - -
        B3:4 - - -  B3:6 - - -    Bb3:5 - - - Bb3:3 - - -
        A3:3 - - -  A3:5 - - -    B3:5 - - -  B3:3 - - -
        G:3 - - -   E:4 - - -     F#:5 - - -  F#:3 - - -

        D:3 - - -   D:5 - - -     B3:5 - - -  B3:3 - - -
        A3:3 - - -  A3:5 - - -    C#:5 - - -  C#:3 - - -
        F#:4 - - -  F#:6 - - -    Bb3:6 - - - Bb3:4 - - -
        G:3 - - -   G:5 - - -     E:5 - - -   C#:4 - - -

        F#:5 - - -  F#:7 - - -    D:6 - - -   D:4 - - -
        B3:4 - - -  B3:6 - - -    Bb3:4 - - - Bb3:2 - - -
        A3:3 - - -  A3:5 - - -    B3:5 - - -  D:4 - - -
        E:5 - - -   C#:3 - - -    D:4 - - -   D:2 - - -
      `) },
    // ---- HALO: low choir breaths on roots/fifths, one inhale per bar -------
    { program: P.VOICE_OOH, gain: 0.06, octave: 3, wave: 'sine', pan: -0.2,
      notes: seq(`
        D:3 - - - - - - -    B2:2 - - - - - - -
        G:2 - - - - - - -    A:2 - - - - - - -
        D:3 - - - - - - -    D:2 - - - - - - -
        E:2 - - - - - - -    A:2 - - - - - - -

        D:3 - - - - - - -    B2:2 - - - - - - -
        G:3 - - - - - - -    G:2 - - - - - - -
        A:2 - - - - - - -    G:2 - - - - - - -
        E:2 - - - - - - -    D:3 - - - - - - -

        B2:3 - - - - - - -   G:2 - - - - - - -
        A:2 - - - - - - -    A:3 - - - - - - -
        B2:3 - - - - - - -   G:2 - - - - - - -
        E:2 - - - - - - -    A:2 - - - - - - -

        D:4 - - - - - - -    B2:3 - - - - - - -
        G:3 - - - - - - -    G:2 - - - - - - -
        A:2 - - - - - - -    G:2 - - - - - - -
        A:3 - - - - - - -    D:2 - - - - - - -
      `) },
    // ---- BASS: cello tide — half notes that walk between the changes -------
    { program: P.CELLO, gain: 0.13, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        D:6 - - - A:4 - - -
        B:6 - - - F#:4 - - -
        G:6 - - - D3:4 - B:3 -
        A:6 - - - E:4 - C#3:3 -
        D:6 - - - F#:4 - A:4 -
        G:6 - - - B:3 - D3:4 -
        E:6 - - - G:4 - B:3 -
        A:6 - - - G:4 - F#:3 E:3

        D:6 - - - A:4 - - -
        B:6 - - - A:3 - F#:4 -
        G:6 - - - D3:4 - E3:3 -
        G:6 - - - Bb:4 - D3:3 -
        F#:6 - - - A:4 - - -
        G:6 - - - B:3 - D3:4 -
        E:6 - - - A:4 - G:3 -
        D:6 - - - - - C#3:3 B:3

        B:6 - - - F#:4 - - -
        G:6 - - - D3:4 - - -
        F#:6 - - - A:4 - - -
        A:6 - - - E:4 - G:3 -
        B:6 - - - F#:4 - A:3 -
        G:6 - - - Bb:4 - - -
        E:6 - - - G:4 - A:3 -
        A:6 - - - G:4 - F#:3 E:3

        D:7 - - - A:4 - F#:4 -
        B:6 - - - F#:4 - - -
        G:6 - - - D3:4 - B:3 -
        G:6 - - - Bb:3 - - -
        F#:6 - - - A:4 - D3:4 -
        G:6 - - - B:3 - - -
        A:6 - - - G:4 - E:4 -
        D:6 - - - A:3 - - -
      `) },
    // ---- SURF: cymbal washes only — an 8-bar swell cycle, no backbeat ------
    { program: 0, gain: 0.07, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        C:3 . . . . . . .
        . . . . R:2 . . .
        R:2 . . . . . . .
        . . . . R:2 . R:2 R:3
        C:2 . . . . . . .
        . . . . R:2 . . .
        R:2 . . . X:2 . . .
        . . R:2 . R:3 . R:4 .
      `) },
  ],
};
