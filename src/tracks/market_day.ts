// 'Market Day' — market bustle. Fast, busy, joyous. OSRS faire-band scoring.
// Form: A (8) A' (8, sequenced up a third, deceptive cadence) B (8, D minor,
// lyrical lead over pedal bass while the harpsichord takes the chatter) A'' (8,
// theme fortissimo, peak on high A, run back to the top). Key: F major.
// Motif: "market call" — leap-and-chatter figure F-G-A...C6, answered a bar
// later by the settle A-G-F-D. Harpsichord answers the recorder between
// phrases (call-and-response between stalls). World leitmotif (C E G A G E)
// appears transposed to F (F A C D C A) in the harpsichord at the start of A''.
// Orchestration ("Yesteryear"/"Faire" style): breathy recorder crier, plucky
// harpsichord stall-keeper, lute-like nylon-guitar off-beat strums (picked
// arpeggios in B), a soft accordion drone underneath, woody acoustic bass,
// and tambourine/shaker/hand-drum street percussion.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Market Day', bpm: 150, loopBars: 32, swing: 0.16,
  channels: [
    // ---- Recorder lead (the crier) -------------------------------- 256 steps
    { program: P.RECORDER, gain: 0.18, octave: 5, wave: 'square', pan: 0.2,
      notes: seq(
        // A — theme (bars 1-8): F Dm Gm C7 F D7 Gm-C7 F
        'F:6 .  F:5 G   A:7  .   C6:9 .  ' +
        'A:7 G  F:6 .   D:5  .   F:7  .  ' +
        'G:6 .  G:5 A   Bb:7 .   D6:9 .  ' +
        'C6:7 Bb:6 A:6 G E:5 .   G:6  .  ' +
        'F:6 .  F:5 G   A:7  .   C6:9 .  ' +
        'D6:8 C6:7 A:6 F#:5 .  A:6 .  .  ' +
        'G:6 A  Bb:7 C6 D6:8 .   E6:8 .  ' +
        'F6:9 -  C6:6 A:5 F:7 -  .   .   ' +
        // A' — sequence up a third (bars 9-16), deceptive cadence to Dm
        'A:6 .  A:5 Bb  C6:7 .   F6:9 .  ' +
        'D6:7 C6:6 A:6 . F:5 .   A:7  .  ' +
        'Bb:6 . Bb:5 C6 D6:7 .   G6:9 .  ' +
        'E6:7 D6:6 C6:6 Bb G:5 . Bb:6 .  ' +
        'D6:7 . Bb:5 C6 D6:7 .   F6:8 .  ' +
        'E6:7 C6:6 A:6 . F:5 .   A:6  .  ' +
        'G:5 Bb:6 D6:7 F6:8 E6:7 C6:6 Bb:6 G:5 ' +
        'A:8 -  -   F:5 D:4 .    .    .  ' +
        // B — D minor, lyrical (bars 17-24): Dm Bb Gm A7 Dm Bb Gm C7
        'D6:7 - -   C6  A:6  -   -    .  ' +
        'Bb:6 - -   C6  D6:7 -   -    .  ' +
        'G:6 -  A   Bb:6 C6:7 -  -    .  ' +
        'C#6:8 - -  -   A:5  -   E:6  .  ' +
        'D6:7 - -   E6  F6:8 -   -    .  ' +
        'D6:7 - C6:6 -  Bb:6 -   -    .  ' +
        'A:6 -  Bb:6 -  G:5  -   -    .  ' +
        'G:5 A:6 Bb:6 C6:7 D6:7 E6:8 .  . ' +
        // A'' — theme returns, accented, peak (bars 25-32)
        'F:7 .  F:6 G   A:8  .   C6:9 .  ' +
        'A:8 G:7 F:7 .  D:6  .   F:7  .  ' +
        'G:7 .  G:6 A   Bb:8 .   D6:9 .  ' +
        'E6:8 D6:7 C6:7 Bb A:6 G:5 E:5 . ' +
        'D6:8 . Bb:6 C6 D6:8 .   F6:9 .  ' +
        'A6:9 - F#6:7 D6:6 . A:5 .    .  ' +
        'G:6 Bb:7 D6:7 F6:8 E6:7 C6:6 Bb:5 G:4 ' +
        'F:7 -  A:5 C6:6 F6:8 -  -    .  ') },

    // ---- Harpsichord counter (the answering stall) ---------------- 256 steps
    { program: P.HARPSICHORD, gain: 0.12, octave: 5, wave: 'sawtooth', pan: -0.4,
      notes: seq(
        // A — short answers in the lead's gaps
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  F:4  A:5  C6:5 ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  E:4  .    C6:5 ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  .    C6:5 A:5 ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  .    A:5  C6:5 ' +
        // A'
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  D:4  F:5  A:5 ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  E:4  .    C6:5 ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  C6:4 . A:4 .    F:4 ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  D6:5 C6:4 A:4 ' +
        // B — harpsichord takes the chatter under the long lead notes
        '.  .  D:4 E:4 F:5  .    A:5  .  ' +
        '.  .  Bb:4 . D:5  .    F:5  .  ' +
        '.  .  G:4 A:4 Bb:5 .    D6:5 .  ' +
        '.  .  E:4 .  G:5  .    C#6:6 . ' +
        '.  .  D:4 E:4 F:5  .    A:5  .  ' +
        '.  .  Bb:4 . F:5  .    D6:5 .  ' +
        '.  .  G:4 .  Bb:5 .    D6:5 .  ' +
        'E:4 .  G:5 .  Bb:5 .   C6:6 .  ' +
        // A'' — leitmotif quote (C E G A G E -> F A C6 D6 C6 A), then answers
        'F:5 A:5 C6:6 D6:6 C6:5 A:4 .  . ' +
        '.  .  .  .  .  .    F:5  A:5 ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  .    C6:5 .   ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  D6:5 .  A:5  F#:4 ' +
        '.  .  .  .  .  .    .    .   ' +
        '.  .  .  .  .  C6:5 D6:5 E6:6') },

    // ---- Nylon guitar / lute (off-beat strums; picked arps in B) -- 256 steps
    { program: P.NYLON_GUITAR, gain: 0.10, octave: 4, wave: 'triangle', pan: 0.35,
      notes: seq(
        // A: F Dm Gm C7 F D7 Gm-C7 F
        '.  A:4  .  C5:4 .  A:3  .  C5:4 ' +
        '.  F:4  .  A:4  .  F:3  .  A:4  ' +
        '.  Bb:4 .  D5:4 .  Bb:3 .  D5:4 ' +
        '.  E:4  .  Bb:4 .  E:3  .  Bb:4 ' +
        '.  A:4  .  C5:4 .  A:3  .  C5:4 ' +
        '.  F#:4 .  C5:4 .  F#:3 .  C5:4 ' +
        '.  Bb:4 .  D5:4 .  E:4  .  Bb:4 ' +
        '.  A:4  .  C5:4 .  A:3  .  C5:4 ' +
        // A': F Dm Gm C7 Bb F Gm-C7 Dm
        '.  A:4  .  C5:4 .  A:3  .  C5:4 ' +
        '.  F:4  .  A:4  .  F:3  .  A:4  ' +
        '.  Bb:4 .  D5:4 .  Bb:3 .  D5:4 ' +
        '.  E:4  .  Bb:4 .  E:3  .  Bb:4 ' +
        '.  D:4  .  F:4  .  D:3  .  F:4  ' +
        '.  A:4  .  C5:4 .  A:3  .  C5:4 ' +
        '.  Bb:4 .  D5:4 .  E:4  .  Bb:4 ' +
        '.  F:4  .  A:4  .  F:3  .  A:4  ' +
        // B: gentle picked arpeggios (lute texture under the lyrical lead)
        'D3:4 .  A3:3 .  D:4  .  A3:3 .  ' +
        'Bb2:4 . F3:3 .  Bb3:4 . F3:3 .  ' +
        'G3:4 .  D:3  .  Bb3:4 . D:3  .  ' +
        'A3:4 .  C#:3 .  G:4  .  E:3  .  ' +
        'D3:4 .  A3:3 .  D:4  .  A3:3 .  ' +
        'Bb2:4 . F3:3 .  Bb3:4 . F3:3 .  ' +
        'G3:4 .  D:3  .  Bb3:4 . D:3  .  ' +
        'G3:4 .  Bb3:4 . C:4  .  E:4  .  ' +
        // A'': F Dm Gm C7 Bb D7 Gm-C7 F
        '.  A:4  .  C5:4 .  A:3  .  C5:4 ' +
        '.  F:4  .  A:4  .  F:3  .  A:4  ' +
        '.  Bb:4 .  D5:4 .  Bb:3 .  D5:4 ' +
        '.  E:4  .  Bb:4 .  E:3  .  Bb:4 ' +
        '.  D:4  .  F:4  .  D:3  .  F:4  ' +
        '.  F#:4 .  C5:4 .  F#:3 .  C5:4 ' +
        '.  Bb:4 .  D5:4 .  E:4  .  Bb:4 ' +
        '.  A:4  .  C5:5 .  A:4  .  C5:3 ') },

    // ---- Accordion drone (sustained guide tones, whole track) ----- 256 steps
    { program: P.ACCORDION, gain: 0.06, octave: 4, wave: 'sawtooth', pan: -0.2,
      notes: seq(
        // A: F Dm Gm C7 F D7 Gm-C7 F
        'A:3  - - - - - - - ' +
        'F:3  - - - - - - - ' +
        'Bb:3 - - - - - - - ' +
        'E:3  - - - - - - - ' +
        'A:3  - - - - - - - ' +
        'F#:3 - - - - - - - ' +
        'Bb:3 - - - E:3 - - - ' +
        'A:3  - - - - - - - ' +
        // A': F Dm Gm C7 Bb F Gm-C7 Dm
        'A:3  - - - - - - - ' +
        'F:3  - - - - - - - ' +
        'Bb:3 - - - - - - - ' +
        'E:3  - - - - - - - ' +
        'D:3  - - - - - - - ' +
        'A:3  - - - - - - - ' +
        'Bb:3 - - - E:3 - - - ' +
        'F:3  - - - - - - - ' +
        // B: Dm Bb Gm A7 Dm Bb Gm C7 — bellows swell a touch
        'F:4  - - - - - - - ' +
        'D:4  - - - - - - - ' +
        'Bb:4 - - - - - - - ' +
        'C#:4 - - - - - - - ' +
        'F:4  - - - - - - - ' +
        'D:4  - - - - - - - ' +
        'Bb:4 - - - - - - - ' +
        'Bb:4 - - - C5:4 - - - ' +
        // A'': F Dm Gm C7 Bb D7 Gm-C7 F
        'A:3  - - - - - - - ' +
        'F:3  - - - - - - - ' +
        'Bb:3 - - - - - - - ' +
        'E:3  - - - - - - - ' +
        'D:3  - - - - - - - ' +
        'F#:3 - - - - - - - ' +
        'Bb:3 - - - E:3 - - - ' +
        'A:4  - - - - - - - ') },

    // ---- Acoustic bass, walking (woody OSRS low end) -------------- 256 steps
    { program: P.ACOUSTIC_BASS, gain: 0.16, octave: 3, wave: 'triangle', pan: -0.1,
      notes: seq(
        // A — walking quarters with octave pops
        'F:6  . A:4  . C4:5 . D4:4 . ' +
        'D:6  . F:4  . A:5  . C4:4 . ' +
        'G:6  . A:4  . Bb:5 . B:4  . ' +
        'C4:6 . Bb:4 . G:5  . E:4  . ' +
        'F:6  . A:4  . C4:5 . D4:4 . ' +
        'D:6  . F#:4 . A:5  . C4:4 . ' +
        'G:6  . Bb:4 . C4:5 . E:4  . ' +
        'F:6  . C4:5 . D4:4 . E4:5 . ' +
        // A'
        'F:6  . A:4  . C4:5 . D4:4 . ' +
        'D:6  . F:4  . A:5  . C4:4 . ' +
        'G:6  . A:4  . Bb:5 . B:4  . ' +
        'C4:6 . Bb:4 . G:5  . E:4  . ' +
        'Bb2:6 . D:4 . F:5  . G:4  . ' +
        'F:6  . A:4  . C4:5 . C:4  . ' +
        'G:6  . Bb:4 . C4:6 . Bb:4 . ' +
        'D:6  . F:4  . A:5  . D4:6 . ' +
        // B — pedal halves (contrast), walk-up into the A'' return
        'D:5   - - - D:4   - -    -   ' +
        'Bb2:5 - - - Bb2:4 - -    -   ' +
        'G:5   - - - G:4   - -    -   ' +
        'A:5   - - - A:4   - C#:4 E:4 ' +
        'D:5   - - - D:4   - -    -   ' +
        'Bb2:5 - - - Bb2:4 - -    -   ' +
        'G:5   - - G:3 G:4 - -    -   ' +
        'C4:6  . G:4 . C:5 D:4 E:4 .  ' +
        // A''
        'F:7  . A:5  . C4:6 . D4:5 . ' +
        'D:7  . F:5  . A:6  . C4:5 . ' +
        'G:7  . A:5  . Bb:6 . B:5  . ' +
        'C4:7 . Bb:5 . G:6  . E:5  . ' +
        'Bb2:7 . D:5 . F:6  . G:5  . ' +
        'D:7  . F#:5 . A:6  . C4:5 . ' +
        'G:7  . Bb:5 . C4:6 D4:4 E4:5 . ' +
        'F:7  . A:5  . F:6  . E:4  . ') },

    // ---- Street percussion: tambourine, shaker, hand drum --------- 64 steps
    { program: 0, gain: 0.12, octave: 3, wave: 'square', drums: true,
      notes: seq(
        'K:6 X:2 B:5 X:3 K:4 X:2 B:5 X:3 ' +
        'K:6 X:2 B:5 X:3 X:4 K:3 B:5 M:4 ' +
        'K:6 X:2 B:5 X:3 K:4 X:2 B:5 X:3 ' +
        'K:6 X:2 B:5 X:3 X:4 K:3 B:5 M:4 ' +
        'K:6 X:2 B:5 X:3 K:4 X:2 B:5 X:3 ' +
        'K:6 X:2 B:5 X:3 X:4 K:3 B:5 M:4 ' +
        'K:6 X:2 B:5 X:3 K:4 X:2 B:5 X:3 ' +
        'K:6 X:2 B:5 .   T:5 T:6 U:6 B:7 ') },
  ],
};
