import test from 'node:test';
import assert from 'node:assert/strict';
import { GardenMusic, gestureMusicFrame, pentatonicMidi, scoreStep } from '../src/music';

const hand = (motion = .6, x = .2, openness = .8) => ({ id: 'one', x, y: .4, openness, motion });

test('the original score stays in a five-note mode across registers and loops', () => {
  for (let step = 0; step < 256; step++) {
    const score = scoreStep(step);
    for (const note of [score.bass, score.pluck, score.flute].filter((note): note is number => note !== null)) {
      assert.ok([2, 4, 6, 9, 11].includes(note % 12));
      assert.ok(note >= 38 && note <= 86);
    }
  }
  assert.deepEqual(scoreStep(0), scoreStep(128));
  assert.ok(Array.from({ length: 128 }, (_, i) => scoreStep(i).flute).filter(n => n !== null).length >= 16);
});

test('the melody has rests, varied pitches and an accompaniment of its own', () => {
  const phrase = Array.from({ length: 128 }, (_, i) => scoreStep(i));
  assert.ok(phrase.some(n => n.flute === null));
  assert.ok(new Set(phrase.map(n => n.flute).filter(n => n !== null)).size >= 7);
  assert.ok(phrase.some(n => n.pluck !== null && n.flute === null));
  assert.ok(phrase.some(n => n.bass !== null));
});

test('pentatonic mapping wraps safely across octaves', () => {
  assert.equal(pentatonicMidi(0), 62);
  assert.equal(pentatonicMidi(5), 74);
  assert.equal(pentatonicMidi(-1), 59);
});

test('no visible hands leave only the lyrical bed, without gesture ornaments', () => {
  assert.deepEqual(gestureMusicFrame([]), { activity: 0, openness: .5, pan: 0, voices: [] });
});

test('gesture mapping is bounded and per-hand position is preserved', () => {
  const frame = gestureMusicFrame([hand(4, -2, -4), { ...hand(.8, .9, .7), id: 'two' }]);
  assert.equal(frame.activity, 1);
  assert.ok(frame.openness >= 0 && frame.openness <= 1);
  assert.equal(frame.voices.length, 2);
  assert.ok(frame.voices.every(v => Math.abs(v.pan) <= .4));
  assert.ok(frame.voices[0]!.pan < frame.voices[1]!.pan);
  assert.ok(frame.voices.every(v => [2, 4, 6, 9, 11].includes(v.note % 12)));
});

test('stationary hands do not create decorative notes and malformed input is ignored', () => {
  const quiet = gestureMusicFrame([hand(0)]);
  assert.equal(quiet.activity, 0);
  assert.equal(quiet.voices.length, 0);
  assert.deepEqual(gestureMusicFrame([{ ...hand(), x: NaN }]), gestureMusicFrame([]));
});

test('volume is user-owned, bounded, and does not change when a hand moves', () => {
  const statuses: { volume: number; playing: boolean }[] = [];
  const music = new GardenMusic(s => statuses.push(s));
  assert.equal(music.getVolume(), .3);
  music.setVolume(.67);
  music.update([hand()], 0);
  music.update([{ ...hand(1), scale: 1.8 }], 100);
  assert.equal(music.getVolume(), .67);
  music.setVolume(4); assert.equal(music.getVolume(), 1);
  music.setVolume(-2); assert.equal(music.getVolume(), 0);
  music.setVolume(NaN); assert.equal(music.getVolume(), 0);
  assert.equal(statuses.at(-1)!.playing, false);
  music.dispose();
});

class Parameter {
  value = 0;
  cancelScheduledValues() { return this; }
  setValueAtTime(value: number) { this.value = value; return this; }
  linearRampToValueAtTime(value: number) { this.value = value; return this; }
  exponentialRampToValueAtTime(value: number) { this.value = value; return this; }
  setTargetAtTime(value: number) { this.value = value; return this; }
}
class Node {
  disconnected = false;
  gain = new Parameter(); frequency = new Parameter(); detune = new Parameter(); pan = new Parameter();
  Q = new Parameter(); threshold = new Parameter(); knee = new Parameter(); ratio = new Parameter(); attack = new Parameter(); release = new Parameter();
  connect(_destination: unknown) { return _destination; }
  disconnect() { this.disconnected = true; }
  setPeriodicWave() {}
  startedAt = Infinity; stoppedAt = Infinity;
  start(at = 0) { this.startedAt = at; }
  stop(at = 0) { this.stoppedAt = at; }
}
class Context {
  static created: Context[] = [];
  static failures = 0;
  state = 'suspended'; sampleRate = 8000; currentTime = 0;
  destination = new Node(); nodes: Node[] = []; onstatechange: (() => void) | null = null;
  constructor() { Context.created.push(this); }
  private node() { const node = new Node(); this.nodes.push(node); return node; }
  createGain() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createDynamicsCompressor() { return this.node(); }
  createConvolver() { return this.node(); }
  createStereoPanner() { return this.node(); }
  createOscillator() { return this.node(); }
  createBufferSource() { return this.node(); }
  createPeriodicWave() { return {}; }
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (channel: number) => data[channel] };
  }
  async resume() {
    if (Context.failures > 0) { Context.failures--; throw new Error('audio was interrupted'); }
    this.state = 'running'; this.onstatechange?.();
  }
  async close() { this.state = 'closed'; this.onstatechange?.(); }
}
async function audioTest(run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Context.created = []; Context.failures = 0;
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
  try { await run(); } finally {
    if (previous) Object.defineProperty(globalThis, 'AudioContext', previous);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
}

test('start is idempotent and pause stops scheduled future voices before a restart', async () => audioTest(async () => {
  let playing = false;
  const music = new GardenMusic(status => { playing = status.playing; });
  try {
    await Promise.all([music.start(), music.start()]);
    assert.equal(Context.created.length, 1);
    assert.equal(playing, true);
    const context = Context.created[0]!;
    const sources = context.nodes.filter(node => node.startedAt < Infinity);
    assert.ok(sources.length >= 4, 'a composed bed schedules multiple instruments');
    context.currentTime = .2;
    music.pause();
    assert.equal(playing, false);
    assert.ok(sources.every(node => node.stoppedAt <= .35), 'pause cancels notes already scheduled in the lookahead');
    await music.start();
    assert.equal(Context.created.length, 1);
    assert.equal(playing, true);
  } finally { music.dispose(); }
  assert.equal(Context.created[0]!.state, 'closed');
}));

test('pause during asynchronous startup cannot start a hidden player later', async () => audioTest(async () => {
  let playing = false;
  const music = new GardenMusic(status => { playing = status.playing; });
  try {
    const pending = music.start(); music.pause(); await pending;
    assert.equal(playing, false);
    assert.equal(Context.created[0]!.nodes.filter(node => node.startedAt < Infinity).length, 0);
    await music.start(); assert.equal(playing, true);
  } finally { music.dispose(); }
}));

test('an audio startup failure can be retried and the failed context is closed', async () => audioTest(async () => {
  Context.failures = 1;
  const music = new GardenMusic();
  try {
    await assert.rejects(() => music.start(), /interrupted/);
    assert.equal(Context.created[0]!.state, 'closed');
    await music.start();
    assert.equal(Context.created.length, 2);
    assert.equal(Context.created[1]!.state, 'running');
  } finally { music.dispose(); }
}));
