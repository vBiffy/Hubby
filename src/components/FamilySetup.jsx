import { useState } from 'react';
import { FamilyMembers } from './FamilyMembers.jsx';

export const demoMembers = [
  { title: 'Mom', color: '#a64b78' },
  { title: 'Dad', color: '#326d9c' },
  { title: 'Kid', color: '#b87724' },
];

// A dedicated setup screen cannot be dismissed by Escape or by changing the URL.
// Explicit Continue keeps setup open while the three demo records are being saved.
export function FamilySetup({ members, onSave, onContinue }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function addDemo() {
    setBusy(true);
    setError('');
    try {
      for (const member of demoMembers) {
        if (!members.some((existing) => existing.title === member.title)) await onSave(member);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className="family-setup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="family-setup-title"
    >
      <p className="eyebrow">WELCOME TO HUBBY</p>
      <h1 id="family-setup-title">Let's meet your family</h1>
      <p>Add at least one family member with a unique calendar color to get started.</p>
      <FamilyMembers
        members={members}
        onSave={onSave}
        onDelete={async () => {}}
        allowDelete={false}
        disabled={busy}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          disabled={
            busy ||
            demoMembers.every((demo) => members.some((member) => member.title === demo.title))
          }
          onClick={addDemo}
        >
          {busy ? 'Adding family...' : 'Add Mom, Dad, and Kid for testing'}
        </button>
        <button className="primary" disabled={busy || !members.length} onClick={onContinue}>
          Continue to kitchen
        </button>
      </div>
    </main>
  );
}
