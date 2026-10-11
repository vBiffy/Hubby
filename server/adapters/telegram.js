import { MessagingUnavailableError } from '../domain/groceryText.js';

// Telegram is an outbound adapter: the domain never knows its token or chat ID.
// Send plain text so grocery names cannot become HTML/Markdown instructions.
export function createTelegram(env = process.env, fetcher = fetch) {
  const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (env.TELEGRAM_CHAT_ID || '').trim();
  const configured = /^\d+:[A-Za-z0-9_-]+$/.test(token) && /^-?[1-9]\d*$/.test(chatId);
  async function call(method, payload) {
    if (!configured) throw new MessagingUnavailableError('Telegram is not configured yet.');
    try {
      const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) {
        throw new MessagingUnavailableError(
          'Telegram rejected the request. Check your bot token, chat ID, and Start the bot.',
        );
      }
      return data.result;
    } catch (error) {
      if (error instanceof MessagingUnavailableError) throw error;
      // Never expose token-bearing URLs from network errors.
      throw new MessagingUnavailableError(
        'Could not confirm the message was sent. Check Telegram before trying again.',
      );
    }
  }
  return {
    configured,
    async send(text) {
      const payload = { chat_id: chatId, text };
      const result = await call('sendMessage', payload);
      if (!Number.isInteger(result?.message_id)) {
        throw new MessagingUnavailableError('Could not confirm the message was sent.');
      }
      return result;
    },
  };
}
