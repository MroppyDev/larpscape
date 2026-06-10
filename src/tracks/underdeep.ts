// 'Underdeep' — the first cavern.
//
// D minor, 52 bpm, 32 bars. OSRS-style cavern orchestration ("Underground" /
// "Dunjun"): a breathy pan flute calls into the dark over lush slow strings,
// dark choir oohs answer from the walls, contrabass pedals with slow chromatic
// walks, a distant horn doubles the final restatement, celesta drips like
// cave water, timpani rolls mark the section turns, deep toms loop an 8-bar
// heartbeat.
//
// Motif: "call into the dark" — a rising D-F-G-A that hangs unresolved, then
// falls back G-F-E-D like an echo dying out. Form: A (1-8) states it over
// Dm-Bb-Gm-A; A2 (9-16) sequences it up a third (F-A-Bb-C) and lands on a
// DECEPTIVE cadence (A7 -> Bb); B (17-24) sinks into borrowed Bbm / Fm / Cm /
// Ab — the cavern widens — before Asus/A7 turns for home; A' (25-32) restates
// the call an octave up at full voice, then empties out while the choir sings
// the world leitmotif (C E G A G E) transposed to minor: D F A Bb A F.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Underdeep', bpm: 52, loopBars: 32,
  channels: [
    // Lead — breathy pan flute, slow fragments with long rests (full 32-bar form)
    { program: P.PAN_FLUTE, gain: 0.16, octave: 4, wave: 'triangle', pan: 0.15, notes: seq(`
      D:5 - - - F:6 - - -
      G:7 - - - - - A:6 -
      A:7 - - - - - - -
      G:5 - F:4 - E:3 - - -
      D:4 - - - - - - -
      . . . . F:3 - G:4 -
      A:6 - - - E:5 - - -
      D:5 - - - - - . .
      F:5 - - - A:6 - - -
      A#:7 - - - - - C5:6 -
      C5:8 - - - - - - -
      A#:6 - A:5 - G:4 - - -
      F:5 - - - - - - -
      . . . . A:4 - A#:5 -
      A:6 - - - C#5:5 - - -
      D5:6 - - - - - . .
      F:6 - - - C#:5 - - -
      A#3:4 - - - - - - -
      F:5 - G#:6 - - - - -
      C5:7 - - - - - - -
      G:6 - - - D#:5 - - -
      C:5 - - - D#:4 - - -
      A:6 - - - G:5 - - -
      E:6 - - - A:4 - C#5:5 -
      D5:7 - - - F5:8 - - -
      G5:8 - - - - - A5:7 -
      A5:9 - - - - - - -
      G5:7 - F5:5 - E5:4 - - -
      D5:5 - - - - - - -
      . . . . . . . .
      . . . . A:4 - E:3 -
      D:4 - - - - - - -`) },
    // Counter — dark choir oohs answering in the phrase gaps; sings the world
    // leitmotif in minor (D F A Bb A F) at bars 29-31 as the lead falls silent.
    { program: P.VOICE_OOH, gain: 0.11, octave: 3, wave: 'sine', pan: -0.3, notes: seq(`
      . . . . . . . .
      . . . . . . . .
      . . . . D4:4 - C4:3 -
      A:4 - - - - - - -
      . . . . . . . .
      . . . . . . . .
      . . . . C#4:3 - - -
      D4:4 - - - A:3 - - -
      . . . . . . . .
      . . . . . . . .
      . . . . A:4 - - -
      . . . . . . . .
      D4:4 - C4:3 - - - - -
      A#:3 - - - - - - -
      G:4 - - - E:3 - - -
      F4:4 - - - - - - -
      C#4:4 - - - - - - -
      A#:3 - - - - - - -
      C4:4 - - - - - - -
      G#:3 - - - - - - -
      D#4:4 - - - - - - -
      C4:3 - - - - - - -
      E4:4 - - - - - - -
      G:3 - - - - - - -
      . . . . . . . .
      . . . . . . . .
      . . . . F4:4 - E4:4 -
      . . . . . . . .
      D4:5 - F4:6 - A4:7 - A#4:7 -
      A4:5 - - - F4:4 - - -
      D4:3 - - - - - - -
      A:3 - - - - - - -`) },
    // Drone — lush slow strings, one low chord tone at a time, the cavern's breath
    { program: P.SLOW_STRINGS, gain: 0.09, octave: 3, wave: 'sine', pan: 0.25, notes: seq(`
      A:3 - - - - - - -
      - - - - - - - -
      F:3 - - - - - - -
      - - - - - - - -
      A#:3 - - - - - - -
      - - - - - - - -
      E:3 - - - - - - -
      F:3 - - - - - - -
      A:3 - - - - - - -
      F:3 - - - - - - -
      C4:3 - - - - - - -
      G:3 - - - - - - -
      A:3 - - - - - - -
      A#:3 - - - - - - -
      G:3 - - - - - - -
      F:3 - - - - - - -
      C#4:3 - - - - - - -
      - - - - - - - -
      C4:3 - - - - - - -
      - - - - - - - -
      D#4:3 - - - - - - -
      C4:2 - - - - - - -
      E:3 - - - - - - -
      - - - - - - - -
      A:4 - - - - - - -
      - - - - - - - -
      D4:4 - - - - - - -
      C#4:3 - - - - - - -
      F:3 - - - - - - -
      - - - - - - - -
      A:2 - - - - - - -
      D:3 - - - - - - -`) },
    // Bass — woody contrabass: long pedals broken by low octave drops and slow
    // chromatic walks (G -> G# -> A into the dominant; F -> G into Gm)
    { program: P.CONTRABASS, gain: 0.14, octave: 2, wave: 'sine', notes: seq(`
      D:6 - - - - - - -
      - - - - - - D1:3 -
      A#:5 - - - - - - -
      - - - - F:3 - G:4 -
      G:5 - - - - - - -
      - - - - G:3 - G#:3 -
      A:5 - - - - - - -
      D:6 - - - - - A:3 -
      D:5 - - - - - - -
      A#:5 - - - - - - -
      F:5 - - - - - - -
      C:5 - - - - - A:3 -
      D:5 - - - - - - -
      G:5 - - - A#:3 - - -
      A:6 - - - - - E:4 -
      A#:5 - - - - - - -
      A#:5 - - - - - - -
      - - - - - - F:3 -
      F:5 - - - - - - -
      - - - - C:3 - - -
      C:5 - - - - - - -
      G#:5 - - - D#:3 - - -
      A:6 - - - - - - -
      - - - - E:3 - C#:4 -
      D:6 - - - - - - -
      - - - - - - D1:3 -
      F:5 - - - - - - -
      A:5 - - - - - E:3 -
      D:6 - - - - - - -
      - - - - - - - -
      A:4 - - - - - - -
      D:5 - - - - - - -`) },
    // Distant horn — silent through A, sustains dark tones under the borrowed
    // B-section chords, then doubles the A' restatement an octave below the lead
    { program: P.HORN, gain: 0.09, octave: 3, wave: 'triangle', pan: -0.2, notes: seq(`
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      A:3 - - - - - - -
      A#:4 - - - - - - -
      F:4 - - - - - - -
      - - - - - - - -
      G#:4 - - - - - - -
      - - - - - - - -
      G:4 - - - - - - -
      - - - - - - - -
      A:4 - - - - - - -
      - - - - - - C#:3 -
      D4:5 - - - F4:6 - - -
      G4:6 - - - - - A4:5 -
      A4:7 - - - - - - -
      G4:5 - F4:4 - E4:3 - - -
      D4:4 - - - - - - -
      . . . . . . . .
      . . . . . . . .
      D:3 - - - - - - -`) },
    // Drips — celesta, water falling from the cavern roof (8-bar loop,
    // D/F/A/E pitches that glint against whatever chord is below)
    { program: P.CELESTA, gain: 0.07, octave: 5, wave: 'sine', pan: 0.4, notes: seq(`
      . . . D6:3 . . . .
      . . . . . . A:2 .
      . . . . . . . .
      F:3 . . . . . . .
      . . . . . D6:2 . .
      . . . . . . . .
      . . E:2 . . . . .
      . . . . . . A6:3 .`) },
    // Timpani — soft rolls marking the section turns (16-bar loop: pickup
    // into bars 8/24, dominant-to-tonic strokes into bars 16/32)
    { program: P.TIMPANI, gain: 0.10, octave: 2, wave: 'sine', pan: -0.15, notes: seq(`
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . D:3 .
      . . . . A:3 . A:4 .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      . . . . . . . .
      A:4 . A:3 . D:5 - - -`) },
    // Percussion — deep toms, an 8-bar heartbeat that fills into each
    // section turn (loops independently beneath the 32-bar form)
    { program: 0, gain: 0.08, octave: 3, wave: 'square', drums: true, pan: -0.1, notes: seq(`
      T:4 . . . . . . .
      . . . . . . T:2 .
      . . . . T:3 . . .
      . . . . . . . .
      T:4 . . . . . . .
      . . . . . . . .
      . . T:2 . . . . .
      T:3 . T:2 . U:2 . . .`) },
  ],
};
