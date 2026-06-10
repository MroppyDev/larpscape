// Shared music notation for Larpscape tracks.
//
// ===================== NOTATION REFERENCE (for composers) ====================
// Each Channel.notes is a grid of 8th-note steps produced by seq("..."):
//   'C'  'F#' 'Bb' 'A5' ...  note-on (letter [+ '#' or 'b'] [+ octave digit; else Channel.octave)
//   '-'                 sustain the previous note for another step
//   '.'                 rest
//   ':n' velocity suffix on any note-on, n = 1..9 (default ~6.5). 'C5:9' = accent,
//        'E:2' = ghost note. Use velocity for dynamics — phrasing lives here.
// DRUM CHANNELS: set drums: true. Tokens are hits (velocity suffix works):
//   K kick   S snare   H closed hat   O open hat   T low tom   U high tom
//   C crash  R ride    M sidestick    X shaker     B tambourine
// Tracks may set swing (0..0.33) to delay every off-beat 8th for groove.
// Channels can have DIFFERENT grid lengths (each loops independently — use for
// ostinatos vs long-form melodies). Track length = channels[0] grid.
// bpm is the tempo; steps are 8th notes (2 steps per beat).
// =============================================================================

export type Wave = OscillatorType;

export interface Channel {
  /** GM program number (0-127), e.g. 73 flute. Ignored for drums channels. */
  program: number;
  /** Channel mix level (~0.05..0.25). Also drives the synth's CC7 volume. */
  gain: number;
  /** Base octave for notes written without an explicit octave digit. */
  octave: number;
  /** Step grid from seq(). */
  notes: (string | null)[];
  /** Oscillator voice for the fallback path (used while the font loads). */
  wave: Wave;
  /** Stereo placement, -1 (left) .. 1 (right). Synth path only. */
  pan?: number;
  /** Percussion channel: tokens are drum letters, routed to the GM drum kit. */
  drums?: boolean;
}

export interface Track {
  name: string;
  bpm: number;
  loopBars: number;
  channels: Channel[];
  /** Off-beat delay as a fraction of a step (0..0.33) for shuffle/groove. */
  swing?: number;
  /** Custom MIDI file track (from /music/manifest.json). */
  midiUrl?: string;
}

// "C E G ." -> step tokens; '.' = rest -> null
export function seq(s: string): (string | null)[] {
  return s.trim().split(/\s+/).map((t) => (t === '.' ? null : t));
}

// GM drum-kit key numbers for drum-channel tokens.
export const DRUM_KEYS: Record<string, number> = {
  K: 36, S: 38, H: 42, O: 46, T: 45, U: 50, C: 49, R: 51, M: 37, X: 70, B: 54,
};

// Convenient GM program names (0-indexed). Raw numbers are equally fine.
export const P = {
  PIANO: 0, BRIGHT_PIANO: 1, EPIANO: 4, HARPSICHORD: 6, CELESTA: 8,
  GLOCKENSPIEL: 9, MUSIC_BOX: 10, VIBRAPHONE: 11, MARIMBA: 12, XYLOPHONE: 13,
  TUBULAR_BELLS: 14, ORGAN: 19, ACCORDION: 21, HARMONICA: 22, NYLON_GUITAR: 24,
  STEEL_GUITAR: 25, JAZZ_GUITAR: 26, CLEAN_GUITAR: 27, MUTED_GUITAR: 28,
  OVERDRIVE_GUITAR: 29, DISTORTION_GUITAR: 30, ACOUSTIC_BASS: 32,
  FINGER_BASS: 33, PICK_BASS: 34, SLAP_BASS: 36, SYNTH_BASS1: 38, SYNTH_BASS2: 39,
  VIOLIN: 40, VIOLA: 41, CELLO: 42, CONTRABASS: 43, TREMOLO_STRINGS: 44,
  PIZZICATO: 45, HARP: 46, TIMPANI: 47, STRINGS: 48, SLOW_STRINGS: 49,
  SYNTH_STRINGS: 50, CHOIR: 52, VOICE_OOH: 53, SYNTH_VOICE: 54, ORCHESTRA_HIT: 55,
  TRUMPET: 56, TROMBONE: 57, TUBA: 58, MUTED_TRUMPET: 59, HORN: 60, BRASS: 61,
  SYNTH_BRASS: 62, SOPRANO_SAX: 64, ALTO_SAX: 65, TENOR_SAX: 66, OBOE: 68,
  ENGLISH_HORN: 69, BASSOON: 70, CLARINET: 71, PICCOLO: 72, FLUTE: 73,
  RECORDER: 74, PAN_FLUTE: 75, BLOWN_BOTTLE: 76, SHAKUHACHI: 77, WHISTLE: 78,
  OCARINA: 79, SQUARE_LEAD: 80, SAW_LEAD: 81, CALLIOPE: 82, CHIFF: 83,
  CHARANG: 84, VOICE_LEAD: 85, FIFTHS: 86, BASS_LEAD: 87, NEW_AGE_PAD: 88,
  WARM_PAD: 89, POLYSYNTH: 90, CHOIR_PAD: 91, BOWED_PAD: 92, METALLIC_PAD: 93,
  HALO_PAD: 94, SWEEP_PAD: 95, SITAR: 104, BANJO: 105, KALIMBA: 108,
  BAGPIPE: 109, FIDDLE: 110, SHANAI: 111, TINKLE_BELL: 112, AGOGO: 113,
  STEEL_DRUMS: 114, WOODBLOCK: 115, TAIKO: 116, MELODIC_TOM: 117, SYNTH_DRUM: 118,
} as const;
