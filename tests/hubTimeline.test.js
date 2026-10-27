import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hubStartAt } from '../shared/hubTimeline.js';

test('Hub creation maps the clicked day and grid position to local half hours', () => {
  assert.equal(hubStartAt('2026-10-27', 9 * 64, 24 * 64), '2026-10-27T09:00');
  assert.equal(hubStartAt('2026-10-27', 14.6 * 64, 24 * 64), '2026-10-27T14:30');
  assert.equal(hubStartAt('2026-10-27', 14.8 * 64, 24 * 64), '2026-10-27T14:30');
  for (const hour of [11, 11.1, 11.25, 11.49]) {
    assert.equal(hubStartAt('2026-10-27', hour * 64, 24 * 64), '2026-10-27T11:00');
  }
  for (const hour of [11.5, 11.75, 11.99]) {
    assert.equal(hubStartAt('2026-10-27', hour * 64, 24 * 64), '2026-10-27T11:30');
  }
  assert.equal(hubStartAt('2026-10-27', -5, 1536), '2026-10-27T00:00');
  assert.equal(hubStartAt('2026-10-27', 1536, 1536), '2026-10-27T23:30');
  // A scaled grid and a DST boundary retain the selected local date/time.
  assert.equal(hubStartAt('2026-11-01', 9.25 * 80, 24 * 80), '2026-11-01T09:00');
});
