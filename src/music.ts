import type { FlowerType } from './types';

/** Original scene-specific pentatonic scores and locally synthesized instruments.
 * No microphone, remote audio requests or recorded-song dependencies. */
export interface MusicHand {
  id: string; x: number; y: number; openness: number;
  motion?: number; scale?: number; rotation?: number;
}
export type MusicScene = 'mountains' | 'waterside' | 'bamboo' | 'moonlake';
export interface MusicStatus {
  enabled: boolean; playing: boolean; volume: number; message: string;
  scene?: MusicScene; sceneName?: string; flowerNames?: string[]; voiceNames?: string[];
}
export interface FlowerVoice {
  name: string; label: string; instrument: 'warm-string' | 'xiao' | 'harmonic' | 'soft-zither' | 'airy-flute';
  register: number; articulation: string;
}
export const FLOWER_VOICES: Record<FlowerType, FlowerVoice> = {
  peony: { name: '牡丹', label: '牡丹暖弦', instrument: 'warm-string', register: -12, articulation: 'broad-double-string' },
  lotus: { name: '荷花', label: '荷花箫声', instrument: 'xiao', register: 0, articulation: 'long-legato' },
  plum: { name: '梅花', label: '梅花泛音', instrument: 'harmonic', register: 12, articulation: 'crisp-harmonic' },
  chrysanthemum: { name: '菊花', label: '菊花柔筝', instrument: 'soft-zither', register: -12, articulation: 'soft-low-pluck' },
  orchid: { name: '兰花', label: '兰花清笛', instrument: 'airy-flute', register: 12, articulation: 'airy-high-legato' },
};
export interface GestureMusicFrame {
  activity: number; openness: number; pan: number;
  voices: { note: number; pan: number; activity: number }[];
}
export interface ScoreStep { bass: number | null; pluck: number | null; flute: number | null; fluteBeats: number }
export const MUSIC_BPM = 68;
const BEAT = 60 / MUSIC_BPM;
const STEP = BEAT / 2;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const MODE = [0, 2, 4, 7, 9] as const;
const midiHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** D pentatonic across octaves, with a stable mapping for negative indices. */
export function pentatonicMidi(index: number): number {
  const value = Number.isFinite(index) ? Math.round(index) : 0;
  const octave = Math.floor(value / MODE.length);
  return 62 + octave * 12 + MODE[((value % MODE.length) + MODE.length) % MODE.length]!;
}

// Eight two-bar phrases: a composed call-and-answer, with space between breaths.
// Values address the pentatonic scale; each row spans sixteen eighth-note steps.
const MELODY: readonly (readonly (number | null)[])[] = [
  [2, null, null, 3, 4, null, 3, null, 2, null, 1, null, 0, null, null, null],
  [1, null, 2, null, 3, null, null, null, 4, null, 2, null, 1, null, null, null],
  [4, null, null, 5, 6, null, 5, null, 4, null, 3, null, 2, null, null, null],
  [3, null, 4, null, 2, null, 1, null, 0, null, null, null, null, null, null, null],
  [5, null, 4, null, 3, null, null, 2, 4, null, 3, null, 1, null, null, null],
  [2, null, null, 3, 5, null, 4, null, 3, null, 2, null, 1, null, null, null],
  [4, null, null, 6, 5, null, 4, null, 3, null, null, 2, 1, null, null, null],
  [2, null, 1, null, 0, null, -1, null, 0, null, null, null, null, null, null, null],
];
const ROOTS = [-10, -6, -8, -10, -10, -6, -8, -10] as const;

