// Procedural audio: a small WebAudio synth with a reverb bus, a step
// sequencer for the soundtrack and one-shot sound effects. No audio files.

type Wave = OscillatorType;

interface Voice {
  wave: Wave;
  gain: number;
  attack: number;
  release: number;
  cutoff?: number;
  detune?: number;
}

interface Track {
  bpm: number;
  steps: number; // 16th-note steps per bar
  chords: number[][]; // midi notes per bar
  arp?: { voice: Voice; pattern: number[]; octave: number };
  bass?: { voice: Voice; pattern: number[] };
  pad?: { voice: Voice };
  lead?: { voice: Voice; notes: (number | null)[]; stepLen: number };
  drums?: { kick: number[]; snare: number[]; hat: number[] };
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

const PLUCK: Voice = { wave: 'triangle', gain: 0.16, attack: 0.005, release: 0.6, cutoff: 3200 };
const BASS: Voice = { wave: 'triangle', gain: 0.2, attack: 0.01, release: 0.35, cutoff: 900 };
const PAD: Voice = { wave: 'sawtooth', gain: 0.035, attack: 0.6, release: 1.4, cutoff: 1100, detune: 8 };
const FLUTE: Voice = { wave: 'sine', gain: 0.11, attack: 0.06, release: 0.5 };
const LEAD: Voice = { wave: 'square', gain: 0.05, attack: 0.01, release: 0.25, cutoff: 2400 };
const BELL: Voice = { wave: 'sine', gain: 0.1, attack: 0.002, release: 1.6 };

// Chord helpers (root midi + intervals)
const maj = (r: number) => [r, r + 4, r + 7, r + 12];
const min = (r: number) => [r, r + 3, r + 7, r + 12];
const sus = (r: number) => [r, r + 5, r + 7, r + 12];

const TRACKS: Record<string, Track> = {
  title: {
    bpm: 72, steps: 16,
    chords: [min(57), maj(53), maj(48), maj(55)],
    arp: { voice: BELL, pattern: [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1, 1, -1], octave: 12 },
    pad: { voice: PAD },
    bass: { voice: BASS, pattern: [0, -1, -1, -1, -1, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1] },
    lead: { voice: FLUTE, stepLen: 4, notes: [76, null, 74, 72, 74, null, 69, null, 72, null, 71, 67, 69, null, null, null] },
  },
  town: {
    bpm: 92, steps: 16,
    chords: [maj(50), maj(55), min(52), maj(57)],
    arp: { voice: PLUCK, pattern: [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 1], octave: 12 },
    bass: { voice: BASS, pattern: [0, -1, -1, -1, 2, -1, -1, -1, 0, -1, -1, -1, 2, -1, 1, -1] },
    pad: { voice: PAD },
    lead: { voice: FLUTE, stepLen: 4, notes: [78, 76, 74, null, 71, 74, 76, null, 76, 74, 71, 69, 71, null, 69, null] },
  },
  field: {
    bpm: 100, steps: 16,
    chords: [maj(55), maj(50), min(52), maj(48)],
    arp: { voice: PLUCK, pattern: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 3, 2], octave: 12 },
    bass: { voice: BASS, pattern: [0, -1, -1, 0, -1, -1, 2, -1, 0, -1, -1, 0, -1, -1, 1, -1] },
    pad: { voice: PAD },
    lead: { voice: FLUTE, stepLen: 4, notes: [74, 79, 78, 76, 74, null, 71, 72, 74, 76, 74, 71, 72, null, null, null] },
  },
  forest: {
    bpm: 80, steps: 16,
    chords: [min(52), min(48 + 9 - 12), maj(48), sus(50)],
    arp: { voice: BELL, pattern: [0, -1, 2, -1, 1, -1, 3, -1, 0, -1, 2, -1, 3, -1, 1, -1], octave: 12 },
    bass: { voice: BASS, pattern: [0, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1] },
    pad: { voice: PAD },
    lead: { voice: FLUTE, stepLen: 8, notes: [71, 69, 67, null, 66, 64, 67, null] },
  },
  waystone: {
    bpm: 64, steps: 16,
    chords: [min(45), sus(45), min(41 + 3), sus(43)],
    arp: { voice: BELL, pattern: [3, -1, -1, 2, -1, -1, 1, -1, 0, -1, -1, 1, -1, -1, 2, -1], octave: 24 },
    pad: { voice: PAD },
    bass: { voice: BASS, pattern: [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1] },
  },
  battle: {
    bpm: 148, steps: 16,
    chords: [min(52), min(52), maj(48), maj(50)],
    arp: { voice: LEAD, pattern: [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 1, 3, 2, 1, 2], octave: 12 },
    bass: { voice: BASS, pattern: [0, -1, 0, -1, 0, -1, 0, 2, 0, -1, 0, -1, 0, -1, 1, 2] },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1], hat: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1] },
    lead: { voice: FLUTE, stepLen: 2, notes: [76, null, 79, null, 76, 74, 72, null, 71, null, 72, 74, 76, null, null, null, 76, null, 79, 81, 83, null, 81, 79, 78, null, 74, null, 76, null, null, null] },
  },
  boss: {
    bpm: 164, steps: 16,
    chords: [min(45), min(45), maj(41), maj(43)],
    arp: { voice: LEAD, pattern: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 2, 3, 2, 1], octave: 24 },
    bass: { voice: BASS, pattern: [0, 0, -1, 0, 0, -1, 0, 2, 0, 0, -1, 0, 1, -1, 2, 3] },
    pad: { voice: PAD },
    drums: { kick: [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1], hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    lead: { voice: LEAD, stepLen: 2, notes: [69, null, 72, null, 76, null, 74, 72, 71, null, 69, null, 67, null, 69, null, 72, null, 76, null, 79, null, 77, 76, 74, null, 76, null, null, null, null, null] },
  },
  ending: {
    bpm: 70, steps: 16,
    chords: [maj(50), maj(57), min(59 - 12), maj(55)],
    arp: { voice: BELL, pattern: [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1, 3, -1], octave: 12 },
    pad: { voice: PAD },
    bass: { voice: BASS, pattern: [0, -1, -1, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1] },
    lead: { voice: FLUTE, stepLen: 4, notes: [78, null, 76, 74, 76, null, 81, null, 79, null, 78, 76, 74, null, null, null] },
  },
};

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noise!: AudioBuffer;
  private track: Track | null = null;
  private trackName = '';
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  musicVolume = 0.55;
  sfxVolume = 0.8;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private note(freq: number, t: number, dur: number, v: Voice, bus: AudioNode, wet = 0.5, vel = 1) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const peak = v.gain * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + v.attack);
    g.gain.setTargetAtTime(0.0001, t + Math.max(dur, v.attack), v.release / 4);
    let out: AudioNode = g;
    if (v.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = v.cutoff;
      g.connect(f);
      out = f;
    }
    out.connect(bus);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      out.connect(s).connect(this.reverbSend);
    }
    const oscs = v.detune ? [-v.detune, v.detune] : [0];
    for (const dt of oscs) {
      const o = ctx.createOscillator();
      o.type = v.wave;
      o.frequency.value = freq;
      o.detune.value = dt;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + v.release + 0.1);
    }
  }

  private drum(kind: 'kick' | 'snare' | 'hat', t: number) {
    const ctx = this.ctx!;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.25);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const g = ctx.createGain();
    const len = kind === 'hat' ? 0.04 : 0.14;
    g.gain.setValueAtTime(kind === 'hat' ? 0.06 : 0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(this.musicBus);
    if (kind === 'snare') g.connect(this.reverbSend);
    src.start(t, Math.random() * 0.5, len + 0.02);
  }

  playMusic(name: string) {
    this.ensure();
    if (!this.ctx || this.trackName === name) return;
    const tr = TRACKS[name];
    this.trackName = name;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(this.musicVolume, this.ctx.currentTime + 1.2);
    this.track = tr ?? null;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic(fade = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, t + fade);
    const name = this.trackName;
    window.setTimeout(() => {
      if (this.trackName === name) {
        this.track = null;
        this.trackName = '';
      }
    }, fade * 1000);
  }

  private schedule() {
    if (!this.ctx || !this.track) return;
    const tr = this.track;
    const stepDur = 60 / tr.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const t = this.nextTime;
      const bar = Math.floor(this.step / tr.steps) % tr.chords.length;
      const s = this.step % tr.steps;
      const chord = tr.chords[bar];
      if (tr.pad && s === 0) for (const n of chord.slice(0, 3)) this.note(midi(n + 12), t, stepDur * tr.steps * 0.9, tr.pad.voice, this.musicBus, 0.6);
      if (tr.arp) {
        const idx = tr.arp.pattern[s];
        if (idx >= 0) this.note(midi(chord[idx % chord.length] + tr.arp.octave), t, stepDur * 0.9, tr.arp.voice, this.musicBus, 0.45, s % 4 === 0 ? 1 : 0.75);
      }
      if (tr.bass) {
        const idx = tr.bass.pattern[s];
        if (idx >= 0) this.note(midi(chord[idx % chord.length] - 12), t, stepDur * 1.6, tr.bass.voice, this.musicBus, 0.1);
      }
      if (tr.drums) {
        if (tr.drums.kick[s]) this.drum('kick', t);
        if (tr.drums.snare[s]) this.drum('snare', t);
        if (tr.drums.hat[s]) this.drum('hat', t);
      }
      if (tr.lead) {
        const total = tr.lead.notes.length * tr.lead.stepLen;
        const ls = this.step % total;
        if (ls % tr.lead.stepLen === 0) {
          const n = tr.lead.notes[ls / tr.lead.stepLen];
          if (n !== null && n !== undefined) this.note(midi(n), t, stepDur * tr.lead.stepLen * 0.85, tr.lead.voice, this.musicBus, 0.55);
        }
      }
      this.nextTime += stepDur;
      this.step++;
    }
  }

  // ---- SFX ---------------------------------------------------------------
  private tone(freq: number, dur: number, wave: Wave, gain: number, slideTo?: number, wet = 0.2) {
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    if (wet) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s).connect(this.reverbSend);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, freq: number, gain: number, type: BiquadFilterType = 'bandpass') {
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.3), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    g.connect(this.reverbSend);
    src.start(t, 0, dur + 0.05);
  }

  blip(pitch = 1) {
    this.tone(520 * pitch + Math.random() * 30, 0.05, 'square', 0.035, undefined, 0);
  }
  move() {
    this.tone(880, 0.05, 'triangle', 0.08, 1100, 0.1);
  }
  confirm() {
    this.tone(660, 0.08, 'triangle', 0.12, 990);
    window.setTimeout(() => this.tone(990, 0.12, 'triangle', 0.1, 1320), 60);
  }
  cancel() {
    this.tone(500, 0.1, 'triangle', 0.1, 300);
  }
  hurt() {
    this.burst(0.25, 900, 0.5, 'lowpass');
    this.tone(220, 0.25, 'sawtooth', 0.12, 90, 0.1);
  }
  slash() {
    this.burst(0.18, 4000, 0.35, 'highpass');
    this.tone(1200, 0.15, 'sawtooth', 0.06, 200, 0.3);
  }
  hit() {
    this.burst(0.3, 1400, 0.5);
    this.tone(160, 0.3, 'square', 0.1, 60, 0.2);
  }
  heal() {
    [0, 4, 7, 12].forEach((s, i) => window.setTimeout(() => this.tone(midi(72 + s), 0.3, 'sine', 0.1, undefined, 0.6), i * 70));
  }
  save() {
    [0, 7, 12, 16, 19].forEach((s, i) => window.setTimeout(() => this.tone(midi(67 + s), 0.6, 'sine', 0.09, undefined, 0.8), i * 90));
  }
  alert() {
    this.tone(1320, 0.08, 'square', 0.08);
    window.setTimeout(() => this.tone(1760, 0.18, 'square', 0.08), 80);
  }
  spare() {
    [12, 7, 4, 0, 7, 12, 19].forEach((s, i) => window.setTimeout(() => this.tone(midi(72 + s), 0.35, 'sine', 0.08, undefined, 0.8), i * 55));
  }
  dust() {
    this.burst(0.9, 2400, 0.3, 'highpass');
  }
  levelUp() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => window.setTimeout(() => this.tone(midi(60 + s), 0.25, 'triangle', 0.1, undefined, 0.5), i * 60));
  }
  shatter() {
    this.burst(0.6, 3000, 0.5);
    this.tone(400, 0.6, 'sawtooth', 0.12, 50, 0.4);
  }
  whoosh() {
    this.burst(0.35, 1800, 0.18);
  }
  chime() {
    this.tone(midi(84), 1.2, 'sine', 0.08, undefined, 0.9);
    window.setTimeout(() => this.tone(midi(91), 1.4, 'sine', 0.06, undefined, 0.9), 120);
  }
  bind() {
    this.tone(300, 0.5, 'triangle', 0.12, 1200, 0.5);
  }
}

export const Sound = new AudioEngine();
