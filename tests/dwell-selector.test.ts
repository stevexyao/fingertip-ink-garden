import test from 'node:test';
import assert from 'node:assert/strict';
import { DwellFlowerSelector } from '../src/dwell-selector';
import type { DwellHand, DwellTarget } from '../src/dwell-selector';

const targets: DwellTarget[] = [
  { flower: 'lotus', left: .1, top: .1, right: .3, bottom: .3 },
  { flower: 'orchid', left: .6, top: .1, right: .8, bottom: .3 },
];
const hand = (id = 'one', x = .2, flower: DwellHand['flower'] = 'peony', y = .2): DwellHand => ({ id, x, y, flower });

test('800ms continuous dwell selects once with progress based only on captured observations', () => {
  const selector = new DwellFlowerSelector();
  assert.deepEqual(selector.update([hand()], targets, 0, 0).progress, [{ id: 'one', target: 'lotus', progress: 0, locked: false }]);
  assert.equal(selector.update([hand()], targets, 200, 200).progress[0]!.progress, .25);
  assert.equal(selector.update([hand()], targets, 400, 400).progress[0]!.progress, .5);
  assert.equal(selector.update([hand()], targets, 600, 600).progress[0]!.progress, .75);
  const completed = selector.update([hand()], targets, 800, 800);
  assert.deepEqual(completed.selections, [{ id: 'one', flower: 'lotus' }]);
  assert.deepEqual(completed.progress, [{ id: 'one', target: 'lotus', progress: 1, locked: true }]);
  assert.deepEqual(selector.update([hand()], targets, 1000, 1000).selections, []);
});

test('five-fps hands can independently select the same target despite observation reordering', () => {
  const selector = new DwellFlowerSelector();
  let result;
  for (let t = 0; t <= 800; t += 200) {
    result = selector.update(t % 400 ? [hand('two'), hand('one')] : [hand('one'), hand('two')], targets, t, t + 80);
  }
  assert.deepEqual(result!.selections.sort((a, b) => a.id.localeCompare(b.id)), [{ id: 'one', flower: 'lotus' }, { id: 'two', flower: 'lotus' }]);
});

test('two hands dwell on different targets using independent start times', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand('one')], targets, 0, 0);
  for (let t = 200; t <= 600; t += 200) selector.update([hand('one'), hand('two', .7)], targets, t, t);
  const first = selector.update([hand('two', .7), hand('one')], targets, 800, 800);
  assert.deepEqual(first.selections, [{ id: 'one', flower: 'lotus' }]);
  assert.equal(first.progress.find(p => p.id === 'two')!.progress, .75);
  assert.deepEqual(selector.update([hand('one'), hand('two', .7)], targets, 1000, 1000).selections, [{ id: 'two', flower: 'orchid' }]);
});

test('exactly three independent observations at 400ms intervals can complete a dwell', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand()], targets, 0, 0);
  assert.deepEqual(selector.update([hand()], targets, 400, 400).selections, []);
  assert.deepEqual(selector.update([hand()], targets, 800, 800).selections, [{ id: 'one', flower: 'lotus' }]);
});

test('duplicate and reversed captured timestamps never advance or emit another selection', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand()], targets, 0, 0);
  const halfway = selector.update([hand()], targets, 400, 400);
  assert.deepEqual(selector.update([hand('other', .7)], targets, 400, 600), { progress: halfway.progress, selections: [] });
  assert.deepEqual(selector.update([], targets, 300, 650), { progress: halfway.progress, selections: [] });
  const done = selector.update([hand()], targets, 800, 800);
  assert.equal(done.selections.length, 1);
  assert.deepEqual(selector.update([hand()], targets, 800, 850).selections, []);
});

test('capture gaps longer than 400ms restart dwell without borrowing old time', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand()], targets, 0, 0);
  selector.update([hand()], targets, 200, 200);
  const resumed = selector.update([hand()], targets, 601, 601);
  assert.equal(resumed.progress[0]!.progress, 0);
  for (const t of [801, 1001, 1201]) assert.deepEqual(selector.update([hand()], targets, t, t).selections, []);
  assert.deepEqual(selector.update([hand()], targets, 1401, 1401).selections, [{ id: 'one', flower: 'lotus' }]);
});

