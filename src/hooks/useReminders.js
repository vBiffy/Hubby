import { useEffect, useMemo, useState } from 'react';
import { dueReminders, reminderAction } from '../../shared/reminders.js';
import { createReminderStorage } from '../adapters/reminderStorage.js';

function browserStorage() {
  // Some kiosk/privacy modes deny access to localStorage itself.
  try {
    return createReminderStorage(window.localStorage);
  } catch {
    return null;
  }
}

export function useReminders(events) {
  const [storage] = useState(browserStorage);
  const [actions, setActions] = useState(() => {
    try {
      return storage?.read() || {};
    } catch {
      return {};
    }
  });
  const [now, setNow] = useState(Date.now);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const synchronize = (event) => {
      if (event.key !== storage?.key) return;
      try {
        setActions(storage.read());
      } catch {
        /* Retain this screen's current choices. */
      }
      tick();
    };
    const timer = setInterval(tick, 10000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('storage', synchronize);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('storage', synchronize);
    };
  }, [storage]);

  const reminders = useMemo(() => dueReminders(events, actions, now), [events, actions, now]);

  function respond(reminder, minutes) {
    const time = Date.now();
    const next = { ...actions, [reminder.reminderKey]: reminderAction(reminder, minutes, time) };
    setActions(next);
    setNow(time);
    try {
      if (!storage) throw new Error('Storage is unavailable.');
      storage.write(next, time);
      setStorageError('');
    } catch {
      setStorageError('Your choice applies now, but could not be saved for the next reload.');
    }
  }

  return {
    reminders,
    now,
    storageError,
    onSnooze: (reminder, minutes) => respond(reminder, minutes),
    onDismiss: (reminder) => respond(reminder, null),
  };
}
