import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, toHour24, dateKey, eventStyle } from '../shared/calendar.js';
import { createHub, ValidationError } from '../server/domain/hub.js';
import { createMemoryRepository } from '../server/adapters/memory.js';
import { createPostgresRepository } from '../server/adapters/postgres.js';

process.env.TZ = 'America/New_York';
const plan = (overrides) => ({
  id: 'series',
  title: 'Breakfast',
  type: 'event',
  done: false,
  startsAt: new Date('2026-10-01T08:00:00').toISOString(),
  ...overrides,
});
const range = (from, through) => [new Date(`${from}T00:00:00`), new Date(`${through}T23:59:59`)];

test('12-hour conversion distinguishes noon, midnight and afternoon', () => {
  assert.equal(toHour24(12, 'AM'), 0);
  assert.equal(toHour24(12, 'PM'), 12);
  assert.equal(toHour24(1, 'PM'), 13);
  assert.equal(toHour24(11, 'AM'), 11);
});

test('weekly recurrence preserves wall time across DST and completes only one occurrence', () => {
  const item = plan({ repeat: 'weekly', completedDates: ['2026-11-05'] });
  const result = occurrences([item], ...range('2026-10-29', '2026-11-12'));
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((event) => new Date(event.startsAt).getHours()),
    [8, 8, 8],
  );
  assert.deepEqual(
    result.map((event) => event.done),
    [false, true, false],
  );
  assert.equal(new Set(result.map((event) => event.occurrenceKey)).size, 3);
});

test('daily repeat includes its end date and excludes dates outside the range', () => {
  const item = plan({ repeat: 'daily', repeatUntil: '2026-10-03' });
  const result = occurrences([item], ...range('2026-10-02', '2026-10-10'));
  assert.deepEqual(
    result.map((event) => event.occurrenceDate),
    ['2026-10-02', '2026-10-03'],
  );
});

test('custom Tuesday/Thursday schedule respects start, inclusive end and completion', () => {
  const item = plan({
    repeat: 'custom',
    repeatDays: [2, 4],
    startsAt: new Date('2026-10-05T09:30').toISOString(),
    repeatUntil: '2026-10-15',
    completedDates: ['2026-10-08'],
  });
  const result = occurrences([item], ...range('2026-10-01', '2026-10-31'));
  assert.deepEqual(
    result.map((event) => event.occurrenceDate),
    ['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15'],
  );
  assert.deepEqual(
    result.map((event) => event.done),
    [false, true, false, false],
  );
  assert.ok(result.every((event) => new Date(event.startsAt).getHours() === 9));
  assert.equal(occurrences([item], ...range('2026-10-16', '2026-11-01')).length, 0);
});

test('custom weekdays keep wall time across DST and allow Sunday', () => {
  const item = plan({ repeat: 'custom', repeatDays: [0, 2, 4] });
  const result = occurrences([item], ...range('2026-10-29', '2026-11-05'));
  assert.deepEqual(
    result.map((event) => event.occurrenceDate),
    ['2026-10-29', '2026-11-01', '2026-11-03', '2026-11-05'],
  );
  assert.ok(result.every((event) => new Date(event.startsAt).getHours() === 8));
});

test('custom weekdays are validated and survive updates; other repeats ignore old selections', async () => {
  const hub = createHub(createMemoryRepository());
  for (const repeatDays of [undefined, [], [7], [-1], ['2'], [1.5], 'Tue']) {
    await assert.rejects(
      hub.save('events', plan({ repeat: 'custom', repeatDays })),
      ValidationError,
    );
  }
  const saved = await hub.save('events', plan({ repeat: 'custom', repeatDays: [4, 2, 2] }));
  assert.deepEqual(saved.repeatDays, [2, 4]);
  const edited = await hub.save('events', { ...saved, title: 'Meeting' }, saved.id);
  assert.deepEqual(edited.repeatDays, [2, 4]);
  const weekly = await hub.save('events', { ...edited, repeat: 'weekly' }, saved.id);
  assert.deepEqual(weekly.repeatDays, []);
});

