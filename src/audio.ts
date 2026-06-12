// Music + SFX engine.
//
// Music plays through the bundled OSRS-style SoundFont (/soundfont.sf2) via the
// spessasynth_lib AudioWorklet synthesizer. The font (~32 MB) ships in public/
// and is fetched asynchronously after init(); while it loads — or if it fails —
// the engine transparently falls back to the built-in Web Audio oscillator
// step-sequencer, so music always works. When the font finishes loading mid-track,
// the engine switches voices at the next play()/loop boundary.
//
// All nine compositions are ORIGINAL works written for Larpscape; this file
// re-voices them with General-MIDI-style instrument programs per channel.
// SFX remain fully synthesized (oscillators + filtered noise).

import { WorkletSynthesizer, Sequencer } from 'spessasynth_lib';

import { Track, Channel, Wave, DRUM_KEYS } from './tracks/notation';
import { BASE_TRACKS } from './tracks';

export type { Track } from './tracks/notation';

const NOTE_IDX: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
  // flat spellings (enharmonic)
  Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10, Cb: 11, Fb: 4,
};

function parseNote(note: string, baseOct: number): { idx: number; oct: number } | null {
  const m = note.match(/^([A-G][#b]?)(\d)?$/);
  if (!m || NOTE_IDX[m[1]] === undefined) return null;
  let oct = m[2] ? parseInt(m[2]) : baseOct;
  if (m[1] === 'Cb') oct -= 1; // Cb sounds in the octave below its written C
  return { idx: NOTE_IDX[m[1]], oct };
}

function freq(note: string, baseOct: number): number {
  const p = parseNote(note, baseOct);
  if (!p) return 440;
  return 440 * Math.pow(2, (p.idx - 9) / 12 + (p.oct - 4));
}

function midiNote(note: string, baseOct: number): number {
  const p = parseNote(note, baseOct);
  if (!p) return 69;
  return Math.max(0, Math.min(127, (p.oct + 1) * 12 + p.idx));
}

// split "C#5:7" -> token name + MIDI velocity (default 92 ≈ 6.5/9)
function parseToken(tok: string): { name: string; vel: number } {
  const i = tok.indexOf(':');
  if (i < 0) return { name: tok, vel: 92 };
  const n = parseInt(tok.slice(i + 1));
  return { name: tok.slice(0, i), vel: isNaN(n) ? 92 : Math.max(10, Math.min(127, Math.round(n / 9 * 127))) };
}

// Built-in compositions live in src/tracks/* (one file per track).
// Custom MIDI entries from /music/manifest.json are appended at init.
export const TRACKS: Track[] = [...BASE_TRACKS];

// synth channel for each track channel: drums on the GM drum channel (9),
// melodic channels numbered in order, skipping 9.
function synthChannels(track: Track): number[] {
  let next = 0;
  return track.channels.map((ch) => {
    if (ch.drums) return 9;
    const c = next === 9 ? 10 : next;
    next = c + 1;
    return c;
  });
}

// Vite copies public/ to the site root (dev + production dist/), so the bundled
// soundfont is always available at /soundfont.sf2 without any player setup.
const SOUNDFONT_URL = '/soundfont.sf2';
// Vite's documented asset recipe: a static `new URL(relativePath, import.meta.url)`
// is rewritten in dev and emitted as a hashed asset in production builds, so the
// worklet processor that ships inside spessasynth_lib is served correctly.
const WORKLET_URL = new URL(
  '../node_modules/spessasynth_lib/dist/spessasynth_processor.min.js',
  import.meta.url,
);

// Start downloading the ~32 MB font as soon as this module loads — no AudioContext
// needed. init() / loadSoundFont() reuse this buffer instead of fetching again.
let fontBufPromise: Promise<ArrayBuffer> | null = null;
function prefetchSoundFont(): Promise<ArrayBuffer> {
  if (!fontBufPromise) {
    fontBufPromise = fetch(SOUNDFONT_URL).then((r) => {
      if (!r.ok) throw new Error(`soundfont fetch failed: ${r.status}`);
      return r.arrayBuffer();
    }).catch((err) => {
      fontBufPromise = null;
      throw err;
    });
  }
  return fontBufPromise;
}
prefetchSoundFont();

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  current: Track | null = null;
  timer: number | null = null;
  step = 0;
  nextTime = 0;
  unlocked = new Set<string>(['Newbie Meadow']);
  onTrackChange: (() => void) | null = null;
  /** True while the player has manually picked a track (music tab / playlist);
   *  main.ts's region auto-switch must leave the music alone until stop(). */
  manualLock = false;

  // ---- SoundFont engine state ----
  private synth: WorkletSynthesizer | null = null;
  private fontLoading = false;
  /** Resolves once the SoundFont synth is ready (or load failed — fallback stays available). */
  private fontReady: Promise<void> | null = null;
  /** MIDI-file sequencer for custom tracks (created lazily on first use). */
  private sequencer: Sequencer | null = null;
  /** midiUrl -> fetched file bytes, so re-plays don't re-download. */
  private midiCache = new Map<string, ArrayBuffer>();
  private manifestLoaded = false;
  /** True once the current playback run is voiced through the SoundFont. */
  private useSynth = false;
  /** desired GM program -> closest program actually present in the font. */
  private programMap = new Map<number, number>();

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
    void this.ctx.resume();
    if (!this.fontReady) this.fontReady = this.loadSoundFont();
    void this.loadMusicManifest();
  }

  /** Begin downloading the font (safe before AudioContext exists). */
  prefetch() { void prefetchSoundFont(); }

  /** Warm the audio engine on first user gesture so the font loads during login / name entry. */
  warmUp() { this.init(); }

  /** Wait until the SoundFont synth is ready (or failed). Music should await this. */
  whenReady(): Promise<void> {
    this.init();
    return this.fontReady ?? Promise.resolve();
  }

  /** Fetch /music/manifest.json and append its entries as always-unlocked
   *  custom tracks (file resolved as /music/<file>). Missing manifest is fine. */
  private async loadMusicManifest() {
    if (this.manifestLoaded) return;
    this.manifestLoaded = true;
    try {
      const r = await fetch('/music/manifest.json');
      if (!r.ok) return;
      const list = await r.json();
      if (!Array.isArray(list)) return;
      for (const entry of list) {
        if (!entry || typeof entry.name !== 'string' || typeof entry.file !== 'string') continue;
        if (TRACKS.some((t) => t.name === entry.name)) continue;
        TRACKS.push({ name: entry.name, bpm: 120, loopBars: 0, channels: [], midiUrl: '/music/' + entry.file });
        this.unlocked.add(entry.name);
      }
      if (list.length) this.onTrackChange?.();
    } catch {
      // no manifest / bad JSON — custom music is purely optional
    }
  }

  private async loadSoundFont() {
    if (this.fontLoading || this.synth || !this.ctx) return;
    this.fontLoading = true;
    try {
      const ctx = this.ctx;
      const [fontBuf] = await Promise.all([
        prefetchSoundFont(),
        ctx.audioWorklet.addModule(WORKLET_URL.href),
      ]);
      const synth = new WorkletSynthesizer(ctx);
      synth.connect(this.musicGain!);
      await synth.soundBankManager.addSoundBank(fontBuf, 'main');
      await synth.isReady;
      this.buildProgramMap(synth);
      this.synth = synth;
      // Track already queued while the font was loading — start it on the synth now.
      if (this.current?.midiUrl) {
        void this.playMidi(this.current);
      } else if (this.current && this.timer !== null) {
        this.useSynth = true;
        this.applyVoices(this.current, ctx.currentTime);
      }
    } catch (err) {
      console.warn('[audio] SoundFont engine unavailable; staying on oscillator fallback.', err);
    } finally {
      this.fontLoading = false;
    }
  }

  /** If the font's bank layout is non-GM, map each desired program to the
   *  closest melodic preset that actually exists. */
  private buildProgramMap(synth: WorkletSynthesizer) {
    const melodic = synth.presetList.filter((p) => !p.isDrum);
    if (melodic.length === 0) return;
    const have = new Set(melodic.map((p) => p.program));
    const wanted = new Set<number>();
    for (const t of TRACKS) for (const ch of t.channels) wanted.add(ch.program);
    for (const prog of wanted) {
      if (have.has(prog)) { this.programMap.set(prog, prog); continue; }
      let best = melodic[0].program, bestDist = Infinity;
      for (const p of melodic) {
        const d = Math.abs(p.program - prog);
        if (d < bestDist) { bestDist = d; best = p.program; }
      }
      this.programMap.set(prog, best);
    }
  }

  setMusicVolume(v: number) { if (this.musicGain) this.musicGain.gain.value = v; }
  setSfxVolume(v: number) { if (this.sfxGain) this.sfxGain.gain.value = v; }

  /** Start a track. `manual = true` marks it as a deliberate player pick
   *  (music tab / playlist) so the region auto-switcher backs off. */
  play(track: Track, manual = false) {
    void this.playTrack(track, manual);
  }

  private async playTrack(track: Track, manual: boolean) {
    this.init();
    await this.whenReady();
    this.stop();
    this.manualLock = manual;
    this.current = track;
    if (track.midiUrl) {
      void this.playMidi(track);
      this.onTrackChange?.();
      return;
    }
    this.step = 0;
    this.nextTime = this.ctx!.currentTime + 0.1;
    this.useSynth = !!this.synth;
    if (this.useSynth) this.applyVoices(track, this.nextTime - 0.05);
    this.timer = window.setInterval(() => this.schedule(), 80);
    this.onTrackChange?.();
  }

  /** Convenience for playlist/music-list UIs: play AND take the manual lock. */
  playFromList(track: Track) { this.play(track, true); }

  stop() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.current = null;
    this.manualLock = false;
    if (this.sequencer && !this.sequencer.paused) this.sequencer.pause();
    if (this.synth) this.synth.stopAll(); // kill scheduled + sounding notes
    this.useSynth = false;
    this.onTrackChange?.();
  }

  /** Fetch (cached) + load + loop a custom MIDI track through the synth.
   *  The synth feeds the same musicGain, so the volume slider applies. */
  private async playMidi(track: Track) {
    if (!track.midiUrl) return;
    if (!this.synth) {
      if (this.fontLoading) {
        // loadSoundFont() retries this track when the font arrives.
        console.warn(`[audio] SoundFont still loading; "${track.name}" will start once it's ready.`);
      } else {
        console.warn(`[audio] SoundFont synth unavailable; cannot play MIDI track "${track.name}".`);
      }
      return;
    }
    try {
      let buf = this.midiCache.get(track.midiUrl);
      if (!buf) {
        const r = await fetch(track.midiUrl);
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
        buf = await r.arrayBuffer();
        this.midiCache.set(track.midiUrl, buf);
      }
      // The player may have switched tracks while the file downloaded.
      if (this.current !== track) return;
      if (!this.sequencer) {
        this.sequencer = new Sequencer(this.synth, { skipToFirstNoteOn: true });
      }
      this.sequencer.loadNewSongList([{ binary: buf, fileName: track.name }]);
      this.sequencer.loopCount = -1; // loop forever until stop()
      this.sequencer.play();
    } catch (err) {
      console.warn(`[audio] Could not play MIDI track "${track.name}".`, err);
    }
  }

  unlock(name: string): boolean {
    if (this.unlocked.has(name)) return false;
    this.unlocked.add(name);
    return true;
  }

  /** Send programChange + channel volume/pan for every channel of a track. */
  private applyVoices(track: Track, when: number) {
    const synth = this.synth;
    if (!synth) return;
    const time = Math.max(when, synth.currentTime);
    const chans = synthChannels(track);
    track.channels.forEach((ch, i) => {
      const sc = chans[i];
      if (!ch.drums) {
        const prog = this.programMap.get(ch.program) ?? ch.program;
        synth.programChange(sc, prog, { time });
      }
      // Map the oscillator mix gain (~0.05..0.22) onto CC7 main volume.
      const vol = Math.round(Math.min(1, ch.gain * 4.5) * 127);
      synth.controllerChange(sc, 7, vol, { time });
      const pan = Math.round(((ch.pan ?? 0) + 1) / 2 * 127);
      synth.controllerChange(sc, 10, pan, { time });
    });
  }

  private schedule() {
    const t = this.current;
    if (!t || !this.ctx || t.midiUrl || t.channels.length === 0) return;
    const stepDur = 60 / t.bpm / 2; // 8th notes
    const totalSteps = t.channels[0].notes.length;
    const swing = Math.max(0, Math.min(0.33, t.swing ?? 0));
    const chans = synthChannels(t);
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      const s = this.step % totalSteps;
      // Seamless loop boundary: if the SoundFont arrived mid-track, hand the
      // voices over to the synth here so the switch lands on a downbeat.
      if (s === 0 && !this.useSynth && this.synth) {
        this.useSynth = true;
        this.applyVoices(t, this.nextTime - 0.02);
      }
      for (let ci = 0; ci < t.channels.length; ci++) {
        const ch = t.channels[ci];
        const tok = ch.notes[s % ch.notes.length];
        if (!tok || tok === '-') continue;
        const { name, vel } = parseToken(tok);
        // off-beat 8ths swing late
        const when = this.nextTime + (s % 2 === 1 ? swing * stepDur : 0);
        if (ch.drums) {
          const key = DRUM_KEYS[name];
          if (key === undefined) continue;
          if (this.useSynth && this.synth) {
            this.synth.noteOn(chans[ci], key, vel, { time: when });
            this.synth.noteOff(chans[ci], key, { time: when + 0.25 });
          } else {
            this.drumHit(name, when, ch.gain * (vel / 92));
          }
          continue;
        }
        // find sustain length
        let len = 1;
        for (let i = s + 1; i < s + 32; i++) {
          if (ch.notes[i % ch.notes.length] === '-') len++; else break;
        }
        const dur = stepDur * len * 0.95;
        if (this.useSynth && this.synth) {
          const key = midiNote(name, ch.octave);
          this.synth.noteOn(chans[ci], key, vel, { time: when });
          this.synth.noteOff(chans[ci], key, { time: when + dur });
        } else {
          this.note(freq(name, ch.octave), when, dur, ch.wave, ch.gain * (vel / 92), this.musicGain!);
        }
      }
      this.nextTime += stepDur;
      this.step++;
    }
  }

  /** Oscillator-path percussion while the SoundFont is loading. */
  private drumHit(name: string, when: number, gain: number) {
    const g = Math.min(0.3, gain);
    switch (name) {
      case 'K': this.note(70, when, 0.09, 'sine', g * 1.4, this.musicGain!); break;
      case 'S': case 'M': this.noiseAt(when, 0.09, 1800, g * 0.8); break;
      case 'H': case 'X': this.noiseAt(when, 0.04, 6000, g * 0.4); break;
      case 'O': this.noiseAt(when, 0.18, 6000, g * 0.4); break;
      case 'T': this.note(110, when, 0.12, 'sine', g, this.musicGain!); break;
      case 'U': this.note(160, when, 0.1, 'sine', g, this.musicGain!); break;
      case 'C': this.noiseAt(when, 0.5, 4000, g * 0.5); break;
      case 'R': case 'B': this.noiseAt(when, 0.12, 7000, g * 0.3); break;
    }
  }

  private noiseAt(when: number, dur: number, filterFreq: number, gain: number) {
    const ctx = this.ctx!;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = filterFreq > 3000 ? 'highpass' : 'lowpass';
    filt.frequency.value = filterFreq;
    const gn = ctx.createGain();
    gn.gain.value = gain;
    src.connect(filt); filt.connect(gn); gn.connect(this.musicGain!);
    src.start(when);
  }

  private note(f: number, when: number, dur: number, wave: Wave, gain: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.015);
    g.gain.setValueAtTime(gain * 0.8, when + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, when + dur);
    osc.connect(g); g.connect(dest);
    osc.start(when); osc.stop(when + dur + 0.05);
  }

  // ---- SFX (fully synthesized; independent of the SoundFont state) ----
  sfx(kind: 'chop' | 'mine' | 'splash' | 'hit' | 'miss' | 'levelup' | 'fire' | 'eat' | 'coins' | 'bury'
    | 'smith' | 'smelt' | 'pray' | 'spell' | 'bow' | 'gun' | 'thieve' | 'plant' | 'agility') {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dest = this.sfxGain!;
    const blip = (f: number, t: number, dur: number, wave: Wave = 'square', g = 0.15) => this.note(f, now + t, dur, wave, g, dest);
    switch (kind) {
      case 'chop': this.noise(now, 0.08, 800, 0.2); blip(180, 0, 0.06, 'triangle', 0.2); break;
      case 'mine': blip(2200, 0, 0.03, 'square', 0.08); blip(1400, 0.02, 0.04, 'square', 0.08); break;
      case 'splash': this.noise(now, 0.18, 1200, 0.12); break;
      case 'hit': this.noise(now, 0.1, 400, 0.25); blip(120, 0, 0.1, 'triangle', 0.25); break;
      case 'miss': this.noise(now, 0.06, 2000, 0.06); break;
      case 'fire': this.noise(now, 0.3, 600, 0.15); blip(300, 0.05, 0.15, 'sawtooth', 0.06); break;
      case 'eat': blip(300, 0, 0.05, 'triangle', 0.15); blip(220, 0.08, 0.05, 'triangle', 0.15); break;
      case 'coins': blip(1800, 0, 0.05, 'sine', 0.12); blip(2400, 0.06, 0.08, 'sine', 0.12); break;
      case 'bury': this.noise(now, 0.15, 500, 0.12); break;
      case 'levelup':
        blip(523, 0, 0.12, 'square', 0.12); blip(659, 0.12, 0.12, 'square', 0.12);
        blip(784, 0.24, 0.12, 'square', 0.12); blip(1047, 0.36, 0.3, 'square', 0.14);
        blip(262, 0, 0.5, 'triangle', 0.1); blip(330, 0.24, 0.4, 'triangle', 0.1);
        break;
      case 'smith': // hammer clang on the anvil
        this.noise(now, 0.04, 3000, 0.15);
        blip(1100, 0, 0.18, 'square', 0.07); blip(1650, 0, 0.12, 'triangle', 0.08);
        break;
      case 'smelt': // low furnace roar
        this.noise(now, 0.45, 300, 0.18); blip(90, 0.05, 0.35, 'sawtooth', 0.07);
        break;
      case 'pray': // soft chime
        blip(1568, 0, 0.4, 'sine', 0.1); blip(2093, 0.1, 0.5, 'sine', 0.07);
        break;
      case 'spell': // whoosh + sparkle
        this.noise(now, 0.2, 1600, 0.1);
        blip(900, 0.08, 0.05, 'sine', 0.1); blip(1400, 0.14, 0.05, 'sine', 0.1);
        blip(2100, 0.2, 0.08, 'sine', 0.1);
        break;
      case 'bow': // string twang
        blip(440, 0, 0.04, 'sawtooth', 0.1); blip(330, 0.03, 0.08, 'triangle', 0.12);
        this.noise(now + 0.02, 0.08, 2500, 0.05);
        break;
      case 'gun': // sharp crack
        this.noise(now, 0.06, 4000, 0.22);
        blip(90, 0, 0.05, 'square', 0.18); blip(60, 0.02, 0.08, 'triangle', 0.12);
        break;
      case 'thieve': // quick rustle
        this.noise(now, 0.05, 3500, 0.08); this.noise(now + 0.06, 0.05, 3000, 0.06);
        break;
      case 'plant': // soft thud into soil
        this.noise(now, 0.1, 350, 0.12); blip(110, 0, 0.08, 'triangle', 0.14);
        break;
      case 'agility': // effortful thump
        blip(150, 0, 0.07, 'triangle', 0.18); this.noise(now + 0.02, 0.08, 600, 0.1);
        blip(100, 0.08, 0.06, 'triangle', 0.12);
        break;
    }
  }

  private noise(when: number, dur: number, filterFreq: number, gain: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain!);
    src.start(when);
  }
}

