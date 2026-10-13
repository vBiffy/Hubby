import { useEffect, useId, useRef, useState } from 'react';
import { weekdays } from '../../shared/calendar.js';

const frequencies = [
  ['none', 'Does not repeat'],
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['custom', 'Custom weekdays'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
];

// Keep changes local until Apply. Cancel never changes the plan being edited.
export function RepeatEditor({ draft, weekStart = 0, onApply, onCancel }) {
  const dialog = useRef(null);
  const id = useId();
  const [repeat, setRepeat] = useState(draft.repeat || 'none');
  const [days, setDays] = useState(
    draft.repeatDays?.length ? draft.repeatDays : [new Date(draft.startsAt).getDay()],
  );
  const [until, setUntil] = useState(draft.repeatUntil || '');
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="panel repeat-editor"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={id}>Repeat settings</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (repeat === 'custom' && !days.length) return;
          onApply({
            repeat,
            repeatDays: repeat === 'custom' ? days : [],
            repeatUntil: repeat === 'none' ? '' : until,
          });
        }}
      >
        <fieldset className="repeat-frequencies">
          <legend>Repeat</legend>
          <div className="repeat-frequency-options">
            {frequencies.map(([value, label]) => (
              <label key={value} className="repeat-frequency-option">
                <input
                  type="radio"
                  name={`${id}-frequency`}
                  value={value}
                  checked={repeat === value}
                  onChange={() => setRepeat(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {repeat === 'custom' && (
          <fieldset className="repeat-weekdays">
            <legend>Repeat every week on</legend>
            <div className="repeat-day-options">
              {Array.from({ length: 7 }, (_, index) => {
                const day = (index + weekStart) % 7;
                return (
                  <label key={day} className="repeat-day-option">
                    <input
                      type="checkbox"
                      checked={days.includes(day)}
                      onChange={() =>
                        setDays(
                          days.includes(day) ? days.filter((item) => item !== day) : [...days, day],
                        )
                      }
                    />
                    {weekdays[day].slice(0, 3)}
                  </label>
                );
              })}
            </div>
            {!days.length && (
              <p role="alert" className="error">
                Select at least one weekday.
              </p>
            )}
          </fieldset>
        )}
        {repeat !== 'none' && (
          <label>
            Repeat through (optional)
            <input
              type="date"
              value={until}
              min={draft.startsAt.slice(0, 10)}
              onChange={(event) => setUntil(event.target.value)}
            />
          </label>
        )}
        <div className="actions">
          <button className="primary" disabled={repeat === 'custom' && !days.length}>
            Apply repeat
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
