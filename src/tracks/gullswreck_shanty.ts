// 'Gullswreck Shanty' — smugglers' cove tavern. Rolling 6/8 (6 steps/bar) in
// A minor, 96 bpm, swing 0.12. Form AA'BA'' (32 bars): accordion verse, fiddle
// answers in the breaths, relative-major chorus players can hum, then the full
// restatement with a chromatic E7 turn (C-B-Bb-A-G#) — the smuggler's wink.
// PROGRESSION — Verse A:  Am Am G Am | Am F E7 Am
//               Verse A': Am C  G Am | Dm F E7 Am
//               Chorus B: C  G Am F  | C  F G-E7 Am
//               A'' tag:  Am Am G Am | Dm F E7(chromatic) Am
// Bass heaves root(beat1)/fifth(beat2) like a rolling deck, walking the seams;
// boot-stomp kick + tambourine-on-2 + shaker drive the groove.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Gullswreck Shanty', bpm: 96, loopBars: 32, swing: 0.12,
  channels: [
    // ---- LEAD: accordion — the shanty tune. 32 bars of 6 steps (6/8). ----
    { program: P.ACCORDION, gain: 0.17, octave: 4, wave: 'square', pan: -0.1,
      notes: seq(`
        A:7  -    B:4  C5:6 -    B:3
        A:6  -    E:4  G:5  -    E:3
        G:6  -    F#:4 G:5  A:6  B:5
        A:7  -    -    -    .    E:3
        A:6  -    B:4  C5:7 -    D5:5
        E5:8 -    C5:4 A:5  -    G:4
        F:5  -    E:6  D:5  G#:4 -
        A:6  -    -    -    -    .

        A:7  -    B:4  C5:6 -    B:3
        C5:6 -    D5:4 E5:7 -    D5:4
        B:6  -    G:4  B:5  C5:5 D5:6
        E5:8 -    -    C5:4 A:4  -
        F5:7 -    E5:4 D5:6 -    C5:4
        C5:6 -    A:4  F:5  -    A:4
        B:5  -    C5:6 B:5  Bb:5 -
        A:7  -    -    -    .    E:3

        E5:7 -    D5:4 C5:6 -    G:4
        A:5  B:6  -    D5:5 -    B:4
        C5:6 -    B:4  A:6  -    G:4
        A:6  -    -    F:4  -    G:3
        E5:7 -    D5:4 C5:6 -    G:4
        A:5  -    C5:6 D5:5 -    C5:4
        B:6  -    A:4  G#:6 -    E:4
        A:7  -    -    -    E:4  G:5

        A:8  -    B:5  C5:7 -    B:4
        A:7  -    E:4  G:6  -    E:4
        G:7  -    F#:4 G:6  A:6  B:6
        C5:7 -    -    A:4  -    .
        F5:7 -    E5:5 D5:6 -    A:4
        C5:6 -    A:4  F:5  -    D:4
        C5:5 B:6  Bb:5 A:5  G#:6 -
        A:7  -    -    -    .    E:3
      `) },
    // ---- COUNTER: fiddle — answers in the accordion's breaths; thirds in
    //      the chorus; joins the chromatic wink in parallel thirds at the tag.
    { program: P.FIDDLE, gain: 0.12, octave: 4, wave: 'sawtooth', pan: 0.4,
      notes: seq(`
        .    .    .    .    .    .
        .    .    .    .    E5:4 D5:3
        .    .    .    .    .    .
        C5:5 B:4  A:4  G:5  E:3  -
        .    .    .    .    .    .
        .    .    .    .    .    .
        .    .    .    .    .    B:4
        E5:6 -    C5:4 B:5  A:4  -

        .    .    .    .    .    .
        .    .    .    .    G:3  B:4
        .    .    .    .    .    .
        .    .    .    .    E:4  G:5
        A:4  -    -    -    -    -
        A:4  -    -    C5:5 -    -
        D5:4 -    -    -    B:3  -
        C5:6 B:4  A:5  E:4  A:3  -

        G5:6 -    F5:3 E5:5 -    .
        C5:4 D5:5 -    B:4  -    G:3
        E5:5 -    D5:3 C5:5 -    -
        C5:5 -    -    A:4  -    -
        G5:6 -    F5:3 E5:5 -    .
        C5:4 -    E5:5 F5:4 -    E5:3
        D5:5 -    C5:3 B:5  -    -
        C5:6 -    -    -    -    .

        .    .    .    E5:4 -    D5:3
        C5:5 -    -    B:4  -    .
        .    .    .    .    .    .
        E5:5 -    D5:4 C5:5 -    B:4
        A:4  -    -    -    F:4  -
        A:4  -    -    C5:4 -    -
        E5:5 D5:6 Db5:5 C5:5 B:6 -
        C5:5 B:4  A:6  -    E:3  -
      `) },
    // ---- HARMONY: low concertina — one sustained chord-third per bar. ----
    { program: P.ACCORDION, gain: 0.06, octave: 3, wave: 'triangle', pan: 0.15,
      notes: seq(`
        C4:3 - - - - -   C4:3 - - - - -   B:3 - - - - -    C4:3 - - - - -
        C4:3 - - - - -   A:3 - - - - -    G#:3 - - - - -   C4:3 - - - - -
        C4:3 - - - - -   E4:3 - - - - -   B:3 - - - - -    C4:3 - - - - -
        F:3 - - - - -    A:3 - - - - -    G#:3 - - - - -   C4:3 - - - - -
        E4:3 - - - - -   B:3 - - - - -    C4:3 - - - - -   A:3 - - - - -
        E4:3 - - - - -   A:3 - - - - -    B:3 - - G#:3 - - C4:3 - - - - -
        C4:4 - - - - -   C4:3 - - - - -   B:3 - - - - -    C4:3 - - - - -
        F:3 - - - - -    A:3 - - - - -    G#:4 - - - - -   C4:3 - - - - -
      `) },
    // ---- BASS: plucked upright — root/fifth heave, walks the seams. ------
    { program: P.ACOUSTIC_BASS, gain: 0.16, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        A:8  .    .    E3:5 .    A:3
        A:7  .    .    E3:5 .    G:4
        G:7  .    .    D3:5 .    G:3
        A:8  .    A:3  E3:5 .    E:4
        A:7  .    .    E3:5 .    A:3
        F:7  .    .    C3:5 .    F:3
        E:7  .    .    B2:5 .    D3:4
        A:8  .    .    C3:4 D3:4 E3:5

        A:8  .    .    E3:5 .    A:3
        C3:7 .    .    G:5  .    E3:4
        G:7  .    .    D3:5 .    B2:4
        A:8  .    .    E3:5 .    A:3
        D3:7 .    .    A:5  .    D3:3
        F:7  .    .    C3:5 .    F:3
        E:7  .    E:3  B2:5 .    D3:4
        A:8  .    .    E3:4 G:4  B2:5

        C3:8 .    .    G:5  .    C3:3
        G:7  .    .    D3:5 .    B2:4
        A:7  .    .    E3:5 .    A:3
        F:7  .    .    C3:5 .    G:4
        C3:8 .    .    G:5  .    E3:4
        F:7  .    .    C3:5 .    F:3
        G:7  .    G:3  E:6  .    B2:4
        A:8  .    .    E3:5 .    E:4

        A:8  .    .    E3:5 .    A:3
        A:7  .    .    E3:5 .    G:4
        G:7  .    .    D3:5 .    G:3
        A:8  .    A:3  E3:5 .    E:4
        D3:7 .    .    A:5  .    F:4
        F:7  .    .    C3:5 .    F:3
        E:7  .    G#:4 B2:5 .    D3:4
        A:8  .    .    E:4  F#3:4 G#3:5
      `) },
    // ---- TEXTURE: nylon guitar — plucked off-beat chord tones. -----------
    { program: P.NYLON_GUITAR, gain: 0.08, octave: 3, wave: 'triangle', pan: -0.4,
      notes: seq(`
        .   E:4  A:3  .   C4:4 E:3
        .   E:3  A:4  .   C4:3 E:4
        .   D:4  G:3  .   B:4  D:3
        .   E:4  A:3  .   C4:4 .
        .   E:3  A:4  .   C4:4 E:3
        .   A:4  C4:3 .   F:4  A:3
        .   B:4  E:3  .   G#:4 D4:3
        .   E:4  A:3  .   C4:3 .

        .   E:4  A:3  .   C4:4 E:3
        .   E:4  G:3  .   C4:4 E:3
        .   D:4  G:3  .   B:4  D:3
        .   E:3  A:4  .   C4:4 E:3
        .   A:4  D4:3 .   F:4  A:3
        .   A:4  C4:3 .   F:4  A:3
        .   B:4  E:3  .   G#:4 D4:3
        .   E:4  A:3  .   C4:3 .

        .   E:4  G:3  .   C4:4 E:3
        .   D:4  G:3  .   B:4  D:3
        .   E:3  A:4  .   C4:4 E:3
        .   A:4  C4:3 .   F:4  A:3
        .   E:4  G:3  .   C4:4 E:3
        .   A:4  C4:3 .   F:4  A:3
        .   D:4  G:3  .   G#:4 B:3
        .   E:4  A:3  .   C4:3 .

        .   E:4  A:4  .   C4:4 E:3
        .   E:3  A:4  .   C4:3 E:4
        .   D:4  G:3  .   B:4  D:3
        .   E:4  A:3  .   C4:4 .
        .   A:4  D4:3 .   F:4  A:3
        .   A:4  C4:3 .   F:4  A:3
        .   B:4  E:3  .   G#:4 D4:3
        .   E:4  A:3  .   .    .
      `) },
    // ---- DRUMS: boot-stomp kick, tambourine on 2, shaker between (8 bars).
    { program: 0, gain: 0.13, octave: 3, wave: 'square', drums: true,
      notes: seq(`
        K:7 X:3 X:4 B:7 X:2 X:5
        K:6 X:3 X:4 B:7 X:2 B:3
        K:7 X:3 X:4 B:7 X:2 X:5
        K:6 X:3 B:4 B:7 X:3 X:5
        K:7 X:3 X:4 B:7 X:2 X:5
        K:6 X:3 X:4 B:7 X:2 B:3
        K:7 X:3 X:4 B:7 X:3 X:5
        K:7 X:4 B:5 B:6 B:7 B:8
      `) },
  ],
};
