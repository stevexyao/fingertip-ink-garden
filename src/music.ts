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
export interface SceneLeadNote { note: number; durationSteps: number; instrument: SceneLeadInstrument }
export interface FlowerReplyNote { note: number; durationSteps: number }
export interface ScoreStep {
  bass: number | null; pluck: number | null; flute: number | null; fluteBeats: number;
  sceneLead: SceneLeadNote | null; reply: FlowerReplyNote | null;
}
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

export type SceneLeadInstrument = 'mountain-xiao' | 'river-xiao' | 'bamboo-dizi' | 'moon-xun';
export interface SceneLeadProfile {
  instrument: SceneLeadInstrument; label: string; register: number;
  attack: number; release: number; vibrato: number; glide: number; strength: number;
}
export interface MusicTheme {
  name: string; bpm: number; meter: '4/4' | '6/8'; subdivision: number;
  phraseSteps: number; loopSteps: number;
  lead: SceneLeadProfile; breath: number;
  melody: readonly (readonly (number | null)[])[];
  pluckPositions: readonly number[]; bassPositions: readonly number[]; replyPositions: readonly number[];
  arpeggio: readonly number[]; reverb: number; wet: number; pluckTone: number; pluckStrength: number;
  flowerRegister: number; flowerMix: number; ornamentRegister: number; ornamentEvery: number;
}
const phrase = (steps: number, entries: readonly (readonly [number, number])[]): readonly (number | null)[] => {
  const notes: (number | null)[] = Array(steps).fill(null);
  for (const [at,note] of entries) notes[at]=note;
  return notes;
};
const MOUNTAIN_MELODY = [
  phrase(32, [[0,0],[8,2],[18,1],[26,-1]]),
  phrase(32, [[0,2],[9,3],[18,1],[26,0]]),
  phrase(32, [[0,3],[8,2],[16,0],[25,-3]]),
  phrase(32, [[0,-1],[8,0],[19,1],[27,0]]),
];
const RIVER_MELODY = [
  phrase(24, [[0,0],[4,2],[7,3],[12,2],[16,1],[20,0]]),
  phrase(24, [[0,1],[4,3],[8,4],[12,3],[16,2],[20,1]]),
  phrase(24, [[0,2],[4,4],[8,5],[12,4],[16,2],[20,3]]),
  phrase(24, [[0,3],[4,2],[8,1],[12,0],[16,-1],[20,0]]),
];
const BAMBOO_MELODY = [
  phrase(32, [[0,3],[4,4],[8,5],[13,4],[16,2],[20,3],[24,4],[28,2]]),
  phrase(32, [[0,4],[4,5],[8,6],[12,5],[16,4],[20,2],[24,3],[28,4]]),
  phrase(32, [[0,5],[4,4],[8,3],[12,4],[16,2],[20,3],[24,1],[28,2]]),
  phrase(32, [[0,3],[4,2],[8,1],[12,2],[16,0],[20,1],[24,2],[28,0]]),
];
const MOON_MELODY = [
  phrase(32, [[0,0],[9,2],[18,1],[26,-1]]),
  phrase(32, [[0,2],[10,1],[19,0],[27,-1]]),
  phrase(32, [[0,1],[8,3],[18,2],[26,0]]),
  phrase(32, [[0,1],[10,0],[20,-1],[27,0]]),
];
const ROOTS = [-10,-6,-8,-10] as const;
export const MUSIC_THEMES: Record<MusicScene, MusicTheme> = {
  mountains: {
    name:'云山远岫', bpm:56, meter:'4/4', subdivision:2, phraseSteps:32, loopSteps:128,
    lead:{instrument:'mountain-xiao',label:'远山长箫',register:0,attack:.38,release:.85,vibrato:3.4,glide:24,strength:.15},
    breath:.87, melody:MOUNTAIN_MELODY, pluckPositions:[0,12,24], bassPositions:[0], replyPositions:[0,12,24],
    arpeggio:[0,4,2], reverb:3.2, wet:.27, pluckTone:1400, pluckStrength:.145,
    flowerRegister:0, flowerMix:.36, ornamentRegister:-12, ornamentEvery:4,
  },
  waterside: {
    name:'江南水乡', bpm:68, meter:'6/8', subdivision:3, phraseSteps:24, loopSteps:96,
    lead:{instrument:'river-xiao',label:'水乡筝箫',register:0,attack:.24,release:.56,vibrato:4.2,glide:35,strength:.135},
    breath:.95, melody:RIVER_MELODY, pluckPositions:[0,3,6,9,12,15,18,21], bassPositions:[0,12], replyPositions:[0,8,16],
    arpeggio:[0,3,5,2,4,1,6,3], reverb:2.1, wet:.2, pluckTone:2500, pluckStrength:.15,
    flowerRegister:0, flowerMix:.4, ornamentRegister:0, ornamentEvery:3,
  },
  bamboo: {
    name:'竹林听风', bpm:74, meter:'4/4', subdivision:2, phraseSteps:32, loopSteps:128,
    lead:{instrument:'bamboo-dizi',label:'竹间清笛',register:0,attack:.17,release:.42,vibrato:4.6,glide:18,strength:.12},
    breath:.85, melody:BAMBOO_MELODY, pluckPositions:[0,6,12,18,24,28], bassPositions:[0,16], replyPositions:[0,12,24],
    arpeggio:[0,4,7,5,3,6], reverb:1.65, wet:.15, pluckTone:3200, pluckStrength:.12,
    flowerRegister:0, flowerMix:.38, ornamentRegister:0, ornamentEvery:2,
  },
  moonlake: {
    name:'荷塘月色', bpm:50, meter:'4/4', subdivision:2, phraseSteps:32, loopSteps:128,
    lead:{instrument:'moon-xun',label:'月下低埙',register:-12,attack:.62,release:1.15,vibrato:2.2,glide:12,strength:.17},
    breath:.93, melody:MOON_MELODY, pluckPositions:[0,18], bassPositions:[0], replyPositions:[0,12,24],
    arpeggio:[0,4], reverb:3.6, wet:.29, pluckTone:1000, pluckStrength:.12,
    flowerRegister:-12, flowerMix:.3, ornamentRegister:-12, ornamentEvery:4,
  },
};

