import { DeleteButton } from './DeleteButton.jsx';
import { useState } from 'react';

const emptyMember = () => ({ title: '', color: '' });

// Muted pigments sit comfortably against walnut while remaining distinct in plans.
export const memberColorPresets = [
  { name: 'Clay', color: '#c88367' },
  { name: 'Moss', color: '#91a078' },
  { name: 'Denim', color: '#819cab' },
  { name: 'Ochre', color: '#c5a052' },
  { name: 'Rosewood', color: '#b78187' },
  { name: 'Sage', color: '#9db7a5' },
  { name: 'Plum', color: '#a18ba8' },
  { name: 'Copper', color: '#c49b80' },
];

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
        <fieldset className="member-color-palette" disabled={disabled || busy}>
          <legend>Color (required)</legend>
          <div className="member-color-presets" role="group" aria-label="Suggested family colors">
            {memberColorPresets.map(({ name, color }) => {
              const taken = members.some(
                (member) => member.id !== draft.id && member.color.toLowerCase() === color,
              );
              return (
                <button
                  type="button"
                  key={color}
                  className="member-color-preset"
                  aria-label={`${name}${taken ? ' (already in use)' : ''}`}
                  aria-pressed={draft.color.toLowerCase() === color}
                  disabled={taken}
                  title={`${name}: ${color}${taken ? ' (already in use)' : ''}`}
                  onClick={() => setDraft({ ...draft, color })}
                >
                  <span
                    className="member-preset-chip"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span>{name}</span>
                </button>
              );
            })}
          </div>
          <p className="hint">Choose a preset or set your own color below.</p>
          <div className="member-color-fields">
            <input
              type="color"
              aria-label="Choose member color"
              value={draft.color || memberColorPresets[0].color}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
            <input
              required
              pattern="#[0-9a-fA-F]{6}"
              placeholder="#c88367"
              value={draft.color}
              aria-label="Member hex color"
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
          </div>
        </fieldset>
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
