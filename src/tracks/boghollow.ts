// 'Boghollow' — the swamp. Damp, murky, dripping. D minor, slow.
//
// OSRS-STYLE ORCHESTRATION (think "Bone Dance" / "Dead Quiet" through the
// SC-88-derived OSRS soundfont): a breathy PAN FLUTE carries the "sink and
// slip" motif over a woody BASSOON counter-voice and a dark CONTRABASS
// pedal/walk. The murk underneath is dark CHOIR OOHS (one slow vowel per
// harmony) doubled an octave up by TREMOLO STRINGS shimmering at the edge
// of hearing. HARP plucks fall as irregular water-drips with chromatic
// neighbors (Eb6, C#6), TIMPANI thuds mark distant tonic/dominant ground,
// and the drum kit gives only ride taps, soft low toms and a shaker rustle
// — things moving in the water, never a beat.
//
// FORM (32 bars): A (1-8) theme | A2 (9-16) motif developed, sequenced up
// a 4th and rhythmically diminished | B (17-24) shift toward G minor / Eb,
// counter-bassoon carries the world leitmotif (C E G A G E -> minor, on G:
// G Bb D Eb D Bb), ends on a deceptive A7 -> Bb cadence | A' (25-32) theme
// returns with a borrowed Bb-minor sting (bVI minor) before settling on D.
//
// MOTIF: "sink and slip" — D rises to F, then slides chromatically E -> Eb
// back down into D. Sequenced up a 4th (G Bb A Ab G) in bars 3-4 and 27-28,
// rhythmically compressed in A2. The bassoon answers every statement in the
// gaps (call-and-response), and the harp "drips" land on off-grid spots.
// NB: notation is sharps-only, so Eb = D#, Bb = A#, Db = C#, Ab = G#.
import { Track, seq, P } from './notation';

