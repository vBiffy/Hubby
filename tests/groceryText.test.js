import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroceryText, groceryMessage } from '../server/domain/groceryText.js';
import { createTelegram } from '../server/adapters/telegram.js';
import { createApp } from '../server/http.js';

const items = [
  { title: 'Milk', quantity: '2 cartons', done: false },
  { title: 'Bread', quantity: '', done: true },
];

test('grocery message includes quantities, excludes checked items, and never truncates', () => {
  assert.equal(
    groceryMessage(items),
    'Hi from hubby, here is your shopping list:\n- Milk (2 cartons)',
  );
  assert.throws(() => groceryMessage([]), /no groceries/);
  assert.throws(() => groceryMessage([{ title: 'x'.repeat(4096) }]), /too long/);
});

test('messaging service reloads saved groceries and limits concurrent and repeated sends', async () => {
  let now = 100000;
  const bodies = [];
  const service = createGroceryText(
    { list: async () => items },
    {
      configured: true,
      send: async (body) => bodies.push(body),
    },
    () => now,
  );
  await service.send();
  await assert.rejects(service.send(), /wait a minute/);
  now += 60000;
  await service.send();
  assert.equal(bodies.length, 2);
  const unavailable = createGroceryText({}, { configured: false });
  await assert.rejects(unavailable.send(), /not configured/);
  let release;
  const blocking = createGroceryText(
    { list: async () => items },
    {
      configured: true,
      send: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
  );
  const pending = blocking.send();
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(blocking.send(), /wait a minute/);
  release();
  await pending;
});

test('Telegram sends plain text to the fixed chat and validates provider acceptance', async () => {
  const env = { TELEGRAM_BOT_TOKEN: '12345:secret_token', TELEGRAM_CHAT_ID: '54321' };
  let calls = 0;
  const adapter = createTelegram(env, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.telegram.org/bot12345:secret_token/sendMessage');
    assert.deepEqual(JSON.parse(options.body), { chat_id: '54321', text: 'shopping <milk>' });
    return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  });
  await adapter.send('shopping <milk>');
  assert.equal(calls, 1);
  assert.equal(adapter.updates, undefined);
  assert.equal(adapter.edit, undefined);
  assert.equal(adapter.answer, undefined);
  assert.equal(createTelegram({}).configured, false);
  assert.equal(createTelegram({ ...env, TELEGRAM_CHAT_ID: '@arbitrary' }).configured, false);
  assert.equal(createTelegram({ ...env, TELEGRAM_CHAT_ID: '-12345' }).configured, true);
  const failure = createTelegram(env, async () => {
    throw new Error('secret_token');
  });
  await assert.rejects(failure.send('shopping'), (error) => {
    assert.doesNotMatch(error.message, /secret_token/);
    return /Check Telegram/.test(error.message);
  });
  const rejected = createTelegram(env, async () => ({
    ok: true,
    json: async () => ({ ok: false, description: 'secret_token' }),
  }));
  await assert.rejects(rejected.send('shopping'), /Telegram rejected/);
  const invalid = createTelegram(env, async () => ({
    ok: true,
    json: async () => ({ ok: true, result: {} }),
  }));
  await assert.rejects(invalid.send('shopping'), /Could not confirm/);
});

test('grocery text HTTP routes expose no secrets and never accept arbitrary recipients', async () => {
  let sends = 0;
  const service = {
    configuration: () => ({ configured: true }),
    send: async () => {
      sends++;
      return { status: 'accepted' };
    },
  };
  const server = createApp({}, 'memory', undefined, undefined, undefined, service).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/groceries/text`;
    assert.deepEqual(await (await fetch(url + '/configuration')).json(), { configured: true });
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: '+19999999999', body: 'arbitrary' }),
    });
    assert.equal(response.status, 202);
    assert.equal(sends, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
