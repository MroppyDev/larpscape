// 'Sunscorch' — the desert. D phrygian dominant (D Eb F# G A Bb C):
// heat-shimmer mode, recomposed as a classic OSRS desert arrangement
// ("Al Kharid" / "Desert Voyage" school) for the OSRS soundfont:
//   shanai lead (snake-charmer line with ornamental turns), oboe answers,
//   sitar plucking a hypnotic drone ostinato, harp glints on the drone tones,
//   lush slow strings shimmering underneath, woody acoustic bass drone,
//   and a hand-drum groove of low/high toms, shaker and tambourine.
//
// FORM (32 bars): A (1-8, theme) / A' (9-16, varied + run) /
//   B (17-24, G minor — leitmotif quote in the oboe) / A'' (25-32, theme
//   an octave up, dominant run resolving back to bar 1).
// MOTIF: "D . . Eb F# . Eb D | C . D . A" — a coil up to F# that slumps
//   back through the flat second; sequenced up a fifth in bars 5-6,
//   restated an octave high in A''.
// LEITMOTIF: bars 17-18, counter line — C E G A G E recast in G minor
//   (G Bb D Eb D Bb G), "rise, reach, settle" under a desert sun.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Sunscorch', bpm: 96, loopBars: 32, swing: 0.08,
  channels: [
    // ---- LEAD: shanai — the OSRS double-reed snake-charmer (defines the 32-bar loop) ----
    { program: P.SHANAI, gain: 0.18, octave: 5, wave: 'sawtooth', pan: 0.15,
      notes: seq(`
        D:8  -    -    D#   F#:7 -    D#   D:5
        C:6  -    D    -    A4:5 -    -    .
        D:7  -    -    D#   F#:7 -    G    A:8
        A#:8 -    A    G    F#:6 -    -    .
        A:8  -    -    A#   C6:8 -    A#   A:6
        G:6  -    F#   G    A:7  -    -    .
        A#:7 A    G    F#   G:6  D#   F#:5 -
        D:7  -    -    -    .    .    A4:3 C:4
        D:9  -    D#:4 F#:8 -    D#:4 D:6  -
        C:6  D    D#:7 D    C:5  A4   -    -
        D:8  -    -    F#:7 G:7  -    A:8  -
        A#:8 A:6  A#   C6:8 -    -    -    .
        D6:9 -    -    C6   A#:7 -    A    G:5
        A:8  -    -    -    G:5  F#   D#:4 D
        D#:7 -    F#:6 -    D:8  -    -    -
        D    -    -    .    .    .    .    .
        G:6  -    -    -    A#:5 -    -    -
        A:6  -    -    -    D:4  -    -    -
        G:5  -    -    A#   C6:7 -    A#   G:4
        A:7  -    -    -    -    -    .    .
        A#:7 -    -    C6   D6:8 -    C6   A#:5
        D#6:8 -   D6   C6   A#:6 -    A    -
        A:6  -    A#   A    G:5  F#   G    -
        D:5  D#:6 F#:6 G:7  A:8  -    C#:7 -
        D6:9 -    -    D#6  F#6:8 -   D#6  D6:6
        C6:7 -    D6   -    A:6  -    -    .
        D6:8 -    -    D#6  F#6:8 -   G6   A6:9
        A#6:9 -   A6   G6   F#6:7 -   -    .
        A6:8 -    G6   F#6  G6:7 -    D#6  F#6:5
        D6:8 -    -    -    C6:5 A#   A:6  G
        D#:7 F#:6 D#:5 C:4  D:8  -    -    -
        D    -    -    -    .    .    A4:3 C:3`) },

    // ---- COUNTER: oboe, answers the lead in its gaps; carries the leitmotif in B ----
    { program: P.OBOE, gain: 0.11, octave: 4, wave: 'triangle', pan: -0.35,
      notes: seq(`
        .    .    .    .    .    .    .    .
        .    .    .    .    D:5  D#   F#:6 D
        .    .    .    .    .    .    .    .
        .    .    .    .    D:5  F#   G:6  F#
        .    .    .    .    .    .    .    .
        .    .    .    .    A:5  G    F#:5 D#
        D:4  -    -    -    -    -    -    -
        D:5  -    D#:5 -    F#:6 -    -    -
        .    .    .    .    .    .    D:4  -
        .    .    .    .    F#:5 G    A:6  -
        .    .    .    .    .    .    F#:4 G
        A:5  -    G    F#   G:5  -    -    -
        .    .    .    .    .    .    .    .
        D:5  D#   F#:5 G    A:6  -    -    -
        C:5  -    A3:4 -    A#3:5 -   -    -
        A3:4 -    -    -    D:5  -    -    -
        G:5  -    A#:6 -    D5:7 -    D#5:7 -
        D5:6 -    A#:5 -    G:4  -    -    -
        .    .    .    .    .    .    .    .
        F#:5 G:5  A:6  -    C5:6 -    A:5  -
        .    .    .    .    .    .    .    .
        G:5  -    -    F#:4 G:5  -    A#:5 -
        D5:5 -    C5:4 -    A#:5 -    -    -
        A:5  -    -    -    -    -    -    -
        D:5  -    -    -    -    -    -    -
        D#:5 -    -    -    C:4  -    -    -
        D:5  -    -    -    -    -    F#:5 -
        G:6  -    F#:5 D#   D:5  -    -    -
        F#:5 -    -    -    D#:5 -    -    -
        D:5  -    -    -    D#:4 -    C:4  -
        C:5  -    A3:4 -    F#:5 -    -    -
        D:5  -    -    -    .    .    .    .`) },

    // ---- SITAR: hypnotic drone-pluck ostinato on D, the oud of the bazaar (4-bar loop) ----
    { program: P.SITAR, gain: 0.13, octave: 3, wave: 'sawtooth', pan: -0.2,
      notes: seq(`
        D:6  .    D4:4 .    A:5  .    D4:4 D#4:3
        D:6  .    A:4  D4:5 .    A:4  D:5  .
        D:6  .    D4:4 .    A:5  .    F#:4 D#:3
        D:6  A:4  .    D4:5 C4:4 A:4  D:6  .`) },

    // ---- HARP: dusty glints on the drone tones, answering the off-beats (4-bar loop) ----
    { program: P.HARP, gain: 0.08, octave: 4, wave: 'triangle', pan: 0.45,
      notes: seq(`
        .    .    D:4  .    .    F#:3 .    A:4
        .    D5:4 .    A:3  .    .    F#:3 .
        .    .    D:4  .    .    A:4  .    D5:3
        .    A:3  .    F#:3 .    D:4  .    .`) },

    // ---- PAD: lush slow strings, the OSRS heat-shimmer; slow chord thirds (gain low) ----
    { program: P.SLOW_STRINGS, gain: 0.07, octave: 4, wave: 'sine', pan: 0.35,
      notes: seq(`
        F#:3 -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        G:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A#:4 -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A:4  -    -    -    -    -    -    -
        F#:3 -    -    -    -    -    -    -
        F#:4 -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A#:4 -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        D#:4 -    -    -    -    -    -    -
        D:3  -    -    -    -    -    -    -
        A#3:3 -   -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        D#:4 -    -    -    -    -    -    -
        F#:4 -    -    -    -    -    -    -
        A#:4 -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A#3:3 -   -    -    -    -    -    -
        C#:4 -    -    -    -    -    -    -
        F#:4 -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        G:4  -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        A3:3 -    -    -    -    -    -    -
        -    -    -    -    -    -    -    -
        D#:4 -    -    -    -    -    -    -
        D:4  -    -    -    -    -    -    -`) },

    // ---- BASS: woody acoustic bass drone on D, sudden scale runs at the turns ----
    { program: P.ACOUSTIC_BASS, gain: 0.15, octave: 2, wave: 'sine', pan: 0,
      notes: seq(`
        D:7  -    -    -    D:4  -    -    -
        D:6  -    -    -    D:4  -    D:3  D:4
        D:6  -    -    -    D:4  -    -    -
        D:5  D#:5 F#:6 G:6  A:7  A#:7 C3:8 -
        D3:8 -    -    -    D:5  -    -    -
        G:6  -    -    -    G:4  -    A:4  A#:5
        A:6  -    -    -    A:4  -    G:4  F#:4
        D:7  -    -    -    D:4  -    C:4  -
        D:7  -    -    -    D:4  -    D:4  -
        D:6  -    -    -    F#:5 -    G:5  -
        A:6  -    -    -    A:4  -    -    -
        A:5  -    G:5  -    F#:5 -    D#:5 -
        A#:6 -    -    -    A#:4 -    C3:5 -
        D3:7 -    -    -    A:5  -    -    -
        D#:6 -    -    -    D#:4 -    D#:4 -
        D:7  -    -    -    D:4  D#:4 F:4  F#:5
        G:7  -    -    -    G:4  -    -    -
        G:6  -    -    -    D:5  -    G:4  -
        C:7  -    -    -    C:4  -    D:4  D#:5
        D:7  -    -    -    A:5  -    D:4  -
        G:7  -    -    -    G:4  -    -    -
        D#:6 -    -    -    D#:4 -    F:4  -
        G:6  -    -    -    D:5  -    A#:5 -
        A:7  -    -    -    A:4  G:4  F#:4 E:4
        D:8  -    -    -    D:5  -    -    -
        D:6  -    -    -    D:4  -    C:4  D:4
        D:6  -    -    -    D:4  -    D#:5 F#:5
        G:7  -    -    -    D#:5 -    C:5  -
        A:7  -    -    -    A:4  -    -    -
        A#:6 -    -    -    A:5  -    G:5  -
        D#:6 -    -    -    A:5  -    -    -
        D:8  -    -    -    D:4  -    D:3  -`) },

    // ---- DRUMS: hand-drum caravan groove — toms, shaker, tambourine; fill at the turn ----
    { program: 0, gain: 0.1, octave: 3, wave: 'sine', pan: -0.1, drums: true,
      notes: seq(`
        T:7  X:3  X:4  T:4  U:5  X:3  T:6  B:4
        T:7  X:3  U:4  X:3  T:5  B:4  U:5  X:4
        T:7  X:3  X:4  T:4  U:5  X:3  T:6  B:4
        T:7  X:3  U:4  T:5  U:6  B:4  T:5  X:4
        T:7  X:3  X:4  T:4  U:5  X:3  T:6  B:4
        T:7  X:3  U:4  X:3  T:5  B:4  U:5  X:4
        T:7  X:3  X:4  T:4  U:5  X:3  T:6  B:4
        T:6  T:4  U:5  T:6  U:6  T:7  T:8  B:6`) },
  ],
};
