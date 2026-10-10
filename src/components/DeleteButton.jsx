import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog.jsx';

// Each feature owns its delete operation; the shared control owns confirmation UX.
export function DeleteButton({ title, onDelete, disabled, ...props }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onDelete();
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button {...props} disabled={disabled || busy} onClick={() => setOpen(true)}>
        Delete
      </button>
      {open && (
        <ConfirmDialog
          title="Delete item?"
          message={`Remove '${title}'? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Keep it"
          busy={busy}
          error={error}
          onConfirm={confirm}
          onCancel={() => {
            setOpen(false);
            setError('');
          }}
        />
      )}
    </>
  );
}
