import { ConfirmDialog } from './ConfirmDialog.jsx';
import { GroceryText } from './GroceryText.jsx';
import { DeleteButton } from './DeleteButton.jsx';
import { useEffect, useRef, useState } from 'react';

const emptyItem = () => ({ title: '', quantity: '', done: false });

// Feature port matches Notes: injected data and callbacks keep storage and
// navigation out of this component, allowing reuse outside the kitchen shell.
export function Groceries({ items, onSave, onDelete, repository }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [draft, setDraft] = useState(emptyItem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checkAll = useRef(null);
  const remaining = items.filter((item) => !item.done).length;
  const checked = items.filter((item) => item.done);
  const allChecked = items.length > 0 && remaining === 0;
  useEffect(() => {
    // Native indeterminate state communicates a partly checked list visually.
    checkAll.current.indeterminate = checked.length > 0 && !allChecked;
  }, [checked.length, allChecked]);
  async function setAllChecked(done) {
    await act(async () => {
      for (const item of items.filter((entry) => Boolean(entry.done) !== done)) {
        const saved = { ...item, done };
        await onSave(saved);
        if (draft.id === item.id) setDraft((current) => ({ ...current, done }));
      }
    });
  }
  const sorted = [...items].sort(
    (a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title),
  );

  async function act(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearChecked() {
    await act(async () => {
      // Use the existing delete port so memory/PostgreSQL and standalone screens
      // share this action. Each successful deletion updates the shell immediately;
      // on failure, the dialog stays open so the remaining items can be retried.
      for (const item of checked) {
        await onDelete(item.id);
        if (draft.id === item.id) setDraft(emptyItem());
      }
      setConfirmClear(false);
    });
  }

  return (
    <section className="panel groceries">
      <div className="panel-heading">
        <div>
          <h2>
            Grocery list <span>{remaining} to pick up</span>
          </h2>
        </div>
        <div className="actions grocery-bulk-actions">
          <label className="check">
            <input
              type="checkbox"
              ref={checkAll}
              checked={allChecked}
              disabled={busy || !items.length}
              onChange={(event) => setAllChecked(event.target.checked)}
            />
            Check all
          </label>
          <button
            type="button"
            disabled={busy || !checked.length}
            onClick={() => {
              setError('');
              setConfirmClear(true);
            }}
          >
            Clear checked items
          </button>
        </div>
      </div>
      {repository && <GroceryText repository={repository} remaining={remaining} />}
      <form
        className="grocery-form"
        onSubmit={(event) => {
          event.preventDefault();
          act(async () => {
            await onSave(draft);
            setDraft(emptyItem());
          });
        }}
      >
        <label>
          Item
          <input
            required
            maxLength={160}
            placeholder="e.g. Milk"
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          Quantity <span className="grocery-optional">(optional)</span>
          <input
            maxLength={80}
            placeholder="e.g. 2 cartons"
            value={draft.quantity}
            onChange={(event) => setDraft({ ...draft, quantity: event.target.value })}
          />
        </label>
        <div className="actions">
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : draft.id ? 'Save item' : '+ Add item'}
          </button>
          {draft.id && (
            <button type="button" disabled={busy} onClick={() => setDraft(emptyItem())}>
              Cancel
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="grocery-items">
        {sorted.map((item) => (
          <li key={item.id} className="grocery-item">
            <label className="grocery-check">
              <input
                type="checkbox"
                checked={item.done}
                disabled={busy}
                onChange={() => act(() => onSave({ ...item, done: !item.done }))}
              />
              <span className={item.done ? 'completed' : ''}>
                {item.title}
                {item.quantity && <small>{item.quantity}</small>}
              </span>
            </label>
            <div className="actions">
              <button
                disabled={busy}
                onClick={() => {
                  setDraft(item);
                  setError('');
                }}
              >
                Edit
              </button>
              <DeleteButton
                title={item.title}
                disabled={busy}
                onDelete={async () => {
                  await onDelete(item.id);
                  if (draft.id === item.id) setDraft(emptyItem());
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {!items.length && (
        <p className="empty">Your list is empty. Add something for your next shop.</p>
      )}
      {items.length > 0 && remaining === 0 && (
        <p className="empty" role="status">
          Everything picked up. You're all set!
        </p>
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Clear checked items?"
          message={`Remove ${checked.length} checked item${checked.length === 1 ? '' : 's'} from your shopping list? Unchecked items will stay. This cannot be undone.`}
          confirmLabel="Clear checked items"
          busyLabel="Clearing..."
          busy={busy}
          error={error}
          onConfirm={clearChecked}
          onCancel={() => {
            setConfirmClear(false);
            setError('');
          }}
        />
      )}
    </section>
  );
}
