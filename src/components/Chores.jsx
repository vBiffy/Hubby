import { useEffect, useId, useRef, useState } from 'react';
import { Select } from './Select.jsx';
import { DateTimePicker } from './DateTimePicker.jsx';
import { DeleteButton } from './DeleteButton.jsx';
import { RepeatEditor } from './RepeatEditor.jsx';
import { localDateTime } from '../../shared/calendar.js';
import {
  activeChores,
  choreDay,
  choreStatus,
  chorePresets,
  choreOccurrence,
  isChoreOverdue,
} from '../../shared/chores.js';

// Reused on the chore board and the Hub; completing a task never edits a plan.
export function ChoreRow({ item, today = choreDay(), onSave, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className={`chore-row ${isChoreOverdue(item, today) ? 'chore-overdue' : ''}`}>
      <label className="check">
        <input
          type="checkbox"
          checked={item.done}
          disabled={
            busy ||
            (item.repeat && item.repeat !== 'none' && !item.occurrenceDate) ||
            (item.missedPolicy === 'skip' && item.occurrenceDate < today)
          }
          aria-label={`Complete ${item.title}`}
          onChange={async (event) => {
            setBusy(true);
            setError('');
            try {
              await onSave({ ...item, done: event.target.checked });
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <span>
          <strong>{item.title}</strong>
          <small>{choreStatus(item, today)}</small>
        </span>
      </label>
      {onEdit && (
        <button type="button" onClick={() => onEdit(item)}>
          Edit
        </button>
      )}
      {item.description && <p className="hint">{item.description}</p>}
      {['failed', 'sending'].includes(item.reminderStatus) && (
        <p className="hint">
          {item.reminderStatus === 'failed'
            ? 'Telegram delivery failed; set a new reminder to retry.'
            : 'Telegram delivery in progress or uncertain after a restart.'}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function ChoreEditor({ item, members, configured, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState(item);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const recurring = Boolean(draft.repeat && draft.repeat !== 'none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const id = useId();
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
      className="panel chore-editor"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="panel-heading">
        <h2 id={id}>{draft.id ? 'Edit chore' : 'Assign a chore'}</h2>
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            await onSave({
              ...draft,
              reminderAt: draft.reminderAt ? new Date(draft.reminderAt).toISOString() : null,
            });
            onClose();
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="chore-editor-fields">
          <label>
            Chore
            <input
              required
              maxLength={160}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>
          <label>
            Assigned to
            <Select
              value={draft.memberId}
              onChange={(event) => setDraft({ ...draft, memberId: event.target.value })}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.title}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Instructions (optional)
            <textarea
              rows={2}
              maxLength={1000}
              value={draft.description || ''}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </label>
          <DateTimePicker
            legend={recurring ? 'First occurrence and scheduled time' : 'Start showing on'}
            value={`${draft.startsOn}T${draft.timeOfDay || '17:00'}`}
            hideTime={!recurring}
            onChange={(value) =>
              setDraft({ ...draft, startsOn: value.slice(0, 10), timeOfDay: value.slice(11, 16) })
            }
          />
          <label>
            Repeat
            <button type="button" onClick={() => setRepeatOpen(true)} aria-haspopup="dialog">
              {recurring
                ? draft.repeat === 'custom'
                  ? 'Custom weekdays'
                  : draft.repeat.charAt(0).toUpperCase() + draft.repeat.slice(1)
                : 'Does not repeat'}
            </button>
          </label>
          {recurring && (
            <label>
              When an occurrence is missed
              <Select
                value={draft.missedPolicy || 'carry'}
                onChange={(event) => setDraft({ ...draft, missedPolicy: event.target.value })}
              >
                <option value="carry">Keep it and mark overdue the next morning</option>
                <option value="skip">Forget it when the next day starts</option>
              </Select>
            </label>
          )}
          {!recurring && (
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(draft.dueOn)}
                onChange={(event) =>
                  setDraft({ ...draft, dueOn: event.target.checked ? draft.startsOn : '' })
                }
              />
              Set a due date
            </label>
          )}
          {!recurring && draft.dueOn && (
            <DateTimePicker
              legend="Due date"
              hideTime
              value={`${draft.dueOn}T09:00`}
              onChange={(value) => setDraft({ ...draft, dueOn: value.slice(0, 10) })}
            />
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={recurring ? Boolean(draft.telegramReminder) : Boolean(draft.reminderAt)}
              disabled={!configured && !(recurring ? draft.telegramReminder : draft.reminderAt)}
              onChange={(event) => {
                if (recurring) {
                  setDraft({ ...draft, telegramReminder: event.target.checked });
                  return;
                }
                const time = new Date();
                time.setHours(time.getHours() + 1);
                setDraft({ ...draft, reminderAt: event.target.checked ? localDateTime(time) : '' });
              }}
            />
            Send a Telegram reminder
          </label>
          {!recurring && draft.reminderAt && (
            <DateTimePicker
              legend="Telegram reminder time"
              value={draft.reminderAt}
              onChange={(reminderAt) => setDraft({ ...draft, reminderAt })}
            />
          )}
          {recurring && draft.telegramReminder && (
            <p className="hint">
              Sends once per occurrence at its scheduled time. Completed occurrences are skipped.
            </p>
          )}
          <p className="hint">
            {configured
              ? 'Uses your existing household Telegram chat.'
              : 'Set up Telegram to enable messages. Chores work without it.'}
          </p>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={busy}>
            {busy ? 'Saving...' : 'Save chore'}
          </button>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {draft.id && (
            <DeleteButton
              type="button"
              disabled={busy}
              title={draft.title}
              onDelete={async () => {
                await onDelete(draft.id);
                onClose();
              }}
            />
          )}
        </div>
      </form>
      {repeatOpen && (
        <RepeatEditor
          draft={{ ...draft, startsAt: `${draft.startsOn}T${draft.timeOfDay || '17:00'}` }}
          weekStart={0}
          onCancel={() => setRepeatOpen(false)}
          onApply={(settings) => {
            setDraft({
              ...draft,
              ...settings,
              dueOn: settings.repeat === 'none' ? draft.dueOn : '',
              telegramReminder: draft.telegramReminder || Boolean(draft.reminderAt),
            });
            setRepeatOpen(false);
          }}
        />
      )}
    </dialog>
  );
}

// The Hub can compose the same assignment window without mounting the board.
export function AddChoreButton({ repository, members, onSave, now }) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    repository
      .request('chores/configuration')
      .then((value) => {
        if (active) setConfigured(value.configured);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, repository]);
  return (
    <>
      <button className="primary" onClick={() => setOpen(true)}>
        + Add a chore
      </button>
      {open && (
        <ChoreEditor
          item={{
            title: '',
            description: '',
            memberId: members[0]?.id,
            startsOn: choreDay(now),
            dueOn: '',
            done: false,
            reminderAt: '',
          }}
          members={members}
          configured={configured}
          onSave={onSave}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function Chores({ repository, items, members, onSave, onDelete, now = new Date() }) {
  const [draft, setDraft] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [person, setPerson] = useState('everyone');
  useEffect(() => {
    let active = true;
    repository
      .request('chores/configuration')
      .then((value) => {
        if (active) setConfigured(value.configured);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [repository]);
  const today = choreDay(now);
  function edit(item) {
    const series = items.find((candidate) => candidate.id === item.id) || item;
    setDraft({ ...series, reminderAt: series.reminderAt ? localDateTime(series.reminderAt) : '' });
  }
  function add(title = '') {
    setDraft({
      title,
      description: '',
      memberId: person === 'everyone' ? members[0]?.id : person,
      startsOn: today,
      dueOn: '',
      done: false,
      reminderAt: '',
      repeat: title === 'Scoop litter' ? 'daily' : 'none',
      timeOfDay: '17:00',
      missedPolicy: title === 'Scoop litter' ? 'skip' : 'carry',
    });
  }
  return (
    <section className="panel chore-board">
      <div className="panel-heading">
        <div>
          <h2>Family chores</h2>
        </div>
        <button className="primary" onClick={() => add()}>
          + Add chore
        </button>
      </div>
      <div className="chore-presets" role="group" aria-label="Chore presets">
        {chorePresets.map((title) => (
          <button key={title} onClick={() => add(title)}>
            {title}
          </button>
        ))}
      </div>
      <div className="hub-family-picker" role="group" aria-label="Choose whose chores to view">
        <button aria-pressed={person === 'everyone'} onClick={() => setPerson('everyone')}>
          Everyone
        </button>
        {members.map((member) => (
          <button
            key={member.id}
            aria-pressed={person === member.id}
            onClick={() => setPerson(member.id)}
          >
            <span className="hub-member-avatar" style={{ background: member.color }}>
              {member.title.slice(0, 1).toUpperCase()}
            </span>
            {member.title}
          </button>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={showCompleted}
          onChange={(event) => setShowCompleted(event.target.checked)}
        />
        Show completed chores
      </label>
      <div className="chore-family-track" key={`${person}:${showCompleted}`}>
        {members
          .filter((member) => person === 'everyone' || person === member.id)
          .map((member) => {
            const assigned = items.filter((item) => item.memberId === member.id);
            const active = activeChores(assigned, today);
            const future = assigned.filter((item) => !item.done && item.startsOn > today);
            const completed = showCompleted
              ? assigned.flatMap((item) =>
                  item.repeat && item.repeat !== 'none'
                    ? (item.completedDates || []).map((day) => choreOccurrence(item, day))
                    : item.done
                      ? [item]
                      : [],
                )
              : [];
            const displayed = [...active, ...future, ...completed];
            const dormant = assigned.filter(
              (item) =>
                item.repeat &&
                item.repeat !== 'none' &&
                !displayed.some((occurrence) => occurrence.id === item.id),
            );
            return (
              <section className="chore-person" key={member.id}>
                <h3>
                  <span className="hub-member-avatar" style={{ background: member.color }}>
                    {member.title.slice(0, 1).toUpperCase()}
                  </span>
                  {member.title}
                </h3>
                <p className="hint">{active.length} to complete</p>
                {!active.length && <p className="empty">All caught up.</p>}
                {displayed.map((item) => (
                  <ChoreRow
                    key={`${item.id}:${item.occurrenceDate || 'single'}`}
                    item={item}
                    today={today}
                    onSave={onSave}
                    onEdit={edit}
                  />
                ))}
                {dormant.map((item) => (
                  <button key={item.id} className="text-button" onClick={() => edit(item)}>
                    Edit {item.title} schedule
                  </button>
                ))}
              </section>
            );
          })}
      </div>
      {draft && (
        <ChoreEditor
          item={draft}
          members={members}
          configured={configured}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => setDraft(null)}
        />
      )}
    </section>
  );
}
