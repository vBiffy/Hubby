import { useEffect, useId, useRef } from 'react';

// Callers control the message and buttons. Native dialog handles modal focus
// inside the app, including when the UI runs in a desktop webview.
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  error,
  onConfirm,
  onCancel,
}) {
  const dialog = useRef(null);
  const id = useId();

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog panel"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-message`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <p className="eyebrow">PLEASE CONFIRM</p>
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-message`} className="confirm-message">
        {message}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" autoFocus disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="delete-plan" disabled={busy} onClick={onConfirm}>
          {busy ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
