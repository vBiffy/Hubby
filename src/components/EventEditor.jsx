import { useEffect, useRef, useState } from 'react';
import { RepeatEditor } from './RepeatEditor.jsx';
import { Select } from './Select.jsx';
import { DateTimePicker } from './DateTimePicker.jsx';
import { localDateTime, assignedMemberIds } from '../../shared/calendar.js';
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
  const [repeatOpen, setRepeatOpen] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  const planType = draft.type === 'reminder' ? 'Reminder' : 'Event';

  return (
    <div className="overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-heading"
        className="panel dialog plan-editor"
        ref={dialog}
        tabIndex={-1}
      >
        <h2 id="event-heading">{draft.id ? `Edit ${planType}` : `Add ${planType}`}</h2>
        <form className="plan-editor-form" onSubmit={onSubmit}>
          <label>
            Title
            <input
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
          <div className="plan-time-options">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.allDay || false}
                onChange={(event) => onChange({ ...draft, allDay: event.target.checked })}
              />
              All day
            </label>
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
          </div>
          {draft.type === 'event' ? (
            <label className="plan-location">
              Location (optional)
              <input
                maxLength={300}
                value={draft.location || ''}
                placeholder="e.g. Office or community center"
                onChange={(event) => onChange({ ...draft, location: event.target.value })}
              />
            </label>
          ) : (
            <div className="plan-location" aria-hidden="true" />
          )}
          <div className="plan-time-range">
            <div className="plan-start-time">
              <DateTimePicker
                value={draft.startsAt}
                hideTime={draft.allDay}
                legend={draft.allDay ? 'Start date' : 'Start date and time'}
                weekStart={weekStart}
                onChange={(startsAt) => onChange({ ...draft, startsAt })}
              />
            </div>
            {/* Reserve the end picker's footprint while keeping it non-interactive
                and outside the accessibility tree until explicitly enabled. */}
            <div
              className={`plan-end-time ${draft.endsAt ? '' : 'plan-end-placeholder'}`}
              inert={!draft.endsAt}
              aria-hidden={!draft.endsAt}
            >
              <DateTimePicker
                value={draft.endsAt || draft.startsAt}
                hideTime={draft.allDay}
                legend={draft.allDay ? 'End date' : 'End date and time'}
                weekStart={weekStart}
                onChange={(endsAt) => onChange({ ...draft, endsAt })}
              />
              <p className="hint">
                {draft.allDay
                  ? 'Inclusive last date.'
                  : `Duration: ${Math.round(
                      (new Date(draft.endsAt || draft.startsAt) - new Date(draft.startsAt)) / 60000,
                    )} minutes`}
              </p>
            </div>
          </div>
          {conflicts.length > 0 && (
            <p role="status" className="hint">
              Overlaps with: {conflicts.map((item) => item.title).join(', ')}. You can still save.
            </p>
          )}
          {occurrenceOnly && <p className="hint">Saving changes only this occurrence.</p>}
          <ReminderTiming
            value={draft.reminderMinutes ?? null}
            onChange={(reminderMinutes) => onChange({ ...draft, reminderMinutes })}
          />
          {draft.allDay && (
            <p className="hint">All-day alerts are relative to 9 AM on the first day.</p>
          )}
          <div className="plan-repeat-control">
            <span>Repeat</span>
            <button
              type="button"
              disabled={busy || occurrenceOnly}
              onClick={() => setRepeatOpen(true)}
              aria-haspopup="dialog"
            >
              {draft.repeat === 'custom'
                ? 'Custom weekdays'
                : draft.repeat && draft.repeat !== 'none'
                  ? draft.repeat.charAt(0).toUpperCase() + draft.repeat.slice(1)
                  : 'Does not repeat'}
            </button>
          </div>
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
      {repeatOpen && (
        <RepeatEditor
          draft={draft}
          weekStart={weekStart}
          onCancel={() => setRepeatOpen(false)}
          onApply={(repeatSettings) => {
            onChange({ ...draft, ...repeatSettings });
            setRepeatOpen(false);
          }}
        />
      )}
    </div>
  );
}
