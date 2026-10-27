import { useLayoutEffect, useRef, useState } from 'react';
import { ChoreRow } from './Chores.jsx';
import { hubStartAt } from '../../shared/hubTimeline.js';
import { hubChores, choreDay } from '../../shared/chores.js';
import {
  assignedMemberIds,
  dateKey,
  occurrences,
  occursOnDay,
  planStyle,
} from '../../shared/calendar.js';

const HOUR_HEIGHT = 64;
const hourLabel = (hour) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
const timeLabel = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Use wall-clock positions: a daylight-saving day still shows the familiar 24 hour labels.
export function timelineBlocks(items, day) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const minutes = (date) => date.getHours() * 60 + date.getMinutes();
  const blocks = items
    .filter((item) => !item.allDay && occursOnDay(item, dateKey(day)))
    .map((item) => {
      const from = new Date(item.startsAt);
      const until = item.endsAt ? new Date(item.endsAt) : new Date(+from + 30 * 60000);
      const top = from < start ? 0 : minutes(from);
      const bottom = until >= end ? 1440 : minutes(until);
      return { item, top, bottom: Math.min(1440, Math.max(top + 40, bottom)) };
    })
    .sort((a, b) => a.top - b.top);
  // Partition overlapping groups into lanes so simultaneous plans remain selectable.
  let group = [];
  let groupEnd = -1;
  const finish = () => {
    const lanes = [];
    for (const block of group) {
      let lane = lanes.findIndex((bottom) => bottom <= block.top);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = block.bottom;
      block.lane = lane;
    }
    group.forEach((block) => {
      block.lanes = lanes.length;
    });
  };
  for (const block of blocks) {
    if (block.top >= groupEnd) {
      finish();
      group = [];
    }
    group.push(block);
    groupEnd = Math.max(...group.map((entry) => entry.bottom));
  }
  finish();
  return blocks;
}

