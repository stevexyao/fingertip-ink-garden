import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOpenness, HandGestureTracker } from '../src/gestures';
import type { FlowerType, HandObservation, Landmark } from '../src/types';

// Anatomically ordered synthetic hands. The fixtures change joint geometry as
// fingers curl, so these checks exercise shape rather than hard-coded labels.
const OPEN: [number, number][] = [
  [0, .18], [-.07, .12], [-.12, .08], [-.17, .01], [-.21, -.05],
  [-.07, .03], [-.085, -.08], [-.09, -.17], [-.095, -.25],
  [0, 0], [0, -.13], [0, -.22], [0, -.30],
  [.065, .025], [.075, -.09], [.08, -.18], [.085, -.25],
  [.12, .055], [.15, -.035], [.17, -.10], [.18, -.17],
];
const CLOSED: [number, number][] = [
  [0, .18], [-.07, .12], [-.10, .09], [-.07, .07], [-.025, .075],
  [-.07, .03], [-.075, -.035], [-.065, .02], [-.04, .075],
  [0, 0], [0, -.055], [.005, .01], [.01, .065],
  [.065, .025], [.065, -.03], [.06, .03], [.045, .085],
  [.12, .055], [.125, .005], [.11, .065], [.085, .11],
];
function points(open = 1, scale = .6, x = .5, y = .55): Landmark[] {
  return OPEN.map((p, i) => ({
    x: x + (CLOSED[i]![0] + (p[0] - CLOSED[i]![0]) * open) * scale,
    y: y + (CLOSED[i]![1] + (p[1] - CLOSED[i]![1]) * open) * scale,
    z: 0,
  }));
}
function observation(screenX: number, handedness: 'Left' | 'Right' = 'Left', open = 1, screenY = .55, confidence = .99): HandObservation {
  return { landmarks: points(open, .35, 1 - screenX, screenY), handedness, confidence };
}
function stabilize(tracker: HandGestureTracker, xs = [.28], start = 0, labels: ('Left' | 'Right')[] = ['Left']): void {
  for (let t = start; t <= start + 240; t += 40) {
    tracker.update(xs.map((x, i) => observation(x, labels[i] ?? 'Left')), t);
  }
}
function moveHand(tracker: HandGestureTracker, from: number, to: number, start: number, options: { duration?: number } = {}): void {
  const duration = options.duration ?? 280;
  const steps = Math.round(duration / 40);
  for (let i = 1; i <= steps; i++) {
    const obs = [observation(from + (to - from) * i / steps)];
    tracker.update(obs, start + duration * i / steps);
  }
}
function flower(tracker: HandGestureTracker, label: 'Left' | 'Right', time: number): FlowerType | undefined {
  return tracker.getHands(time).find(hand => hand.handedness === label)?.flower;
}

test('natural left and right hand waves never select a different flower automatically', () => {
  for (const [from, to] of [[.2, .5], [.8, .5]] as const) {
    const tracker = new HandGestureTracker();
    stabilize(tracker, [from]);
    moveHand(tracker, from, to, 240);
    assert.equal(flower(tracker, 'Left', 520), 'peony');
    assert.equal(tracker.getHands(520)[0]!.switchedAt, -Infinity);
  }
});

test('simultaneous natural waves preserve both independently selected flowers', () => {
  const tracker = new HandGestureTracker();
  const initial = tracker.update([observation(.18, 'Left'), observation(.62, 'Right')], 0);
  tracker.setFlower(initial.find(hand => hand.handedness === 'Left')!.id, 'plum', 0);
  tracker.setFlower(initial.find(hand => hand.handedness === 'Right')!.id, 'orchid', 0);
  stabilize(tracker, [.18, .62], 1000, ['Left', 'Right']);
  for (let i = 1; i <= 7; i++) {
    const hands = [observation(.18 + .18 * i / 7, 'Left'), observation(.62 + .18 * i / 7, 'Right')];
    tracker.update(i % 2 ? hands.reverse() : hands, 1240 + i * 40);
  }
  assert.equal(flower(tracker, 'Left', 1520), 'plum');
  assert.equal(flower(tracker, 'Right', 1520), 'orchid');
});

