import { ValidationError } from './hub.js';

export class MessagingUnavailableError extends Error {}

export function groceryMessage(items) {
  const remaining = items.filter((item) => !item.done);
  if (!remaining.length) throw new ValidationError('There are no groceries left to pick up.');
  const body =
    'Hi from hubby, here is your shopping list:\n' +
    remaining
      .map((item) => `- ${item.title}${item.quantity ? ` (${item.quantity})` : ''}`)
      .join('\n');
  // Telegram accepts up to 4,096 characters; never silently truncate a shopping list.
  if (body.length > 4096) {
    throw new ValidationError('This list is too long to send. Shorten it to 4,096 characters.');
  }
  return body;
}

// Application service knows only the household repository and the outbound messaging port.
export function createGroceryText(hub, sender, clock = () => Date.now()) {
  let pending = false;
  let lastAttempt = -Infinity;
  return {
    configuration() {
      return { configured: sender.configured };
    },
    async send() {
      if (!sender.configured)
        throw new MessagingUnavailableError('Telegram is not configured yet.');
      if (pending || clock() - lastAttempt < 60000) {
        throw new ValidationError('Please wait a minute before sending another grocery message.');
      }
      pending = true;
      try {
        const items = (await hub.list('groceries')).filter((item) => !item.done);
        const body = groceryMessage(items);
        lastAttempt = clock();
        await sender.send(body);
        return { status: 'accepted' };
      } finally {
        pending = false;
      }
    },
  };
}
