import { DeleteButton } from './DeleteButton.jsx';
import { useState } from 'react';

// Both widget and full screen use this feature component. The parent supplies
// data and actions; notes never imports calendar code or assumes a layout.
export function Notes({ items, onSave, onDelete, compact = false, onOpen }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(draft);
      setDraft(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          Notes <span>{items.length}</span>
        </h2>
        <button
          onClick={() => {
            setError('');
            setDraft({ title: '', body: '' });
          }}
        >
          + Note
        </button>
      </div>
      {draft && (
        <form onSubmit={save} className="editor">
          <label>
            Title
            <input
              required
              maxLength={160}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            Note
            <textarea
              rows={compact ? 4 : 8}
              maxLength={20000}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <div className="actions">
            <button disabled={busy} className="primary">
              {busy ? 'Saving…' : 'Save note'}
            </button>
            <button type="button" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="note-grid">
        {(compact ? items.slice(0, 2) : items).map((note) => (
          <article className="note" key={note.id}>
            <h3>{note.title}</h3>
            <p className={compact ? 'truncate' : ''}>{note.body || 'No text yet.'}</p>
            <div className="actions">
              <button
                onClick={() => {
                  setError('');
                  setDraft(note);
                }}
              >
                Edit
              </button>
              <DeleteButton
                title={note.title}
                disabled={busy}
                onDelete={async () => {
                  await onDelete(note.id);
                }}
              />
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <p className="empty">A place for shopping lists, recipes, and little reminders.</p>
      )}
      {compact && (
        <button className="text-button" onClick={onOpen}>
          Open all notes →
        </button>
      )}
    </section>
  );
}