test('openness follows curling continuously and remains within 0..1', () => {
  const values = [0, .25, .5, .75, 1].map(open => computeOpenness(points(open)));
  assert.ok(values[0]! < .25, `closed ${values[0]}`);
  assert.ok(values[4]! > .75, `open ${values[4]}`);
  for (let i = 1; i < values.length; i++) assert.ok(values[i]! > values[i - 1]!, `${values}`);
  assert.ok(values.every(value => value >= 0 && value <= 1));
});

test('openness is invariant to hand distance, translation, and image aspect correction', () => {
  for (const open of [.2, .55, .9]) {
    const near = computeOpenness(points(open, 1.1, .3, .2));
    const far = computeOpenness(points(open, .12, .8, .6));
    assert.ok(Math.abs(near - far) < 1e-8);
    const wide = points(open).map(p => ({ ...p, x: p.x / 1.8 }));
    assert.ok(Math.abs(computeOpenness(wide, undefined, 1.8) - computeOpenness(points(open))) < 1e-8);
  }
});

test('world landmarks keep openness stable when projected landmarks distort', () => {
  const world = points(.6, .1, 0, 0).map((p, i) => ({ ...p, z: i > 5 ? -.003 * i : 0 }));
  const distorted = points(.6).map(p => ({ ...p, y: p.y * .45 }));
  assert.equal(computeOpenness(points(.6), world), computeOpenness(distorted, world));
});

test('invalid and degenerate landmarks return a finite safe closed value', () => {
  assert.equal(computeOpenness([]), 0);
  assert.equal(computeOpenness(Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }))), 0);
  const invalid = points(); invalid[8]!.x = Number.NaN;
  assert.equal(computeOpenness(invalid), 0);
  const tracker = new HandGestureTracker();
  assert.equal(tracker.update([{ landmarks: invalid, handedness: 'Left', confidence: 1 }], 0).length, 0);
});

test('flower follows the mirrored index tip while retaining raw landmarks for preview', () => {
  const tracker = new HandGestureTracker();
  const obs = observation(.3);
  const [hand] = tracker.update([obs], 0);
  assert.ok(hand);
  assert.equal(hand.x, 1 - obs.landmarks[8]!.x);
  assert.equal(hand.y, obs.landmarks[8]!.y);
  assert.deepEqual(hand.landmarks, obs.landmarks);
  assert.equal(hand.flower, 'peony');
});

test('position and openness are smoothed independently without render frames advancing state', () => {
  const tracker = new HandGestureTracker();
  tracker.update([observation(.25, 'Left', 0)], 0);
  const target = observation(.55, 'Left', 1);
  const [hand] = tracker.update([target], 40);
  assert.ok(hand);
  assert.ok(hand.x > .25 && hand.x < 1 - target.landmarks[8]!.x);
  assert.ok(hand.openness > 0 && hand.openness < computeOpenness(target.landmarks));
  for (let t = 41; t < 80; t++) tracker.getHands(t);
  assert.equal(flower(tracker, 'Left', 79), 'peony');
});

test('observation reordering never exchanges IDs or selected flowers', () => {
  const tracker = new HandGestureTracker();
  const initial = tracker.update([observation(.25, 'Left'), observation(.75, 'Right')], 0);
  tracker.setFlower(initial.find(h => h.handedness === 'Left')!.id, 'plum');
  tracker.setFlower(initial.find(h => h.handedness === 'Right')!.id, 'orchid');
  const next = tracker.update([observation(.72, 'Right'), observation(.28, 'Left')], 40);
  for (const previous of initial) {
    const current = next.find(h => h.handedness === previous.handedness)!;
    assert.equal(current.id, previous.id);
    assert.equal(current.flower, previous.handedness === 'Left' ? 'plum' : 'orchid');
  }
});

