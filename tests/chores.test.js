import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepository } from '../server/adapters/memory.js';
import { createHub, ValidationError } from '../server/domain/hub.js';
import { createChores } from '../server/domain/chores.js';
import { createApp } from '../server/http.js';
import {
  activeChores,
  choreStatus,
  choreDay,
  choreDatesThrough,
  choreOccursOn,
  isChoreOverdue,
  hubChores,
} from '../shared/chores.js';

test('Hub does not project future missed chores into subsequent days', () => {
  const chore = {
    id: 'trash',
    title: 'Trash',
    startsOn: '2026-10-18',
    repeat: 'weekly',
    timeOfDay: '19:00',
    missedPolicy: 'carry',
    completedDates: [],
  };
  const before = new Date('2026-10-17T12:00:00-04:00');
  assert.equal(hubChores([chore], '2026-10-18', before).length, 1);
  assert.equal(hubChores([chore], '2026-10-19', before).length, 0);
  assert.equal(hubChores([chore], '2026-10-19', '2026-10-18T18:00:00-04:00').length, 0);
  assert.equal(hubChores([chore], '2026-10-19', '2026-10-19T08:00:00-04:00').length, 1);
  assert.equal(
    hubChores(
      [{ ...chore, completedDates: ['2026-10-18'] }],
      '2026-10-19',
      '2026-10-19T08:00:00-04:00',
    ).length,
    0,
  );
  const single = { ...chore, repeat: 'none', dueOn: '2026-10-18' };
  assert.equal(hubChores([single], '2026-10-19', before).length, 0);
  assert.equal(hubChores([single], '2026-10-18', before).length, 1);
});

test('future views retain carried chores without making them overdue early', () => {
  const item = {
    title: 'Take out the trash',
    startsOn: '2026-10-18',
    dueOn: '2026-10-18',
    done: false,
  };
  const [visible] = activeChores([item], '2026-10-19');
  assert.ok(visible);
  assert.equal(isChoreOverdue(visible, '2026-10-14'), false);
  assert.doesNotMatch(choreStatus(visible, '2026-10-14'), /Overdue/);
  assert.equal(choreStatus(visible, '2026-10-18'), 'Due today');
  assert.equal(isChoreOverdue(visible, '2026-10-19'), true);
  assert.equal(isChoreOverdue({ ...visible, done: true }, '2026-10-19'), false);

  const [recurring] = activeChores(
    [{ ...item, repeat: 'weekly', missedPolicy: 'carry', timeOfDay: '17:00' }],
    '2026-10-19',
  );
  assert.equal(recurring.occurrenceDate, '2026-10-18');
  assert.equal(choreStatus(recurring, '2026-10-14'), 'Due 2026-10-18 at 5:00 PM');
  assert.equal(isChoreOverdue(recurring, '2026-10-18'), false);
  assert.equal(isChoreOverdue(recurring, '2026-10-19'), true);
});

async function setup(sender = { configured: false }) {
  const repository = createMemoryRepository();
  const hub = createHub(repository);
  const member = await hub.save('members', { title: 'Mom', color: '#a64b78' });
  let now = Date.parse('2026-10-12T12:00Z');
  const service = createChores(repository, sender, () => now);
  const input = {
    title: 'Dishes',
    memberId: member.id,
    startsOn: '2026-10-12',
    dueOn: '2026-10-13',
    done: false,
    description: '',
  };
  return {
    repository,
    hub,
    member,
    service,
    input,
    advance: () => {
      now += 2 * 3600000;
    },
  };
}

test('chores carry forward, become overdue, complete/reopen and stay out of calendar storage', async () => {
  const { service, input, hub, member } = await setup();
  const item = await service.save(input);
  assert.deepEqual(activeChores([item], '2026-10-11'), []);
  assert.equal(activeChores([item], '2026-10-20').length, 1);
  assert.equal(choreStatus(item, '2026-10-14'), 'Overdue since 2026-10-13');
  const done = await service.save({ ...item, done: true }, item.id);
  assert.ok(done.completedAt);
  assert.deepEqual(activeChores([done], '2026-10-20'), []);
  const reopened = await service.save({ ...done, done: false }, done.id);
  assert.equal(reopened.completedAt, null);
  assert.deepEqual(await hub.list('events'), []);
  await assert.rejects(hub.remove('members', member.id), /chores/);
  await service.remove(item.id);
  await hub.remove('members', member.id);
  assert.equal(choreDay('2026-10-13T02:00Z'), '2026-10-12');
});

