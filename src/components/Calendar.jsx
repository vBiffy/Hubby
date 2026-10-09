import { occurrences, eventStyle } from '../../shared/calendar.js';
import { useEffect, useRef, useState } from 'react';
import { createCalendarDrag } from '../adapters/calendarDrag.js';

export function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function Calendar({ items, weekStart, onSelect, onEdit, onMove, members = [] }) {
  const [dragged, setDragged] = useState(null);
  const [drag] = useState(createCalendarDrag);
  const [dropDay, setDropDay] = useState(null);
  const [moving, setMoving] = useState(false);
  const [moveMessage, setMoveMessage] = useState('');
  const touch = useRef({ timer: null, active: false, suppressUntil: 0 });
  useEffect(() => () => clearTimeout(touch.current.timer), []);

  async function drop(day) {
    const entry = drag.current();
    if (!entry || moving) return;
    drag.end();
    setDragged(null);
    setDropDay(null);
    setMoving(true);
    try {
      await onMove(entry, day);
      setMoveMessage(`Moved ${entry.title} to ${day}.`);
    } catch (error) {
      setMoveMessage(error.message);
    } finally {
      setMoving(false);
    }
  }

  function selectDay(day) {
    if (Date.now() < touch.current.suppressUntil) return;
    if (drag.current()) drop(day);
    else onSelect(day);
  }
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
    <section
      className="panel calendar"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          drag.end();
          setDragged(null);
          setDropDay(null);
        }
      }}
    >
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
          if (dropDay === key) classes.push('drop-target');
          const isDayExpanded = expandedDays.has(key);
          const visibleEvents = isDayExpanded ? events : events.slice(0, 2);

          return (
            <div
              key={key}
              className={classes.join(' ')}
              data-calendar-day={key}
              onDragOver={(event) => {
                if (!drag.current()) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropDay(key);
              }}
              onDrop={(event) => {
                event.preventDefault();
                drop(key);
              }}
              onClick={(event) => {
                if (event.target === event.currentTarget) selectDay(key);
              }}
            >
              <button
                type="button"
                className="day-date"
                onClick={() => selectDay(key)}
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
                  draggable={Boolean(onMove) && !moving}
                  disabled={moving}
                  onDragStart={(event) => {
                    drag.start(item, true);
                    setDragged(item);
                    setMoveMessage('');
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.occurrenceKey);
                  }}
                  onDragEnd={() => {
                    drag.end();
                    setDragged(null);
                    setDropDay(null);
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse' || !onMove || moving) return;
                    const button = event.currentTarget;
                    touch.current.x = event.clientX;
                    touch.current.y = event.clientY;
                    touch.current.timer = setTimeout(() => {
                      touch.current.active = true;
                      drag.start(item);
                      button.setPointerCapture(event.pointerId);
                      setDragged(item);
                      setMoveMessage('');
                    }, 350);
                  }}
                  onPointerMove={(event) => {
                    if (!touch.current.active) {
                      if (
                        Math.hypot(
                          event.clientX - touch.current.x,
                          event.clientY - touch.current.y,
                        ) > 8
                      )
                        clearTimeout(touch.current.timer);
                      return;
                    }
                    setDropDay(
                      document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest('[data-calendar-day]')?.dataset.calendarDay || null,
                    );
                  }}
                  onPointerUp={() => {
                    clearTimeout(touch.current.timer);
                    if (!touch.current.active) return;
                    touch.current.active = false;
                    touch.current.suppressUntil = Date.now() + 500;
                    if (dropDay) drop(dropDay);
                    else {
                      drag.end();
                      setDragged(null);
                      setDropDay(null);
                    }
                  }}
                  onPointerCancel={() => {
                    clearTimeout(touch.current.timer);
                    if (!drag.cancelPointer()) return;
                    touch.current.active = false;
                    setDragged(null);
                    setDropDay(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === ' ' && onMove) {
                      event.preventDefault();
                      drag.start(item);
                      setDragged(item);
                      setMoveMessage('Choose a date to move this entry. Escape cancels.');
                    }
                    if (event.key === 'Escape') {
                      drag.end();
                      setDragged(null);
                      setDropDay(null);
                    }
                  }}
                  onClick={() => {
                    if (Date.now() < touch.current.suppressUntil) return;
                    onEdit?.(item);
                  }}
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
      {onMove && (
        <p className="hint">
          Drag entries to another day; on touchscreens, press and hold before dragging. Time stays
          the same. Keyboard: Space on an entry, then choose a date.
        </p>
      )}
      {moveMessage && (
        <p role="status" className="hint">
          {moveMessage}
        </p>
      )}
    </section>
  );
}
