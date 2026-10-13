import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Select } from './Select.jsx';

const presets = [
  ['Laundry', 'Time to move the laundry to the dryer.', 60],
  ['Dryer', 'Time to take out and fold the laundry.', 60],
  ['Dishwasher', 'Time to check and empty the dishwasher.', 120],
  ['Oven check', 'Time to check the food in the oven.', 20],
];

function ReminderWindow({ onClose, children }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="panel quick-reminders-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="panel-heading">
        <h2 id={id}>Quick reminders &amp; timers</h2>
        <button onClick={onClose}>Close</button>
      </div>
      {children}
    </dialog>
  );
}

// Poll only our local API for countdown outcomes; Telegram is contacted at delivery.
export function QuickReminders({ repository }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], recipients: [] });
  const [draft, setDraft] = useState({
    title: '',
    minutes: '',
    delivery: 'telegram',
    recipient: 'household',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const seen = useRef(null);
  const active = useRef(false);
  // Each visit starts a fresh custom reminder; presets still start immediately.
  const openWindow = useCallback(() => {
    setDraft({ title: '', minutes: '', delivery: 'telegram', recipient: 'household' });
    setOpen(true);
  }, []);
  const refresh = useCallback(async () => {
    const value = await repository.request('quick-reminders');
    if (!active.current) return;
    const completed = value.items.filter(
      (item) => item.delivery === 'screen' && item.status === 'completed',
    );
    if (seen.current && completed.some((item) => !seen.current.has(item.id))) {
      openWindow();
      setMessage('Your timer is finished.');
    }
    seen.current = new Set(completed.map((item) => item.id));
    setData(value);
  }, [repository, openWindow]);
  useEffect(() => {
    active.current = true;
    const load = () =>
      refresh().catch(() => {
        if (active.current) setError('Could not load quick reminders. Check the kitchen server.');
      });
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  const recipient = data.recipients.some((item) => item.id === 'household') ? 'household' : '';
  async function act(action) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (err) {
      if (active.current) setError(err.message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  function startReminder(value) {
    setMessage('');
    return act(async () => {
      await repository.request('quick-reminders', {
        method: 'POST',
        body: JSON.stringify({ ...value, recipient: 'household' }),
      });
      setMessage(
        value.delivery === 'telegram'
          ? `${value.title} Reminder started for ${value.minutes} minutes.`
          : 'Timer started.',
      );
    });
  }
  const running = data.items.filter((item) => ['scheduled', 'sending'].includes(item.status));
  const recent = data.items
    .filter((item) => ['completed', 'failed'].includes(item.status))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 5);
  return (
    <>
      <button
        onClick={() => {
          setMessage('');
          openWindow();
        }}
      >
        Quick reminders {running.length ? `(${running.length})` : ''}
      </button>
      {open && (
        <ReminderWindow
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p className="hint">
            Tap a preset to immediately start a Telegram reminder in your usual chat. Presets are
            estimates; they do not detect when an appliance actually finishes.
          </p>
          <div className="quick-reminder-presets">
            {presets.map(([label, title, minutes]) => (
              <button
                key={label}
                disabled={busy || !recipient}
                onClick={() => startReminder({ title, minutes, delivery: 'telegram' })}
              >
                <strong>{label}</strong>
                <small>{minutes} minutes</small>
              </button>
            ))}
          </div>
          <form
            className="editor"
            onSubmit={(event) => {
              event.preventDefault();
              startReminder(draft);
            }}
          >
            <label>
              Reminder message
              <input
                required
                maxLength={160}
                disabled={busy}
                placeholder="Time to move the laundry to the dryer."
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label>
              Minutes from now
              <input
                type="number"
                required
                min={1}
                max={1440}
                step={1}
                disabled={busy}
                placeholder="e.g. 60"
                value={draft.minutes}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    minutes: event.target.value === '' ? '' : Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Notify me using
              <Select
                value={draft.delivery}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, delivery: event.target.value })}
              >
                <option value="telegram">Telegram reminder</option>
                <option value="screen">On-screen timer</option>
              </Select>
            </label>
            {draft.delivery === 'telegram' && (
              <p className="hint">
                {recipient
                  ? 'Messages go to your existing Telegram chat.'
                  : 'Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID on the server first.'}
              </p>
            )}
            <p className="hint">
              Telegram reminders need the server running. Screen timers also need the Hub open to
              display their completion.
            </p>
            <button
              className="primary"
              disabled={busy || (draft.delivery === 'telegram' && !recipient)}
            >
              {busy
                ? 'Starting...'
                : draft.delivery === 'screen'
                  ? 'Start timer'
                  : 'Start reminder'}
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="hint" role="status">
              {message}
            </p>
          )}
          <h3>Running</h3>
          {!running.length && <p className="empty">No reminders or timers running.</p>}
          {running.map((item) => (
            <div className="quick-reminder-item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.status === 'sending'
                    ? 'Sending; if the server restarted, delivery is uncertain.'
                    : `${Math.max(0, Math.ceil((Date.parse(item.dueAt) - Date.now()) / 60000))} min left`}
                  {' - '}
                  {item.delivery === 'screen' ? 'Screen' : 'Telegram'}
                </small>
              </div>
              <button
                disabled={busy || item.status === 'sending'}
                onClick={() =>
                  act(() => repository.request(`quick-reminders/${item.id}`, { method: 'DELETE' }))
                }
              >
                Cancel
              </button>
            </div>
          ))}
          {recent.length > 0 && <h3>Recent</h3>}
          {recent.map((item) => (
            <p key={item.id}>
              {item.title} -{' '}
              {item.status === 'failed'
                ? 'Could not confirm delivery. Check Telegram before starting another reminder.'
                : 'Finished'}
            </p>
          ))}
        </ReminderWindow>
      )}
    </>
  );
}