test('chores require existing owners, real dates and configured future Telegram reminders', async () => {
  const { service, input } = await setup();
  for (const change of [
    { title: ' ' },
    { memberId: 'missing' },
    { startsOn: '2026-02-30' },
    { dueOn: '2026-10-01' },
    { done: 'true' },
    { description: 'x'.repeat(1001) },
    { reminderAt: 'not a date' },
    { reminderAt: '2026-10-12T13:00Z' },
  ])
    await assert.rejects(service.save({ ...input, ...change }), ValidationError);
});

test('Telegram chore reminders send once after due time and completion cancels pending delivery', async () => {
  const messages = [];
  const sender = { configured: true, send: async (text) => messages.push(text) };
  const { repository, service, input, advance } = await setup(sender);
  const a = await service.save({ ...input, reminderAt: '2026-10-12T13:00:00.000Z' });
  const b = await service.save({ ...input, title: 'Laundry', reminderAt: a.reminderAt });
  await service.save({ ...b, done: true }, b.id);
  const finished = await repository.get('chores', b.id);
  assert.equal(finished.reminderStatus, 'cancelled');
  await service.save({ ...finished, done: false }, b.id);
  await service.tick();
  assert.equal(messages.length, 0);
  advance();
  await Promise.all([service.tick(), service.tick()]);
  assert.deepEqual(messages, ['Hubby chore for Mom: Dishes']);
  const restarted = createChores(repository, sender, () => Date.parse('2026-10-12T16:00Z'));
  await restarted.tick();
  assert.equal(messages.length, 1);
  assert.equal((await repository.get('chores', a.id)).reminderStatus, 'sent');
});

test('failed and previously claimed chore messages are not automatically resent', async () => {
  let calls = 0;
  const sender = {
    configured: true,
    send: async () => {
      calls++;
      throw new Error('Offline');
    },
  };
  const { service, input, advance, repository } = await setup(sender);
  const item = await service.save({ ...input, reminderAt: '2026-10-12T13:00:00.000Z' });
  advance();
  await service.tick();
  await service.tick();
  assert.equal(calls, 1);
  assert.equal((await repository.get('chores', item.id)).reminderStatus, 'failed');
  await repository.save('chores', { ...item, reminderStatus: 'sending' });
  await service.tick();
  assert.equal(calls, 1);
});

