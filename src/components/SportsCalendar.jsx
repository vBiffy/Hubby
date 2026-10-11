import { useEffect, useId, useRef, useState } from 'react';
import { Calendar } from './Calendar.jsx';
import { EventDetails } from './EventDetails.jsx';

// This projection remains separate from the household calendar and never saves games.
export function SportsCalendar({ items = [], error, weekStart = 0 }) {
  const [details, setDetails] = useState(null);
  return (
    <div className="sports-calendar-content">
      <p className="hint">Favorite-team games enabled in Customize appear here.</p>
      {error && (
        <p className="error" role="status">
          {error}
        </p>
      )}
      {!items.length && (
        <p className="empty">
          No games loaded. Choose favorite teams and enable their sports calendar in Customize.
        </p>
      )}
      <Calendar items={items} weekStart={weekStart} readOnly onEdit={setDetails} />
      {details && <EventDetails item={details} members={[]} onClose={() => setDetails(null)} />}
    </div>
  );
}

export function SportsCalendarDialog({ onClose, ...props }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      className="panel sports-calendar-dialog"
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="panel-heading">
        <h2 id={id}>Sports calendar</h2>
        <button autoFocus onClick={onClose}>
          Close
        </button>
      </div>
      <SportsCalendar {...props} />
    </dialog>
  );
}