export interface MusicTheme {
  name: string; bpm: number; pluckEvery: number; bassEvery: number;
  melody: readonly (readonly (number | null)[])[];
  arpeggio: readonly number[]; reverb: number; wet: number; pluckTone: number; pluckStrength: number;
}
const MOUNTAIN_MELODY = [
  [0,null,null,null,2,null,null,null,1,null,null,null,-1,null,null,null],
  [2,null,null,null,3,null,null,null,1,null,null,null,0,null,null,null],
  [3,null,null,null,2,null,null,null,0,null,null,null,-1,null,null,null],
  [1,null,null,null,0,null,null,null,-1,null,null,null,0,null,null,null],
];
const BAMBOO_MELODY = [
  [2,null,4,3,null,5,4,null,3,null,2,3,null,4,2,null],
  [4,null,5,6,null,5,3,null,4,null,2,1,null,2,3,null],
  [5,null,4,3,null,4,2,null,3,null,4,5,null,3,2,null],
  [3,null,2,1,null,2,0,null,1,null,2,3,null,1,0,null],
];
const MOON_MELODY = [
  [4,null,null,null,null,null,2,null,3,null,null,null,null,null,1,null],
  [3,null,null,null,null,null,1,null,2,null,null,null,0,null,null,null],
  [2,null,null,null,null,null,4,null,3,null,null,null,null,null,1,null],
  [1,null,null,null,null,null,0,null,-1,null,null,null,0,null,null,null],
];
export const MUSIC_THEMES: Record<MusicScene, MusicTheme> = {
  mountains: { name:'云山远岫', bpm:62, pluckEvery:4, bassEvery:16, melody:MOUNTAIN_MELODY, arpeggio:[0,3,5,3], reverb:2.6, wet:.24, pluckTone:1500, pluckStrength:.19 },
  waterside: { name:'江南水乡', bpm:68, pluckEvery:2, bassEvery:8, melody:MELODY, arpeggio:[0,4,7,4,2,4,7,9], reverb:1.8, wet:.18, pluckTone:2900, pluckStrength:.19 },
  bamboo: { name:'竹林听风', bpm:74, pluckEvery:1, bassEvery:8, melody:BAMBOO_MELODY, arpeggio:[0,2,4,7,4,2,3,5], reverb:1.2, wet:.12, pluckTone:3900, pluckStrength:.16 },
  moonlake: { name:'荷塘月色', bpm:60, pluckEvery:4, bassEvery:16, melody:MOON_MELODY, arpeggio:[0,4,2,5], reverb:2.5, wet:.27, pluckTone:1800, pluckStrength:.14 },
};

export function scoreStep(step: number, scene: MusicScene = 'waterside'): ScoreStep {
  const current = ((Math.floor(Number.isFinite(step) ? step : 0) % 128) + 128) % 128;
  const phrase = Math.floor(current / 16), position = current % 16;
  const theme = MUSIC_THEMES[scene] ?? MUSIC_THEMES.waterside;
  const row = theme.melody[phrase % theme.melody.length]!;
  const melody = row[position];
  const root = ROOTS[phrase]!;
  const arpeggio = theme.arpeggio[Math.floor(position / theme.pluckEvery) % theme.arpeggio.length]!;
  let untilNext = 1;
  while (position + untilNext < 16 && row[position + untilNext] === null) untilNext++;
  return {
    bass: position % theme.bassEvery === 0 ? pentatonicMidi(root) : null,
    pluck: position % theme.pluckEvery === 0 ? pentatonicMidi(root + arpeggio + 5) : null,
    flute: melody === null ? null : pentatonicMidi(melody!),
    fluteBeats: Math.min(scene === 'moonlake' ? 3.4 : 2.8, Math.max(.65, untilNext * .46)),
  };
}

export function gestureMusicFrame(hands: MusicHand[]): GestureMusicFrame {
  const valid = hands.filter(hand => [hand.x, hand.y, hand.openness].every(Number.isFinite)).slice(0, 2);
  if (!valid.length) return { activity: 0, openness: .5, pan: 0, voices: [] };
  const voices = valid.flatMap(hand => {
    const activity = Number.isFinite(hand.motion) ? clamp(hand.motion!) : 0;
    return activity > .12 ? [{ note: pentatonicMidi(2 + Math.round((1 - clamp(hand.y)) * 5)),
      pan: (clamp(hand.x) - .5) * .8, activity }] : [];
  });
  return {
    activity: Math.max(0, ...voices.map(voice => voice.activity)),
    openness: valid.reduce((sum, hand) => sum + clamp(hand.openness), 0) / valid.length,
    pan: valid.reduce((sum, hand) => sum + (clamp(hand.x) - .5) * .8, 0) / valid.length,
    voices,
  };
}

interface Voice { sources: AudioScheduledSourceNode[]; nodes: AudioNode[] }

