import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, ValidationError } from '../server/domain/hub.js';
import { createMemoryRepository } from '../server/adapters/memory.js';
import { occurrences, moveOccurrence, overlaps, occursOnDay } from '../shared/calendar.js';
import { dueReminders } from '../shared/reminders.js';
import {
  planStyle,
  assignedMemberIds,
  durationMinutes,
  durationLabel,
} from '../shared/calendar.js';

process.env.TZ = 'America/New_York';

test('shared assignments persist, overlap with each participant, and protect member deletion', async () => {
  const hub = createHub(createMemoryRepository());
  const alex = await hub.save('members', { title: 'Alex', color: '#ff0000' });
  const sam = await hub.save('members', { title: 'Sam', color: '#0000ff' });
  const event = await hub.save('events', { ...plan, memberIds: [alex.id, sam.id, alex.id] });
  assert.deepEqual(assignedMemberIds(event), [alex.id, sam.id]);
  assert.equal(overlaps(event, { ...plan, memberId: sam.id }), true);
  assert.equal(overlaps(event, { ...plan, memberId: 'other' }), false);
  await assert.rejects(hub.remove('members', sam.id), ValidationError);
  const style = planStyle(event, [alex, sam]);
  assert.equal(style.backgroundImage, 'linear-gradient(135deg, #ff0000 0% 50%, #0000ff 50% 100%)');
  await assert.rejects(hub.save('events', { ...plan, memberIds: ['missing'] }), ValidationError);
});

test('duration formatting handles end times, legacy entries, and all-day plans', () => {
  assert.equal(durationMinutes(plan), 60);
  assert.equal(durationLabel({ ...plan, endsAt: '2026-10-06T10:30:00-04:00' }), '1 hr 30 min');
  assert.equal(durationMinutes({ ...plan, endsAt: null }), null);
  assert.equal(durationLabel({ ...plan, allDay: true }), '');
});
const plan = {
  title: 'Team meeting',
  type: 'event',
  done: false,
  repeat: 'weekly',
  startsAt: '2026-10-06T09:00:00-04:00',
  endsAt: '2026-10-06T10:00:00-04:00',
  reminderMinutes: 15,
};
const range = (items, first, last) =>
  occurrences(items, new Date(`${first}T00:00:00`), new Date(`${last}T23:59:59.999`));

test('occurrence edits preserve the series and survive subsequent dragging', async () => {
  const hub = createHub(createMemoryRepository());
  const series = await hub.save('events', plan);
  const changed = await hub.save(
    'events',
    {
      ...series,
      occurrenceOverrides: {
        '2026-10-13': {
          title: 'Special meeting',
          startsAt: '2026-10-14T11:00:00-04:00',
          endsAt: '2026-10-14T12:00:00-04:00',
        },
      },
    },
    series.id,
  );
  const entries = range([changed], '2026-10-13', '2026-10-21');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, 'Special meeting');
  assert.equal(entries[0].occurrenceDate, '2026-10-13');
  assert.equal(new Date(entries[0].startsAt).getHours(), 11);
  assert.equal(entries[1].title, 'Team meeting');
  const moved = moveOccurrence(changed, entries[0], '2026-10-15');
  const result = range([moved], '2026-10-15', '2026-10-15');
  assert.equal(result.length, 1);
  assert.equal(new Date(result[0].endsAt).getHours(), 12);
  assert.equal(result[0].occurrenceDate, '2026-10-13');
});

test('edited occurrence appears even when original is outside the visible range', async () => {
  const hub = createHub(createMemoryRepository());
  const series = await hub.save('events', {
    ...plan,
    repeatUntil: '2026-10-06',
    occurrenceOverrides: {
      '2026-10-06': { startsAt: '2026-12-01T09:00:00-05:00', endsAt: '2026-12-01T10:00:00-05:00' },
    },
  });
  assert.equal(range([series], '2026-10-06', '2026-10-06').length, 0);
  assert.equal(range([series], '2026-12-01', '2026-12-01').length, 1);
});

