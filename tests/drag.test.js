import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarDrag } from '../src/adapters/calendarDrag.js';

test('native drag survives the browser pointercancel and retains the drop payload', () => {
  const drag = createCalendarDrag();
  const entry = { id: 'meeting', occurrenceDate: '2026-10-08' };
  drag.start(entry, true);
  assert.equal(drag.cancelPointer(), false);
  assert.equal(drag.current(), entry);
  drag.end();
  assert.equal(drag.current(), null);
});

test('touch cancellation clears its gesture without affecting the next native drag', () => {
  const drag = createCalendarDrag();
  drag.start({ id: 'touch' });
  assert.equal(drag.cancelPointer(), true);
  assert.equal(drag.current(), null);
  drag.start({ id: 'mouse' }, true);
  assert.equal(drag.cancelPointer(), false);
  assert.equal(drag.current().id, 'mouse');
});
