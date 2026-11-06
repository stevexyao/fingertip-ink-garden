/** Original 68 BPM pentatonic score and locally synthesized instruments.
 * No microphone, remote audio requests or recorded-song dependencies. */
export interface MusicHand {
  id: string; x: number; y: number; openness: number;
  motion?: number; scale?: number; rotation?: number;
}
export interface MusicStatus { enabled: boolean; playing: boolean; volume: number; message: string }
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

export function scoreStep(step: number): ScoreStep {
  const current = ((Math.floor(Number.isFinite(step) ? step : 0) % 128) + 128) % 128;
  const phrase = Math.floor(current / 16);
  const position = current % 16;
  const melody = MELODY[phrase]![position];
  const root = ROOTS[phrase]!;
  const arpeggio = [0, 4, 7, 4, 2, 4, 7, 9][Math.floor(position / 2)]!;
  // Sustained flute notes end before the following note; deliberate rests remain.
  let untilNext = 1;
  while (position + untilNext < 16 && MELODY[phrase]![position + untilNext] === null) untilNext++;
  return {
    bass: position % 8 === 0 ? pentatonicMidi(root) : null,
    pluck: position % 2 === 0 ? pentatonicMidi(root + arpeggio + 5) : null,
    flute: melody === null ? null : pentatonicMidi(melody!),
    fluteBeats: Math.min(2.8, Math.max(.65, untilNext * .46)),
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

  constructor(private context: BaseAudioContext, destination: AudioNode, private limitVoices = true) {
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
    reverb.buffer = this.impulse();
    const wet = context.createGain(); wet.gain.value = .18;
    this.bus.connect(reverb); reverb.connect(wet); wet.connect(this.colour);
    this.effects = [this.bus, this.colour, compressor, this.master, reverb, wet];
    this.fluteWave = context.createPeriodicWave(new Float32Array(6), new Float32Array([0, 1, .14, .055, .025, .006]));
  }

  volume(value: number, fade = .12): void {
    const now = this.context.currentTime;
    const parameter = this.master.gain;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(clamp(value) ** 1.25 * .82, now + fade);
  }

  colourFor(openness: number): void {
    this.colour.frequency.setTargetAtTime(2200 + clamp(openness) * 2100, this.context.currentTime, .2);
  }

  pluck(note: number, at: number, strength: number, pan = 0): void {
    const source = this.context.createBufferSource(); source.buffer = this.string(note);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(strength, at + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + 3.5);
    source.connect(envelope);
    const panner = this.pan(envelope, pan);
    const voice = this.register([source], [envelope, panner]);
    source.start(at); source.stop(at + 3.6);
    source.onended = () => this.finish(voice);
  }

  flute(note: number, at: number, duration: number, pan = -.12): void {
    const oscillator = this.context.createOscillator();
    oscillator.setPeriodicWave(this.fluteWave);
    oscillator.frequency.value = midiHz(note);
    const vibrato = this.context.createOscillator(); vibrato.frequency.value = 4.7;
    const depth = this.context.createGain(); depth.gain.value = 5;
    vibrato.connect(depth); depth.connect(oscillator.detune);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(.115, at + .13);
    envelope.gain.linearRampToValueAtTime(.084, at + Math.min(.4, duration * .55));
    envelope.gain.setValueAtTime(.084, at + Math.max(.42, duration - .28));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration + .28);
    oscillator.connect(envelope);
    const panner = this.pan(envelope, pan);
    const voice = this.register([oscillator, vibrato], [envelope, panner, depth]);
    oscillator.start(at); vibrato.start(at);
    oscillator.stop(at + duration + .3); vibrato.stop(at + duration + .3);
    oscillator.onended = () => this.finish(voice);
  }

  pad(note: number, at: number): void {
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(.037, at + .75);
    envelope.gain.linearRampToValueAtTime(.023, at + BEAT * 3);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + BEAT * 7.8);
    const sources = [note, note + 12].map((midi, index) => {
      const oscillator = this.context.createOscillator(); oscillator.type = 'sine';
      oscillator.frequency.value = midiHz(midi); oscillator.detune.value = index ? 3 : -3;
      oscillator.connect(envelope); oscillator.start(at); oscillator.stop(at + BEAT * 8);
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
    this.strings.clear();
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

  private impulse(): AudioBuffer {
    const buffer = this.context.createBuffer(2, Math.round(this.context.sampleRate * 1.8), this.context.sampleRate);
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

/** A player is explicitly started by a click; camera recognition never enables
 * audio. Scheduling ahead keeps the music continuous during a slower frame. */
export class GardenMusic {
  private context: AudioContext | null = null;
  private rack: InstrumentRack | null = null;
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
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.rack?.stop();
    this.gesture = gestureMusicFrame([]); this.lastCapturedAt = -Infinity;
    this.lastGestureAudioTime = -Infinity;
    this.emit();
  }

  setVolume(value: number): void {
    if (!Number.isFinite(value)) return;
    this.volumeValue = clamp(value);
    if (this.enabled) this.rack?.volume(this.volumeValue);
    this.emit();
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
    if (!this.enabled || !this.context || !this.rack) return;
    const now = this.context.currentTime;
    if (now - this.lastSelectionAt < .3) return;
    this.lastSelectionAt = now;
    // One soft octave interval; simultaneous two-hand selections share a cue.
    this.rack.pluck(pentatonicMidi(5), now + .015, .17, -.08);
    this.rack.pluck(pentatonicMidi(7), now + .1, .09, .08);
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause(); this.disposed = true;
    this.rack?.dispose(); this.rack = null;
    const context = this.context; this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  private async begin(generation: number): Promise<void> {
    try {
      if (!this.context || this.context.state === 'closed') {
        const Constructor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) throw new Error('当前浏览器无法播放互动音乐，请使用更新的 Safari 或 Chrome。');
        this.context = new Constructor();
        this.rack = new InstrumentRack(this.context, this.context.destination);
        this.context.onstatechange = () => this.emit();
      }
      await this.context.resume();
      if (generation !== this.generation || this.disposed) return;
      this.enabled = true; this.step = 0;
      this.nextStepAt = this.context.currentTime + .08;
      this.rack!.volume(this.volumeValue, .5);
      this.rack!.colourFor(this.gesture.openness);
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 100);
      this.emit();
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.enabled = false; this.rack?.dispose(); this.rack = null;
      const context = this.context; this.context = null;
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      this.emit(error instanceof Error ? error.message : '音乐暂时无法开启，请再点一次重试。');
      throw error;
    }
  }

  private schedule(): void {
    if (!this.enabled || !this.context || !this.rack || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (this.nextStepAt < now - .22) this.nextStepAt = now + .04;
    // 450ms covers usual 100–200ms recognition work without a catch-up burst.
    let iterations = 0;
    while (this.nextStepAt < now + .45 && iterations++ < 8) {
      const at = this.nextStepAt;
      const score = scoreStep(this.step);
      if (score.bass !== null) this.rack.pluck(score.bass, at, .27, -.09);
      if (score.pluck !== null) this.rack.pluck(score.pluck, at, this.step % 8 ? .19 : .23, this.step % 4 ? .14 : -.14);
      if (score.flute !== null) this.rack.flute(score.flute, at, score.fluteBeats * BEAT);
      if (this.step % 16 === 0 && score.bass !== null) this.rack.pad(score.bass + 12, at);
      const fresh = now - this.lastGestureAudioTime < .5;
      if (fresh && this.gesture.voices.length && (this.step % 2 === 0 || this.gesture.activity > .72)) {
        const voice = this.gesture.voices[this.step % this.gesture.voices.length]!;
        this.rack.pluck(voice.note, at + .035, .07 + voice.activity * .09, voice.pan);
      }
      this.nextStepAt += STEP;
      this.step = (this.step + 1) % 128;
    }
  }

  private emit(error?: string): void {
    const playing = this.enabled && this.context?.state === 'running';
    this.onStatus?.({ enabled: this.enabled, playing, volume: this.volumeValue,
      message: error ?? (playing ? '国风器乐 · 随手入韵' : '本机合成 · 点按开启国风器乐') });
  }
}

/** Render a short sample using the same score/instruments for audio QA. */
export async function renderGardenMusicPreview(seconds = 16): Promise<AudioBuffer> {
  const duration = clamp(Number.isFinite(seconds) ? seconds : 16, 2, 60);
  const context = new OfflineAudioContext(2, Math.ceil(duration * 32000), 32000);
  const rack = new InstrumentRack(context, context.destination, false);
  rack.volume(.85, .3);
  for (let step = 0, at = .08; at < duration - .5; step++, at += STEP) {
    const score = scoreStep(step);
    if (score.bass !== null) rack.pluck(score.bass, at, .27, -.09);
    if (score.pluck !== null) rack.pluck(score.pluck, at, .2, .1);
    if (score.flute !== null) rack.flute(score.flute, at, score.fluteBeats * BEAT);
    if (step % 16 === 0 && score.bass !== null) rack.pad(score.bass + 12, at);
  }
  const result = await context.startRendering(); rack.dispose(); return result;
}
