import { useEffect, useRef, useState } from 'react';
import { planStyle, planMemberLabel, assignedMemberIds } from '../../shared/calendar.js';
import { snoozeOptions } from '../../shared/reminders.js';

// Non-modal popup: other plans remain usable while multiple reminders queue.
export function ReminderCenter({ reminders, now, members, onSnooze, onDismiss, storageError }) {
  const [minutes, setMinutes] = useState(5);
  const panel = useRef(null);
  const previousFocus = useRef(null);
  const visible = reminders.length > 0;

  useEffect(() => {
    if (!visible) return;
    previousFocus.current = document.activeElement;
    panel.current?.focus();
    return () => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, [visible]);

  if (!visible)
    return storageError ? (
      <p className="reminder-storage-error error" role="alert">
        {storageError}
      </p>
    ) : null;

  return (
    <section
      className="panel reminder-center"
      role="dialog"
      aria-labelledby="reminder-title"
      aria-describedby="reminder-description"
      tabIndex={-1}
      ref={panel}
    >
      <div className="panel-heading">
        <h2 id="reminder-title">Reminders</h2>
        <span aria-live="polite">{reminders.length} due</span>
      </div>
      <p id="reminder-description" className="hint">
        Snooze to be reminded again, or dismiss this alert.
      </p>
      {storageError && (
        <p role="alert" className="error">
          {storageError}
        </p>
      )}
      <div className="reminder-list">
        {reminders.map((reminder) => {
          const startsAt = new Date(reminder.startsAt);
          const difference = Math.round((startsAt.getTime() - now) / 60000);
          const relative =
            difference > 0
              ? `Starts in ${difference} min`
              : difference === 0
                ? 'Happening now'
                : `Started ${Math.abs(difference)} min ago`;
          return (
            <article key={reminder.reminderKey} className="reminder-item">
              <span
                className={`reminder-type ${assignedMemberIds(reminder).length > 1 ? 'shared-event' : ''}`}
                style={planStyle(reminder, members)}
              >
                <span className="calendar-event-label">
                  {reminder.type === 'reminder' ? 'Reminder' : 'Event'} ·{' '}
                  {planMemberLabel(reminder, members)}
                </span>
              </span>
              <h3>{reminder.title}</h3>
              <p>
                {startsAt.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}{' '}
                · {relative}
              </p>
              <div className="actions">
                <button className="primary" onClick={() => onSnooze(reminder, minutes)}>
                  Snooze
                </button>
                <button onClick={() => onDismiss(reminder)}>Dismiss</button>
              </div>
            </article>
          );
        })}
      </div>
      <label className="reminder-snooze">
        Snooze for
        <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          {snoozeOptions.map((value) => (
            <option key={value} value={value}>
              {value} minutes
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
