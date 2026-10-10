import {
  occurrences,
  eventStyle,
  occursOnDay,
  assignedMemberIds,
  planStyle,
  planMemberLabel,
  durationMinutes,
  durationLabel,
} from '../../shared/calendar.js';
import { useEffect, useRef, useState } from 'react';
import { createCalendarDrag } from '../adapters/calendarDrag.js';
import { CalendarViewPicker } from './CalendarViewPicker.jsx';

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
  const [view, setView] = useState('month');
  const [family, setFamily] = useState('all');
  const [month, setMonth] = useState(() => new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const monthDays = Array.from(
    { length: 42 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i - offset + 1),
  );
  const week = new Date(month);
  week.setDate(week.getDate() - ((week.getDay() - weekStart + 7) % 7));
  week.setHours(0, 0, 0, 0);
  const day = new Date(month);
  day.setHours(0, 0, 0, 0);
  const days =
    view === 'month'
      ? monthDays
      : Array.from({ length: view === 'week' ? 7 : 1 }, (_, index) => {
          const date = new Date(view === 'week' ? week : day);
          date.setDate(date.getDate() + index);
          return date;
        });
  function navigate(direction) {
    const date = new Date(month);
    if (view === 'month') {
      date.setDate(1);
      date.setMonth(date.getMonth() + direction);
    } else date.setDate(date.getDate() + direction * (view === 'week' ? 7 : 1));
    setMonth(date);
  }
  const through = new Date(days.at(-1));
  through.setHours(23, 59, 59, 999);
  // A removed member automatically returns this calendar to the default view.
  const selectedMember = members.find((member) => member.id === family);
  const calendarOccurrences = occurrences(items, days[0], through).filter(
    (item) => !selectedMember || assignedMemberIds(item).includes(selectedMember.id),
  );

  return (
    <section
      className={`panel calendar calendar-${view}`}
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
          <h2>
            {month.toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
              ...(view !== 'month' ? { day: 'numeric' } : {}),
            })}
          </h2>
        </div>
        <div className="actions calendar-navigation">
          <CalendarViewPicker value={view} onChange={setView} />
          <button aria-label={`Previous ${view}`} onClick={() => navigate(-1)}>
            ‹
          </button>
          <button onClick={() => setMonth(new Date())}>Today</button>
          <button aria-label={`Next ${view}`} onClick={() => navigate(1)}>
            ›
          </button>
        </div>
      </div>
      {members.length > 0 && (
        <div className="calendar-family" role="group" aria-label="Filter by family member">
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              className="family-bubble"
              style={eventStyle(member)}
              aria-label={`Show plans for ${member.title}`}
              aria-pressed={selectedMember?.id === member.id}
              title={member.title}
              onClick={() => setFamily(member.id)}
            >
              {Array.from(member.title.trim())[0]?.toLocaleUpperCase()}
            </button>
          ))}
          {selectedMember && (
            <>
              <span className="family-selection">{selectedMember.title}</span>
              <button
                type="button"
                className="family-reset"
                aria-label="Clear family filter and show everyone"
                title="Show everyone"
                onClick={() => setFamily('all')}
              >
                {'\u00d7'}
              </button>
            </>
          )}
        </div>
      )}
      <div
        className="calendar-grid"
        style={{ gridTemplateColumns: view === 'day' ? '1fr' : undefined }}
      >
        {Array.from({ length: view === 'day' ? 1 : 7 }, (_, i) => (
          <div className="weekday" key={i}>
            {new Date(
              2024,
              0,
              7 + (view === 'day' ? month.getDay() : (i + weekStart) % 7),
            ).toLocaleDateString(undefined, {
              weekday: 'short',
            })}
          </div>
        ))}
        {days.map((date) => {
          const events = calendarOccurrences.filter((item) => occursOnDay(item, dayKey(date)));
          const longestDuration = Math.max(1, ...events.map((item) => durationMinutes(item) || 0));
          const isOutsideMonth = view === 'month' && date.getMonth() !== month.getMonth();
          const isToday = dayKey(date) === dayKey(new Date());
          const classes = ['day', isOutsideMonth ? 'muted' : '', isToday ? 'today' : ''];
          const key = dayKey(date);
          if (dropDay === key) classes.push('drop-target');
          const visibleEvents = view !== 'month' ? events : events.slice(0, 2);

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
                  draggable={Boolean(onMove) && !moving && !item.sportsSource}
                  disabled={moving}
                  onDragStart={(event) => {
                    if (item.sportsSource) {
                      event.preventDefault();
                      return;
                    }
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
                    if (event.pointerType === 'mouse' || !onMove || moving || item.sportsSource)
                      return;
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
                    if (event.key === ' ' && onMove && !item.sportsSource) {
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
                  style={{
                    ...planStyle(item, members),
                    ...(view === 'day' && durationMinutes(item) !== null
                      ? {
                          width: `${(durationMinutes(item) / longestDuration) * 100}%`,
                          minWidth: 'min(100%, 140px)',
                        }
                      : {}),
                  }}
                  title={planMemberLabel(item, members)}
                  className={`calendar-event ${item.done ? 'completed' : ''} ${
                    view === 'day' ? 'day-event' : ''
                  } ${assignedMemberIds(item).length > 1 || item.sportsColors?.length > 1 ? 'shared-event' : ''}`}
                >
                  <span className="calendar-event-label">
                    {item.type === 'reminder' ? '• ' : ''}
                    {item.sportsTimeTbd
                      ? 'Time TBD'
                      : item.allDay
                        ? 'All day'
                        : new Date(item.startsAt).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}{' '}
                    {item.title}
                    {item.repeat && item.repeat !== 'none' ? ' (repeats)' : ''}
                    {view === 'day' && durationLabel(item) && (
                      <span className="event-duration">{durationLabel(item)}</span>
                    )}
                  </span>
                </button>
              ))}
              {view === 'month' && events.length > 2 && (
                <button
                  type="button"
                  className="day-more"
                  aria-label={`View all ${events.length} plans on ${key}`}
                  onClick={() => {
                    setMonth(date);
                    setView('day');
                  }}
                >
                  {`+${events.length - 2} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {view === 'day' && (
        <p className="hint">
          Timed widths compare durations against the longest event shown. All-day plans and entries
          without an end time use full width.
        </p>
      )}
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