test('stable handedness resists one contradictory low-confidence classification', () => {
  const tracker = new HandGestureTracker();
  const [initial] = tracker.update([observation(.3)], 0);
  const [next] = tracker.update([observation(.31, 'Right', 1, .55, .4)], 40);
  assert.equal(next!.id, initial!.id);
  assert.equal(next!.handedness, 'Left');
});

test('crossing hands preserve identity and independently selected flowers', () => {
  const tracker = new HandGestureTracker();
  stabilize(tracker, [.25, .75], 0, ['Left', 'Right']);
  const initial = tracker.getHands(240);
  assert.equal(initial.length, 2);
  tracker.setFlower(initial.find(hand => hand.handedness === 'Left')!.id, 'plum');
  tracker.setFlower(initial.find(hand => hand.handedness === 'Right')!.id, 'orchid');
  for (let i = 1; i <= 8; i++) {
    const obs = [observation(.25 + .5 * i / 8, 'Left'), observation(.75 - .5 * i / 8, 'Right')];
    tracker.update(i % 2 ? obs.reverse() : obs, 240 + i * 40);
  }
  for (const previous of initial) {
    const current = tracker.getHands(560).find(h => h.handedness === previous.handedness)!;
    assert.equal(current.id, previous.id);
    assert.equal(current.flower, previous.handedness === 'Left' ? 'plum' : 'orchid');
  }
});

test('lost hands fade between 150ms and 350ms and a short reentry preserves identity', () => {
  const tracker = new HandGestureTracker();
  stabilize(tracker);
  const initialId = tracker.getHands(240)[0]!.id;
  moveHand(tracker, .28, .4, 240, { duration: 200 });
  tracker.update([], 480);
  const fading = tracker.getHands(650);
  assert.ok(fading[0]!.opacity > 0 && fading[0]!.opacity < 1);
  assert.equal(tracker.getHands(790).length, 0);
  const [returned] = tracker.update([observation(.7)], 800);
  assert.equal(returned!.id, initialId);
  moveHand(tracker, .7, .9, 800, { duration: 200 });
  assert.equal(flower(tracker, 'Left', 1000), 'peony');
});

test('after one second a fresh track remembers its independently selected flower', () => {
  const tracker = new HandGestureTracker();
  const [initial] = tracker.update([observation(.25)], 0);
  tracker.setFlower(initial!.id, 'chrysanthemum');
  tracker.update([], 40);
  tracker.getHands(1200);
  const [next] = tracker.update([observation(.72)], 1300);
  assert.notEqual(next!.id, initial!.id);
  assert.equal(next!.flower, 'chrysanthemum');
  moveHand(tracker, .72, .4, 1300);
  assert.equal(flower(tracker, 'Left', 1580), 'chrysanthemum');
});

test('manual controls wrap their own hand only and clear removes active and remembered state', () => {
  const tracker = new HandGestureTracker();
  const hands = tracker.update([observation(.2, 'Left'), observation(.8, 'Right')], 0);
  tracker.cycleFlower(hands[0]!.id, -1);
  assert.equal(flower(tracker, 'Left', 0), 'orchid');
  assert.equal(flower(tracker, 'Right', 0), 'peony');
  tracker.setFlower(hands[1]!.id, 'plum');
  assert.equal(flower(tracker, 'Right', 0), 'plum');
  tracker.clear();
  assert.equal(tracker.getHands(20).length, 0);
  assert.equal(tracker.update([observation(.2)], 40)[0]!.flower, 'peony');
});

test('a slow inference result is fully visible when it is first received', () => {
  const tracker = new HandGestureTracker();
  const [hand] = tracker.update([observation(.28)], 100, 800);
  assert.ok(hand);
  assert.equal(hand.lastSeen, 800);
  assert.equal(hand.opacity, 1);
  assert.equal(tracker.getHands(900)[0]!.opacity, 1);
});

test('continuous 10fps inference keeps full opacity between recognition frames', () => {
  const tracker = new HandGestureTracker();
  tracker.update([observation(.3)], 0);
  assert.equal(tracker.getHands(99)[0]!.opacity, 1);
  tracker.update([observation(.31)], 100);
  assert.equal(tracker.getHands(199)[0]!.opacity, 1);
  tracker.update([observation(.32)], 200);
  assert.equal(tracker.getHands(350)[0]!.opacity, 1);
});

