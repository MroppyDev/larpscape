// 'Ashfall' — the magma depths, lair of the final boss.
//
// C minor, 56 bpm, 32 bars. Doom with grandeur — scored OSRS-style after
// "TzHaar!" / "Fire and Brimstone" / "Inferno" through the SC-88 soundfont:
//   * powerful FRENCH HORN carries the chromatic dread motif (the classic
//     RuneScape low-brass voice), answered by a dark TROMBONE counter-line
//   * menacing TREMOLO-STRING ostinato pulsing 8ths under everything
//   * dark CHOIR aahs blooming on long tones, CONTRABASS growling the
//     pedal/chromatic-walk bass, pounding TIMPANI and doom TOMS
//   * shrieking PICCOLO erupts only at the section peaks (infernal winds)
// FORM:  A  (bars 1-8)   — the dread motif: a chromatic crawl C -> C# -> D -> D#
//                          that falls back and sinks to the leading tone, never
//                          resolving. Stated low, then sequenced up a minor 3rd.
//        A' (bars 9-16)  — motif an octave up, trombone counter-line answering
//                          in the gaps, development drives to a G4 peak.
//        B  (bars 17-24) — the dark bloom: bVI (Ab, spelled G#) opens up and
//                          the world leitmotif (C E G A G E) is quoted in
//                          minor — C Eb G Ab G Eb — over Ab / Fm / Db / G7b9.
//        A''(bars 25-32) — heaviest statement: lead climbs the full chromatic
//                          ladder to G while the counter mirrors it with a
//                          chromatic lament descent; ends hanging on the
//                          dominant so the loop seam falls back onto C.
import { Track, seq, P } from './notation';

// ---- lead: french horn, the chromatic dread motif ----------------------------
const LEAD = [
  // A — motif, low and slow
  'C:6 - - - - - C#:4 -',
  'D:7 - - - D#:8 - D:6 -',
  'C:6 - - - - - - -',
  'B2:5 - - - - - - -',
  // sequenced up a minor third
  'D#:6 - - - - - E:4 -',
  'F:7 - - - F#:8 - F:6 -',
  'D#:7 - - - D:6 - C:5 -',
  'B2:5 - - - C:3 - C#:4 -',
  // A' — octave up, louder
  'C4:7 - - - - - C#4:5 -',
  'D4:8 - - - D#4:9 - D4:7 -',
  'C4:7 - - - - - - -',
  'B3:6 - - - - - - -',
  'D#4:7 - - - - - E4:5 -',
  'F4:8 - - - F#4:9 - F4:7 -',
  'G4:9 - - - F4:7 - D#4:6 -',
  'D4:6 - - - B3:5 - - -',
  // B — dark bloom: leitmotif in minor (C D# G G# G D#) over bVI
  'C4:6 - - - D#4:7 - - -',
  'G4:8 - - - G#4:9 - - -',
  'G4:7 - - - D#4:6 - - -',
  'F4:6 - - - - - - -',
  'G#4:8 - - - G4:7 - F4:6 -',
  'D#4:7 - - - C#4:6 - - -',
  'D4:7 - - - - - - -',
  'G:6 - - - G#:5 - B2:6 -',
  // A'' — heaviest; full chromatic climb to the dominant
  'C:8 - - - - - C#:6 -',
  'D:9 - - - D#:9 - D:8 -',
  'C:8 - - - G:7 - D#:6 -',
  'D:7 - - - B2:6 - - -',
  'C:8 - - - C#:7 - D:8 -',
  'D#:9 - - - E:8 - F:9 -',
  'F#:9 - - - G:9 - - -',
  'G:7 - - - F:5 - B2:6 -',
];

