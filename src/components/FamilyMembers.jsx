import { DeleteButton } from './DeleteButton.jsx';
import { useState } from 'react';

const emptyMember = () => ({ title: '', color: '' });

// Family records are shared data, unlike the display preferences above them.
export function FamilyMembers({ members, onSave, onDelete, allowDelete = true, disabled = false }) {
  const [draft, setDraft] = useState(emptyMember);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const duplicate = members.some(
    (member) => member.id !== draft.id && member.color.toLowerCase() === draft.color.toLowerCase(),
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
    <section className="panel settings family-members">
      <h2>Family members</h2>
      <p>Add each person with their own unique color for the calendar.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          act(async () => {
            await onSave(draft);
            setDraft(emptyMember());
          });
        }}
      >
        <label>
          Name
          <input
            required
            maxLength={160}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          Color (required)
          <div className="member-color-fields">
            <input
              type="color"
              aria-label="Choose member color"
              value={draft.color || '#264e42'}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
            <input
              required
              pattern="#[0-9a-fA-F]{6}"
              placeholder="#264e42"
              value={draft.color}
              aria-label="Member hex color"
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
          </div>
        </label>
        {duplicate && (
          <p role="alert" className="error">
            This color is already in use.
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={disabled || busy || duplicate}>
            {busy ? 'Saving…' : draft.id ? 'Save member' : '+ Add member'}
          </button>
          {draft.id && (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => setDraft(emptyMember())}
            >
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
        {members.map((member) => (
          <li className="grocery-item" key={member.id}>
            <span>
              <span className="member-swatch" style={{ backgroundColor: member.color }} />
              {member.title}
            </span>
            <div className="actions">
              <button disabled={disabled || busy} onClick={() => setDraft(member)}>
                Edit
              </button>
              {allowDelete && (
                <DeleteButton
                  title={member.title}
                  disabled={disabled || busy}
                  onDelete={async () => {
                    await onDelete(member.id);
                    if (draft.id === member.id) setDraft(emptyMember());
                  }}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
      {!members.length && <p className="empty">No family members yet.</p>}
    </section>
  );
}