export function scoreStep(step: number, scene: MusicScene = 'waterside'): ScoreStep {
  const theme = MUSIC_THEMES[scene] ?? MUSIC_THEMES.waterside;
  const current = ((Math.floor(Number.isFinite(step) ? step : 0) % theme.loopSteps) + theme.loopSteps) % theme.loopSteps;
  const phraseIndex = Math.floor(current / theme.phraseSteps), position = current % theme.phraseSteps;
  const row = theme.melody[phraseIndex]!;
  const melody = row[position];
  const root = ROOTS[phraseIndex % ROOTS.length]!;
  const pluckIndex = theme.pluckPositions.indexOf(position);
  let gap=1;
  while (position+gap<theme.phraseSteps && row[position+gap]===null) gap++;
  const durationSteps = gap * theme.breath;
  const sceneLead = melody === null ? null : { note:pentatonicMidi(melody!), durationSteps, instrument:theme.lead.instrument };
  let previous=position;
  while (previous>0 && row[previous]===null) previous--;
  const reply = theme.replyPositions.includes(position) ? {
    note:pentatonicMidi(row[previous] ?? 0) + theme.flowerRegister,
    durationSteps: scene==='moonlake' ? 4.5 : 3.5,
  } : null;
  return {
    bass:theme.bassPositions.includes(position) ? pentatonicMidi(root) : null,
    pluck:pluckIndex>=0 ? pentatonicMidi(root+theme.arpeggio[pluckIndex % theme.arpeggio.length]!+5) : null,
    flute:sceneLead?.note ?? null,
    fluteBeats:durationSteps/theme.subdivision,
    sceneLead, reply,
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
  private readonly diziWave: PeriodicWave;
  private readonly xunWave: PeriodicWave;
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
    this.fluteWave = context.createPeriodicWave(new Float32Array(6), new Float32Array([0,1,.13,.045,.012,.003]));
    this.diziWave = context.createPeriodicWave(new Float32Array(6), new Float32Array([0,1,.3,.12,.045,.012]));
    this.xunWave = context.createPeriodicWave(new Float32Array(6), new Float32Array([0,1,.055,.17,.025,.025]));
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
    source.start(at); source.stop(at + Math.min(5.2, (style.decay ?? 3.5) + .12));
    source.onended = () => this.finish(voice);
  }

  flute(note: number, at: number, duration: number, pan = -.12, strength = .115, airy = false,
    expression: { wave?:'xiao'|'dizi'|'xun'; attack?:number; release?:number; vibrato?:number; glide?:number; cutoff?:number } = {}): void {
    const oscillator=this.context.createOscillator();
    if (airy) oscillator.type='sine';
    else oscillator.setPeriodicWave(expression.wave==='dizi' ? this.diziWave : expression.wave==='xun' ? this.xunWave : this.fluteWave);
    const frequency=midiHz(note), glide=expression.glide ?? 18;
    oscillator.frequency.value=frequency;
    oscillator.frequency.setValueAtTime(frequency*2**(-glide/1200),at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency,at+.24);
    const vibrato=this.context.createOscillator(); vibrato.frequency.value=expression.wave==='xun' ? 3.4 : expression.wave==='dizi' ? 5.1 : 4.35;
    const depth=this.context.createGain(); depth.gain.value=0;
    depth.gain.setValueAtTime(0,at); depth.gain.linearRampToValueAtTime(expression.vibrato ?? 4.2,at+Math.min(.9,duration*.45));
    vibrato.connect(depth); depth.connect(oscillator.detune);
    const envelope=this.context.createGain(), attack=Math.min(expression.attack ?? .24,duration*.35), release=expression.release ?? .6;
    envelope.gain.setValueAtTime(0,at);
    envelope.gain.linearRampToValueAtTime(strength,at+attack);
    envelope.gain.linearRampToValueAtTime(strength*.74,at+Math.max(attack+.06,duration*.42));
    envelope.gain.linearRampToValueAtTime(strength*.86,at+Math.max(attack+.12,duration*.72));
    envelope.gain.exponentialRampToValueAtTime(.0001,at+duration+release);
    const body=this.context.createBiquadFilter();body.type='lowpass';body.frequency.value=expression.cutoff ?? (airy ? 3900 : 3100);body.Q.value=.35;
    oscillator.connect(body);body.connect(envelope);
    const panner=this.pan(envelope,pan);
    const sources:AudioScheduledSourceNode[]=[oscillator,vibrato], nodes:AudioNode[]=[envelope,panner,depth,body];
    if (airy || expression.wave==='dizi') {
      const breath=this.context.createBufferSource();breath.buffer=this.noise();breath.loop=true;
      const filter=this.context.createBiquadFilter();filter.type='bandpass';filter.frequency.value=airy ? 2100 : 2700;filter.Q.value=.8;
      const mix=this.context.createGain();mix.gain.value=airy ? .045 : .018;
      breath.connect(filter);filter.connect(mix);mix.connect(envelope);sources.push(breath);nodes.push(filter,mix);
    }
    const voice=this.register(sources,nodes);
    for(const source of sources){source.start(at);source.stop(at+duration+release+.03)}
    oscillator.onended=()=>this.finish(voice);
  }

  sceneLead(scene:MusicScene,note:number,at:number,duration:number):void {
    const lead=MUSIC_THEMES[scene].lead;
    const wave=lead.instrument==='moon-xun' ? 'xun' : lead.instrument==='bamboo-dizi' ? 'dizi' : 'xiao';
    this.flute(note+lead.register,at,duration,scene==='bamboo' ? .08 : -.08,lead.strength,false,
      {wave,attack:lead.attack,release:lead.release,vibrato:lead.vibrato,glide:lead.glide,cutoff:scene==='moonlake' ? 1150 : scene==='mountains' ? 2350 : scene==='bamboo' ? 4900 : 3200});
  }

  lead(flower: FlowerType, note: number, at: number, duration: number, pan: number, mix = .4): void {
    const profile = FLOWER_VOICES[flower];
    const pitch = note + profile.register;
    switch (profile.instrument) {
      case 'warm-string':
        this.pluck(pitch, at, .3*mix, pan, { attack:.065, decay:4.6, tone:1700 });
        this.pluck(pitch+12,at+.07,.09*mix,pan*.6,{attack:.08,decay:3.8,tone:1900});
        break;
      case 'xiao': this.flute(pitch,at,duration,pan,.12*mix); break;
      case 'harmonic': this.harmonic(pitch,at,pan,.12*mix); break;
      case 'soft-zither': this.pluck(pitch,at,.34*mix,pan,{attack:.09,decay:4.3,tone:1050}); break;
      case 'airy-flute': this.flute(pitch,at,duration*1.1,pan,.085*mix,true); break;
    }
  }

  private harmonic(note: number, at: number, pan: number, strength: number): void {
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(strength,at+.035);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + 2.8);
    const weights: GainNode[] = [];
    const sources = [1,2,3].map((multiple, index) => {
      const oscillator = this.context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = midiHz(note) * multiple;
      const weight = this.context.createGain(); weight.gain.value = [1,.28,.1][index]!;
      oscillator.connect(weight); weight.connect(envelope); weights.push(weight); return oscillator;
    });
    const panner = this.pan(envelope, pan); const voice = this.register(sources, [envelope,panner,...weights]);
    for (const source of sources) { source.start(at); source.stop(at + 2.85); }
    sources[0]!.onended = () => this.finish(voice);
  }

  private noise(): AudioBuffer {
    if (this.breathBuffer) return this.breathBuffer;
    const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const data = buffer.getChannelData(0); let seed = 86471;
    for (let i=0;i<data.length;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; data[i]=seed/4294967296*2-1; }
    this.breathBuffer=buffer; return buffer;
  }

  pad(note:number,at:number,beat=BEAT,lengthBeats=8,strength=.027):void {
    const duration=beat*lengthBeats, envelope=this.context.createGain();
    envelope.gain.setValueAtTime(0,at);
    envelope.gain.linearRampToValueAtTime(strength,at+Math.min(1.6,duration*.15));
    envelope.gain.linearRampToValueAtTime(strength*.66,at+duration*.64);
    envelope.gain.exponentialRampToValueAtTime(.0001,at+duration+.6);
    const sources=[note,note+12].map((midi,index)=>{
      const oscillator=this.context.createOscillator();oscillator.type='sine';oscillator.frequency.value=midiHz(midi);oscillator.detune.value=index ? 2 : -2;
      oscillator.connect(envelope);oscillator.start(at);oscillator.stop(at+duration+.65);return oscillator;
    });
    const panner=this.pan(envelope,.035),voice=this.register(sources,[envelope,panner]);sources[0]!.onended=()=>this.finish(voice);
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
    const length = Math.round(sampleRate * 5.2);
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
      ring[index] = (sample + ring[(index + 1) % period]!) * .49915;
      dc += (sample - dc) * .002;
      data[i] = (sample - dc) * Math.min(1, i / Math.max(1, sampleRate * .003));
    }
    if (this.strings.size >= 20) this.strings.delete(this.strings.keys().next().value!);
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