// ---- counter: trombone, answers in the gaps; chromatic lament in A'' ---------
const COUNTER = [
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . G:4 - G#:5 -',
  'G:4 - - - D:3 - - -',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . G:3 - - -',
  '. . . . . . G:5 -',
  '. . . . . . . .',
  '. . . . G#:6 - G:5 -',
  'F:5 - - - D:4 - - -',
  '. . . . . . A#:5 -',
  '. . . . . . . .',
  '. . . . C5:6 - A#:5 -',
  'G#:5 - - - G:4 - - -',
  '. . . . . . D#:4 -',
  '. . . . C5:5 - - -',
  '. . . . A#:5 - G#:4 -',
  '. . C5:5 - G#:4 - F:4 -',
  '. . . . . . . .',
  '. . . . G#:5 - F:4 -',
  '. . F:5 - D#:4 - - -',
  'D:5 - - - - - - -',
  // chromatic lament descent against the rising lead
  'G:5 - - - F#:4 - - -',
  'F:5 - - - E:4 - - -',
  'D#:5 - - - D:4 - - -',
  'C#:5 - - - C:4 - - -',
  'G:6 - - - F#:5 - - -',
  'F:6 - - - E:5 - - -',
  'D#:7 - - - D:6 - - -',
  'D:6 - - - - - - -',
];

// ---- ostinato: tremolo strings, menacing pulsing 8ths on the harmony ---------
const OST = [
  // A — quiet seethe on the C pedal
  'C:4 C:2 C:3 C:2 G:4 C:2 D#:3 C:2',
  'C:4 C:2 C:3 C:2 G:4 C:2 D#:3 C:2',
  'C:4 C:2 C:3 C:2 G:4 C:2 D#:3 C:2',
  'G:5 G:2 G:3 G:2 D:4 G:2 B:3 G:2',
  'C:4 C:2 C:3 C:2 G:4 C:2 D#:3 C:2',
  'F:4 F:2 F:3 F:2 C:4 F:2 G#:3 F:2',
  'C:4 C:2 C:3 C:2 G:4 C:2 D#:3 C:2',
  'G:5 G:2 G:3 G:3 D:4 G:3 B:4 G:3',
  // A' — a notch hotter
  'C:5 C:3 C:4 C:3 G:5 C:3 D#:4 C:3',
  'C:5 C:3 C:4 C:3 G:5 C:3 D#:4 C:3',
  'C:5 C:3 C:4 C:3 G:5 C:3 D#:4 C:3',
  'G:6 G:3 G:4 G:3 D:5 G:3 B:4 G:3',
  'C:5 C:3 C:4 C:3 G:5 C:3 D#:4 C:3',
  'F:5 F:3 F:4 F:3 C:5 F:3 G#:4 F:3',
  'G:6 G:3 G:4 G:3 D:5 G:3 B:4 G:3',
  'G:6 G:3 G:4 G:4 D:5 G:4 B:5 G:4',
  // B — the bloom: bVI / iv / bII / V
  'G#:5 G#:3 G#:4 G#:3 D#:5 G#:3 C4:4 G#:3',
  'G#:5 G#:3 G#:4 G#:3 D#:5 G#:3 C4:4 G#:3',
  'F:5 F:3 F:4 F:3 C:5 F:3 G#:4 F:3',
  'F:5 F:3 F:4 F:3 C:5 F:3 G#:4 F:3',
  'C#:5 C#:3 C#:4 C#:3 G#:5 C#:3 F:4 C#:3',
  'C#:5 C#:3 C#:4 C#:3 G#:5 C#:3 F:4 C#:3',
  'G:5 G:3 G:4 G:3 D:5 G:3 B:4 G:3',
  'G:6 G:3 G:4 G:4 D:5 G:4 B:5 G:5',
  // A'' — full boil
  'C:6 C:4 C:5 C:4 G:6 C:4 D#:5 C:4',
  'C:6 C:4 C:5 C:4 G:6 C:4 D#:5 C:4',
  'C:6 C:4 C:5 C:4 G:6 C:4 D#:5 C:4',
  'G:6 G:4 G:5 G:4 D:6 G:4 B:5 G:4',
  'C:6 C:4 C:5 C:4 G:6 C:4 D#:5 C:4',
  'D#:6 D#:4 D#:5 D#:4 A#:6 D#:4 G:5 D#:4',
  'G:7 G:4 G:5 G:5 D:6 G:5 B:6 G:5',
  'G:7 G:5 G:6 G:5 D:6 G:5 B:6 G:6',
];

