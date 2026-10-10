import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueReminders, reminderAction } from '../shared/reminders.js';
import { createReminderStorage } from '../src/adapters/reminderStorage.js';
import { createHub, ValidationError } from '../server/domain/hub.js';
import { createMemoryRepository } from '../server/adapters/memory.js';

process.env.TZ = 'America/New_York';
const time = Date.parse('2026-10-08T09:00:00-04:00');
const event = (overrides) => ({
  id: 'meeting',
  title: 'Meeting',
  type: 'event',
  done: false,
  startsAt: new Date(time).toISOString(),
  reminderMinutes: 15,
  ...overrides,
});

test('event/reminder alerts fire at their configured lead time and legacy plans stay silent', () => {
  const plans = [
    event(),
    event({ id: 'task', type: 'reminder', reminderMinutes: 0 }),
    event({ id: 'legacy', reminderMinutes: undefined }),
    event({ id: 'disabled', reminderMinutes: null }),
  ];
  assert.equal(dueReminders(plans, {}, time - 16 * 60000).length, 0);
  assert.equal(dueReminders(plans, {}, time - 15 * 60000).length, 1);
  assert.equal(dueReminders(plans, {}, time).length, 2);
  assert.equal(dueReminders([event({ done: true })], {}, time).length, 0);
});

test('snooze is relative to the response time, survives reload, and dismiss silences the occurrence', () => {
  const now = time - 10 * 60000;
  const [reminder] = dueReminders([event()], {}, now);
  const actions = { [reminder.reminderKey]: reminderAction(reminder, 5, now) };
  const data = new Map();
  const storage = createReminderStorage({
    getItem: (key) => data.get(key),
    setItem: (key, value) => data.set(key, value),
  });
  storage.write(actions, now);
  const loaded = storage.read(now);
  assert.equal(dueReminders([event()], loaded, now + 4 * 60000).length, 0);
  assert.equal(dueReminders([event()], loaded, now + 5 * 60000).length, 1);
  loaded[reminder.reminderKey] = reminderAction(reminder, null, now);
  assert.equal(dueReminders([event()], loaded, time).length, 0);
  assert.equal(event().done, false);
});

test('custom recurring plans alert and dismiss independently per date', () => {
  const plan = event({ repeat: 'custom', repeatDays: [2, 4] });
  const [first] = dueReminders([plan], {}, time);
  const actions = { [first.reminderKey]: reminderAction(first, null, time) };
  const next = Date.parse('2026-10-13T08:45:00-04:00');
  const result = dueReminders([plan], actions, next);
  assert.equal(result.length, 1);
  assert.equal(result[0].occurrenceDate, '2026-10-13');
  assert.notEqual(result[0].reminderKey, first.reminderKey);
  assert.equal(
    dueReminders([{ ...plan, completedDates: ['2026-10-13'] }], actions, next).length,
    0,
  );
});

test('recently missed reminders catch up and very old alerts stay quiet', () => {
  assert.equal(dueReminders([event()], {}, time + 60 * 60000).length, 1);
  assert.equal(dueReminders([event()], {}, time + 2 * 86400000).length, 0);
  assert.equal(
    dueReminders([event({ reminderMinutes: 10080 })], {}, time - 7 * 86400000).length,
    1,
  );
});

test('deleted, completed or rescheduled plans do not retain obsolete popup state', () => {
  const [reminder] = dueReminders([event()], {}, time);
  const actions = { [reminder.reminderKey]: reminderAction(reminder, null, time) };
  assert.equal(dueReminders([], actions, time).length, 0);
  assert.equal(dueReminders([event({ done: true })], actions, time).length, 0);
  assert.equal(dueReminders([event({ title: 'Renamed' })], actions, time).length, 0);
  assert.equal(dueReminders([event({ reminderMinutes: 0 })], actions, time).length, 1);
});

test('snoozed overdue occurrences are reconsidered after the original catch-up range', () => {
  const respondedAt = time + 23 * 60 * 60000;
  const [reminder] = dueReminders([event({ reminderMinutes: 0 })], {}, respondedAt);
  const actions = { [reminder.reminderKey]: reminderAction(reminder, 60, respondedAt) };
  assert.equal(
    dueReminders([event({ reminderMinutes: 0 })], actions, respondedAt + 61 * 60000).length,
    1,
  );
});

test('storage ignores malformed/expired records and prunes expired decisions on write', () => {
  let json = JSON.stringify({
    bad: { dismissed: false, startsAt: 'bad', expiresAt: time + 1 },
    expired: { dismissed: true, startsAt: event().startsAt, expiresAt: time - 1 },
  });
  const storage = createReminderStorage({
    getItem: () => json,
    setItem: (_, value) => {
      json = value;
    },
  });
  assert.deepEqual(storage.read(time), {});
  storage.write({ expired: { expiresAt: time - 1 } }, time);
  assert.equal(json, '{}');
});

test('lead time validation covers both plan types and preserves settings through edits', async () => {
  const hub = createHub(createMemoryRepository());
  for (const type of ['event', 'reminder']) {
    for (const reminderMinutes of [-1, 10081, 1.5, '', '15']) {
      await assert.rejects(hub.save('events', event({ type, reminderMinutes })), ValidationError);
    }
    const saved = await hub.save('events', event({ type, reminderMinutes: 30 }));
    const edited = await hub.save('events', { ...saved, title: 'Changed' }, saved.id);
    assert.equal(edited.reminderMinutes, 30);
  }
  const legacy = await hub.save('events', event({ reminderMinutes: undefined }));
  assert.equal(legacy.reminderMinutes, null);
});
