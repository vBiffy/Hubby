import { Children, useEffect, useId, useRef, useState } from 'react';

// Preserve the familiar controlled-select callback while drawing the menu ourselves.
// This avoids operating-system dropdowns in both browsers and the kitchen webview.
export function Select({ children, value, onChange, disabled, ...props }) {
  const options = Children.toArray(children);
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();
  const selected = options.find((option) => String(option.props.value) === String(value));
  useEffect(() => {
    if (!open) return;
    menu.current.querySelector('[aria-selected="true"]')?.focus();
    const outside = (event) => {
      if (!root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      className="shared-select"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        {...props}
        type="button"
        ref={trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected?.props.children}
        <span className="calendar-view-chevron" aria-hidden="true" />
      </button>
      <div
        hidden={!open}
        className="shared-select-menu"
        role="listbox"
        id={id}
        ref={menu}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
          const buttons = [...menu.current.querySelectorAll('button:not(:disabled)')];
          const index = buttons.indexOf(document.activeElement);
          let next;
          if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
          if (event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
          if (event.key === 'Home') next = 0;
          if (event.key === 'End') next = buttons.length - 1;
          if (next !== undefined) {
            event.preventDefault();
            buttons[next]?.focus();
          }
        }}
      >
        {options.map((option) => (
          <button
            type="button"
            role="option"
            tabIndex={-1}
            key={option.props.value}
            disabled={option.props.disabled}
            aria-selected={String(option.props.value) === String(value)}
            onClick={() => {
              onChange({ target: { value: String(option.props.value) } });
              close();
            }}
          >
            {option.props.children}
          </button>
        ))}
      </div>
    </div>
  );
}