/** Synthesized guqin-like plucked strings, soft flute and a quiet sustained bed. */
class InstrumentRack {
  private readonly bus: GainNode;
  private readonly colour: BiquadFilterNode;
  private readonly master: GainNode;
  private readonly effects: AudioNode[];
  private readonly strings = new Map<number, AudioBuffer>();
  private readonly voices = new Set<Voice>();
  private readonly fluteWave: PeriodicWave;
  private breathBuffer: AudioBuffer | null = null;

  constructor(private context: BaseAudioContext, destination: AudioNode, private limitVoices = true, scene: MusicScene = 'waterside') {
    this.bus = context.createGain();
    this.colour = context.createBiquadFilter();
    this.colour.type = 'lowpass'; this.colour.frequency.value = 3000; this.colour.Q.value = .45;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14; compressor.knee.value = 16; compressor.ratio.value = 4;
    compressor.attack.value = .012; compressor.release.value = .35;
    this.master = context.createGain(); this.master.gain.value = 0;
    this.bus.connect(this.colour); this.colour.connect(compressor);
    compressor.connect(this.master); this.master.connect(destination);

    const reverb = context.createConvolver();
    reverb.buffer = this.impulse(MUSIC_THEMES[scene].reverb);
    const wet = context.createGain(); wet.gain.value = MUSIC_THEMES[scene].wet;
    this.bus.connect(reverb); reverb.connect(wet); wet.connect(this.colour);
    this.effects = [this.bus, this.colour, compressor, this.master, reverb, wet];
    this.fluteWave = context.createPeriodicWave(new Float32Array(6), new Float32Array([0, 1, .14, .055, .025, .006]));
  }

  volume(value: number, fade = .12): void {
    const now = this.context.currentTime;
    const parameter = this.master.gain;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(clamp(value), now + fade);
  }

  colourFor(openness: number): void {
    this.colour.frequency.setTargetAtTime(2200 + clamp(openness) * 2100, this.context.currentTime, .2);
  }