test('deleting one occurrence suppresses it and its alert; snapshot undo restores it', async () => {
  const hub = createHub(createMemoryRepository());
  const before = await hub.save('events', plan);
  const after = await hub.save('events', { ...before, excludedDates: ['2026-10-13'] }, before.id);
  assert.equal(range([after], '2026-10-13', '2026-10-13').length, 0);
  assert.equal(dueReminders([after], {}, Date.parse('2026-10-13T09:00:00-04:00')).length, 0);
  const restored = await hub.save('events', before, before.id);
  assert.equal(range([restored], '2026-10-13', '2026-10-13').length, 1);
});

test('deleted series can be restored with its original ID without overwriting another restore', async () => {
  const hub = createHub(createMemoryRepository());
  const before = await hub.save('events', plan);
  await hub.remove('events', before.id);
  const results = await Promise.allSettled([
    hub.save('events', before, before.id, true),
    hub.save('events', before, before.id, true),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await hub.list('events'))[0].id, before.id);
});

test('multi-day recurrences include ongoing spans and keep local end time across DST', () => {
  const item = {
    ...plan,
    id: 'span',
    startsAt: '2026-10-30T09:00:00-04:00',
    endsAt: '2026-11-02T10:00:00-05:00',
  };
  const entries = range([item], '2026-11-09', '2026-11-09');
  assert.equal(entries.length, 1);
  assert.equal(new Date(entries[0].startsAt).getDate(), 6);
  assert.equal(new Date(entries[0].endsAt).getDate(), 9);
  assert.equal(new Date(entries[0].endsAt).getHours(), 10);
});

test('an event ending at midnight does not occupy the following day', () => {
  const item = { ...plan, endsAt: '2026-10-07T00:00:00-04:00' };
  assert.equal(occursOnDay(item, '2026-10-06'), true);
  assert.equal(occursOnDay(item, '2026-10-07'), false);
});

test('all-day plans normalize inclusive dates and alert at 9 AM minus lead time', async () => {
  const hub = createHub(createMemoryRepository());
  const item = await hub.save('events', {
    ...plan,
    allDay: true,
    repeat: 'none',
    endsAt: '2026-10-08T09:00:00-04:00',
  });
  assert.equal(new Date(item.startsAt).getHours(), 0);
  assert.equal(new Date(item.endsAt).getHours(), 23);
  assert.equal(range([item], '2026-10-07', '2026-10-07').length, 1);
  assert.equal(dueReminders([item], {}, Date.parse('2026-10-06T08:44:00-04:00')).length, 0);
  assert.equal(dueReminders([item], {}, Date.parse('2026-10-06T08:45:00-04:00')).length, 1);
});

test('overlap warnings distinguish household, same member, other members and adjacent times', () => {
  const first = { ...plan, memberId: 'alex' };
  assert.equal(overlaps(first, { ...first, startsAt: '2026-10-06T09:30:00-04:00' }), true);
  assert.equal(overlaps(first, { ...first, memberId: null }), true);
  assert.equal(overlaps(first, { ...first, memberId: 'sam' }), false);
  assert.equal(overlaps(first, { ...first, startsAt: first.endsAt }), false);
  assert.equal(overlaps(first, { ...first, type: 'reminder' }), false);
});

test('new fields and occurrence patches use the same validation rules', async () => {
  const hub = createHub(createMemoryRepository());
  for (const extra of [
    { endsAt: 'invalid' },
    { endsAt: plan.startsAt },
    { allDay: 'yes' },
    { excludedDates: ['2026-02-30'] },
    { occurrenceOverrides: { '2026-10-13': { title: '' } } },
    { occurrenceOverrides: { '2026-10-13': { memberId: 'missing' } } },
  ]) {
    await assert.rejects(hub.save('events', { ...plan, ...extra }), ValidationError);
  }
});