// ---- choir: long ominous aahs, blooming in B ----------------------------------
const CHOIR = [
  'G:3 - - - - - - -',
  '- - - - - - - -',
  'D#:3 - - - - - - -',
  'D:3 - - - - - - -',
  'G:4 - - - - - - -',
  'G#:4 - - - - - - -',
  'G:4 - - - - - - -',
  'D:4 - - - - - - -',
  'G:5 - - - - - - -',
  '- - - - - - - -',
  'D#:5 - - - - - - -',
  'D:5 - - - - - - -',
  'G:5 - - - - - - -',
  'G#:5 - - - - - - -',
  'G:6 - - - - - - -',
  'F:5 - - - - - - -',
  'C4:6 - - - - - - -',
  '- - - - - - - -',
  'C4:6 - - - - - - -',
  '- - - - - - - -',
  'C#4:7 - - - - - - -',
  '- - - - - - - -',
  'B:6 - - - - - - -',
  '- - - - - - - -',
  'G:6 - - - - - - -',
  '- - - - - - - -',
  'D#:6 - - - - - - -',
  'D:6 - - - - - - -',
  'G:6 - - - - - - -',
  'C4:7 - - - - - - -',
  'A:7 - - - - - - -',
  'D:6 - - - - - - -',
];

// ---- bass: contrabass — pedal vs chromatic walk, octave pops ------------------
const BASS = [
  'C:7 - - - . . C3:4 .',
  'C:6 - - - . . G1:4 .',
  'C:7 - - - . . B1:3 .',
  'G1:6 - - - A1:3 - B1:4 -',
  'C:7 - - - . . C3:4 .',
  'F:6 - - - . . F3:4 .',
  'C:6 - - - G1:4 - - -',
  'G1:6 - - - A1:4 - B1:5 -',
  'C:7 - - - C3:4 - C:5 -',
  'C:6 - - - D#:4 - D:4 -',
  'C:7 - - - . . B1:4 .',
  'G1:6 - - - B1:4 - - -',
  'C:7 - - - B1:4 - A#1:4 -',
  'F:6 - - - F#:5 - - -',
  'G:7 - - - F:4 - D#:4 -',
  'D:6 - - - G1:5 - - -',
  'G#1:7 - - - . . G#:4 .',
  'G#1:6 - - - D#:4 - C:4 -',
  'F1:7 - - - . . F:4 .',
  'F1:6 - - - G#1:4 - C:5 -',
  'C#:7 - - - . . C#3:4 .',
  'C#:6 - - - G#1:4 - - -',
  'G1:7 - - - . . G:4 .',
  'G1:6 - - - A1:4 - B1:5 -',
  'C:8 - - - C3:4 - C:5 -',
  'C:7 - - - D#:5 - D:4 -',
  'C:8 - - - G1:5 - - -',
  'G1:7 - - - B1:5 - - -',
  'C:8 - - - C#:5 - D:5 -',
  'D#:8 - - - E:6 - F:7 -',
  'F#:8 - - - G:8 - - -',
  'G1:7 - - - F1:5 - G1:6 -',
];

// ---- timpani: downbeat strikes, crescendo rolls at section turns --------------
const TIMP = [
  'C:8 . . . . . . .',
  '. . . . . . C:3 .',
  'C:7 . . . . . . .',
  'G1:7 . . . . . . .',
  'C:8 . . . . . . .',
  'F:6 . . . . . . .',
  'C:7 . . . G1:5 . . .',
  'G1:6 . G1:4 . G1:5 G1:6 G1:7 G1:8',
  'C:9 . . . . . . .',
  '. . . . . . C:4 .',
  'C:8 . . . . . . .',
  'G1:8 . . . . . G1:4 .',
  'C:8 . . . . . . .',
  'F:7 . . . . . . .',
  'G1:8 . . . C:6 . . .',
  'G1:7 . . . G1:5 G1:6 G1:7 G1:8',
  'G#1:7 . . . . . . .',
  '. . . . . . . .',
  'F:6 . . . . . . .',
  '. . . . . . . .',
  'C#:7 . . . . . . .',
  '. . . . . . . .',
  'G1:7 . . . . . . .',
  'G1:5 . G1:5 . G1:6 G1:7 G1:8 G1:9',
  'C:9 . . . . . C:4 .',
  'C:8 . . . . . . .',
  'C:8 . . . G1:6 . . .',
  'G1:8 . . . . . . .',
  'C:9 . . . . . C:4 .',
  'D#:8 . . . . . . .',
  'G1:8 . . . G1:8 . . .',
  'G1:6 . G1:6 G1:7 G1:7 G1:8 G1:8 G1:9',
];