  pluck(note: number, at: number, strength: number, pan = 0, style: { attack?: number; decay?: number; tone?: number } = {}): void {
    const source = this.context.createBufferSource(); source.buffer = this.string(note);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(strength, at + (style.attack ?? .008));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + (style.decay ?? 3.5));
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass';
    filter.frequency.value = style.tone ?? 4200; filter.Q.value = .4;
    source.connect(filter); filter.connect(envelope);
    const panner = this.pan(envelope, pan);
    const voice = this.register([source], [filter, envelope, panner]);
    source.start(at); source.stop(at + Math.min(3.6, (style.decay ?? 3.5) + .08));
    source.onended = () => this.finish(voice);
  }

  flute(note: number, at: number, duration: number, pan = -.12, strength = .115, airy = false): void {
    const oscillator = this.context.createOscillator();
    if (airy) oscillator.type = 'sine'; else oscillator.setPeriodicWave(this.fluteWave);
    oscillator.frequency.value = midiHz(note);
    const vibrato = this.context.createOscillator(); vibrato.frequency.value = airy ? 5.3 : 4.7;
    const depth = this.context.createGain(); depth.gain.value = airy ? 7 : 5;
    vibrato.connect(depth); depth.connect(oscillator.detune);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(strength, at + (airy ? .21 : .13));
    envelope.gain.linearRampToValueAtTime(strength * .73, at + Math.min(.4, duration * .55));
    envelope.gain.setValueAtTime(strength * .73, at + Math.max(.42, duration - .28));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration + .28);
    oscillator.connect(envelope);
    const panner = this.pan(envelope, pan);
    const sources: AudioScheduledSourceNode[] = [oscillator, vibrato];
    const nodes: AudioNode[] = [envelope, panner, depth];
    if (airy) {
      const breath = this.context.createBufferSource(); breath.buffer = this.noise(); breath.loop = true;
      const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 2100; filter.Q.value = .8;
      const mix = this.context.createGain(); mix.gain.value = .055;
      breath.connect(filter); filter.connect(mix); mix.connect(envelope);
      sources.push(breath); nodes.push(filter, mix);
    }
    const voice = this.register(sources, nodes);
    for (const source of sources) { source.start(at); source.stop(at + duration + .3); }
    oscillator.onended = () => this.finish(voice);
  }

  lead(flower: FlowerType, note: number, at: number, duration: number, pan: number): void {
    const profile = FLOWER_VOICES[flower];
    const pitch = note + profile.register;
    switch (profile.instrument) {
      case 'warm-string':
        this.pluck(pitch, at, .3, pan, { attack:.028, decay:3.4, tone:1800 });
        this.pluck(pitch + 12, at + .045, .09, pan * .6, { attack:.045, decay:2.8, tone:2000 });
        break;
      case 'xiao': this.flute(pitch, at, duration, pan, .12); break;
      case 'harmonic': this.harmonic(pitch, at, pan); break;
      case 'soft-zither': this.pluck(pitch, at, .34, pan, { attack:.065, decay:3.15, tone:1100 }); break;
      case 'airy-flute': this.flute(pitch, at, duration * 1.1, pan, .085, true); break;
    }
  }

  private harmonic(note: number, at: number, pan: number): void {
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(.14, at + .005);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + 1.8);
    const weights: GainNode[] = [];
    const sources = [1,2,3].map((multiple, index) => {
      const oscillator = this.context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = midiHz(note) * multiple;
      const weight = this.context.createGain(); weight.gain.value = [1,.28,.1][index]!;
      oscillator.connect(weight); weight.connect(envelope); weights.push(weight); return oscillator;
    });
    const panner = this.pan(envelope, pan); const voice = this.register(sources, [envelope,panner,...weights]);
    for (const source of sources) { source.start(at); source.stop(at + 1.85); }
    sources[0]!.onended = () => this.finish(voice);
  }

  private noise(): AudioBuffer {
    if (this.breathBuffer) return this.breathBuffer;
    const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const data = buffer.getChannelData(0); let seed = 86471;
    for (let i=0;i<data.length;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; data[i]=seed/4294967296*2-1; }
    this.breathBuffer=buffer; return buffer;
  }

  pad(note: number, at: number, beat = BEAT): void {
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(.037, at + .75);
    envelope.gain.linearRampToValueAtTime(.023, at + beat * 3);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + beat * 7.8);
    const sources = [note, note + 12].map((midi, index) => {
      const oscillator = this.context.createOscillator(); oscillator.type = 'sine';
      oscillator.frequency.value = midiHz(midi); oscillator.detune.value = index ? 3 : -3;
      oscillator.connect(envelope); oscillator.start(at); oscillator.stop(at + beat * 8);
      return oscillator;
    });
    const panner = this.pan(envelope, .07);
    const voice = this.register(sources, [envelope, panner]);
    sources[0]!.onended = () => this.finish(voice);
  }

  stop(fade = .12): void {
    this.volume(0, fade);
    for (const voice of this.voices) {
      for (const source of voice.sources) { try { source.stop(this.context.currentTime + fade + .025); } catch { /* already ended */ } }
    }
  }

  dispose(): void {
    for (const voice of [...this.voices]) {
      for (const source of voice.sources) { try { source.stop(); } catch { /* already ended */ } }
      this.finish(voice);
    }
    for (const node of this.effects) node.disconnect();
    this.strings.clear(); this.breathBuffer = null;
  }

  private pan(source: AudioNode, value: number): AudioNode {
    const createPanner = this.context.createStereoPanner;
    if (typeof createPanner === 'function') {
      const panner = createPanner.call(this.context); panner.pan.value = clamp(value, -.4, .4);
      source.connect(panner); panner.connect(this.bus); return panner;
    }
    const passthrough = this.context.createGain(); source.connect(passthrough); passthrough.connect(this.bus); return passthrough;
  }

  private register(sources: AudioScheduledSourceNode[], nodes: AudioNode[]): Voice {
    // At this tempo normal polyphony is under twenty notes; bound pathological
    // calls as well so repeated UI events cannot grow an unbounded audio graph.
    if (this.limitVoices && this.voices.size >= 40) {
      const oldest = this.voices.values().next().value as Voice;
      for (const source of oldest.sources) { try { source.stop(); } catch { /* already ended */ } }
      this.finish(oldest);
    }
    const voice = { sources, nodes }; this.voices.add(voice); return voice;
  }

  private finish(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    for (const node of [...voice.sources, ...voice.nodes]) node.disconnect();
  }

  private string(note: number): AudioBuffer {
    const cached = this.strings.get(note); if (cached) return cached;
    const sampleRate = this.context.sampleRate;
    const length = Math.round(sampleRate * 3.6);
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    const period = Math.max(4, Math.round(sampleRate / midiHz(note)));
    const ring = new Float32Array(period);
    let seed = (note * 9199 + 71) >>> 0;
    for (let i = 0; i < period; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      ring[i] = ((seed / 4294967296) * 2 - 1) * .55 + Math.sin(i / period * Math.PI * 2) * .17;
    }
    let dc = 0;
    for (let i = 0; i < length; i++) {
      const index = i % period;
      const sample = ring[index]!;
      ring[index] = (sample + ring[(index + 1) % period]!) * .4985;
      dc += (sample - dc) * .002;
      data[i] = (sample - dc) * Math.min(1, i / Math.max(1, sampleRate * .003));
    }
    if (this.strings.size >= 28) this.strings.delete(this.strings.keys().next().value!);
    this.strings.set(note, buffer); return buffer;
  }

  private impulse(seconds: number): AudioBuffer {
    const buffer = this.context.createBuffer(2, Math.round(this.context.sampleRate * seconds), this.context.sampleRate);
    let seed = 74117;
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const t = i / data.length;
        data[i] = ((seed >>> 0) / 4294967296 * 2 - 1) * (1 - t) ** 3 * Math.min(1, t * 70);
      }
    }
    return buffer;
  }
}