test('continuous 5–6fps inference preserves identity while movement leaves flowers unchanged', () => {
  for (const interval of [180, 200]) {
    const tracker = new HandGestureTracker();
    let initialId = '';
    for (let frame = 0; frame <= 3; frame++) {
      const [hand] = tracker.update([observation(.28)], frame * interval);
      if (frame === 0) initialId = hand!.id;
      assert.equal(hand!.id, initialId);
    }
    tracker.update([observation(.41)], 4 * interval);
    const [moved] = tracker.update([observation(.54)], 5 * interval);
    assert.equal(moved!.id, initialId);
    assert.equal(moved!.flower, 'peony', `${interval}ms inference interval`);
    const [held] = tracker.update([observation(.54)], 6 * interval);
    assert.equal(held!.flower, 'peony');
  }
});

test('invalid or older timestamps do not advance a tracked hand', () => {
  const tracker = new HandGestureTracker();
  const [initial] = tracker.update([observation(.25)], 100, 200);
  for (const [capturedAt, receivedAt] of [[99, 300], [NaN, 300], [Infinity, 300], [150, Infinity]] as const) {
    const [hand] = tracker.update([observation(.8)], capturedAt, receivedAt);
    assert.equal(hand!.id, initial!.id);
    assert.equal(hand!.x, initial!.x);
    assert.equal(hand!.lastSeen, 200);
  }
});

test('invalid manual selections leave a tracked flower unchanged', () => {
  const tracker = new HandGestureTracker();
  const [hand] = tracker.update([observation(.25)], 0);
  tracker.setFlower(hand!.id, 'invalid' as FlowerType);
  tracker.setFlower('missing', 'lotus');
  tracker.cycleFlower(hand!.id, 0);
  tracker.cycleFlower(hand!.id, NaN);
  tracker.cycleFlower('missing', 1);
  assert.equal(flower(tracker, 'Left', 0), 'peony');
  assert.equal(tracker.getHands(0)[0]!.switchedAt, -Infinity);
});

test('capture time controls smoothing while arrival time controls freshness', () => {
  const immediate = new HandGestureTracker();
  const delayed = new HandGestureTracker();
  immediate.update([observation(.25, 'Left', 0)], 0);
  delayed.update([observation(.25, 'Left', 0)], 0, 100);
  const [a] = immediate.update([observation(.55, 'Left', 1)], 40);
  const [b] = delayed.update([observation(.55, 'Left', 1)], 40, 300);
  assert.equal(a!.x, b!.x);
  assert.equal(a!.openness, b!.openness);
  assert.equal(b!.lastSeen, 300);
  assert.equal(b!.opacity, 1);
});

test('a pending label is not assigned during ambiguous palm overlap', () => {
  const tracker = new HandGestureTracker();
  tracker.update([
    { ...observation(.3), handedness: 'Unknown', confidence: .6 },
    { ...observation(.7), handedness: 'Unknown', confidence: .6 },
  ], 0);
  const overlapping = tracker.update([observation(.48, 'Left'), observation(.52, 'Right')], 40);
  assert.equal(overlapping.length, 2);
  assert.ok(overlapping.every(hand => hand.handedness === 'Unknown'));
  const separate = tracker.update([observation(.3, 'Left'), observation(.7, 'Right')], 80);
  assert.deepEqual(separate.map(hand => hand.handedness).sort(), ['Left', 'Right']);
});

test('manual flower changes retain their actual visible timestamp', () => {
  const tracker = new HandGestureTracker();
  const [hand] = tracker.update([observation(.25)], 100, 800);
  tracker.setFlower(hand!.id, 'plum', 900);
  assert.equal(tracker.getHands(900)[0]!.switchedAt, 900);
  assert.equal(flower(tracker, 'Left', 900), 'plum');
});
