import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, ValidationError, NotFoundError } from '../server/domain/hub.js';
import { createMemoryRepository } from '../server/adapters/memory.js';
import { createApp } from '../server/http.js';

test('notes can be created, updated, listed and deleted', async () => {
  const hub = createHub(createMemoryRepository());
  const note = await hub.save('notes', { title: ' Groceries ', body: 'Milk\nBread' });
  assert.equal(note.title, 'Groceries');
  assert.equal((await hub.list('notes'))[0].body, 'Milk\nBread');
  await hub.save('notes', { title: 'Updated', body: 'Eggs' }, note.id);
  assert.equal((await hub.list('notes')).length, 1);
  assert.equal((await hub.list('notes'))[0].title, 'Updated');
  await hub.remove('notes', note.id);
  assert.deepEqual(await hub.list('notes'), []);
  await assert.rejects(hub.remove('notes', note.id), NotFoundError);
});
test('events normalize timezones and validate incoming data', async () => {
  const hub = createHub(createMemoryRepository());
  const input = {
    title: 'Dinner',
    startsAt: '2026-10-05T18:00:00-04:00',
    type: 'reminder',
    done: false,
  };
  const event = await hub.save('events', input);
  assert.equal(event.startsAt, '2026-10-05T22:00:00.000Z');
  assert.equal((await hub.save('events', { ...event, done: true }, event.id)).done, true);
  for (const invalid of [
    { ...input, title: ' ' },
    { ...input, startsAt: 'bad' },
    { ...input, type: 'bad' },
    { ...input, done: 'true' },
  ])
    await assert.rejects(hub.save('events', invalid), ValidationError);
  await assert.rejects(hub.list('unknown'), ValidationError);
  await assert.rejects(
    hub.save('notes', { title: 'Missing', body: '' }, 'missing-id'),
    NotFoundError,
  );
});
test('memory records cannot be mutated by callers', async () => {
  const hub = createHub(createMemoryRepository());
  const note = await hub.save('notes', { title: 'Original', body: '' });
  note.title = 'Changed';
  assert.equal((await hub.list('notes'))[0].title, 'Original');
});

test('groceries support quantities, edits, completion and isolated storage', async () => {
  const hub = createHub(createMemoryRepository());
  const milk = await hub.save('groceries', {
    title: ' Milk ',
    quantity: ' 2 cartons ',
    done: false,
  });
  assert.equal(milk.title, 'Milk');
  assert.equal(milk.quantity, '2 cartons');
  await hub.save('groceries', { ...milk, title: 'Oat milk', done: true }, milk.id);
  const [saved] = await hub.list('groceries');
  assert.equal(saved.title, 'Oat milk');
  assert.equal(saved.done, true);
  assert.deepEqual(await hub.list('notes'), []);
  assert.deepEqual(await hub.list('events'), []);
  for (const invalid of [
    { ...milk, title: ' ' },
    { ...milk, quantity: 2 },
    { ...milk, quantity: 'x'.repeat(81) },
    { ...milk, done: 'yes' },
  ]) {
    await assert.rejects(hub.save('groceries', invalid), ValidationError);
  }
  await hub.remove('groceries', milk.id);
  assert.deepEqual(await hub.list('groceries'), []);
});
test('HTTP CRUD, validation, health and missing records', async (t) => {
  const server = createApp(createHub(createMemoryRepository()), 'memory').listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method = 'GET', body) =>
    fetch(url + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  assert.equal((await (await request('/health')).json()).storage, 'memory');
  const response = await request('/notes', 'POST', { title: 'Recipe', body: 'Soup' });
  assert.equal(response.status, 201);
  const note = await response.json();
  assert.equal(
    (await request(`/notes/${note.id}`, 'PUT', { title: 'Recipe', body: 'Stew' })).status,
    200,
  );
  assert.equal((await (await request('/notes')).json())[0].body, 'Stew');
  assert.equal((await request('/notes', 'POST', {})).status, 400);
  assert.equal(
    (
      await fetch(url + '/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      })
    ).status,
    400,
  );
  assert.equal((await request(`/notes/${note.id}`, 'DELETE')).status, 204);
  assert.equal((await request(`/notes/${note.id}`, 'DELETE')).status, 404);
  const groceryResponse = await request('/groceries', 'POST', {
    title: 'Eggs',
    quantity: '12',
    done: false,
  });
  assert.equal(groceryResponse.status, 201);
  const grocery = await groceryResponse.json();
  assert.equal(
    (await request(`/groceries/${grocery.id}`, 'PUT', { ...grocery, done: true })).status,
    200,
  );
  assert.equal((await (await request('/groceries')).json())[0].done, true);
  assert.equal(
    (await request('/groceries', 'POST', { title: 'Eggs', quantity: '', done: 'yes' })).status,
    400,
  );
  assert.equal((await request(`/groceries/${grocery.id}`, 'DELETE')).status, 204);
  const memberResponse = await request('/members', 'POST', { title: 'Alex', color: '#123456' });
  assert.equal(memberResponse.status, 201);
  const member = await memberResponse.json();
  assert.equal((await request('/members', 'POST', { title: 'Sam', color: '#123456' })).status, 400);
  const recurring = await request('/events', 'POST', {
    title: 'Dinner',
    startsAt: '2026-10-08T18:00:00-04:00',
    type: 'event',
    done: false,
    repeat: 'weekly',
    memberId: member.id,
  });
  assert.equal(recurring.status, 201);
  const series = await recurring.json();
  assert.equal(series.repeat, 'weekly');
  assert.equal((await request(`/members/${member.id}`, 'DELETE')).status, 400);
  assert.equal((await request(`/events/${series.id}`, 'DELETE')).status, 204);
  assert.equal((await request(`/members/${member.id}`, 'DELETE')).status, 204);
});
