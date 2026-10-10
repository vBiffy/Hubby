import { useState } from 'react';
import { maxReminderMinutes } from '../../shared/reminders.js';

const presets = [0, 5, 10, 15, 30, 60, 1440];

export function ReminderTiming({ value, onChange }) {
  const [custom, setCustom] = useState(value != null && !presets.includes(value));
  const selection = value == null ? 'none' : custom ? 'custom' : String(value);
  return (
    <fieldset className="reminder-timing">
      <legend>When should we remind you?</legend>
      <label>
        Reminder time
        <select
          value={selection}
          onChange={(event) => {
            const next = event.target.value;
            setCustom(next === 'custom');
            onChange(next === 'none' ? null : next === 'custom' ? 20 : Number(next));
          }}
        >
          <option value="none">No popup reminder</option>
          {presets.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes === 0
                ? 'At the scheduled time'
                : minutes === 1440
                  ? '1 day before'
                  : `${minutes} minutes before`}
            </option>
          ))}
          <option value="custom">Custom lead time</option>
        </select>
      </label>
      {custom && value != null && (
        <label>
          Minutes before (up to 7 days)
          <input
            type="number"
            required
            min={0}
            max={maxReminderMinutes}
            step={1}
            value={value}
            onChange={(event) =>
              onChange(event.target.value === '' ? '' : event.target.valueAsNumber)
            }
          />
        </label>
      )}
    </fieldset>
  );
}