/** Scene-owned voices are always the principal melody. Flowers respond on a
 * separate rack, so changing a flower never restarts or replaces a long breath. */
function scheduleSceneScore(rack:InstrumentRack,scene:MusicScene,step:number,at:number):ScoreStep {
  const theme=MUSIC_THEMES[scene],beat=60/theme.bpm,score=scoreStep(step,scene);
  const position=step%theme.phraseSteps;
  if(score.bass!==null)rack.pluck(score.bass,at,scene==='moonlake' ? .15 : .18,-.08,{attack:.075,tone:1200,decay:4.8});
  if(score.pluck!==null){
    const accent=theme.meter==='6/8' && position%6!==0 ? .72 : 1;
    rack.pluck(score.pluck,at,theme.pluckStrength*accent,position%6 ? .13 : -.13,
      {attack:scene==='bamboo' ? .025 : .065,tone:theme.pluckTone,decay:scene==='bamboo' ? 3.5 : 4.8});
  }
  if(score.sceneLead)rack.sceneLead(scene,score.sceneLead.note,at,score.sceneLead.durationSteps*beat/theme.subdivision);
  if(position===0&&score.bass!==null)rack.pad(score.bass+12,at,beat,theme.phraseSteps/theme.subdivision*.93,scene==='moonlake' ? .034 : .022);
  return score;
}
function scheduleFlowerReply(rack:InstrumentRack,scene:MusicScene,flowers:FlowerType[],reply:FlowerReplyNote,at:number,cursor:number):number {
  const theme=MUSIC_THEMES[scene],index=cursor%flowers.length;
  rack.lead(flowers[index]!,reply.note,at,reply.durationSteps*60/theme.bpm/theme.subdivision,
    flowers.length>1 ? (index===0 ? -.24 : .24) : .16,theme.flowerMix);
  return cursor+1;
}

