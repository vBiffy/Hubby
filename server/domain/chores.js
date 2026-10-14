import { randomUUID } from 'node:crypto';
import { ValidationError, NotFoundError } from './hub.js';
import { validDay } from '../../shared/calendar.js';
import { repeatOptions } from '../../shared/calendar.js';
import { choreDay, choreOccursOn, choreDatesThrough } from '../../shared/chores.js';

// Task persistence and scheduled delivery depend only on ports. The shared
// process lock prevents a completion/edit racing a Telegram delivery claim.
export function createChores(repository, sender, now = () => Date.now()) {
  let queue = Promise.resolve();
  let ticking = false;
  function locked(action) {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  const save = (item) =>
    repository.save('chores', {
      ...item,
      updatedAt: new Date(now()).toISOString(),
    });
  return {
    configuration: () => ({ configured: Boolean(sender?.configured) }),
    list: () => repository.list('chores'),
    save(input, id) {
      return locked(async () => {
        const previous = id ? await repository.get('chores', id) : null;
        if (id && !previous) throw new NotFoundError('Chore no longer exists.');
        if (
          !input ||
          typeof input.title !== 'string' ||
          !input.title.trim() ||
          input.title.length > 160
        )
          throw new ValidationError('Enter a chore title up to 160 characters.');
        if (
          typeof input.memberId !== 'string' ||
          !(await repository.get('members', input.memberId))
        ) {
          throw new ValidationError('Assign the chore to an existing family member.');
        }
        if (
          !validDay(input.startsOn) ||
          (input.dueOn && (!validDay(input.dueOn) || input.dueOn < input.startsOn))
        ) {
          throw new ValidationError('Choose a start day and an optional due date on or after it.');
        }
        const description = input.description ?? '';
        const repeat = input.repeat || 'none';
        const timeOfDay = input.timeOfDay || '17:00';
        const missedPolicy = input.missedPolicy || 'carry';
        const repeatDays = input.repeatDays || [];
        if (
          !repeatOptions.includes(repeat) ||
          !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay) ||
          !['carry', 'skip'].includes(missedPolicy)
        )
          throw new ValidationError('Choose valid chore recurrence settings.');
        if (
          !Array.isArray(repeatDays) ||
          repeatDays.length > 7 ||
          repeatDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
          (repeat === 'custom' && !repeatDays.length)
        )
          throw new ValidationError('Choose recurrence weekdays.');
        const repeatUntil = input.repeatUntil || '';
        if (repeatUntil && (!validDay(repeatUntil) || repeatUntil < input.startsOn)) {
          throw new ValidationError('Repeat end date must be on or after the start day.');
        }
        const telegramReminder = input.telegramReminder ?? false;
        if (
          typeof telegramReminder !== 'boolean' ||
          (telegramReminder && !sender?.configured && !previous?.telegramReminder)
        )
          throw new ValidationError('Configure Telegram to enable recurring reminders.');
        if (
          typeof description !== 'string' ||
          description.length > 1000 ||
          typeof input.done !== 'boolean'
        )
          throw new ValidationError('Invalid chore details.');
        const requestedTime = repeat === 'none' ? input.reminderAt || null : null;
        if (
          requestedTime &&
          (typeof requestedTime !== 'string' || !Number.isFinite(Date.parse(requestedTime)))
        ) {
          throw new ValidationError('Choose a valid Telegram reminder time.');
        }
        const reminderAt = requestedTime ? new Date(requestedTime).toISOString() : null;
        const previousTime = previous?.reminderAt
          ? new Date(previous.reminderAt).toISOString()
          : null;
        const changed = reminderAt !== previousTime;
        if (reminderAt && changed && (!sender?.configured || Date.parse(reminderAt) <= now())) {
          throw new ValidationError('Configure Telegram and choose a reminder time in the future.');
        }
        const item = {
          id: id || randomUUID(),
          title: input.title.trim(),
          description: description.trim(),
          memberId: input.memberId,
          startsOn: input.startsOn,
          dueOn: repeat === 'none' ? input.dueOn || '' : '',
          repeat,
          repeatDays: [...new Set(repeatDays)],
          repeatUntil,
          timeOfDay,
          missedPolicy,
          telegramReminder,
          completedDates: previous?.completedDates || [],
          reminderStatuses:
            previous?.timeOfDay && previous.timeOfDay !== timeOfDay
              ? {}
              : previous?.reminderStatuses || {},
          done: repeat === 'none' ? input.done : false,
          completedAt:
            repeat === 'none' && input.done
              ? previous?.completedAt || new Date(now()).toISOString()
              : null,
          reminderAt,
          reminderStatus: changed
            ? reminderAt
              ? 'scheduled'
              : null
            : previous?.reminderStatus || (reminderAt ? 'scheduled' : null),
          updatedAt: new Date(now()).toISOString(),
        };
        if (item.done && item.reminderStatus === 'scheduled') item.reminderStatus = 'cancelled';
        await save(item);
        return item;
      });
    },
    remove(id) {
      return locked(async () => {
        if (!(await repository.remove('chores', id)))
          throw new NotFoundError('Chore no longer exists.');
      });
    },
    completeOccurrence(id, day, done) {
      return locked(async () => {
        const item = await repository.get('chores', id);
        if (!item) throw new NotFoundError('Chore no longer exists.');
        if (typeof done !== 'boolean' || !validDay(day) || !choreOccursOn(item, day)) {
          throw new ValidationError('Choose a valid chore occurrence.');
        }
        if (item.missedPolicy === 'skip' && day < choreDay(now())) {
          throw new ValidationError('This chore occurrence has expired.');
        }
        const dates = new Set(item.completedDates || []);
        if (done) dates.add(day);
        else dates.delete(day);
        const updated = { ...item, completedDates: [...dates].sort() };
        if (done && !updated.reminderStatuses?.[day]) {
          updated.reminderStatuses = { ...updated.reminderStatuses, [day]: 'cancelled' };
        }
        updated.updatedAt = new Date(now()).toISOString();
        await save(updated);
        return updated;
      });
    },
    async tick() {
      if (ticking) return;
      ticking = true;
      try {
        await locked(async () => {
          for (const item of await repository.list('chores')) {
            if (item.repeat && item.repeat !== 'none') {
              if (!item.telegramReminder) continue;
              const today = choreDay(now());
              const time = new Date(now()).toLocaleTimeString('en-GB', {
                timeZone: 'America/Detroit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });
              const date = choreDatesThrough(item, today)
                .filter((day) => day < today || time >= item.timeOfDay)
                .at(-1);
              if (
                !date ||
                (item.missedPolicy === 'skip' && date < today) ||
                item.completedDates?.includes(date) ||
                item.reminderStatuses?.[date]
              )
                continue;
              const claimed = {
                ...item,
                reminderStatuses: { ...item.reminderStatuses, [date]: 'sending' },
              };
              await save(claimed);
              try {
                const member = await repository.get('members', item.memberId);
                await sender.send(
                  `Hubby chore for ${member?.title || 'your family'}: ${item.title} (${date})`,
                );
                await save({
                  ...claimed,
                  reminderStatuses: { ...claimed.reminderStatuses, [date]: 'sent' },
                });
              } catch {
                await save({
                  ...claimed,
                  reminderStatuses: { ...claimed.reminderStatuses, [date]: 'failed' },
                });
              }
              continue;
            }
            if (
              item.done ||
              item.reminderStatus !== 'scheduled' ||
              !item.reminderAt ||
              Date.parse(item.reminderAt) > now()
            )
              continue;
            // Claim before sending; a restart never automatically duplicates an
            // uncertain delivery. Completion before this claim cancels delivery.
            await save({ ...item, reminderStatus: 'sending' });
            try {
              const member = await repository.get('members', item.memberId);
              await sender.send(`Hubby chore for ${member?.title || 'your family'}: ${item.title}`);
              await save({ ...item, reminderStatus: 'sent' });
            } catch {
              await save({ ...item, reminderStatus: 'failed' });
            }
          }
        });
      } finally {
        ticking = false;
      }
    },
  };
}