test('chore HTTP routes support separate CRUD and reveal only Telegram configuration status', async () => {
  const { service, input, hub } = await setup();
  const server = createApp(
    hub,
    'memory',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    service,
  ).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/chores`;
  try {
    assert.deepEqual(await (await fetch(`${base}/configuration`)).json(), { configured: false });
    const response = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 201);
    const item = await response.json();
    assert.equal((await (await fetch(base)).json()).length, 1);
    assert.equal((await fetch(`${base}/${item.id}`, { method: 'DELETE' })).status, 204);
    assert.deepEqual(await (await fetch(base)).json(), []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('daily chores can expire at midnight or keep each missed occurrence overdue', async () => {
  const { service, input } = await setup();
  const skip = await service.save({
    ...input,
    repeat: 'daily',
    timeOfDay: '17:00',
    missedPolicy: 'skip',
  });
  const carry = await service.save({
    ...input,
    title: 'Trash',
    repeat: 'daily',
    timeOfDay: '17:00',
    missedPolicy: 'carry',
  });
  assert.deepEqual(
    activeChores([skip], '2026-10-13').map((item) => item.occurrenceDate),
    ['2026-10-13'],
  );
  const pending = activeChores([carry], '2026-10-13');
  assert.deepEqual(
    pending.map((item) => item.occurrenceDate),
    ['2026-10-12', '2026-10-13'],
  );
  assert.match(choreStatus(pending[0], '2026-10-13'), /Overdue.*5:00 PM/);
  assert.doesNotMatch(choreStatus(activeChores([skip], '2026-10-13')[0], '2026-10-13'), /Overdue/);
  const done = await service.completeOccurrence(carry.id, '2026-10-12', true);
  assert.equal(done.done, false);
  assert.deepEqual(
    activeChores([done], '2026-10-13').map((item) => item.occurrenceDate),
    ['2026-10-13'],
  );
});

test('concurrent occurrence completions merge and changing schedule preserves completion history', async () => {
  const { service, input } = await setup();
  const item = await service.save({ ...input, repeat: 'daily' });
  await Promise.all(
    ['2026-10-12', '2026-10-13'].map((day) => service.completeOccurrence(item.id, day, true)),
  );
  const updated = (await service.list())[0];
  assert.deepEqual(updated.completedDates, ['2026-10-12', '2026-10-13']);
  const edited = await service.save(
    { ...updated, title: 'New title', completedDates: [] },
    item.id,
  );
  assert.deepEqual(edited.completedDates, updated.completedDates);
  await assert.rejects(service.completeOccurrence(item.id, '2026-10-11', true), ValidationError);
});

test('custom weekdays, monthly skipped dates and inclusive recurrence end dates are respected', () => {
  const item = {
    startsOn: '2026-10-12',
    repeat: 'custom',
    repeatDays: [2, 4],
    repeatUntil: '2026-10-15',
  };
  assert.deepEqual(choreDatesThrough(item, '2026-10-20'), ['2026-10-13', '2026-10-15']);
  assert.equal(choreOccursOn(item, '2026-10-16'), false);
  assert.deepEqual(choreDatesThrough({ startsOn: '2026-01-31', repeat: 'monthly' }, '2026-03-31'), [
    '2026-01-31',
    '2026-03-31',
  ]);
  assert.deepEqual(choreDatesThrough({ startsOn: '2024-02-29', repeat: 'yearly' }, '2028-02-29'), [
    '2024-02-29',
    '2028-02-29',
  ]);
});

test('expired occurrences cannot be reopened and recurrence inputs are validated', async () => {
  const { repository, service, input } = await setup();
  const item = await service.save({ ...input, repeat: 'daily', missedPolicy: 'skip' });
  const tomorrow = createChores(repository, {}, () => Date.parse('2026-10-13T12:00Z'));
  await assert.rejects(tomorrow.completeOccurrence(item.id, '2026-10-12', true), /expired/);
  for (const change of [
    { repeat: 'random' },
    { timeOfDay: '25:00' },
    { missedPolicy: 'random' },
    { repeat: 'custom', repeatDays: [] },
    { repeatUntil: '2026-10-01' },
    { telegramReminder: true },
  ]) {
    await assert.rejects(service.save({ ...input, ...change }), ValidationError);
  }
});

test('recurring Telegram reminders follow 5 PM Lansing time across DST and skip completions', async () => {
  const messages = [];
  const sender = { configured: true, send: async (text) => messages.push(text) };
  const { repository, input } = await setup(sender);
  let now = Date.parse('2026-10-31T20:59Z');
  const service = createChores(repository, sender, () => now);
  const item = await service.save({
    ...input,
    startsOn: '2026-10-31',
    dueOn: '',
    repeat: 'daily',
    timeOfDay: '17:00',
    missedPolicy: 'skip',
    telegramReminder: true,
  });
  await service.tick();
  assert.equal(messages.length, 0);
  now = Date.parse('2026-10-31T21:00Z');
  await service.tick();
  await service.tick();
  assert.equal(messages.length, 1);
  now = Date.parse('2026-11-01T21:59Z');
  await service.tick();
  assert.equal(messages.length, 1);
  now = Date.parse('2026-11-01T22:00Z');
  await service.tick();
  assert.equal(messages.length, 2);
  await service.completeOccurrence(item.id, '2026-11-02', true);
  now = Date.parse('2026-11-02T22:00Z');
  await service.tick();
  assert.equal(messages.length, 2);
  now = Date.parse('2026-11-04T13:00Z');
  await service.tick();
  assert.equal(messages.length, 2);
});

test('HTTP completion changes only the specified recurring occurrence', async () => {
  const { service, input, hub } = await setup();
  const item = await service.save({ ...input, repeat: 'daily' });
  const server = createApp(
    hub,
    'memory',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    service,
  ).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/chores/${item.id}/occurrences/2026-10-12`;
  try {
    assert.equal((await fetch(url, { method: 'PUT' })).status, 400);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true }),
    });
    assert.equal(response.status, 200);
    const updated = await response.json();
    assert.deepEqual(updated.completedDates, ['2026-10-12']);
    assert.equal(updated.done, false);
    assert.equal(activeChores([updated], '2026-10-13').length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
