import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HandGestureTracker } from '../src/gestures';
import type { HandObservation, TrackedHand } from '../src/types';

// Camera-oriented synthetic geometry: world coordinates express hand shape,
// while changing size affects only its image projection, as distance would.
const OPEN = [
  [0, .18], [-.07, .12], [-.12, .08], [-.17, .01], [-.21, -.05],
  [-.07, .03], [-.085, -.08], [-.09, -.17], [-.095, -.25],
  [0, 0], [0, -.13], [0, -.22], [0, -.30],
  [.065, .025], [.075, -.09], [.08, -.18], [.085, -.25],
  [.12, .055], [.15, -.035], [.17, -.10], [.18, -.17],
];
const CLOSED = [
  [0, .18], [-.07, .12], [-.10, .09], [-.07, .07], [-.025, .075],
  [-.07, .03], [-.075, -.035], [-.065, .02], [-.04, .075],
  [0, 0], [0, -.055], [.005, .01], [.01, .065],
  [.065, .025], [.065, -.03], [.06, .03], [.045, .085],
  [.12, .055], [.125, .005], [.11, .065], [.085, .11],
];

interface Options {
  size?: number; rotation?: number; tilt?: number; open?: number;
  x?: number; y?: number; aspect?: number; side?: 'Left' | 'Right'; world?: boolean;
}
function observation(options: Options = {}): HandObservation {
  const { size = .5, rotation = 0, tilt = 0, open = 1, x = .5, y = .5,
    aspect = 4 / 3, side = 'Left', world = true } = options;
  const shape = OPEN.map(([px, py], i) => {
    const cx = CLOSED[i]![0]! + (px! - CLOSED[i]![0]!) * open;
    const cy = CLOSED[i]![1]! + (py! - CLOSED[i]![1]!) * open;
    const tiltedX = cx * Math.cos(tilt), z = -cx * Math.sin(tilt);
    // Camera x is mirrored by the app, so a clockwise screen rotation has
    // the opposite sign in the unmirrored input coordinates.
    return { x: Math.cos(rotation) * tiltedX + Math.sin(rotation) * cy,
      y: -Math.sin(rotation) * tiltedX + Math.cos(rotation) * cy, z };
  });
  return {
    landmarks: shape.map(p => ({ x: x + p.x * size, y: y + p.y * size * aspect, z: p.z * size })),
    worldLandmarks: world ? shape.map(p => ({ x: p.x * .4, y: p.y * .4, z: p.z * .4 })) : undefined,
    handedness: side, confidence: .99, imageAspect: aspect,
  };
}

function calibrate(tracker: HandGestureTracker, options: Options = {}, start = 0): TrackedHand {
  let hand: TrackedHand | undefined;
  for (let t = start; t <= start + 500; t += 100) [hand] = tracker.update([observation(options)], t);
  return hand!;
}
function observeUntil(tracker: HandGestureTracker, options: Options, start: number, end: number): TrackedHand {
  let hand: TrackedHand | undefined;
  for (let t = start; t <= end; t += 100) [hand] = tracker.update([observation(options)], t);
  return hand!;
}
const close = (actual: number | undefined, expected: number, tolerance = .025): void => {
  assert.ok(Number.isFinite(actual), `expected a finite value, received ${actual}`);
  assert.ok(Math.abs(actual! - expected) < tolerance, `expected ${actual} near ${expected}`);
};

test('tracked flowers start with neutral finite pose values', () => {
  const [hand] = new HandGestureTracker().update([observation()], 0);
  assert.equal(hand!.scale, 1);
  assert.equal(hand!.rotation, 0);
  assert.equal(hand!.motion, 0);
});

test('a stable open palm calibrates at 500ms and approaching increases flower scale', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const near = observeUntil(tracker, { size: .8 }, 600, 1600);
  close(near.scale, 1.6);
  const far = observeUntil(tracker, { size: .35 }, 1700, 2900);
  close(far.scale, .7);
});

test('scale is bounded to 0.65–1.8 across large distance changes', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const near = observeUntil(tracker, { size: 1.3 }, 600, 1800);
  close(near.scale, 1.8);
  assert.ok(near.scale! <= 1.8);
  const far = observeUntil(tracker, { size: .16 }, 1900, 3200);
  close(far.scale, .65);
  assert.ok(far.scale! >= .65);
});

test('closing fingers changes openness without changing calibrated palm scale', () => {
  const tracker = new HandGestureTracker();
  const open = calibrate(tracker);
  const closed = observeUntil(tracker, { open: 0 }, 600, 1600);
  close(closed.scale, 1, .005);
  close(closed.rotation, 0, .005);
  assert.ok(closed.openness < open.openness * .4);
});

test('closed or moving hands cannot establish the initial distance baseline', () => {
  const tracker = new HandGestureTracker();
  observeUntil(tracker, { open: 0 }, 0, 700);
  let hand: TrackedHand | undefined;
  for (let t = 800; t <= 1800; t += 100) [hand] = tracker.update([observation({ size: t % 200 ? .65 : .5 })], t);
  assert.equal(hand!.scale, 1);
  calibrate(tracker, { size: .65 }, 1900);
  close(observeUntil(tracker, { size: .78 }, 2500, 3500).scale, 1.2);
});

