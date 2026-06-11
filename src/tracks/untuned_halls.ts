// 'Untuned Halls' — Untuned Mine, floors 1-2. Percussive D-minor grind at 80
// bpm: hammered dulcimer states a strike-rebound-ring motif over a 7-step
// pizzicato cell that phases against the 4/4 bar (7s against 4s), while
// tubular bells ring a "wrong" major second off the lead's landings — the
// ore answering out of tune. Bowed-pad drone + mine-hammer kit underneath.
//
// FORM (24 bars, ABA'): A (1-8) theme low · B (9-16) lifted to the relative
// major, sparser and more lyrical · A' (17-24) restate fuller, climax on the
// b2 cluster in bar 19, ghost half-step seam back into the loop.
// PROGRESSION — A: | Dm | Dm | Eb/D | Dm | Gm | Gm | A7b9 | Dm |
//               B: | Bb  | Bb | Gm   | Gm | Em7b5 | Eb | A7b9 | A7b9 |
//               A': | Dm | Dm | Eb/D | Dm | Gm | Eb | A7b9 | Dm |
// The Eb-over-D pedal (bars 3/19) and the bell seconds are the Offnote in
// the rock; the pizzicato 7-cell never lines up twice the same way.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Untuned Halls', bpm: 80, loopBars: 24,
  channels: [
    // ---- LEAD: hammered dulcimer (GM 15) — strike, rebound, ring ---------
    { program: 15, gain: 0.16, octave: 4, wave: 'triangle', pan: -0.1,
      notes: seq(
      // A — theme stated low
      'D:8  .    D:3  F:6  E:4  .    A:7  -   ' + //  1 Dm   motif: strike-ghost-reach
      'G:6  F:5  E:3  D:6  .    .    D:3  .   ' + //  2 Dm   rebound falls home
      'Eb:7 .    Eb:3 F:5  D:4  .    Eb:6 -   ' + //  3 Eb/D the wrong ring — b2 over pedal
      'D:6  -    .    .    A3:3 C:4  D:5  .   ' + //  4 Dm   settle, low pickup
      'G:8  .    G:3  Bb:6 A:4  .    D5:7 -   ' + //  5 Gm   motif sequenced up a 4th
      'C5:6 Bb:5 A:3  G:6  .    .    G:3  .   ' + //  6 Gm
      'A:7  .    Bb:6 A:4  G:3  .    E:6  .   ' + //  7 A7b9 the b9 rub
      'D:7  -    -    .    .    .    C:3  D:4 ' + //  8 Dm   breath; ghost pickup
      // B — lifted, sparser, lyrical
      'F:7  .    D:4  F:5  Bb:8 -    .    .   ' + //  9 Bb   theme inverted upward
      'A:6  -    Bb:5 A:4  F:5  .    D:3  .   ' + // 10 Bb
      'G:6  .    Bb:5 .    D5:7 -    C5:5 Bb:4 ' + // 11 Gm   answer climbs
      'A:5  G:4  -    .    .    .    G:3  A:3 ' + // 12 Gm   exhale, ghost turn
      'Bb:7 .    A:5  G:4  E:5  .    .    .   ' + // 13 Em7b5 darkening
      'Eb:6 -    F:5  G:6  Bb:4 .    G:3  .   ' + // 14 Eb   bIII glow
      'A:7  -    C#5:6 .   Bb:5 A:4  E:4  .   ' + // 15 A7b9 leading tone bites
      'E:6  -    -    .    C#:3 .    D:4  .   ' + // 16 A7b9 leans home
      // A' — restate fuller, peak on the wrong ring
      'D:8  .    D:3  F:6  E:4  .    A:8  -   ' + // 17 Dm   theme returns harder
      'G:6  F:5  E:3  D:6  .    F:4  G:5  .   ' + // 18 Dm   tail varied upward
      'Eb:8 .    F:5  Eb:4 D:6  -    Eb:5 .   ' + // 19 Eb/D CLIMAX — loudest wrong ring
      'D:6  -    .    .    D5:4 C5:5 A:4  .   ' + // 20 Dm   answer drops from above
      'G:8  .    G:3  Bb:6 A:4  .    D5:8 -   ' + // 21 Gm
      'Eb5:7 -   D5:5 C5:4 Bb:6 .    G:3  .   ' + // 22 Eb   long fall through bIII
      'A:7  Bb:8 A:6  G:4  E:5  .    C#:4 .   ' + // 23 A7b9 b9 hammered, then hush
      'D:8  -    -    .    .    .    A3:2 C:3 '   // 24 Dm   ghost pickup loops to bar 1
    ) },
    // ---- WRONG RING: tubular bells a major 2nd off the lead's landings ---
    { program: P.TUBULAR_BELLS, gain: 0.07, octave: 5, wave: 'sine', pan: 0.45,
      notes: seq(
      '.    .    .    .    .    .    E:3  .   ' + //  1 E vs D — the ore answers wrong
      '.    .    .    .    .    .    .    D:2 ' + //  2 drip
      'F:4  .    .    .    .    .    .    .   ' + //  3 F vs Eb
      '.    .    .    .    .    .    E:3  F:3 ' + //  4 cluster drip pair
      '.    .    .    .    .    .    A:3  .   ' + //  5 A vs G
      '.    .    .    .    .    .    .    .   ' + //  6
      'Bb:4 .    .    .    .    .    .    .   ' + //  7 b9 ring
      '.    .    E:2  .    .    .    .    .   ' + //  8 faint drip in the breath
      '.    .    .    .    C:3  .    .    .   ' + //  9 C vs Bb
      '.    .    .    .    .    .    .    .   ' + // 10
      '.    .    .    .    .    .    A:3  .   ' + // 11
      '.    .    .    .    G:2  A:2  .    .   ' + // 12 seconds drip together
      'F:3  .    .    .    .    .    .    .   ' + // 13
      '.    .    .    .    .    .    F:3  .   ' + // 14 F vs Eb again
      '.    .    Bb:4 .    .    .    .    .   ' + // 15
      '.    .    .    .    D:3  .    .    .   ' + // 16 D vs C# — pre-echo of home
      '.    .    .    .    .    .    E:4  .   ' + // 17
      '.    .    .    .    .    .    .    D:2 ' + // 18
      'F:5  .    .    .    .    .    .    .   ' + // 19 loudest ring at the climax
      '.    .    .    .    E:3  .    .    .   ' + // 20
      '.    .    .    .    .    .    A:3  .   ' + // 21
      'F:4  .    .    .    .    .    .    .   ' + // 22 F vs Eb5 — high vs low rub
      '.    .    Bb:4 .    .    .    .    .   ' + // 23
      '.    .    .    .    E:2  .    D:3  .   '   // 24 last drips fade into the seam
    ) },
    // ---- 7-CELL: pizzicato in two 7-step groupings (14-step grid) --------
    // Phases against the 8-step bar — realigns only once every 7 bars.
    { program: P.PIZZICATO, gain: 0.12, octave: 3, wave: 'triangle', pan: 0.25,
      notes: seq(
      'D:8 .   D:3 F:5 A:4 .   E:3 ' + // cell a (7): hammer, rebound, wrong tail
      'D:6 F:4 .   A:5 .   E:3 .   '   // cell b (7): answer with more air
    ) },
    // ---- BASS: contrabass — pedal pulls and walking turns ----------------
    { program: P.CONTRABASS, gain: 0.15, octave: 2, wave: 'sine', pan: 0,
      notes: seq(
      'D:7  .    .    .    D:3  .    A:5  .   ' + //  1 Dm
      'D:6  .    .    .    C:4  .    D:5  .   ' + //  2 Dm  b7 underturn
      'D:6  .    Eb:5 .    D:4  .    Eb:5 .   ' + //  3 Eb/D pedal grinds the b2
      'D:6  .    .    .    F:4  G:4  A:5  .   ' + //  4 Dm  walks up into Gm
      'G:7  .    .    .    D:3  .    G:5  .   ' + //  5 Gm
      'G:6  .    .    .    F:4  .    E:4  .   ' + //  6 Gm  stepwise toward A
      'A:7  .    .    .    E:4  .    C#:4 .   ' + //  7 A7b9
      'D:6  .    .    .    D:3  C:3  Bb:4 A:4 ' + //  8 Dm  walkdown into Bb
      'Bb:7 .    .    .    F:4  .    Bb:5 .   ' + //  9 Bb
      'Bb:6 .    .    .    A:4  .    G:4  .   ' + // 10 Bb  walks to Gm
      'G:6  .    .    .    D:3  .    G:5  .   ' + // 11 Gm
      'G:6  .    .    .    F:3  .    E:4  .   ' + // 12 Gm
      'E:6  .    .    .    Bb:4 .    E:4  .   ' + // 13 Em7b5 tritone pop
      'Eb:6 .    .    .    Bb:4 .    G:4  .   ' + // 14 Eb
      'A:7  .    .    .    E:4  .    A:5  .   ' + // 15 A7b9
      'A:6  .    G:3  .    F:4  .    E:4  .   ' + // 16 A7b9 descent into D
      'D:7  .    .    .    D:3  .    A:5  .   ' + // 17 Dm
      'D:6  .    .    .    C:4  .    D:5  .   ' + // 18 Dm
      'D:6  .    Eb:5 .    D:4  .    Eb:5 .   ' + // 19 Eb/D climax pedal
      'D:6  .    .    .    F:4  G:4  A:5  .   ' + // 20 Dm
      'G:7  .    .    .    D:3  .    G:5  .   ' + // 21 Gm
      'Eb:6 .    .    .    Bb:4 .    C:4  .   ' + // 22 Eb  leans to A
      'A:7  .    .    .    E:4  .    C#:4 .   ' + // 23 A7b9
      'D:6  .    .    .    A:3  .    D:4  Eb:3'   // 24 Dm  ghost b2 rub into the loop
    ) },
    // ---- DRONE: bowed pad — low rumble, shifts with the harmony ----------
    { program: P.BOWED_PAD, gain: 0.06, octave: 2, wave: 'sine', pan: -0.3,
      notes: seq(
      'D:3 - - - - - - -   - - - - - - - -   D:3 - - - - - - -   - - - - - - - -  ' + //  1-4  D pedal
      'G:3 - - - - - - -   - - - - - - - -   A:3 - - - - - - -   D:3 - - - - - - - ' + //  5-8  Gm A D
      'Bb:3 - - - - - - -  - - - - - - - -   G:3 - - - - - - -   - - - - - - - -  ' + //  9-12 Bb Gm
      'Bb:3 - - - - - - -  - - - - - - - -   A:3 - - - - - - -   - - - - - - - -  ' + // 13-16 Bb (over Em7b5/Eb) A
      'D:3 - - - - - - -   - - - - - - - -   Eb:3 - - - - - - -  D:3 - - - - - - - ' + // 17-20 D, Eb shadow at climax
      'G:3 - - - - - - -   Eb:3 - - - - - - - A:3 - - - - - - -  D:2 - - - - - - - '   // 21-24 Gm Eb A D, fading
    ) },
    // ---- DRUMS: mine-hammer kit — kick pick, sidestick tinks, drip ghosts -
    { program: 0, gain: 0.12, octave: 3, wave: 'square', drums: true,
      notes: seq(
      'K:7 X:2 M:5 X:2 K:4 X:2 M:6 X:2 ' + // 1 pick falls, tink answers
      'K:7 X:2 M:5 M:2 K:4 X:2 M:6 X:3 ' + // 2 ghost double-tink
      'K:7 X:2 M:5 X:2 K:4 X:2 M:6 X:2 ' + // 3
      'K:7 X:2 M:5 X:2 T:5 T:3 M:6 .   ' + // 4 low tom rumble at the turn
      'K:7 X:2 M:5 X:2 K:4 X:2 M:6 X:2 ' + // 5
      'K:7 X:2 M:5 M:3 K:4 X:2 M:6 X:2 ' + // 6
      'K:7 X:2 M:5 X:2 K:4 M:3 M:6 X:2 ' + // 7 extra drip-tick
      'K:7 M:3 M:5 T:4 T:6 .   M:7 X:3 '   // 8 rumble fill back to the pick
    ) },
  ],
};
