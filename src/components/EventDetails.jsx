import { useEffect, useId, useRef } from 'react';
import { weekdays, eventStyle } from '../../shared/calendar.js';

// Show the clicked occurrence's date, while Edit still opens its source series.
export function EventDetails({ item, members, onEdit, onDelete, onClose, busy, error }) {
  const dialog = useRef(null);
  const id = useId();
  const type = item.type === 'reminder' ? 'Reminder' : 'Event';
  const member = members.find((person) => person.id === item.memberId);
  const repeat = item.repeat || 'none';
  const schedule =
    repeat === 'custom'
      ? `Every ${item.repeatDays.map((day) => weekdays[day]).join(', ')}`
      : repeat === 'none'
        ? 'Does not repeat'
        : `Repeats ${repeat}`;

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      className="panel event-details"
      ref={dialog}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <p className="eyebrow">{type.toUpperCase()} DETAILS</p>
      <h2 id={`${id}-title`}>{item.title}</h2>
      <span className="reminder-type" style={eventStyle(member)}>
        {member?.title || 'Whole household'}
      </span>
      <dl className="event-summary">
        <div>
          <dt>When</dt>
          <dd>
            {new Date(item.startsAt).toLocaleString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </dd>
        </div>
        {item.type === 'event' && item.location && (
          <div>
            <dt>Location</dt>
            <dd>{item.location}</dd>
          </div>
        )}
        <div>
          <dt>Schedule</dt>
          <dd>
            {schedule}
            {item.repeatUntil && ` through ${item.repeatUntil}`}
          </dd>
        </div>
        <div>
          <dt>Alert</dt>
          <dd>
            {item.reminderMinutes == null
              ? 'No popup reminder'
              : item.reminderMinutes === 0
                ? 'At the scheduled time'
                : `${item.reminderMinutes} minutes before`}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{item.done ? 'Completed' : 'Planned'}</dd>
        </div>
      </dl>
      {repeat !== 'none' && <p className="hint">Editing or deleting affects the whole series.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="primary" disabled={busy} onClick={onEdit}>
          Edit {type}
        </button>
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
        <button className="delete-plan" disabled={busy} onClick={onDelete}>
          Delete {type}
        </button>
      </div>
    </dialog>
  );
}