test('moderate out-of-plane turning is not interpreted as a distance change', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const tilted = observeUntil(tracker, { tilt: Math.PI / 3 }, 600, 1600);
  close(tilted.scale, 1, .015);
});

test('severe side-on poses hold scale and rotation instead of creating a jump', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const before = observeUntil(tracker, { size: .7, rotation: .5 }, 600, 1400);
  const sideOn = observeUntil(tracker, { size: .9, rotation: 2, tilt: Math.PI * .48 }, 1500, 1900);
  close(sideOn.scale, before.scale!, .000001);
  close(sideOn.rotation, before.rotation!, .000001);
  assert.equal(sideOn.motion, 0);
});

test('turning clockwise follows the mirrored palm axis with corrected camera aspect', () => {
  for (const aspect of [9 / 16, 4 / 3, 16 / 9]) {
    const tracker = new HandGestureTracker();
    calibrate(tracker, { aspect });
    const hand = observeUntil(tracker, { aspect, rotation: Math.PI / 3 }, 600, 1700);
    close(hand.rotation, Math.PI / 3);
  }
});

test('rotation crossing ±π takes the short path without reversing the flower', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  let hand: TrackedHand | undefined;
  for (let i = 1; i <= 16; i++) [hand] = tracker.update([observation({ rotation: i * .19 })], 500 + i * 100);
  const previous = hand!.rotation!;
  const [across] = tracker.update([observation({ rotation: -3.10 })], 2200);
  assert.ok(across!.rotation! > previous);
  assert.ok(across!.rotation! - previous < .35);
  assert.ok(across!.rotation! > 2.5);
});

test('motion is bounded, uses capture time, and settles when the hand is still', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const [moving] = tracker.update([observation({ x: .65 })], 600);
  assert.ok(moving!.motion! > .1 && moving!.motion! <= 1);
  const still = observeUntil(tracker, { x: .65 }, 700, 1800);
  assert.ok(still.motion! < .02);
});

test('inference latency does not change motion or pose smoothing', () => {
  const immediate = new HandGestureTracker();
  const delayed = new HandGestureTracker();
  let a: TrackedHand | undefined; let b: TrackedHand | undefined;
  for (let t = 0; t <= 800; t += 100) {
    const source = observation(t > 500 ? { x: .6, rotation: .5, size: .65 } : {});
    [a] = immediate.update([source], t, t);
    [b] = delayed.update([source], t, t * 2 + 100);
  }
  assert.equal(a!.motion, b!.motion);
  assert.equal(a!.scale, b!.scale);
  assert.equal(a!.rotation, b!.rotation);
});

test('each hand owns its own baseline and pose despite observation reordering', () => {
  const tracker = new HandGestureTracker();
  for (let t = 0; t <= 500; t += 100) tracker.update([
    observation({ side: 'Left', x: .23, size: .4 }), observation({ side: 'Right', x: .77, size: .6 }),
  ], t);
  let hands: TrackedHand[] = [];
  for (let t = 600; t <= 1700; t += 100) {
    const inputs = [observation({ side: 'Left', x: .23, size: .6, rotation: .6 }),
      observation({ side: 'Right', x: .77, size: .42, rotation: -.4 })];
    hands = tracker.update(t % 200 ? inputs.reverse() : inputs, t);
  }
  const left = hands.find(h => h.handedness === 'Left')!, right = hands.find(h => h.handedness === 'Right')!;
  close(left.scale, 1.5); close(right.scale, .7);
  close(left.rotation, .6); close(right.rotation, -.4);
});

test('short reentry retains baseline and suppresses a false movement spike', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const before = observeUntil(tracker, { size: .8 }, 600, 1100);
  tracker.update([], 1200);
  const [returned] = tracker.update([observation({ size: .6, x: .7 })], 1400);
  assert.equal(returned!.id, before.id);
  assert.equal(returned!.motion, 0);
  close(returned!.scale, before.scale!, .000001);
  close(observeUntil(tracker, { size: .6, x: .7 }, 1500, 2300).scale, 1.2);
});

test('invalid geometry holds the last valid pose and clears motion', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const before = observeUntil(tracker, { size: .7, rotation: .4 }, 600, 1100);
  const invalid = observation(); invalid.landmarks[5]!.x = NaN;
  const [held] = tracker.update([invalid], 1200);
  assert.equal(held!.scale, before.scale);
  assert.equal(held!.rotation, before.rotation);
  assert.equal(held!.motion, 0);
});

test('a finite landmark jump that contradicts the world palm axis cannot flip the flower', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const before = observeUntil(tracker, { size: .7, rotation: .4 }, 600, 1100);
  const jumped = observation({ size: .7, rotation: .4 });
  jumped.landmarks[9]!.x += .22;
  const [held] = tracker.update([jumped], 1200);
  close(held!.rotation, before.rotation!, .000001);
  close(held!.scale, before.scale!, .000001);
  assert.equal(held!.motion, 0);
});

