import { occurrences } from './calendar.js';

export const maxReminderMinutes = 7 * 24 * 60;
export const snoozeOptions = [5, 10, 15, 30, 60];
const day = 24 * 60 * 60 * 1000;

// Pure scheduling policy. The browser provides a clock and persisted actions;
// no timers, DOM, or storage are coupled to recurrence calculation here.
export function dueReminders(events, actions, now) {
  let from = now - day;
  for (const action of Object.values(actions)) {
    if (!action.dismissed && action.expiresAt > now) {
      from = Math.min(from, Date.parse(action.startsAt));
    }
  }
  const through = now + maxReminderMinutes * 60 * 1000;
  const expanded = occurrences(events, new Date(from), new Date(through));

  return expanded
    .flatMap((event) => {
      const minutes = event.reminderMinutes;
      if (event.done || !Number.isInteger(minutes) || minutes < 0 || minutes > maxReminderMinutes)
        return [];
      const startsAt = Date.parse(event.startsAt);
      const dueAt = startsAt - minutes * 60 * 1000;
      // A changed start time or lead time creates a new notification identity.
      // Editing a title/member alone should not resurrect a dismissed reminder.
      const movedFrom = event.occurrenceMoves?.[event.occurrenceDate]
        ? `:${event.occurrenceDate}`
        : '';
      const key = `${event.id}:${event.startsAt}:${minutes}${movedFrom}`;
      const action = actions[key];
      if (action?.dismissed) return [];
      const triggerAt = action?.snoozeUntil ?? dueAt;
      if (triggerAt > now || (triggerAt < now - day && !action)) return [];
      return [{ ...event, reminderKey: key, dueAt, triggerAt }];
    })
    .sort((a, b) => a.triggerAt - b.triggerAt);
}

export function reminderAction(reminder, snoozeMinutes, now) {
  if (snoozeMinutes !== null && !snoozeOptions.includes(snoozeMinutes)) {
    throw new Error('Choose a valid snooze duration.');
  }
  const snoozeUntil = snoozeMinutes === null ? null : now + snoozeMinutes * 60 * 1000;
  return {
    startsAt: reminder.startsAt,
    dismissed: snoozeMinutes === null,
    snoozeUntil,
    expiresAt: Math.max(Date.parse(reminder.startsAt), snoozeUntil ?? now) + day,
  };
}
