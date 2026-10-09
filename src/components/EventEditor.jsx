import { DateTimePicker } from './DateTimePicker.jsx';
import { weekdays } from '../../shared/calendar.js';

// The editor receives actions; it does not know about HTTP or storage.
export function EventEditor({
  draft,
  onChange,
  onSubmit,
  onCancel,
  weekStart,
  busy,
  error,
  members = [],
}) {
  const planType = draft.type === 'reminder' ? 'Reminder' : 'Event';

  return (
    <div className="overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-heading"
        className="panel dialog"
      >
        <h2 id="event-heading">{draft.id ? `Edit ${planType}` : `Add ${planType}`}</h2>
        <form onSubmit={onSubmit}>
          <label>
            Title
            <input
              autoFocus
              required
              maxLength={160}
              value={draft.title}
              onChange={(e) => onChange({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Type
            <select
              value={draft.type}
              onChange={(e) => onChange({ ...draft, type: e.target.value })}
            >
              <option value="event">Event</option>
              <option value="reminder">Reminder</option>
            </select>
          </label>
          <DateTimePicker
            value={draft.startsAt}
            weekStart={weekStart}
            onChange={(startsAt) => onChange({ ...draft, startsAt })}
          />
          <label>
            Family member
            <select
              value={draft.memberId || ''}
              onChange={(event) => onChange({ ...draft, memberId: event.target.value || null })}
            >
              <option value="">Whole household</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Repeat
            <select
              value={draft.repeat || 'none'}
              onChange={(event) =>
                onChange({
                  ...draft,
                  repeat: event.target.value,
                  repeatDays: draft.repeatDays?.length
                    ? draft.repeatDays
                    : [new Date(draft.startsAt).getDay()],
                })
              }
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom weekdays</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          {draft.repeat === 'custom' && (
            <fieldset className="repeat-weekdays">
              <legend>Repeat every week on</legend>
              <div className="repeat-day-options">
                {Array.from({ length: 7 }, (_, index) => {
                  const day = (index + weekStart) % 7;
                  const selected = (draft.repeatDays || []).includes(day);
                  return (
                    <label key={day} className="repeat-day-option">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          onChange({
                            ...draft,
                            repeatDays: selected
                              ? draft.repeatDays.filter((value) => value !== day)
                              : [...(draft.repeatDays || []), day],
                          })
                        }
                      />
                      {weekdays[day].slice(0, 3)}
                    </label>
                  );
                })}
              </div>
              <p className="hint">
                Choose one or more days, such as Tuesday and Thursday. Repeats begin on the first
                selected weekday on or after the start date.
              </p>
              {!draft.repeatDays?.length && (
                <p role="alert" className="error">
                  Select at least one weekday.
                </p>
              )}
            </fieldset>
          )}
          {draft.repeat && draft.repeat !== 'none' && (
            <>
              <label>
                Repeat through (optional)
                <input
                  type="date"
                  value={draft.repeatUntil || ''}
                  min={draft.startsAt.slice(0, 10)}
                  onChange={(event) => onChange({ ...draft, repeatUntil: event.target.value })}
                />
              </label>
              <p className="hint">
                Editing or deleting changes the whole series. Completion applies to one occurrence.
                Dates that don't exist are skipped.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              disabled={busy || (draft.repeat === 'custom' && !draft.repeatDays?.length)}
              className="primary"
            >
              {busy ? 'Saving…' : `Save ${planType}`}
            </button>
            <button disabled={busy} type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