test('without world landmarks palm geometry still supports relative distance', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker, { world: false });
  close(observeUntil(tracker, { size: .7, world: false }, 600, 1700).scale, 1.4);
});

test('temporary loss of world coordinates uses the image baseline without a scale jump', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  const before = observeUntil(tracker, { size: .7 }, 600, 1600);
  const fallback = observeUntil(tracker, { size: .7, world: false }, 1700, 2200);
  close(fallback.scale, before.scale!, .005);
});

test('five-fps calibration and smoothing use elapsed captured time', () => {
  const tracker = new HandGestureTracker();
  for (let t = 0; t <= 600; t += 200) tracker.update([observation()], t);
  let hand: TrackedHand | undefined;
  for (let t = 800; t <= 2200; t += 200) [hand] = tracker.update([observation({ size: .7 })], t);
  close(hand!.scale, 1.4);
});

test('a missing observation restarts an incomplete baseline calibration', () => {
  const tracker = new HandGestureTracker();
  for (const t of [0, 100, 200]) tracker.update([observation()], t);
  tracker.update([], 300);
  observeUntil(tracker, {}, 400, 600);
  const notCalibrated = observeUntil(tracker, { size: .8 }, 700, 900);
  assert.equal(notCalibrated.scale, 1);
  observeUntil(tracker, { size: .8 }, 1000, 1200);
  close(observeUntil(tracker, { size: 1 }, 1300, 2300).scale, 1.25);
});

test('starting a new camera session discards the previous distance baseline', () => {
  const tracker = new HandGestureTracker();
  calibrate(tracker);
  observeUntil(tracker, { size: .8 }, 600, 1200);
  tracker.clear();
  const fresh = calibrate(tracker, { size: .8 }, 1300);
  assert.equal(fresh.scale, 1);
  assert.equal(fresh.rotation, 0);
  assert.equal(fresh.motion, 0);
  close(observeUntil(tracker, { size: .96 }, 1900, 2900).scale, 1.2);
});

test('real pixel detections grow monotonically with image size and do not shrink on 25° rotation', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/hand-pose-real.json', import.meta.url), 'utf8')) as {
    phases: { name: string; observations: HandObservation[] }[];
  };
  const source = (name: string): HandObservation[] => fixture.phases.find(phase => phase.name === name)!.observations;
  const tracker = new HandGestureTracker();
  let hands: TrackedHand[] = [];
  for (let t = 0; t <= 600; t += 100) hands = tracker.update(source('baseline'), t);
  const ids = hands.map(hand => hand.id).sort();
  for (let t = 700; t <= 1900; t += 100) hands = tracker.update(source('closer'), t);
  assert.deepEqual(hands.map(hand => hand.id).sort(), ids);
  assert.ok(hands.every(hand => hand.scale! > 1.3 && hand.scale! < 1.5), JSON.stringify(hands.map(hand => hand.scale)));
  for (let t = 2000; t <= 3100; t += 100) hands = tracker.update(source('baseline'), t);
  assert.ok(hands.every(hand => Math.abs(hand.scale! - 1) < .04));
  for (let t = 3200; t <= 4400; t += 100) hands = tracker.update(source('camera-clockwise-25'), t);
  assert.ok(hands.every(hand => Math.abs(hand.scale! - 1) < .06), JSON.stringify(hands.map(hand => hand.scale)));
  assert.ok(hands.every(hand => hand.rotation! < -.2));
  for (let t = 4500; t <= 5700; t += 100) hands = tracker.update(source('camera-counterclockwise-25'), t);
  assert.ok(hands.every(hand => Math.abs(hand.scale! - 1) < .06), JSON.stringify(hands.map(hand => hand.scale)));
  assert.ok(hands.every(hand => hand.rotation! > .2));
});

test('a current frame delayed by long inference retains its hand ID and calibrated baseline', () => {
  const tracker = new HandGestureTracker();
  const initial = calibrate(tracker);
  const [slow] = tracker.update([observation({ size: .7 })], 600, 1800);
  assert.equal(slow!.id, initial.id);
  assert.ok(slow!.scale! > 1.05 && slow!.scale! < 1.4);
  assert.equal(slow!.lastSeen, 1800);
  assert.equal(slow!.opacity, 1);
  tracker.update([observation({ size: .7 })], 1900, 2000);
  close(observeUntil(tracker, { size: .7 }, 2100, 3100).scale, 1.4);
});

test('a genuinely unobserved hand still expires after the original one-second retention', () => {
  const tracker = new HandGestureTracker();
  const initial = calibrate(tracker);
  const [returned] = tracker.update([observation({ size: .7 })], 1700, 1800);
  assert.notEqual(returned!.id, initial.id);
  assert.equal(returned!.scale, 1);
});
