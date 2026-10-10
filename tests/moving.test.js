import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, moveOccurrence, onDay } from '../shared/calendar.js';
import { dueReminders, reminderAction } from '../shared/reminders.js';
import { createHub, ValidationError } from '../server/domain/hub.js';
import { createMemoryRepository } from '../server/adapters/memory.js';

process.env.TZ = 'America/New_York';
const series = {
  id: 'meeting',
  title: 'Meeting',
  type: 'event',
  done: false,
  startsAt: new Date('2026-10-06T09:30').toISOString(),
  repeat: 'custom',
  repeatDays: [2, 4],
  reminderMinutes: 15,
};
const range = (from, through) => [new Date(`${from}T00:00`), new Date(`${through}T23:59:59`)];

test('single events and reminders change only their day, retaining local time across DST', () => {
  for (const type of ['event', 'reminder']) {
    const original = { ...series, repeat: 'none', type };
    const moved = moveOccurrence(original, original, '2026-11-03');
    assert.equal(new Date(moved.startsAt).getHours(), 9);
    assert.equal(new Date(moved.startsAt).getMinutes(), 30);
    assert.equal(moved.title, original.title);
    assert.equal(moved.type, type);
    assert.equal(original.startsAt, series.startsAt);
  }
  assert.throws(() => onDay(series.startsAt, '2026-02-31'));
  assert.throws(() => onDay(new Date('2026-03-01T02:30').toISOString(), '2026-03-08'));
});

test('moving a recurring entry changes only that occurrence and can be moved again or restored', () => {
  const [first] = occurrences([series], ...range('2026-10-06', '2026-10-06'));
  const moved = moveOccurrence(series, first, '2026-10-07');
  assert.equal(moved.startsAt, series.startsAt);
  assert.deepEqual(moved.repeatDays, [2, 4]);
  const entries = occurrences([moved], ...range('2026-10-06', '2026-10-13'));
  assert.deepEqual(
    entries.map((entry) => entry.startsAt.slice(0, 10)),
    ['2026-10-07', '2026-10-08', '2026-10-13'],
  );
  assert.equal(entries[0].occurrenceDate, '2026-10-06');
  const movedAgain = moveOccurrence(moved, entries[0], '2026-10-09');
  assert.deepEqual(movedAgain.occurrenceMoves, { '2026-10-06': '2026-10-09' });
  assert.deepEqual(moveOccurrence(movedAgain, entries[0], '2026-10-06').occurrenceMoves, {});
});

test('exceptions moved across month/end-date boundaries appear once and keep completion identity', () => {
  const plan = {
    ...series,
    repeatUntil: '2026-10-08',
    completedDates: ['2026-10-06'],
    occurrenceMoves: { '2026-10-06': '2026-11-02' },
  };
  assert.equal(occurrences([plan], ...range('2026-10-06', '2026-10-06')).length, 0);
  const entries = occurrences([plan], ...range('2026-11-01', '2026-11-30'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].done, true);
  assert.equal(entries[0].occurrenceDate, '2026-10-06');
});

test('moved reminders trigger on the new date and co-located occurrences dismiss independently', () => {
  const moved = { ...series, occurrenceMoves: { '2026-10-06': '2026-10-08' } };
  const now = Date.parse('2026-10-08T09:15');
  const alerts = dueReminders([moved], {}, now);
  assert.equal(alerts.length, 2);
  assert.notEqual(alerts[0].reminderKey, alerts[1].reminderKey);
  const actions = { [alerts[0].reminderKey]: reminderAction(alerts[0], null, now) };
  assert.equal(dueReminders([moved], actions, now).length, 1);
  assert.equal(dueReminders([moved], {}, Date.parse('2026-10-06T09:15')).length, 0);
});

test('occurrence date exceptions persist through edits and reject invalid dates', async () => {
  const hub = createHub(createMemoryRepository());
  const saved = await hub.save('events', {
    ...series,
    occurrenceMoves: { '2026-10-06': '2026-10-07' },
  });
  const edited = await hub.save('events', { ...saved, title: 'New title' }, saved.id);
  assert.deepEqual(edited.occurrenceMoves, saved.occurrenceMoves);
  for (const occurrenceMoves of [
    [],
    'bad',
    { bad: '2026-10-07' },
    { '2026-10-06': '2026-02-31' },
  ]) {
    await assert.rejects(hub.save('events', { ...series, occurrenceMoves }), ValidationError);
  }
});