export function HubTimeline({
  items,
  chores,
  members,
  person,
  selected,
  onChangeWeek,
  now,
  onOpenEvent,
  onCreateEvent,
  onSaveChore,
}) {
  const scroll = useRef(null);
  const tap = useRef({ pending: null, down: null, opened: 0 });
  const timeline = useRef(null);
  const previousView = useRef(null);
  const [viewport, setViewport] = useState({ top: 8 * HOUR_HEIGHT, height: 400 });
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(`${selected}T00:00:00`);
    day.setDate(day.getDate() - day.getDay() + index);
    return day;
  });
  const through = new Date(days[6]);
  through.setHours(23, 59, 59, 999);
  const plans = occurrences(
    items.filter((item) => !item.sportsSource),
    days[0],
    through,
  ).filter(
    (item) =>
      !item.done &&
      (person === 'everyone' ||
        !assignedMemberIds(item).length ||
        assignedMemberIds(item).includes(person)),
  );
  const columns = days.map((day) => ({
    day,
    key: dateKey(day),
    blocks: timelineBlocks(plans, day),
  }));
  useLayoutEffect(() => {
    const previous = previousView.current;
    previousView.current = { selected, person };
    if (!previous || (previous.selected === selected && previous.person === person)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Match the other view transitions without remounting the calendar or its controls.
    const direction = selected < previous.selected ? -1 : 1;
    const animation = timeline.current.animate(
      [
        { opacity: 0, transform: `translateX(${direction * 16}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 350, easing: 'ease-in-out' },
    );
    // Rapid selections cancel the previous animation before starting the next one.
    return () => animation.cancel();
  }, [selected, person]);
  useLayoutEffect(() => {
    const element = scroll.current;
    const update = () => {
      const headerHeight = element.firstElementChild.offsetHeight;
      timeline.current.style.setProperty('--hub-header-height', `${headerHeight}px`);
      timeline.current.style.setProperty(
        '--hub-grid-width',
        `${element.lastElementChild.getBoundingClientRect().width}px`,
      );
      setViewport({ top: element.scrollTop, height: element.clientHeight - headerHeight });
    };
    // Begin near the current hour today; other dates start at 8 AM.
    element.scrollTop =
      (selected === dateKey(now) ? Math.max(0, now.getHours() - 1) : 8) * HOUR_HEIGHT;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [selected, person]);
  function jump(block) {
    scroll.current.scrollTo({
      top: Math.max(0, (block.top / 60) * HOUR_HEIGHT - 12),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  function createAt(event, day) {
    // Existing plan buttons keep their detail/edit behavior.
    if (!onCreateEvent || event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onCreateEvent(hubStartAt(day, event.clientY - bounds.top, bounds.height));
  }
  return (
    <div className="hub-timeline" ref={timeline}>
      <div className="hub-timeline-viewport">
        <div
          className="hub-timeline-scroll"
          ref={scroll}
          tabIndex={0}
          role="region"
          aria-label="Sunday through Saturday hourly calendar; scroll vertically for more hours"
          onScroll={(event) => {
            tap.current.pending = null;
            tap.current.down = null;
            setViewport({
              top: event.currentTarget.scrollTop,
              height:
                event.currentTarget.clientHeight -
                event.currentTarget.firstElementChild.offsetHeight,
            });
          }}
        >
          <div className="hub-timeline-head">
            <button
              type="button"
              className="hub-calendar-week-arrow hub-calendar-week-previous"
              aria-label="Previous week"
              onClick={() => onChangeWeek(-1)}
            >
              <span aria-hidden="true">{'\u2039'}</span>
            </button>
            {columns.map(({ day, key }) => {
              return (
                <section key={key} data-today={key === dateKey(now) || undefined}>
                  <h3>
                    {day.toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </h3>
                  {plans
                    .filter((item) => item.allDay && occursOnDay(item, key))
                    .map((item) => (
                      <button
                        className="hub-all-day-plan"
                        key={item.occurrenceKey}
                        style={planStyle(item, members)}
                        onClick={() => onOpenEvent(item)}
                      >
                        All day · {item.title}
                      </button>
                    ))}
                  {hubChores(chores, key, now)
                    .filter((item) => person === 'everyone' || item.memberId === person)
                    .map((item) => (
                      <ChoreRow
                        key={`${item.id}:${item.occurrenceDate || 'single'}`}
                        item={item}
                        today={choreDay(now)}
                        onSave={onSaveChore}
                      />
                    ))}
                </section>
              );
            })}
            <button
              type="button"
              className="hub-calendar-week-arrow hub-calendar-week-next"
              aria-label="Next week"
              onClick={() => onChangeWeek(1)}
            >
              <span aria-hidden="true">{'\u203a'}</span>
            </button>
          </div>
          <div className="hub-timeline-grid">
            <div className="hub-time-labels">
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour}>{hourLabel(hour)}</span>
              ))}
            </div>
            {columns.map(({ key, blocks }) => (
              <div
                className="hub-hour-column"
                key={key}
                onDoubleClick={(event) => {
                  // Touch double taps can also generate a synthetic dblclick.
                  if (Date.now() - tap.current.opened < 600) return;
                  createAt(event, key);
                }}
                onPointerDown={(event) => {
                  if (event.pointerType === 'mouse' || event.target !== event.currentTarget) {
                    tap.current.pending = null;
                    return;
                  }
                  tap.current.down = { x: event.clientX, y: event.clientY, time: Date.now() };
                }}
                onPointerCancel={() => {
                  tap.current.down = null;
                  tap.current.pending = null;
                }}
                onPointerUp={(event) => {
                  if (event.pointerType === 'mouse') return;
                  const down = tap.current.down;
                  tap.current.down = null;
                  const time = Date.now();
                  if (
                    !down ||
                    time - down.time > 300 ||
                    Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12
                  ) {
                    tap.current.pending = null;
                    return;
                  }
                  const previous = tap.current.pending;
                  if (
                    previous &&
                    previous.day === key &&
                    time - previous.time < 400 &&
                    Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 24
                  ) {
                    tap.current.pending = null;
                    tap.current.opened = time;
                    createAt(event, key);
                  } else {
                    tap.current.pending = { day: key, time, x: event.clientX, y: event.clientY };
                  }
                }}
              >
                {blocks.map(({ item, top, bottom, lane, lanes }) => (
                  <button
                    className="hub-timed-plan"
                    key={item.occurrenceKey}
                    style={{
                      ...planStyle(item, members),
                      top: `${(top / 60) * HOUR_HEIGHT}px`,
                      height: `${((bottom - top) / 60) * HOUR_HEIGHT}px`,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                    onClick={() => onOpenEvent(item)}
                  >
                    <strong>{item.title}</strong>
                    <small>
                      {timeLabel(new Date(item.startsAt))}
                      {item.endsAt && ` – ${timeLabel(new Date(item.endsAt))}`}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="hub-timeline-indicators">
          <span aria-hidden="true" />
          {columns.map(({ key, blocks }) => {
            const above = blocks.filter(
              (block) => (block.bottom / 60) * HOUR_HEIGHT <= viewport.top,
            );
            const below = blocks.filter(
              (block) => (block.top / 60) * HOUR_HEIGHT >= viewport.top + viewport.height,
            );
            return (
              <div className="hub-day-indicators" key={key}>
                {!!above.length && (
                  <button
                    type="button"
                    className="hub-plan-edge hub-plan-edge-up"
                    onClick={() => jump(above.at(-1))}
                    title={`${above.length} plans above`}
                    aria-label={`${above.length} plans above on ${key}`}
                  >
                    <span aria-hidden="true">{'\u2191'} !</span>
                  </button>
                )}
                {!!below.length && (
                  <button
                    type="button"
                    className="hub-plan-edge hub-plan-edge-down"
                    onClick={() => jump(below[0])}
                    title={`${below.length} plans below`}
                    aria-label={`${below.length} plans below on ${key}`}
                  >
                    <span aria-hidden="true">{'\u2193'} !</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
