import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  keyboardEdit,
  keyboardLayout,
  numberPadEdit,
  timeEntryComplete,
} from '../../shared/keyboard.js';

const letterRows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

// Emit the same bubbling input event used by real typing. Calling the native
// setter bypasses React's value tracker so controlled fields receive onChange.
function updateField(field, value, caret) {
  const prototype =
    field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => {
    if (field.isConnected && field.selectionStart !== null) {
      const position = Math.min(caret, field.value.length);
      field.setSelectionRange(position, position);
    }
  });
}

export function typeIntoField(field, key) {
  const { value, caret } = keyboardEdit(
    field.value,
    field.selectionStart ?? field.value.length,
    field.selectionEnd ?? field.value.length,
    key,
    field.maxLength,
  );
  // A controlled field may normalize the entered value (e.g. a padded hour).
  updateField(field, value, caret);
}

export function KeyboardKeys({ layout, uppercase, decimal, signed, telephone, multiline, onKey }) {
  const rows = layout === 'number' ? ['123', '456', '789', '0'] : letterRows;
  const keyButton = (label, value = label) => (
    <button key={label} type="button" onClick={() => onKey(value)}>
      {label}
    </button>
  );
  return (
    <>
      <div className="touch-keyboard-rows">
        {rows.map((row) => (
          <div className="touch-keyboard-row" key={row}>
            {[...row].map((key) => keyButton(uppercase ? key.toUpperCase() : key))}
            {layout === 'number' && row === '0' && (
              <>
                {decimal && keyButton('.')}
                {signed && keyButton('-')}
                {telephone && keyButton('+')}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="touch-keyboard-actions">
        {layout === 'text' && (
          <>
            <button type="button" aria-pressed={uppercase} onClick={() => onKey('Caps')}>
              Caps
            </button>
            {keyButton('@')}
            {keyButton('.')}
            {keyButton(',')}
            {keyButton('-')}
            {keyButton('Space', ' ')}
            {multiline && keyButton('New line', '\n')}
            {keyButton('Symbols')}
          </>
        )}
        {keyButton('Backspace')}
        {keyButton('Clear')}
        {keyButton('Next')}
        {keyButton('Done')}
      </div>
    </>
  );
}

// One keyboard serves all screens, including setup. Portal into the active
// dialog so the browser's modal top layer never covers the keys or makes them inert.
export function TouchKeyboard() {
  const [field, setField] = useState(null);
  const [uppercase, setUppercase] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const [numericText, setNumericText] = useState('');
  const numericDraft = useRef('');
  const replaceNumber = useRef(false);
  const keyboard = useRef(null);
  const close = useCallback(() => setField(null), []);
  useEffect(() => {
    const focus = (event) => {
      if (event.target.closest('.touch-keyboard')) return;
      const layout = keyboardLayout({
        tagName: event.target.tagName,
        type: event.target.type,
        disabled: event.target.disabled,
        readOnly: event.target.readOnly,
        keyboard: event.target.dataset?.keyboard,
      });
      setField(layout ? event.target : null);
      numericDraft.current = event.target.value || '';
      replaceNumber.current = event.target.dataset?.keyboardReplace === 'true';
      setNumericText(numericDraft.current);
      setUppercase(false);
      setSymbols(false);
    };
    const physicalInput = (event) => {
      if (event.isTrusted && event.target.type === 'number') {
        numericDraft.current = event.target.value;
        replaceNumber.current = false;
        setNumericText(event.target.value);
      }
    };
    const escape = (event) => {
      if (event.key === 'Escape' && keyboard.current) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('focusin', focus);
    // Done leaves the caret in place. A second tap must reopen the keyboard
    // even when the browser does not emit another focus event for that field.
    document.addEventListener('pointerdown', focus);
    document.addEventListener('input', physicalInput);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('focusin', focus);
      document.removeEventListener('pointerdown', focus);
      document.removeEventListener('input', physicalInput);
      document.removeEventListener('keydown', escape, true);
    };
  }, [close]);

  useEffect(() => {
    if (!field) return;
    const app = document.querySelector('.app');
    const dialog = field.closest('dialog');
    const overlay = field.closest('.overlay');
    const originalMode = field.getAttribute('inputmode');
    // Request no OS keyboard while ours is open; physical typing still works.
    field.setAttribute('inputmode', 'none');
    app.classList.add('touch-keyboard-open');
    dialog?.classList.add('touch-keyboard-host');
    overlay?.classList.add('touch-keyboard-overlay');
    const resize = new ResizeObserver(() => {
      const height = `${keyboard.current.getBoundingClientRect().height}px`;
      app.style.setProperty('--touch-keyboard-height', height);
      dialog?.style.setProperty('--touch-keyboard-height', height);
      overlay?.style.setProperty('--touch-keyboard-height', height);
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    resize.observe(keyboard.current);
    // Closing a popup or disabling/removing its input must close the keyboard too.
    const removed = new MutationObserver(() => {
      if (!field.isConnected || field.disabled || (dialog && !dialog.open)) close();
    });
    removed.observe(app, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'disabled'],
    });
    return () => {
      resize.disconnect();
      removed.disconnect();
      if (originalMode === null) field.removeAttribute('inputmode');
      else field.setAttribute('inputmode', originalMode);
      app.classList.remove('touch-keyboard-open');
      app.style.removeProperty('--touch-keyboard-height');
      dialog?.classList.remove('touch-keyboard-host');
      dialog?.style.removeProperty('--touch-keyboard-height');
      overlay?.classList.remove('touch-keyboard-overlay');
      overlay?.style.removeProperty('--touch-keyboard-height');
    };
  }, [field, close]);

  if (!field) return null;
  const layout = keyboardLayout({ tagName: field.tagName, type: field.type });
  const host = field.closest('dialog') || document.querySelector('.app');
  function press(key) {
    if (key === 'Done') return close();
    if (key === 'Caps') return setUppercase(!uppercase);
    if (key === 'Symbols') return setSymbols(!symbols);
    if (key === 'Next') {
      const scope = field.closest('form') || host;
      const fields = [...scope.querySelectorAll('input, textarea')].filter(
        (item) =>
          keyboardLayout({
            tagName: item.tagName,
            type: item.type,
            disabled: item.disabled,
            readOnly: item.readOnly,
            keyboard: item.dataset.keyboard,
          }) && item.getClientRects().length,
      );
      const next = fields[fields.indexOf(field) + 1];
      if (next) next.focus();
      else close();
      return;
    }
    if (field.type === 'number') {
      // Number inputs reject intermediate values such as "-" and "0.".
      // Keep those locally until complete, rather than losing the next digit.
      const previous = numericDraft.current;
      const next = numberPadEdit(previous, key, {
        replace: replaceNumber.current,
        max: field.max,
      });
      if (next !== previous || key === 'Clear' || key === 'Backspace') {
        replaceNumber.current = false;
      }
      numericDraft.current = next;
      setNumericText(next);
      if (field.dataset.keyboardReplace === 'true' && /^\d$/.test(key)) {
        replaceNumber.current = timeEntryComplete(next, field.max);
      }
      if (next === '' || /^-?\d+(\.\d+)?$/.test(next)) {
        // Keep a leading zero in the keypad draft while entering e.g. 09.
        // Publishing it to an hour field would immediately clamp it to 01.
        if (next !== '' && field.min !== '' && Number(next) < Number(field.min)) return;
        updateField(field, next, next.length);
      }
      return;
    }
    typeIntoField(field, key);
  }
  return createPortal(
    <section
      className={`touch-keyboard ${layout === 'number' ? 'touch-number-pad' : ''}`}
      ref={keyboard}
      role="region"
      aria-label={layout === 'number' ? 'Number pad' : 'Keyboard'}
      onPointerDown={(event) => event.preventDefault()}
    >
      <div className="touch-keyboard-heading">
        <strong>{layout === 'number' ? 'Number pad' : 'Keyboard'}</strong>
        {field.type === 'number' && (
          <output aria-live="polite">{numericText || 'Enter a number'}</output>
        )}
        <button type="button" onClick={close} aria-label="Close keyboard">
          Close
        </button>
      </div>
      {symbols && layout === 'text' && (
        <div className="touch-keyboard-row">
          {[...'!?/:;()&%+_='].map((key) => (
            <button key={key} type="button" onClick={() => press(key)}>
              {key}
            </button>
          ))}
        </div>
      )}
      <KeyboardKeys
        layout={layout}
        uppercase={uppercase}
        decimal={field.type === 'number' && (field.step === 'any' || Number(field.step) % 1 !== 0)}
        signed={field.type === 'number' && (field.min === '' || Number(field.min) < 0)}
        telephone={field.type === 'tel'}
        multiline={field.tagName === 'TEXTAREA'}
        onKey={press}
      />
    </section>,
    host,
  );
}
