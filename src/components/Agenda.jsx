import {
  occurrences,
  planStyle,
  planMemberLabel,
  assignedMemberIds,
  weekdays,
} from '../../shared/calendar.js';
import { useState } from 'react';

export function Agenda({ items, onEdit, onSave, onDelete, compact = false, members = [] }) {
  const [error, setError] = useState('');
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (!compact) from.setDate(from.getDate() - 30);
  const through = new Date();
  through.setFullYear(through.getFullYear() + 1);
  const sorted = occurrences(items, from, through);

  const visible = compact
    ? sorted
        .filter(
          (item) => !item.done && Date.parse(item.startsAt) >= new Date().setHours(0, 0, 0, 0),
        )
        .slice(0, 5)
    : sorted;
  async function act(action) {
    try {
      await action();
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{compact ? 'Coming up' : 'Events & reminders'}</h2>
        <button onClick={() => onEdit(null)}>+ Add</button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {visible.map((item) => (
        <article key={item.occurrenceKey} className="agenda-item">
          <div
            className={`date-badge ${assignedMemberIds(item).length > 1 ? 'shared-event' : ''}`}
            style={planStyle(item, members)}
          >
            <span className="calendar-event-label">
              {new Date(item.startsAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
          <div className="agenda-content">
            <button
              className={`event-title ${item.done ? 'completed' : ''}`}
              onClick={() => onEdit(item)}
            >
              {item.title}
            </button>
            <small>
              {item.type} ·{' '}
              {item.allDay
                ? 'All day'
                : new Date(item.startsAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
              {assignedMemberIds(item).length > 0 && ` · ${planMemberLabel(item, members)}`}
              {item.repeat && item.repeat !== 'none' && ' ? Repeats'}
              {item.repeat === 'custom' &&
                ` ${item.repeatDays.map((day) => weekdays[day].slice(0, 3)).join('/')}`}
            </small>
          </div>
          <button
            aria-label={item.done ? 'Mark incomplete' : 'Mark complete'}
            onClick={() => act(() => onSave({ ...item, done: !item.done }))}
          >
            {item.done ? '↶' : '✓'}
          </button>
          {!compact && (
            <button
              aria-label={`Delete ${item.title}${item.repeat && item.repeat !== 'none' ? ' (whole series)' : ''}`}
              onClick={() => {
                onDelete(item);
              }}
            >
              ×
            </button>
          )}
        </article>
      ))}
      {!compact && (
        <p className="hint">
          Showing the last 30 days and the next year. Choose an occurrence or the entire series when
          editing or deleting a repeating plan.
        </p>
      )}
      {!visible.length && <p className="empty">Nothing planned. Make room for something good.</p>}
    </section>
  );
}
