import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog.jsx';

export function GroceryText({ repository, remaining }) {
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    repository
      .request('groceries/text/configuration')
      .then((data) => {
        if (active) setConfigured(data.configured);
      })
      .catch(() => {
        if (active) setError('Could not check Telegram configuration.');
      });
    return () => {
      active = false;
    };
  }, [repository]);
  async function send() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await repository.request('groceries/text', { method: 'POST', body: '{}' });
      setOpen(false);
      setMessage('Grocery list sent to Telegram.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        disabled={!configured || !remaining || busy}
        onClick={() => {
          setError('');
          setMessage('');
          setOpen(true);
        }}
      >
        Send to Telegram
      </button>
      {!configured && (
        <p className="hint">Connect your Telegram bot on the kitchen server to send your list.</p>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {error && !open && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <ConfirmDialog
          title="Send your grocery list?"
          message="Send the current unchecked items and quantities to your configured Telegram chat?"
          confirmLabel="Send list"
          busy={busy}
          error={error}
          busyLabel="Sending..."
          onConfirm={send}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
