import { useState } from 'react';

const emptyItem = () => ({ title: '', quantity: '', done: false });

// Feature port matches Notes: injected data and callbacks keep storage and
// navigation out of this component, allowing reuse outside the kitchen shell.
export function Groceries({ items, onSave, onDelete }) {
  const [draft, setDraft] = useState(emptyItem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remaining = items.filter((item) => !item.done).length;
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

  return (
    <section className="panel groceries">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">FOR THE NEXT SHOP</p>
          <h2>
            Grocery list <span>{remaining} to pick up</span>
          </h2>
        </div>
      </div>
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
              <button
                disabled={busy}
                aria-label={`Delete ${item.title}`}
                onClick={() => {
                  if (window.confirm(`Remove “${item.title}” from the grocery list?`))
                    act(async () => {
                      await onDelete(item.id);
                      if (draft.id === item.id) setDraft(emptyItem());
                    });
                }}
              >
                Delete
              </button>
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
    </section>
  );
}
