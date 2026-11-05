import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandSlots } from '../src/hand-slots';

test('a temporarily missing first hand never moves the second flower into its controls', () => {
  const slots = new HandSlots();
  slots.observe(['left', 'right']);
  assert.deepEqual(slots.ids, ['left', 'right']);
  slots.observe(['right']);
  assert.deepEqual(slots.ids, ['left', 'right']);
  assert.equal(slots.indexOf('right'), 1);
  slots.observe(['right', 'left']);
  assert.deepEqual(slots.ids, ['left', 'right']);
});

test('a genuinely new hand reuses an absent slot without replacing a present hand', () => {
  const slots = new HandSlots();
  slots.observe(['one', 'two']);
  slots.observe(['two', 'three']);
  assert.deepEqual(slots.ids, ['three', 'two']);
  slots.clear();
  assert.deepEqual(slots.ids, [null, null]);
});
