import { Select } from './Select.jsx';

export function CalendarViewPicker({ value, onChange }) {
  return (
    <div className="calendar-view-picker">
      <Select
        value={value}
        aria-label={`Calendar view: ${value}`}
        onChange={(event) => onChange(event.target.value)}
      >
        {['month', 'week', 'day'].map((view) => (
          <option key={view} value={view}>
            {view[0].toUpperCase() + view.slice(1)}
          </option>
        ))}
      </Select>
    </div>
  );
}