export const audio = new AudioEngine();

// Region -> track mapping for auto-play & unlocks
// Boxes are checked in SPEC order (castle first); map is 224x224 (Phase 6).
export function trackForRegion(x: number, y: number): string {
  if (x >= 13 && x <= 28 && y >= 28 && y <= 46) return 'Stonecourt';
  if (x >= 12 && x <= 32 && y >= 58 && y <= 76) return 'Boghollow';
  if (x >= 52 && x <= 70 && y >= 22 && y <= 52) return 'Goblin Strut';
  // Phase-5 districts (checked before the open-ended river/north bands).
  if (x >= 76 && x <= 130 && y >= 8 && y <= 56) return 'Aldgate Streets'; // city
  if (x >= 132 && x <= 160 && y >= 10 && y <= 34) return 'Warbanner'; // warlord fort
  if (x >= 60 && x <= 150 && y >= 110 && y <= 160) return 'Underdeep'; // cavern
  // Phase-6 districts. The Ashen Depths check sits AFTER the cavern box above,
  // so the old cavern keeps 'Underdeep' and only the eastern extension is ash.
  // (the three open-ended bands below are clamped to the legacy 224 box so the
  // Phase 5 expansion east/south of it can carry its own music)
  if (x >= 152 && x < 224 && y >= 108 && y <= 162) return 'Ashfall'; // ashen depths
  if (x >= 168 && x < 224 && y <= 104) return 'Rimewind'; // frostpeak mountains
  if (x <= 64 && y >= 168 && y < 224) return 'Sunscorch'; // sunscorch desert
  if (x >= 70 && x <= 140 && y >= 178 && y <= 223) return 'Brackwater Tide'; // port
  if (x >= 8 && x <= 40 && y >= 80 && y <= 110) return 'Boghollow'; // deep bog
  if (x >= 42 && x <= 54 && y < 224) return 'Riverside';
  if (y < 22 && x < 46) return "Shepherd's Rest";
  if (x >= 29 && x <= 41 && y >= 40 && y <= 62) return 'Market Day';
  if (x >= 60 && x <= 70 && y >= 58 && y <= 68) return 'Whispering Stones';
  if (x >= 56 && x <= 72 && y >= 70 && y <= 84) return 'Quiet Meadow';
  if (x >= 54 && x <= 68 && y >= 38 && y <= 44) return 'Market Day';
  // Phase 5 handcrafted expansion (300×300) — checked after all legacy boxes.
  // The Untuned Mine (instanced dungeon carved under the southern sea) sits
  // inside the y>=217 band, so it must be checked before the coast tracks.
  if (x >= 6 && x <= 50 && y >= 238 && y <= 295) {
    if (y >= 284) return 'The Crystal Heart'; // F3: gate + Resonant Vault + Resonance Gallery
    return 'Untuned Halls'; // F1/F2 galleries
  }
  if (x >= 96 && x <= 112 && y >= 238 && y <= 252) return 'Beacon Rock'; // Gullswreck Light islet + coast
  if (x >= 76 && x <= 132 && y >= 250 && y <= 292) return 'Gullswreck Shanty'; // the cove village
  if (y >= 217) return 'Brackwater Tide'; // rest of the southern sea
  if (x >= 224) {
    if (x >= 262 && x <= 278 && y <= 22) return "Imber's Spire"; // the Imber Spire
    if (y <= 26) return 'Rimewind'; // Frostpeak's eastern skirts
    if (x >= 244 && x <= 272 && y >= 62 && y <= 106) return 'Quiet Meadow'; // Eldermere
    if (x >= 280 && x <= 296 && y >= 78 && y <= 94) return "Quiess' Rest"; // the Quiess Tower
    if (x <= 260 && y >= 64 && y <= 136) return 'Tanglewood Depths'; // the Tanglewood
    if (y <= 62) return 'Harvest Road'; // farm belt on the Aldgate road
    if (x >= 226 && x <= 252 && y >= 144 && y <= 168) return 'Ravenmoor'; // Ravenmoor Manor grounds
    if (x >= 256 && y >= 156 && y <= 200) return 'Stonewatch Garrison'; // Stonewatch (duchy garrison)
    if (y >= 106 && y <= 156) return 'Wraithrun'; // danger corridor
  }
  // Content-update skill towns (scripts/merge-content-update.ts). Boxes cover each
  // town's footprint (origin .. origin+footprint) and are checked after all the
  // legacy/expansion regions so they only claim their own clearing.
  if (x >= 115 && x <= 143 && y >= 162 && y <= 190) return 'Cairnchime Dig'; // mining
  if (x >= 203 && x <= 233 && y >= 176 && y <= 206) return 'Drummer\'s March'; // melee
  if (x >= 154 && x <= 182 && y >= 1 && y <= 27) return 'Quillrook Wilds'; // ranged
  if (x >= 188 && x <= 220 && y >= 59 && y <= 91) return 'Resonne Chord'; // magic
  if (x >= 160 && x <= 188 && y >= 176 && y <= 204) return 'Resin Hollow'; // woodcutting
  if (x >= 233 && x <= 263 && y >= 189 && y <= 217) return 'Saltsong Tide'; // fishing
  if (x >= 251 && x <= 281 && y >= 15 && y <= 45) return 'Forgekeep Anvil'; // smithing
  if (x >= 8 && x <= 38 && y >= 130 && y <= 158) return 'Verdancourt Bloom'; // herblore
  if (x >= 264 && x <= 294 && y >= 132 && y <= 162) return 'The Knell'; // prayer
  if (x >= 268 && x <= 298 && y >= 34 && y <= 64) return 'Quaverside'; // utility
  return 'Newbie Meadow';
}