test('monthly recurrence skips short months and yearly recurrence skips non-leap years', () => {
  const monthly = plan({ repeat: 'monthly', startsAt: new Date('2026-01-31T08:00').toISOString() });
  assert.deepEqual(
    occurrences([monthly], ...range('2026-01-01', '2026-04-30')).map((event) =>
      dateKey(new Date(event.startsAt)),
    ),
    ['2026-01-31', '2026-03-31'],
  );
  const yearly = plan({ repeat: 'yearly', startsAt: new Date('2024-02-29T08:00').toISOString() });
  assert.deepEqual(
    occurrences([yearly], ...range('2025-01-01', '2028-12-31')).map(
      (event) => event.occurrenceDate,
    ),
    ['2028-02-29'],
  );
});

test('legacy events stay single occurrences and old daily series can jump to current dates', () => {
  assert.equal(occurrences([plan()], ...range('2026-10-01', '2026-10-30')).length, 1);
  const old = plan({ repeat: 'daily', startsAt: new Date('1990-01-01T08:00').toISOString() });
  assert.equal(occurrences([old], ...range('2026-10-01', '2026-10-07')).length, 7);
});

test('family colors are required, normalized, unique and safe during concurrent saves', async () => {
  const hub = createHub(createMemoryRepository());
  for (const color of [undefined, '', '#abc', 'red']) {
    await assert.rejects(hub.save('members', { title: 'Alex', color }), ValidationError);
  }
  const results = await Promise.allSettled([
    hub.save('members', { title: 'Alex', color: '#ABCDEF' }),
    hub.save('members', { title: 'Sam', color: '#abcdef' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const [member] = await hub.list('members');
  assert.equal(member.color, '#abcdef');
  await hub.save('members', { ...member, title: 'Alex Updated' }, member.id);
  assert.equal((await hub.list('members'))[0].title, 'Alex Updated');
});

test('events validate family assignment and recurrence; members in use cannot be deleted', async () => {
  const hub = createHub(createMemoryRepository());
  const member = await hub.save('members', { title: 'Alex', color: '#112233' });
  const item = await hub.save(
    'events',
    plan({
      memberId: member.id,
      repeat: 'daily',
      repeatUntil: '2026-10-10',
      completedDates: ['2026-10-02'],
    }),
  );
  assert.equal(item.memberId, member.id);
  assert.equal(item.repeat, 'daily');
  assert.deepEqual(item.completedDates, ['2026-10-02']);
  for (const invalid of [
    { ...item, memberId: 'missing' },
    { ...item, repeat: 'hourly' },
    { ...item, repeatUntil: '2026-09-30' },
    { ...item, repeatUntil: '2026-02-31' },
    { ...item, completedDates: 'bad' },
    { ...item, repeatUntil: 123 },
    { ...item, memberId: { id: member.id } },
  ]) {
    await assert.rejects(hub.save('events', invalid), ValidationError);
  }
  await assert.rejects(hub.remove('members', member.id), ValidationError);
  await hub.save('events', { ...item, memberId: null }, item.id);
  await hub.remove('members', member.id);
  assert.deepEqual(await hub.list('members'), []);
});

test('database color uniqueness violations produce a friendly validation error', async () => {
  const repository = createPostgresRepository({
    query: async () => {
      throw { code: '23505', constraint: 'hub_members_unique_color' };
    },
  });
  await assert.rejects(repository.save('members', { id: 'alex' }), ValidationError);
});

test('member colors choose contrasting text and leave household entries neutral', () => {
  assert.equal(eventStyle({ color: '#ffffff' }).color, '#000000');
  assert.equal(eventStyle({ color: '#00ff00' }).color, '#000000');
  assert.equal(eventStyle({ color: '#000000' }).color, '#ffffff');
  assert.equal(eventStyle(undefined), undefined);
});

test('locations are optional for events, validated, and omitted for reminders', async () => {
  const hub = createHub(createMemoryRepository());
  const saved = await hub.save('events', plan({ location: ' Office ' }));
  assert.equal(saved.location, 'Office');
  const edited = await hub.save('events', { ...saved, title: 'Updated' }, saved.id);
  assert.equal(edited.location, 'Office');
  assert.equal((await hub.save('events', plan())).location, '');
  const reminder = await hub.save('events', { ...saved, type: 'reminder' }, saved.id);
  assert.equal(Object.hasOwn(reminder, 'location'), false);
  for (const location of [42, 'x'.repeat(301)]) {
    await assert.rejects(hub.save('events', plan({ location })), ValidationError);
  }
});
