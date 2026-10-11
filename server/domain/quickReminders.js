import { randomUUID } from 'node:crypto';
import { ValidationError, NotFoundError } from './hub.js';

// Separate from calendar plans: durable countdowns use a repository and delivery ports.
export function createQuickReminders(repository, recipients, now = () => Date.now()) {
  const kind = 'quickReminders';
  let ticking = false;
  let changing = false;
  let queue = Promise.resolve();
  // Serialize cancellation with delivery claims inside the single server process.
  function locked(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  const save = (item) =>
    repository.save(kind, { ...item, updatedAt: new Date(now()).toISOString() });
  return {
    async list() {
      return {
        items: await repository.list(kind),
        recipients: Object.entries(recipients)
          .filter(([, sender]) => sender.configured)
          .map(([id]) => ({
            id,
            title: id === 'wife' ? 'Wife (Telegram)' : 'Household (Telegram)',
          })),
      };
    },
    async create(input) {
      if (
        !input ||
        typeof input.title !== 'string' ||
        !input.title.trim() ||
        input.title.length > 160
      )
        throw new ValidationError('Enter a reminder up to 160 characters.');
      if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) {
        throw new ValidationError('Choose a duration from 1 to 1,440 minutes.');
      }
      if (!['telegram', 'screen'].includes(input.delivery))
        throw new ValidationError('Choose delivery.');
      if (input.delivery === 'telegram' && !recipients[input.recipient]?.configured) {
        throw new ValidationError('Choose a configured Telegram recipient.');
      }
      if (changing) throw new ValidationError('Please wait for the previous reminder to save.');
      changing = true;
      try {
        const all = await repository.list(kind);
        if (all.filter((item) => item.status === 'scheduled').length >= 20) {
          throw new ValidationError('Up to 20 reminders can be running at once.');
        }
        const item = {
          id: randomUUID(),
          title: input.title.trim(),
          dueAt: new Date(now() + input.minutes * 60000).toISOString(),
          delivery: input.delivery,
          recipient: input.delivery === 'telegram' ? input.recipient : null,
          status: 'scheduled',
          updatedAt: new Date(now()).toISOString(),
        };
        await save(item);
        return item;
      } finally {
        changing = false;
      }
    },
    async cancel(id) {
      return locked(async () => {
        const item = await repository.get(kind, id);
        if (!item) throw new NotFoundError('Reminder no longer exists.');
        if (item.status !== 'scheduled')
          throw new ValidationError('This reminder has already finished or is being sent.');
        await save({ ...item, status: 'cancelled' });
      });
    },
    async tick() {
      if (ticking) return;
      ticking = true;
      try {
        await locked(async () => {
          const items = await repository.list(kind);
          for (const snapshot of items) {
            // Re-read immediately before delivery to respect cancellations.
            const item = await repository.get(kind, snapshot.id);
            if (!item || item.status !== 'scheduled' || Date.parse(item.dueAt) > now()) continue;
            if (item.delivery === 'screen') {
              await save({ ...item, status: 'completed' });
              continue;
            }
            // Persist the claim before contacting Telegram. A crash/ambiguous timeout
            // must not repeatedly notify a household; uncertain sends stay visible.
            await save({ ...item, status: 'sending' });
            try {
              await (recipients[item.recipient] || recipients.household).send(
                `Hubby reminder: ${item.title}`,
              );
              await save({ ...item, status: 'completed' });
            } catch {
              await save({ ...item, status: 'failed' });
            }
          }
          // Retain recent outcomes for review but do not let expired timers grow forever.
          for (const item of items) {
            if (
              ['completed', 'cancelled', 'failed'].includes(item.status) &&
              now() - Date.parse(item.updatedAt) > 7 * 86400000
            ) {
              await repository.remove(kind, item.id);
            }
          }
        });
      } finally {
        ticking = false;
      }
    },
  };
}
