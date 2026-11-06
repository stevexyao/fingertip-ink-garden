import test from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeFlowerSelection } from '../src/flower-selection';
import { HandSlots } from '../src/hand-slots';
import { HandGestureTracker } from '../src/gestures';
import type { FlowerType, HandObservation } from '../src/types';

const observation = (side: 'Left' | 'Right', x: number): HandObservation => ({
  landmarks: Array.from({ length: 21 }, (_, i) => ({ x: x + (i % 5) * .009, y: .4 + Math.floor(i / 5) * .009, z: 0 })),
  handedness: side, confidence: .99,
});

test('returning hands retain their latest explicitly selected flower rather than an old manual choice', () => {
  const tracker = new HandGestureTracker();
  const slots = new HandSlots();
  const pending: (FlowerType | null)[] = [null, null];
  const displayed: (FlowerType | null)[] = ['peony', null];
  const first = tracker.update([observation('Left', .2)], 0);
  synchronizeFlowerSelection(tracker, slots, first, pending, displayed);
  tracker.cycleFlower(first[0]!.id, 1);
  assert.equal(tracker.getHands(0)[0]!.flower, 'lotus');
  tracker.update([], 50);
  const returned = tracker.update([observation('Left', .2)], 1400);
  assert.notEqual(returned[0]!.id, first[0]!.id);
  synchronizeFlowerSelection(tracker, slots, returned, pending, displayed);
  assert.equal(tracker.getHands(1400)[0]!.flower, 'lotus');
  assert.equal(displayed[0], 'lotus');
});

test('a flower chosen while no hand is visible is applied once and does not undo later selections', () => {
  const tracker = new HandGestureTracker();
  const slots = new HandSlots();
  const pending: (FlowerType | null)[] = ['plum', null];
  const displayed: (FlowerType | null)[] = ['peony', null];
  const hands = tracker.update([observation('Left', .2)], 0);
  synchronizeFlowerSelection(tracker, slots, hands, pending, displayed);
  assert.equal(hands[0]!.flower, 'plum');
  assert.equal(pending[0], null);
  tracker.cycleFlower(hands[0]!.id, 1);
  synchronizeFlowerSelection(tracker, slots, tracker.getHands(0), pending, displayed);
  assert.equal(tracker.getHands(0)[0]!.flower, 'chrysanthemum');
  assert.equal(displayed[0], 'chrysanthemum');
});

test('pending choices follow fixed slots when detection order changes', () => {
  const tracker = new HandGestureTracker();
  const slots = new HandSlots();
  const pending: (FlowerType | null)[] = [null, null];
  const displayed: (FlowerType | null)[] = [null, null];
  const initial = tracker.update([observation('Left', .2), observation('Right', .8)], 0);
  synchronizeFlowerSelection(tracker, slots, initial, pending, displayed);
  const secondId = slots.ids[1];
  pending[1] = 'orchid';
  const reversed = tracker.update([observation('Right', .8), observation('Left', .2)], 40).reverse();
  synchronizeFlowerSelection(tracker, slots, reversed, pending, displayed);
  assert.equal(tracker.getHands(40).find(hand => hand.id === secondId)!.flower, 'orchid');
  assert.equal(tracker.getHands(40).find(hand => hand.id !== secondId)!.flower, 'peony');
});
