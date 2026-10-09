import { useEffect, useId, useRef, useState } from 'react';

const views = ['month', 'week', 'day'];

// Render the menu ourselves so its open state shares the app's theme on the Pi.
export function CalendarViewPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menu.current.querySelector('[aria-checked="true"]')?.focus();
    function outside(event) {
      if (!root.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current.focus();
  }

  return (
    <div
      className="calendar-view-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="calendar-view"
        ref={trigger}
        aria-label={`Calendar view: ${value}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {value[0].toUpperCase() + value.slice(1)}
        <span className="calendar-view-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          ref={menu}
          role="menu"
          aria-label="Calendar view"
          className="calendar-view-menu"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
            const options = [...menu.current.querySelectorAll('button')];
            const index = options.indexOf(document.activeElement);
            let next;
            if (event.key === 'ArrowDown') next = (index + 1) % options.length;
            if (event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = options.length - 1;
            if (next !== undefined) {
              event.preventDefault();
              options[next].focus();
            }
          }}
        >
          {views.map((view) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={view === value}
              tabIndex={-1}
              key={view}
              onClick={() => {
                onChange(view);
                close();
              }}
            >
              {view[0].toUpperCase() + view.slice(1)}
              <span aria-hidden="true">{view === value ? '\u2713' : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