test('a long reception pause resets dwell even when captured frames are close together', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand()], targets, 0, 100);
  selector.update([hand()], targets, 200, 300);
  const resumed = selector.update([hand()], targets, 400, 801);
  assert.equal(resumed.progress[0]!.progress, 0);
  assert.deepEqual(selector.update([hand()], targets, 600, 1001).selections, []);
  assert.equal(selector.update([hand()], targets, 800, 1201).progress[0]!.progress, .5);
});

test('duplicate frames cannot refresh the reception time used to detect a pause', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand()], targets, 0, 0);
  selector.update([hand()], targets, 200, 200);
  selector.update([hand()], targets, 200, 600);
  assert.equal(selector.update([hand()], targets, 400, 801).progress[0]!.progress, 0);
});

test('a no-hand result clears dwell immediately and the same ID must start again', () => {
  const selector = new DwellFlowerSelector();
  for (const t of [0, 200, 400]) selector.update([hand()], targets, t, t);
  assert.deepEqual(selector.update([], targets, 500, 500), { progress: [], selections: [] });
  assert.equal(selector.update([hand()], targets, 600, 600).progress[0]!.progress, 0);
  assert.deepEqual(selector.update([hand()], targets, 800, 800).selections, []);
});

test('one missing hand resets only its own dwell', () => {
  const selector = new DwellFlowerSelector();
  for (const t of [0, 200, 400]) selector.update([hand('one'), hand('two', .7)], targets, t, t);
  selector.update([hand('one')], targets, 600, 600);
  const result = selector.update([hand('one'), hand('two', .7)], targets, 800, 800);
  assert.deepEqual(result.selections, [{ id: 'one', flower: 'lotus' }]);
  assert.equal(result.progress.find(p => p.id === 'two')!.progress, 0);
});

test('leaving a target clears progress and entering it again starts from zero', () => {
  const selector = new DwellFlowerSelector();
  for (const t of [0, 200, 400]) selector.update([hand()], targets, t, t);
  assert.deepEqual(selector.update([hand('one', .4)], targets, 600, 600).progress, [{ id: 'one', target: null, progress: 0, locked: false }]);
  assert.equal(selector.update([hand()], targets, 800, 800).progress[0]!.progress, 0);
  assert.deepEqual(selector.update([hand()], targets, 1000, 1000).selections, []);
});

test('changing targets starts a new dwell and unlocks a previously selected target', () => {
  const selector = new DwellFlowerSelector();
  for (let t = 0; t <= 800; t += 200) selector.update([hand()], targets, t, t);
  const changed = selector.update([hand('one', .7)], targets, 1000, 1000);
  assert.deepEqual(changed.progress, [{ id: 'one', target: 'orchid', progress: 0, locked: false }]);
  for (const t of [1200, 1400, 1600]) selector.update([hand('one', .7)], targets, t, t);
  assert.deepEqual(selector.update([hand('one', .7)], targets, 1800, 1800).selections, [{ id: 'one', flower: 'orchid' }]);
});

test('the current flower remains highlighted with zero progress and no selection', () => {
  const selector = new DwellFlowerSelector();
  for (let t = 0; t <= 1200; t += 200) {
    const result = selector.update([hand('one', .2, 'lotus')], targets, t, t);
    assert.deepEqual(result.progress, [{ id: 'one', target: 'lotus', progress: 0, locked: false }]);
    assert.deepEqual(result.selections, []);
  }
});

test('time spent over the current flower cannot be borrowed after its flower changes', () => {
  const selector = new DwellFlowerSelector();
  for (let t = 0; t <= 800; t += 200) selector.update([hand('one', .2, 'lotus')], targets, t, t);
  assert.equal(selector.update([hand()], targets, 1000, 1000).progress[0]!.progress, 0);
  for (const t of [1200, 1400, 1600]) assert.deepEqual(selector.update([hand()], targets, t, t).selections, []);
  assert.deepEqual(selector.update([hand()], targets, 1800, 1800).selections, [{ id: 'one', flower: 'lotus' }]);
});

test('updating the selected flower from application feedback does not emit a second selection', () => {
  const selector = new DwellFlowerSelector();
  for (let t = 0; t <= 800; t += 200) selector.update([hand()], targets, t, t);
  for (const t of [1000, 1200, 1400]) {
    const result = selector.update([hand('one', .2, 'lotus')], targets, t, t);
    assert.deepEqual(result.progress, [{ id: 'one', target: 'lotus', progress: 0, locked: true }]);
    assert.deepEqual(result.selections, []);
  }
});

