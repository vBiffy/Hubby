import { occurrences, eventStyle } from '../../shared/calendar.js';
import { useState } from 'react';

export function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function Calendar({ items, weekStart, onSelect, onEdit, members = [] }) {
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const days = Array.from(
    { length: 42 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1),
  );
  const through = new Date(days[41]);
  through.setHours(23, 59, 59, 999);
  const calendarOccurrences = occurrences(items, days[0], through);

  return (
    <section className="panel calendar">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">THE FAMILY PLAN</p>
          <h2>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        </div>
        <div className="actions">
          <button
            aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            ‹
          </button>
          <button
            onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            Today
          </button>
          <button
            aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            ›
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {Array.from({ length: 7 }, (_, i) => (
          <div className="weekday" key={i}>
            {new Date(2024, 0, 7 + ((i + weekStart) % 7)).toLocaleDateString(undefined, {
              weekday: 'short',
            })}
          </div>
        ))}
        {days.map((date) => {
          const events = calendarOccurrences.filter(
            (item) => dayKey(new Date(item.startsAt)) === dayKey(date),
          );
          const isOutsideMonth = date.getMonth() !== month.getMonth();
          const isToday = dayKey(date) === dayKey(new Date());
          const classes = ['day', isOutsideMonth ? 'muted' : '', isToday ? 'today' : ''];
          const key = dayKey(date);
          const isDayExpanded = expandedDays.has(key);
          const visibleEvents = isDayExpanded ? events : events.slice(0, 2);

          return (
            <div
              key={key}
              className={classes.join(' ')}
              onClick={(event) => {
                if (event.target === event.currentTarget) onSelect(key);
              }}
            >
              <button
                type="button"
                className="day-date"
                onClick={() => onSelect(key)}
                aria-label={`Add a plan on ${date.toLocaleDateString(undefined, {
                  dateStyle: 'full',
                })}`}
              >
                <span>{date.getDate()}</span>
              </button>
              {visibleEvents.map((item) => (
                <button
                  type="button"
                  key={item.occurrenceKey}
                  onClick={() => onEdit?.(item)}
                  aria-label={`Edit ${item.type}: ${item.title}`}
                  style={eventStyle(members.find((member) => member.id === item.memberId))}
                  title={
                    members.find((member) => member.id === item.memberId)?.title ||
                    'Whole household'
                  }
                  className={`calendar-event ${item.done ? 'completed' : ''}`}
                >
                  {item.type === 'reminder' ? '• ' : ''}
                  {new Date(item.startsAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}{' '}
                  {item.title}
                  {item.repeat && item.repeat !== 'none' ? ' ?' : ''}
                </button>
              ))}
              {events.length > 2 && (
                <button
                  type="button"
                  className="day-more"
                  aria-expanded={isDayExpanded}
                  onClick={() =>
                    setExpandedDays((previous) => {
                      const next = new Set(previous);
                      if (isDayExpanded) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                >
                  {isDayExpanded ? 'Show less' : `+${events.length - 2} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="family-legend">
        {members.map((member) => (
          <span key={member.id}>
            <span className="member-swatch" style={{ backgroundColor: member.color }} />
            {member.title}
          </span>
        ))}
      </div>
      <p className="hint">Touch a date to add a plan, or an entry to edit it.</p>
    </section>
  );
}