/** A player is explicitly started by a click. Scene/flower changes while paused
 * only save configuration; each live track can crossfade its previous rack. */
export class GardenMusic {
  private context: AudioContext | null = null;
  private userGain: GainNode | null = null;
  private rack: InstrumentRack | null = null;
  private flowerRack: InstrumentRack | null = null;
  private retiring = new Map<InstrumentRack, {timer:ReturnType<typeof setTimeout>;kind:'scene'|'flower'}>();
  private scene: MusicScene = 'waterside';
  private flowers: FlowerType[] = ['peony', 'lotus'];
  private leadCursor = 0;
  private lastLeadNote = 62;
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
    this.scene = scene; this.transition(true,0); this.emit();
  }

  setFlowers(flowers: FlowerType[]): void {
    if (this.disposed) return;
    const next = normalizedFlowers(flowers);
    if (!next.length || next.length === this.flowers.length && next.every((flower, index) => flower === this.flowers[index])) return;
    const changed = next.findIndex((flower, index) => flower !== this.flowers[index]);
    this.flowers = next;
    this.transition(false,Math.max(0, changed)); this.emit();
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
    this.clearScheduler(); this.clearRetiring(); this.rack?.stop(); this.flowerRack?.stop();
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
    if (this.enabled) this.flowerRack?.colourFor(this.gesture.openness);
  }

  flowerSelected():void {
    if(!this.enabled||!this.context||!this.flowerRack||this.context.state!=='running')return;
    const now=this.context.currentTime;
    if(now-this.lastSelectionAt<.3)return;
    this.lastSelectionAt=now;
    // Configuration already changes the continuing flower response. Keep this
    // acknowledgement very soft, rather than an electronic two-note prompt.
    this.flowerRack.pluck(62,now+.025,.045,0,{attack:.05,decay:2.6,tone:1400});
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause(); this.disposed = true;
    this.rack?.dispose(); this.rack = null; this.flowerRack?.dispose(); this.flowerRack = null;
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
        this.rack?.dispose(); this.rack = null; this.flowerRack?.dispose(); this.flowerRack = null; this.clearRetiring();
        const Constructor = globalThis.AudioContext || (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) throw new Error('当前浏览器无法播放互动音乐，请使用更新的 Safari 或 Chrome。');
        this.context = new Constructor();
        this.userGain = this.context.createGain(); this.userGain.gain.value = 0;
        this.userGain.connect(this.context.destination);
        this.context.onstatechange = () => this.emit();
      }
      await this.context.resume();
      if (generation !== this.generation || this.disposed) return;
      this.clearRetiring(); this.rack?.dispose(); this.flowerRack?.dispose();
      this.rack = new InstrumentRack(this.context, this.userGain!, true, this.scene);
      this.flowerRack = new InstrumentRack(this.context, this.userGain!, true, this.scene);
      this.enabled = true; this.step = 0; this.leadCursor = 0;
      this.nextStepAt = this.context.currentTime + .08;
      this.applyUserVolume(.15); this.rack.volume(1,.6); this.flowerRack.volume(1,.6);
      this.flowerRack.colourFor(this.gesture.openness);
      this.schedule();
      this.timer = setInterval(() => this.schedule(), 100);
      this.emit();
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      this.enabled = false; this.clearScheduler(); this.clearRetiring(); this.rack?.dispose(); this.rack = null; this.flowerRack?.dispose(); this.flowerRack = null;
      this.userGain?.disconnect(); this.userGain = null;
      const context = this.context; this.context = null;
      if (context) context.onstatechange = null;
      if (context && context.state !== 'closed') void context.close().catch(() => {});
      this.emit(error instanceof Error ? error.message : '音乐暂时无法开启，请再点一次重试。');
      throw error;
    }
  }

  private transition(changeScene:boolean,firstVoice:number):void {
    if(!this.enabled||!this.context||this.context.state!=='running'||!this.userGain)return;
    this.retire(this.flowerRack,'flower',.78);
    this.flowerRack=new InstrumentRack(this.context,this.userGain,true,this.scene);
    this.flowerRack.colourFor(this.gesture.openness);this.flowerRack.volume(1,.78);
    this.leadCursor=firstVoice;
    if(changeScene){
      this.retire(this.rack,'scene',.85);
      this.rack=new InstrumentRack(this.context,this.userGain,true,this.scene);this.rack.volume(1,.85);
      this.step=0;this.nextStepAt=this.context.currentTime+.045;this.schedule();
    }else{
      // Preserve the scene playhead and its already-singing long notes. Only
      // the newly selected flower enters; the scene does not repeat its opening.
      const theme=MUSIC_THEMES[this.scene];
      this.leadCursor=scheduleFlowerReply(this.flowerRack,this.scene,this.flowers,
        {note:this.lastLeadNote+theme.flowerRegister,durationSteps:theme.subdivision*1.8},
        this.context.currentTime+.045,this.leadCursor);
    }
  }

  private retire(rack:InstrumentRack|null,kind:'scene'|'flower',fade:number):void {
    this.clearRetiring(kind);
    if(!rack)return;
    rack.stop(fade);
    const timer=setTimeout(()=>{rack.dispose();this.retiring.delete(rack)},Math.ceil((fade+.12)*1000));
    this.retiring.set(rack,{timer,kind});
  }

  private clearScheduler(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private clearRetiring(kind?:'scene'|'flower'):void {
    for(const [rack,retired] of this.retiring){
      if(kind&&retired.kind!==kind)continue;
      clearTimeout(retired.timer);rack.dispose();this.retiring.delete(rack);
    }
  }

  private applyUserVolume(fade = .08): void {
    if (!this.context || !this.userGain) return;
    const now = this.context.currentTime, gain = this.userGain.gain;
    gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.volumeValue ** 1.25 * .82, now + fade);
  }

  private schedule():void {
    if(!this.enabled||!this.context||!this.rack||!this.flowerRack||this.context.state!=='running')return;
    const now=this.context.currentTime,theme=MUSIC_THEMES[this.scene];
    if(this.nextStepAt<now-.22)this.nextStepAt=now+.04;
    const stepDuration=60/theme.bpm/theme.subdivision;
    let iterations=0;
    while(this.nextStepAt<now+.45&&iterations++<8){
      const at=this.nextStepAt,score=scheduleSceneScore(this.rack,this.scene,this.step,at);
      if(score.sceneLead)this.lastLeadNote=score.sceneLead.note;
      if(score.reply)this.leadCursor=scheduleFlowerReply(this.flowerRack,this.scene,this.flowers,score.reply,at,this.leadCursor);
      const fresh=now-this.lastGestureAudioTime<.5;
      if(fresh&&this.gesture.voices.length&&this.step%theme.ornamentEvery===0){
        const voice=this.gesture.voices[this.step%this.gesture.voices.length]!;
        this.flowerRack.pluck(voice.note+theme.ornamentRegister,at+.045,.045+voice.activity*.055,voice.pan,
          {attack:.04,decay:3.2,tone:this.scene==='moonlake'?1400:2600});
      }
      this.nextStepAt+=stepDuration;this.step=(this.step+1)%theme.loopSteps;
    }
  }

  private emit(error?: string): void {
    const playing = this.enabled && this.context?.state === 'running';
    const sceneName = MUSIC_THEMES[this.scene].name;
    const flowerNames = this.flowers.map(flower => FLOWER_VOICES[flower].name);
    const voiceNames = this.flowers.map(flower => FLOWER_VOICES[flower].label);
    const description = `${sceneName} · ${MUSIC_THEMES[this.scene].lead.label} · ${voiceNames.join(' / ')}`;
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
  const rack=new InstrumentRack(context,master,false,scene),flowerRack=new InstrumentRack(context,master,false,scene);
  rack.volume(1,.45);flowerRack.volume(1,.45);
  const theme=MUSIC_THEMES[scene],stepDuration=60/theme.bpm/theme.subdivision;
  let cursor=0;
  for(let step=0,at=.08;at<duration-.5;step++,at+=stepDuration){
    const score=scheduleSceneScore(rack,scene,step,at);
    if(score.reply)cursor=scheduleFlowerReply(flowerRack,scene,flowers,score.reply,at,cursor);
  }
  const result=await context.startRendering();rack.dispose();flowerRack.dispose();master.disconnect();return result;
}
