import { useId, useState } from 'react';
import { toHour24 } from '../../shared/calendar.js';
import { dayKey } from './Calendar.jsx';

const pad = (number) => String(number).padStart(2, '0');

// Keep the existing local-wall-time contract. The event editor remains
// responsible for conversion to UTC; choosing a date never shifts its time.
// Rendering our own calendar avoids the unthemeable browser/OS date popup.
export function DateTimePicker({ value, onChange, weekStart = 0 }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [datePart, timePart = '09:00'] = value.split('T');
  const selected = new Date(`${datePart}T12:00:00`);
  const [month, setMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const [hour24, minute] = timePart.split(':').map(Number);
  const hour = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const offset = (month.getDay() - weekStart + 7) % 7;
  const days = Array.from(
    { length: 42 },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1),
  );

  function choose(date) {
    onChange(`${dayKey(date)}T${timePart}`);
    setOpen(false);
    document.getElementById(`${id}-date-focus`)?.focus();
  }
  function changeTime(part, number) {
    // Numeric entry and steppers both clamp to valid hour/minute ranges.
    if (!Number.isFinite(number)) return;
    const next = Math.max(
      part === 'hour' ? 1 : 0,
      Math.min(part === 'hour' ? 12 : 59, Math.trunc(number)),
    );
    const nextHour = part === 'hour' ? toHour24(next, period) : hour24;
    const nextMinute = part === 'minute' ? next : minute;
    onChange(`${datePart}T${pad(nextHour)}:${pad(nextMinute)}`);
  }

  return (
    <fieldset className="datetime-picker">
      <legend>Date and time</legend>
      <button
        type="button"
        id={`${id}-date-focus`}
        className="picker-date"
        aria-expanded={open}
        aria-controls={open ? `${id}-calendar` : undefined}
        onClick={() => {
          if (!open) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
          setOpen(!open);
        }}
      >
        <span>
          <span className="picker-caption">DATE</span>
          {selected.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <span aria-hidden="true">▦</span>
      </button>
      {open && (
        <div
          id={`${id}-calendar`}
          className="picker-calendar"
          role="group"
          aria-label="Choose a date"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
              document.getElementById(`${id}-date-focus`)?.focus();
            }
          }}
        >
          <div className="picker-month">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <strong aria-live="polite">
              {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>
          <div className="picker-days">
            {Array.from({ length: 7 }, (_, index) => (
              <span className="picker-weekday" key={index}>
                {new Date(2024, 0, 7 + ((index + weekStart) % 7)).toLocaleDateString(undefined, {
                  weekday: 'narrow',
                })}
              </span>
            ))}
            {days.map((date) => (
              <button
                type="button"
                key={dayKey(date)}
                aria-label={date.toLocaleDateString(undefined, { dateStyle: 'full' })}
                aria-pressed={dayKey(date) === datePart}
                aria-current={dayKey(date) === dayKey(new Date()) ? 'date' : undefined}
                className={
                  date.getMonth() !== month.getMonth() ? 'picker-day outside-month' : 'picker-day '
                }
                onClick={() => choose(date)}
              >
                {date.getDate()}
              </button>
            ))}
          </div>
          <button type="button" className="picker-today" onClick={() => choose(new Date())}>
            Use today
          </button>
        </div>
      )}
      <div className="picker-time">
        <span className="picker-caption">TIME · 12 HOUR</span>
        <div className="picker-time-fields">
          {[
            ['hour', hour, 12],
            ['minute', minute, 59],
          ].map(([part, number, max]) => (
            <div className="picker-stepper" key={part}>
              <button
                type="button"
                aria-label={`Decrease ${part}`}
                onClick={() =>
                  changeTime(part, number <= (part === 'hour' ? 1 : 0) ? max : number - 1)
                }
              >
                −
              </button>
              <label className="picker-number">
                <span>{part === 'hour' ? 'Hour' : 'Minute'}</span>
                <input
                  type="number"
                  required
                  min={part === 'hour' ? 1 : 0}
                  max={max}
                  step={1}
                  value={pad(number)}
                  onChange={(event) => changeTime(part, event.target.valueAsNumber)}
                />
              </label>
              <button
                type="button"
                aria-label={`Increase ${part}`}
                onClick={() =>
                  changeTime(part, number === max ? (part === 'hour' ? 1 : 0) : number + 1)
                }
              >
                +
              </button>
            </div>
          ))}
          <label className="picker-period">
            AM / PM
            <select
              value={period}
              onChange={(event) =>
                onChange(`${datePart}T${pad(toHour24(hour, event.target.value))}:${pad(minute)}`)
              }
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </label>
        </div>
      </div>
    </fieldset>
  );
}