test('manual selection cancels pending dwell and locks its target until exit', () => {
  const selector = new DwellFlowerSelector();
  for (const t of [0, 200, 400]) selector.update([hand()], targets, t, t);
  selector.cancel('one');
  for (const t of [600, 800, 1000]) {
    const result = selector.update([hand('one', .2, 'plum')], targets, t, t);
    assert.deepEqual(result.progress, [{ id: 'one', target: 'lotus', progress: 0, locked: true }]);
    assert.deepEqual(result.selections, []);
  }
  selector.update([hand('one', .4, 'plum')], targets, 1200, 1200);
  assert.equal(selector.update([hand('one', .2, 'plum')], targets, 1400, 1400).progress[0]!.locked, false);
  for (const t of [1600, 1800, 2000]) selector.update([hand('one', .2, 'plum')], targets, t, t);
  assert.deepEqual(selector.update([hand('one', .2, 'plum')], targets, 2200, 2200).selections, [{ id: 'one', flower: 'lotus' }]);
});

test('a recognition pause clears progress without unlocking a manual choice at the same target', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand()], targets, 0, 0);
  selector.update([hand()], targets, 200, 200);
  selector.cancel('one');
  for (const t of [1000, 1200, 1400, 1600, 1800]) {
    const result = selector.update([hand('one', .2, 'plum')], targets, t, t);
    assert.deepEqual(result.progress, [{ id: 'one', target: 'lotus', progress: 0, locked: true }]);
    assert.deepEqual(result.selections, []);
  }
  selector.update([], targets, 2000, 2000);
  assert.equal(selector.update([hand()], targets, 2200, 2200).progress[0]!.locked, false);
});

test('cancel affects only its hand and an off-target cancellation does not block the next target', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand('one', .4), hand('two', .7)], targets, 0, 0);
  selector.cancel('one');
  selector.cancel('unknown');
  for (const t of [200, 400, 600]) selector.update([hand('one'), hand('two', .7)], targets, t, t);
  assert.deepEqual(selector.update([hand('one'), hand('two', .7)], targets, 800, 800).selections, [{ id: 'two', flower: 'orchid' }]);
  assert.deepEqual(selector.update([hand('one'), hand('two', .7)], targets, 1000, 1000).selections, [{ id: 'one', flower: 'lotus' }]);
});

test('a different hand ID cannot inherit another hand dwell or cancellation lock', () => {
  const selector = new DwellFlowerSelector();
  for (const t of [0, 200, 400]) selector.update([hand('old')], targets, t, t);
  selector.cancel('old');
  const next = selector.update([hand('new')], targets, 600, 600);
  assert.deepEqual(next.progress, [{ id: 'new', target: 'lotus', progress: 0, locked: false }]);
  assert.deepEqual(selector.update([hand('new')], targets, 800, 800).selections, []);
});

test('clear removes dwell, locks, and timestamp history for a fresh session', () => {
  const selector = new DwellFlowerSelector();
  for (let t = 0; t <= 800; t += 200) selector.update([hand()], targets, t, t);
  selector.clear();
  const fresh = selector.update([hand()], targets, 0, 0);
  assert.deepEqual(fresh.progress, [{ id: 'one', target: 'lotus', progress: 0, locked: false }]);
  assert.deepEqual(fresh.selections, []);
});

test('invalid timestamps and coordinates cannot complete or corrupt dwell', () => {
  const selector = new DwellFlowerSelector();
  selector.update([hand()], targets, 0, 0);
  const valid = selector.update([hand()], targets, 200, 200);
  assert.deepEqual(selector.update([hand()], targets, Number.NaN, 400), { progress: valid.progress, selections: [] });
  assert.deepEqual(selector.update([hand()], targets, 400, Number.POSITIVE_INFINITY), { progress: valid.progress, selections: [] });
  assert.deepEqual(selector.update([hand('one', Number.NaN)], targets, 400, 400).progress, [{ id: 'one', target: null, progress: 0, locked: false }]);
  assert.equal(selector.update([hand()], targets, 600, 600).progress[0]!.progress, 0);
});
