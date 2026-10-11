import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuickReminders } from '../server/domain/quickReminders.js';
import { createMemoryRepository } from '../server/adapters/memory.js';
import { createApp } from '../server/http.js';

const input = { title: 'Change laundry', minutes: 60, delivery: 'telegram', recipient: 'wife' };

test('durable reminders wait until due, target the right recipient, and survive service recreation', async () => {
  let time = Date.parse('2026-10-10T12:00Z');
  const repo = createMemoryRepository();
  const wife = [],
    household = [];
  const recipients = {
    wife: { configured: true, send: async (text) => wife.push(text) },
    household: { configured: true, send: async (text) => household.push(text) },
  };
  let service = createQuickReminders(repo, recipients, () => time);
  const item = await service.create(input);
  await service.tick();
  assert.equal(wife.length, 0);
  time += 3600000;
  service = createQuickReminders(repo, recipients, () => time);
  await Promise.all([service.tick(), service.tick()]);
  await service.tick();
  assert.deepEqual(wife, ['Hubby reminder: Change laundry']);
  assert.deepEqual(household, []);
  assert.equal((await repo.get('quickReminders', item.id)).status, 'completed');
});

test('cancelled reminders never send, screen timers work offline, failed sends are not retried', async () => {
  let time = 0,
    calls = 0;
  const repo = createMemoryRepository();
  const service = createQuickReminders(
    repo,
    {
      wife: {
        configured: true,
        send: async () => {
          calls++;
          throw new Error('network');
        },
      },
    },
    () => time,
  );
  const cancelled = await service.create({ ...input, minutes: 1 });
  await service.cancel(cancelled.id);
  const failed = await service.create({ ...input, minutes: 1 });
  const screen = await service.create({ ...input, minutes: 1, delivery: 'screen' });
  time = 60000;
  await service.tick();
  await service.tick();
  assert.equal(calls, 1);
  assert.equal((await repo.get('quickReminders', failed.id)).status, 'failed');
  assert.equal((await repo.get('quickReminders', screen.id)).status, 'completed');
  assert.equal((await repo.get('quickReminders', cancelled.id)).status, 'cancelled');
});

test('quick reminders reject invalid durations, arbitrary destinations, and excess pending reminders', async () => {
  const service = createQuickReminders(createMemoryRepository(), {});
  for (const minutes of [0, -1, 1.5, 1441, '60']) {
    await assert.rejects(service.create({ ...input, minutes }), /duration/);
  }
  await assert.rejects(service.create(input), /recipient/);
  await assert.rejects(service.create({ ...input, delivery: 'sms' }), /delivery/);
  for (let index = 0; index < 20; index++) await service.create({ ...input, delivery: 'screen' });
  await assert.rejects(service.create({ ...input, delivery: 'screen' }), /20 reminders/);
});

test('quick reminder routes persist, list sanitized recipients, and cancel reminders', async () => {
  const repo = createMemoryRepository();
  const service = createQuickReminders(repo, { wife: { configured: true, send() {} } });
  const server = createApp(
    {},
    'memory',
    undefined,
    undefined,
    undefined,
    undefined,
    service,
  ).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/quick-reminders`;
    const created = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.equal(created.status, 201);
    const item = await created.json();
    const listed = await (await fetch(url)).json();
    assert.deepEqual(listed.recipients, [{ id: 'wife', title: 'Wife (Telegram)' }]);
    assert.equal((await fetch(`${url}/${item.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await repo.get('quickReminders', item.id)).status, 'cancelled');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('restart never resends a reminder claimed before an ambiguous shutdown', async () => {
  const repo = createMemoryRepository();
  let time = 0,
    calls = 0;
  const recipients = { wife: { configured: true, send: async () => calls++ } };
  const service = createQuickReminders(repo, recipients, () => time);
  const item = await service.create({ ...input, minutes: 1 });
  await repo.save('quickReminders', { ...item, status: 'sending' });
  time = 60000;
  await createQuickReminders(repo, recipients, () => time).tick();
  assert.equal(calls, 0);
  assert.equal((await repo.get('quickReminders', item.id)).status, 'sending');
});
