import { Select } from './Select.jsx';
import { DateTimePicker } from './DateTimePicker.jsx';
import { weekdays, localDateTime, assignedMemberIds } from '../../shared/calendar.js';
import { ReminderTiming } from './ReminderTiming.jsx';

// The editor receives actions; it does not know about HTTP or storage.
export function EventEditor({
  draft,
  onChange,
  onSubmit,
  onCancel,
  onDelete,
  weekStart,
  busy,
  error,
  members = [],
  occurrenceOnly = false,
  conflicts = [],
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
            <Select
              value={draft.type}
              onChange={(e) => onChange({ ...draft, type: e.target.value })}
            >
              <option value="event">Event</option>
              <option value="reminder">Reminder</option>
            </Select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.allDay || false}
              onChange={(event) => onChange({ ...draft, allDay: event.target.checked })}
            />
            All day
          </label>
          <DateTimePicker
            value={draft.startsAt}
            hideTime={draft.allDay}
            weekStart={weekStart}
            onChange={(startsAt) => onChange({ ...draft, startsAt })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(draft.endsAt)}
              onChange={(event) => {
                const end = new Date(draft.startsAt);
                end.setHours(end.getHours() + 1);
                onChange({ ...draft, endsAt: event.target.checked ? localDateTime(end) : '' });
              }}
            />
            Set an end date/time
          </label>
          {draft.endsAt && (
            <div>
              <p>Ends (inclusive last date for all-day plans)</p>
              <DateTimePicker
                value={draft.endsAt}
                hideTime={draft.allDay}
                weekStart={weekStart}
                onChange={(endsAt) => onChange({ ...draft, endsAt })}
              />
              {!draft.allDay && (
                <p className="hint">
                  Duration:{' '}
                  {Math.round((new Date(draft.endsAt) - new Date(draft.startsAt)) / 60000)} minutes
                </p>
              )}
            </div>
          )}
          {conflicts.length > 0 && (
            <p role="status" className="hint">
              Overlaps with: {conflicts.map((item) => item.title).join(', ')}. You can still save.
            </p>
          )}
          {occurrenceOnly && <p className="hint">Saving changes only this occurrence.</p>}
          {draft.type === 'event' && (
            <label>
              Location (optional)
              <input
                maxLength={300}
                value={draft.location || ''}
                placeholder="e.g. Office or community center"
                onChange={(event) => onChange({ ...draft, location: event.target.value })}
              />
            </label>
          )}
          <ReminderTiming
            value={draft.reminderMinutes ?? null}
            onChange={(reminderMinutes) => onChange({ ...draft, reminderMinutes })}
          />
          {draft.allDay && (
            <p className="hint">All-day alerts are relative to 9 AM on the first day.</p>
          )}
          <fieldset className="plan-members">
            <legend>Family members</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={!assignedMemberIds(draft).length}
                onChange={() => onChange({ ...draft, memberIds: [], memberId: null })}
              />
              Whole household
            </label>
            {members.map((member) => {
              const selected = assignedMemberIds(draft);
              return (
                <label className="check" key={member.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(member.id)}
                    onChange={() => {
                      const memberIds = selected.includes(member.id)
                        ? selected.filter((id) => id !== member.id)
                        : [...selected, member.id];
                      onChange({
                        ...draft,
                        memberIds,
                        memberId: memberIds.length === 1 ? memberIds[0] : null,
                      });
                    }}
                  />
                  <span className="member-swatch" style={{ backgroundColor: member.color }} />
                  {member.title}
                </label>
              );
            })}
          </fieldset>
          <label>
            Repeat
            <Select
              disabled={occurrenceOnly}
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
            </Select>
          </label>
          {!occurrenceOnly && draft.repeat === 'custom' && (
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
          {!occurrenceOnly && draft.repeat && draft.repeat !== 'none' && (
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
                Series edits keep existing occurrence exceptions. Completion applies to one
                occurrence. Dates that don't exist are skipped.
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
            {draft.id && onDelete && (
              <button disabled={busy} type="button" className="delete-plan" onClick={onDelete}>
                Delete {planType}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
