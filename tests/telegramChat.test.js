import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listTelegramChats } from '../server/telegramChat.js';

test('chat setup distinguishes missing, malformed, rejected, and conflicting tokens', async () => {
  await assert.rejects(listTelegramChats(''), /not .env.example/);
  await assert.rejects(listTelegramChats('placeholder'), /invalid format/);
  for (const [status, message] of [
    [401, /rejected/],
    [404, /rejected/],
    [409, /conflict/],
    [429, /rate limit/],
    [503, /HTTP 503/],
  ]) {
    await assert.rejects(
      listTelegramChats('123:secret', async () => ({ status, ok: false })),
      message,
    );
  }
  await assert.rejects(
    listTelegramChats('123:secret', async () => {
      throw new Error('https://api.telegram.org/bot123:secret/getUpdates');
    }),
    (error) => !error.message.includes('secret') && /Cannot reach/.test(error.message),
  );
});

test('chat setup returns only unique chat IDs and types, never message contents', async () => {
  const chats = await listTelegramChats('123:secret', async () => ({
    ok: true,
    json: async () => ({
      ok: true,
      result: [
        { message: { chat: { id: 123, type: 'private' }, text: 'private shopping' } },
        { message: { chat: { id: 123, type: 'private' } } },
        { message: { chat: { id: -456, type: 'group' } } },
      ],
    }),
  }));
  assert.deepEqual(
    [...chats],
    [
      [123, 'private'],
      [-456, 'group'],
    ],
  );
});
