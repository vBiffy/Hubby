import { Select } from './Select.jsx';
import { useEffect, useId, useRef } from 'react';
import { weekdays, planStyle, planMemberLabel, assignedMemberIds } from '../../shared/calendar.js';

// Scope is controlled by the shell; this view remains independent of storage.
export function EventDetails({
  item,
  members,
  onEdit,
  onDelete,
  onClose,
  busy,
  error,
  scope = 'occurrence',
  onScope,
}) {
  const dialog = useRef(null);
  const id = useId();
  const type = item.type === 'reminder' ? 'Reminder' : 'Event';
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
      <span
        className={`reminder-type ${assignedMemberIds(item).length > 1 || item.sportsColors?.length > 1 ? 'shared-event' : ''}`}
        style={planStyle(item, members)}
      >
        <span className="calendar-event-label">{planMemberLabel(item, members)}</span>
      </span>
      <dl className="event-summary">
        {item.sportsSource && (
          <div>
            <dt>Sports schedule</dt>
            <dd>
              Synced from ESPN · {item.sportsStatus}
              {item.sportsTimeTbd && ' · Start time TBD'}
            </dd>
          </div>
        )}
        <div>
          <dt>When</dt>
          <dd>
            {new Date(item.startsAt).toLocaleString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              ...(item.allDay ? {} : { hour: 'numeric', minute: '2-digit', hour12: true }),
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
      {item.sportsSource && (
        <p className="hint">
          This game updates from ESPN automatically. Manage its calendar visibility through favorite
          teams in Customize → Sports.
        </p>
      )}
      {repeat !== 'none' && onScope && (
        <label>
          Apply edit or delete to
          <Select value={scope} onChange={(event) => onScope(event.target.value)}>
            <option value="occurrence">Only this occurrence</option>
            <option value="series">Entire series</option>
          </Select>
        </label>
      )}
      {item.allDay && <p>All-day plan</p>}
      {item.endsAt && (
        <p>
          Ends{' '}
          {new Date(item.endsAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            ...(item.allDay ? {} : { timeStyle: 'short' }),
          })}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        {!item.sportsSource && (
          <button className="primary" disabled={busy} onClick={onEdit}>
            Edit {type}
          </button>
        )}
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
        {!item.sportsSource && (
          <button className="delete-plan" disabled={busy} onClick={onDelete}>
            Delete {type}
          </button>
        )}
      </div>
    </dialog>
  );
}