export const track: Track = {
  name: 'Boghollow', bpm: 62, loopBars: 32,
  channels: [
    // LEAD — breathy pan flute, the "sink and slip" motif. Full 32-bar form.
    { program: P.PAN_FLUTE, gain: 0.21, octave: 4, wave: 'triangle', pan: 0, notes: seq(`
      D:6 -   F:6 -   E:5 -   D#:4 -
      D:5 -   -   -   -   -   .    .
      G:6 -   A#:6 -  A:5 -   G#:4 -
      G:5 -   -   -   -   -   F:3  E:3
      F:6 -   D:5 -   A#3:5 - C:5  -
      D:6 -   -   -   A#3:4 - G3:4 -
      A3:5 -  C#:5 -  E:6 -   G:5  -
      F:5 -   E:4 -   D:5 -   -    -
      D:6 F:4 E:4 D#:3 D:6 -  A:7  -
      G:6 -   F:5 -   E:5 -   -    -
      G:6 A#:4 A:4 G#:3 G:6 - D5:7 -
      C5:6 -  A#:5 -  A:5 -   -    -
      A#:6 -  A:5 A#:5 C5:6 - D5:7 -
      D5:6 -  C5:5 -  A#:5 -  G:4  -
      A:5 -   G:5 -   E:5 -   C#:4 -
      D:6 -   -   -   -   -   .    .
      G:5 -   -   -   A#:4 -  D5:5 -
      D5:5 -  -   -   C5:3 A#:3 -  -
      C5:5 -  -   -   G:4 -   D#:4 -
      D:5 -   -   -   F#:4 -  A:5  -
      A#:6 -  -   -   A:4 G:4 -    -
      A#:5 -  G:4 -   D#:4 -  -    -
      C#:4 -  E:5 -   G:6 -   A:7  -
      A#:6 -  -   -   -   -   F:3  E:3
      D:7 -   F:6 -   E:5 -   D#:4 -
      D:5 -   -   -   .   .   F:3  G:3
      G:6 -   A#:6 -  A:6 -   G#:5 -
      G:5 -   -   -   -   -   -    -
      F:6 -   -   -   D#:5 -  C#:4 -
      C:5 -   A#3:4 - G3:4 -  -    -
      E:5 -   -   -   C#:4 -  E:4  -
      D:5 -   -   -   -   -   .    .`) },

    // COUNTER — bassoon, answers the pan flute in its rests. Carries the
    // world leitmotif (minor, on G) at bars 17-18: G A# D4 | D#4 D4 A#.
    { program: P.BASSOON, gain: 0.14, octave: 3, wave: 'sawtooth', pan: -0.35, notes: seq(`
      .    .   .    .   .    .   .    .
      .    .   F:4  -   E:4  -   D#:3 D:3
      .    .   .    .   .    .   .    .
      .    .   A#:4 -   A:4  -   G#:3 G:3
      .    .   .    .   D:4  -   D#:3 -
      .    .   G:4  -   F:3  -   D:3  -
      C#:4 -   -    -   E:4  -   -    -
      D:4  -   -    -   A2:3 -   -    -
      .    .   .    .   .    .   .    .
      .    .   .    .   C:3  -   C#:3 -
      .    .   .    .   .    .   .    .
      .    .   F:4  -   E:3  -   C#:3 -
      .    .   .    .   .    .   A#:3 -
      .    .   .    .   D:4  -   C:3  A#2:3
      A:4  -   -    -   C#:4 -   -    -
      D:4  -   -    -   F:3  E:3 D#:3 D:3
      .    .   G:5  -   A#:5 -   D4:5 -
      D#4:5 -  D4:5 -   A#:4 -   -    -
      .    .   .    .   C:4  -   -    -
      .    .   F#:4 -   A:4  -   C4:3 -
      .    .   .    .   .    .   D4:4 -
      D#4:4 -  A#:3 -   G:3  -   -    -
      .    .   .    .   .    .   .    .
      .    .   D4:4 -   C4:3 -   A#:3 A:3
      .    .   .    .   .    .   .    .
      .    .   F:4  -   E:4  -   D#:3 D:3
      .    .   .    .   .    .   .    .
      .    .   A#:4 -   A:4  -   G#:3 G:3
      .    .   .    .   C#:4 -   -    -
      .    .   E:4  -   G:4  -   -    -
      .    .   .    .   G:3  -   -    -
      F:3  -   E:3  -   D:3  -   -    -`) },

    // BASS — contrabass; pedal-to-walk contrast, octave pops in A2,
    // chromatic creep (A-B-C#) under the bar-23 crescendo.
    { program: P.CONTRABASS, gain: 0.13, octave: 2, wave: 'sine', pan: 0, notes: seq(`
      D:5  -   -    -   .    .   D:3   .
      D:4  -   -    -   A:4  -   -     -
      G:5  -   -    -   .    .   G:3   .
      G:4  -   -    -   A:3  -   C3:3  -
      A#:5 -   -    -   F:3  -   -     -
      G:5  -   -    -   A#:3 -   D3:3  -
      A:5  -   -    -   G:3  -   E:3   -
      D3:5 -   -    -   A:4  -   -     -
      D:5  -   A:3  -   D3:4 -   A:3   -
      A:5  -   -    -   G:3  -   E:3   -
      G:5  -   D3:3 -   G:4  -   D3:3  -
      F:5  -   -    -   E:3  -   C#3:3 -
      A#:5 -   F:3  -   A#:4 -   F:3   -
      G:5  -   -    -   F:3  -   D#:3  -
      A:5  -   -    -   C#3:4 -  -     -
      D3:5 -   -    -   C3:3 -   A#:3  G:3
      G:5  -   -    -   D3:3 -   -     -
      G:4  -   -    -   F:3  -   D#:3  -
      C3:5 -   -    -   G:3  -   -     -
      D3:5 -   -    -   C3:3 -   A:3   -
      G:5  -   D3:3 -   G:4  -   A#:3  -
      D#:5 -   -    -   A#:3 -   -     -
      A:5  -   -    -   B:3  -   C#3:4 -
      A#:5 -   -    -   A:4  -   G:3   F:3
      D:6  -   -    -   A:3  -   -     -
      D:4  -   F:3  -   G:3  -   A:3   -
      G:5  -   -    -   D3:3 -   -     -
      G:4  -   -    -   F:3  -   D#:3  -
      A#:5 -   -    -   F:3  -   -     -
      E3:4 -   -    -   G:3  -   -     -
      A:5  -   -    -   G:3  -   E:3   -
      D3:5 -   -    -   A:3  -   D:4   -`) },

    // PAD — dark choir oohs, one slow vowel per harmony. Db3 sting at b29.
    { program: P.VOICE_OOH, gain: 0.08, octave: 3, wave: 'sine', pan: 0.2, notes: seq(`
      D:3  - - - - - - -   - - - - - - - -
      G:3  - - - - - - -   - - - - - - - -
      F:3  - - - - - - -   - - - - - - - -
      E:3  - - - - - - -   F:3 - - - - - - -
      F:3  - - - - - - -   E:3 - - - - - - -
      A#:3 - - - - - - -   G:3 - - - - - - -
      F:3  - - - - - - -   G:3 - - - - - - -
      E:3  - - - - - - -   D:3 - - - - - - -
      A#:3 - - - - - - -   - - - - - - - -
      D#:3 - - - - - - -   F#:3 - - - - - - -
      G:3  - - - - - - -   - - - - - - - -
      E:3  - - - - - - -   F:4 - - - - - - -
      F:3  - - - - - - -   D:3 - - - - - - -
      A#:3 - - - - - - -   - - - - - - - -
      C#:4 - - - - - - -   G:2 - - - - - - -
      C#:3 - - - - - - -   D:3 - - - - - - -`) },

    // SHIMMER — tremolo strings doubling the choir harmony an octave up,
    // barely audible: the fog over the water. 16-bar loop, runs 2x.
    { program: P.TREMOLO_STRINGS, gain: 0.06, octave: 4, wave: 'sawtooth', pan: -0.5, notes: seq(`
      D:2  - - - - - - -   - - - - - - - -
      G:2  - - - - - - -   - - - - - - - -
      F:2  - - - - - - -   - - - - - - - -
      E:2  - - - - - - -   F:2 - - - - - - -
      F:2  - - - - - - -   E:2 - - - - - - -
      A#:2 - - - - - - -   G:2 - - - - - - -
      F:2  - - - - - - -   G:2 - - - - - - -
      E:2  - - - - - - -   D:2 - - - - - - -
      A#:2 - - - - - - -   - - - - - - - -
      D#:2 - - - - - - -   F#:2 - - - - - - -
      G:2  - - - - - - -   - - - - - - - -
      E:2  - - - - - - -   F:3 - - - - - - -
      F:2  - - - - - - -   D:2 - - - - - - -
      A#:2 - - - - - - -   - - - - - - - -
      C#:3 - - - - - - -   G:1 - - - - - - -
      C#:2 - - - - - - -   D:2 - - - - - - -`) },

    // DRIPS — harp droplets, irregular placement, chromatic neighbors
    // (Eb6, C#6) for the damp unease. 8-bar ostinato, loops 4x.
    { program: P.HARP, gain: 0.09, octave: 5, wave: 'sine', pan: 0.5, notes: seq(`
      .   .    .    D6:3 .    .   .     .
      .   A:2  .    .    .    .   D#6:3 .
      .   .    .    .    .    G:2 .     .
      .   .    D6:2 .    .    .   .     .
      .   .    .    .    A#:3 .   .     .
      .   F:2  .    .    .    .   .     .
      .   .    .    .    .    .   C#6:3 .
      .   .    .    A:2  .    .   .     .`) },

    // TIMPANI — distant tonic/dominant thuds, far apart; the ground of the
    // bog answering the bass. 8-bar loop, runs 4x.
    { program: P.TIMPANI, gain: 0.10, octave: 2, wave: 'sine', pan: -0.15, notes: seq(`
      D:4 .   .   .   .   .   .   .
      .   .   .   .   .   .   .   .
      .   .   .   .   A:3 .   .   .
      .   .   .   .   .   .   .   .
      .   .   .   .   .   .   .   .
      D:3 .   .   .   .   .   D:2 .
      .   .   .   .   .   .   .   .
      A:3 .   .   .   D:4 .   .   .`) },

    // PERCUSSION — barely-there bog: ride taps, soft low toms, a shaker
    // rustle. 8-bar loop; no backbeat, just things moving in the water.
    { program: 0, drums: true, gain: 0.05, octave: 3, wave: 'square', pan: 0.3, notes: seq(`
      .  .   .   .   R:2 .   .   .
      .  .   T:2 .   .   .   .   X:1
      .  .   .   .   .   R:2 .   .
      .  .   .   .   .   .   .   .
      .  R:2 .   .   .   .   T:2 .
      .  .   .   .   X:1 .   .   .
      .  .   .   R:2 .   .   .   .
      .  .   .   .   .   .   T:3 .`) },
  ],
};