function normalizedFlowers(flowers: FlowerType[]): FlowerType[] {
  return (Array.isArray(flowers) ? flowers : []).filter(flower => Object.prototype.hasOwnProperty.call(FLOWER_VOICES, flower)).slice(0, 2);
}

/** The sustained bed is scored by scene; selected flowers alternate their own
 * melodic instruments. Gesture ornaments remain a separate pentatonic layer. */
function scheduleScore(rack: InstrumentRack, scene: MusicScene, flowers: FlowerType[], step: number, at: number, cursor: number): number {
  const theme = MUSIC_THEMES[scene], beat = 60 / theme.bpm;
  const score = scoreStep(step, scene);
  if (score.bass !== null) rack.pluck(score.bass, at, scene === 'moonlake' ? .19 : .25, -.08, { attack:.025, tone:1500 });
  if (score.pluck !== null) rack.pluck(score.pluck, at, theme.pluckStrength, step % 4 ? .13 : -.13,
    { attack: scene === 'mountains' ? .03 : .008, tone:theme.pluckTone, decay:scene === 'bamboo' ? 2.25 : 3.5 });
  if (score.flute !== null) {
    const index = cursor % flowers.length;
    rack.lead(flowers[index]!, score.flute, at, score.fluteBeats * beat, flowers.length > 1 ? (index === 0 ? -.22 : .22) : 0);
    cursor++;
  }
  if (step % 16 === 0 && score.bass !== null) rack.pad(score.bass + 12, at, beat);
  return cursor;
}

/** A player is explicitly started by a click. Scene/flower changes while paused
 * only save configuration; changing a live configuration crossfades two racks. */
export class GardenMusic {
  private context: AudioContext | null = null;
  private userGain: GainNode | null = null;
  private rack: InstrumentRack | null = null;
  private retiring = new Map<InstrumentRack, ReturnType<typeof setTimeout>>();
  private scene: MusicScene = 'waterside';
  private flowers: FlowerType[] = ['peony', 'lotus'];
  private leadCursor = 0;
  private volumeValue = .3;
  private enabled = false;
  private disposed = false;
  private generation = 0;
  private pending: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepAt = 0;
  private step = 0;
  private lastCapturedAt = -Infinity;
  private lastGestureAudioTime = -Infinity;
  private lastSelectionAt = -Infinity;
  private gesture = gestureMusicFrame([]);

  constructor(private onStatus?: (status: MusicStatus) => void) { this.emit(); }