// ---- shriek: piccolo — infernal high winds, only at the section peaks ---------
const SHRIEK = [
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  // A' peak — first scream
  'G5:7 - - - F5:6 - D#5:5 -',
  'D5:4 - - - . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  // end of the bloom — wail over the dominant
  '. . . . G5:6 - G#5:7 -',
  'G5:8 - - - F5:5 - - -',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  '. . . . . . . .',
  // final chromatic climb, doubled two octaves up
  'D#5:7 - - - E5:7 - F5:8 -',
  'F#5:8 - - - G5:9 - - -',
  'G5:7 - - - - - - -',
];

// ---- drums: sparse doom toms; fills only at section turns ---------------------
const DRUMS = [
  'C:6 . . . . . . .',
  'K:5 . . . . . T:3 .',
  'K:6 . . . . . . .',
  'K:5 . . . T:4 . T:3 .',
  'K:6 . . . . . . .',
  'K:5 . . . . . T:3 .',
  'K:6 . . . T:4 . . .',
  'T:4 . T:5 . T:6 T:6 T:7 K:8',
  'C:7 . . . K:5 . . .',
  'K:6 . . . . . T:4 .',
  'K:7 . . . . T:3 . .',
  'K:6 . . T:4 . . T:5 .',
  'K:7 . . . . . . T:3',
  'K:6 . . . T:4 . . .',
  'K:7 . . . K:5 . . .',
  'T:5 T:5 . T:6 . T:7 U:6 U:7',
  'C:6 . . . . . . .',
  '. . . . . . . .',
  'K:5 . . . . . . .',
  '. . . . . . T:3 .',
  'K:5 . . . . . . .',
  '. . . . . . . .',
  'K:6 . . . . . . .',
  'T:4 . T:5 T:5 T:6 T:7 T:8 T:9',
  'C:8 . . . K:6 . . .',
  'K:7 . . . T:4 . T:4 .',
  'K:8 . . T:4 . . K:6 .',
  'K:7 . . . T:5 . T:5 .',
  'C:7 . . . K:6 . . .',
  'K:8 . . T:5 . T:5 . .',
  'K:9 . . . K:8 . . .',
  'T:6 T:6 T:7 T:7 U:7 U:8 T:8 K:9',
];

export const track: Track = {
  name: 'Ashfall', bpm: 56, loopBars: 32,
  channels: [
    { program: P.HORN, gain: 0.20, octave: 3, wave: 'sawtooth', pan: 0,
      notes: seq(LEAD.join(' ')) },
    { program: P.TROMBONE, gain: 0.11, octave: 4, wave: 'square', pan: 0.35,
      notes: seq(COUNTER.join(' ')) },
    { program: P.TREMOLO_STRINGS, gain: 0.09, octave: 3, wave: 'sawtooth', pan: 0.2,
      notes: seq(OST.join(' ')) },
    { program: P.CHOIR, gain: 0.11, octave: 3, wave: 'triangle', pan: -0.3,
      notes: seq(CHOIR.join(' ')) },
    { program: P.CONTRABASS, gain: 0.15, octave: 2, wave: 'sawtooth', pan: -0.1,
      notes: seq(BASS.join(' ')) },
    { program: P.TIMPANI, gain: 0.15, octave: 2, wave: 'sine', pan: -0.15,
      notes: seq(TIMP.join(' ')) },
    { program: P.PICCOLO, gain: 0.07, octave: 5, wave: 'triangle', pan: 0.45,
      notes: seq(SHRIEK.join(' ')) },
    { program: 0, gain: 0.13, octave: 3, wave: 'sine', pan: 0.1, drums: true,
      notes: seq(DRUMS.join(' ')) },
  ],
};
