const key = 'hubby.reminder-actions.v1';

// Per-screen delivery state: dismissing a popup does not mark a plan complete,
// nor silence reminders on another household device.
export function createReminderStorage(storage) {
  return {
    read(now = Date.now()) {
      const parsed = JSON.parse(storage.getItem(key) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([, action]) =>
            action &&
            typeof action.dismissed === 'boolean' &&
            Number.isFinite(Date.parse(action.startsAt)) &&
            Number.isFinite(action.expiresAt) &&
            action.expiresAt > now &&
            (action.dismissed || Number.isFinite(action.snoozeUntil)),
        ),
      );
    },
    write(actions, now = Date.now()) {
      const current = Object.fromEntries(
        Object.entries(actions).filter(([, action]) => action.expiresAt > now),
      );
      storage.setItem(key, JSON.stringify(current));
    },
    key,
  };
}