  setScene(scene: MusicScene): void {
    if (this.disposed || !MUSIC_THEMES[scene] || scene === this.scene) return;
    this.scene = scene; this.transition(0); this.emit();
  }

  setFlowers(flowers: FlowerType[]): void {
    if (this.disposed) return;
    const next = normalizedFlowers(flowers);
    if (!next.length || next.length === this.flowers.length && next.every((flower, index) => flower === this.flowers[index])) return;
    const changed = next.findIndex((flower, index) => flower !== this.flowers[index]);
    this.flowers = next;
    this.transition(Math.max(0, changed)); this.emit();
  }

  async start(): Promise<void> {
    if (this.disposed) throw new Error('音乐播放器已关闭，请刷新页面后重试。');
    if (this.enabled && this.context?.state === 'running') return;
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    const pending = this.begin(generation);
    this.pending = pending;
    try { await pending; } finally { if (this.pending === pending) this.pending = null; }
  }

  pause(): void {
    ++this.generation; this.pending = null; this.enabled = false;
    this.clearScheduler(); this.clearRetiring(); this.rack?.stop();
    this.gesture = gestureMusicFrame([]); this.lastCapturedAt = -Infinity;
    this.lastGestureAudioTime = -Infinity;
    this.emit();
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.volumeValue = clamp(value); this.applyUserVolume(); this.emit();
  }
  getVolume(): number { return this.volumeValue; }

  update(hands: MusicHand[], capturedAt: number): void {
    if (!Number.isFinite(capturedAt) || capturedAt <= this.lastCapturedAt) return;
    this.lastCapturedAt = capturedAt;
    this.gesture = gestureMusicFrame(hands);
    this.lastGestureAudioTime = this.context?.currentTime ?? -Infinity;
    if (this.enabled) this.rack?.colourFor(this.gesture.openness);
  }

