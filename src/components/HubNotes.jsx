import { useEffect, useId, useRef } from 'react';
import { Notes } from './Notes.jsx';

// Reuse the notes feature in a small modal, retaining the same storage ports.
export function HubNotes({ items, onSave, onDelete, onClose }) {
  const dialog = useRef(null);
  const title = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="panel hub-notes-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="panel-heading">
        <h2 id={title}>Family notes</h2>
        <div className="actions">
          <a href="#notes" onClick={onClose}>
            Open notebook
          </a>
          <button onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
      <Notes items={items} onSave={onSave} onDelete={onDelete} />
    </dialog>
  );
}