  flowerSelected(): void {
    if (!this.enabled || !this.context || !this.rack || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (now - this.lastSelectionAt < .3) return;
    this.lastSelectionAt = now;
    // The main voice already changed through setFlowers. This cue is only an
    // acknowledgement, not the musical response to the selected flower.
    this.rack.pluck(pentatonicMidi(5), now + .015, .13, -.08);
    this.rack.pluck(pentatonicMidi(7), now + .1, .07, .08);
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause(); this.disposed = true;
    this.rack?.dispose(); this.rack = null;
    this.userGain?.disconnect(); this.userGain = null;
    const context = this.context; this.context = null;
    if (context) context.onstatechange = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  private async begin(generation: number): Promise<void> {
    // A browser interruption can leave an old scheduler alive. Reuse the audio
    // context, but always start this playback with one fresh scheduler/rack.
    this.clearScheduler(); this.enabled = false;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.rack?.dispose(); this.rack = null; this.clearRetiring();
        const Constructor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) throw new Error('当前浏览器无法播放互动音乐，请使用更新的 Safari 或 Chrome。');
        this.context = new Constructor();
        this.userGain = this.context.createGain(); this.userGain.gain.value = 0;
        this.userGain.connect(this.context.destination);
        this.context.onstatechange = () => this.emit();
      }
      await this.context.resume();
      if (generation !== this.generation || this.disposed) return;
      this.clearRetiring(); this.rack?.dispose();
      this.rack = new InstrumentRack(this.context, this.userGain!, true, this.scene);
      this.enabled = true; this.step = 0; this.leadCursor = 0;
      this.nextStepAt = this.context.currentTime + .08;
      this.applyUserVolume(.15); this.rack.volume(1, .5);
      this.rack.colourFor(this.gesture.openness);
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 100);
      this.emit();
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.enabled = false; this.clearScheduler(); this.clearRetiring(); this.rack?.dispose(); this.rack = null;
      this.userGain?.disconnect(); this.userGain = null;
      const context = this.context; this.context = null;
      if (context) context.onstatechange = null;
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      this.emit(error instanceof Error ? error.message : '音乐暂时无法开启，请再点一次重试。');
      throw error;
    }
  }

  private transition(firstVoice: number): void {
    if (!this.enabled || !this.context || this.context.state !== 'running' || !this.userGain) return;
    // At most two racks exist: the new score and one fading previous score.
    // Rapid scene changes retire older transitions immediately, without timers
    // or sampled-string caches accumulating behind the UI.
    this.clearRetiring();
    const old = this.rack;
    if (old) {
      old.stop(.75);
      const timer = setTimeout(() => { old.dispose(); this.retiring.delete(old); }, 850);
      this.retiring.set(old, timer);
    }
    this.rack = new InstrumentRack(this.context, this.userGain, true, this.scene);
    this.rack.colourFor(this.gesture.openness); this.rack.volume(1, .75);
    this.step = 0; this.leadCursor = firstVoice;
    this.nextStepAt = this.context.currentTime + .04;
    this.schedule();
  }

  private clearScheduler(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private clearRetiring(): void {
    for (const [rack, timer] of this.retiring) { clearTimeout(timer); rack.dispose(); }
    this.retiring.clear();
  }

  private applyUserVolume(fade = .08): void {
    if (!this.context || !this.userGain) return;
    const now = this.context.currentTime, gain = this.userGain.gain;
    gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.volumeValue ** 1.25 * .82, now + fade);
  }

  private schedule(): void {
    if (!this.enabled || !this.context || !this.rack || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (this.nextStepAt < now - .22) this.nextStepAt = now + .04;
    const stepDuration = 60 / MUSIC_THEMES[this.scene].bpm / 2;
    let iterations = 0;
    while (this.nextStepAt < now + .45 && iterations++ < 8) {
      const at = this.nextStepAt;
      this.leadCursor = scheduleScore(this.rack, this.scene, this.flowers, this.step, at, this.leadCursor);
      const fresh = now - this.lastGestureAudioTime < .5;
      if (fresh && this.gesture.voices.length && (this.step % 2 === 0 || this.gesture.activity > .72)) {
        const voice = this.gesture.voices[this.step % this.gesture.voices.length]!;
        this.rack.pluck(voice.note, at + .035, .07 + voice.activity * .09, voice.pan);
      }
      this.nextStepAt += stepDuration; this.step = (this.step + 1) % 128;
    }
  }

  private emit(error?: string): void {
    const playing = this.enabled && this.context?.state === 'running';
    const sceneName = MUSIC_THEMES[this.scene].name;
    const flowerNames = this.flowers.map(flower => FLOWER_VOICES[flower].name);
    const voiceNames = this.flowers.map(flower => FLOWER_VOICES[flower].label);
    const description = `${sceneName} · ${voiceNames.join(' / ')}`;
    this.onStatus?.({ enabled: this.enabled, playing, volume: this.volumeValue,
      scene:this.scene, sceneName, flowerNames, voiceNames,
      message: error ?? (playing ? description : `${description} · 点按开启`) });
  }
}

export interface MusicPreviewOptions { scene?: MusicScene; flowers?: FlowerType[]; volume?: number }
/** Render the same sustained score/instruments, with configurable scene/voices,
 * so musical changes can be checked independently of short selection cues. */
export async function renderGardenMusicPreview(seconds = 16, options: MusicPreviewOptions = {}): Promise<AudioBuffer> {
  const duration = clamp(Number.isFinite(seconds) ? seconds : 16, 2, 60);
  const scene = options.scene && MUSIC_THEMES[options.scene] ? options.scene : 'waterside';
  const flowers = normalizedFlowers(options.flowers ?? ['peony','lotus']);
  if (!flowers.length) flowers.push('peony','lotus');
  const volume = Number.isFinite(options.volume) ? clamp(options.volume!) : .85;
  const context = new OfflineAudioContext(2, Math.ceil(duration * 32000), 32000);
  const master = context.createGain(); master.gain.value = volume ** 1.25 * .82; master.connect(context.destination);
  const rack = new InstrumentRack(context, master, false, scene);
  rack.volume(1, .3);
  const stepDuration = 60 / MUSIC_THEMES[scene].bpm / 2;
  let cursor = 0;
  for (let step = 0, at = .08; at < duration - .5; step++, at += stepDuration) {
    cursor = scheduleScore(rack, scene, flowers, step, at, cursor);
  }
  const result = await context.startRendering(); rack.dispose(); master.disconnect(); return result;
}
