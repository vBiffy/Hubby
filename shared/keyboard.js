// Native pickers (colors/dates), toggles, and buttons keep their own controls.
// This small policy also lets future fields opt out with data-keyboard="off".
export function keyboardLayout(field) {
  if (!field || field.disabled || field.readOnly || field.keyboard === 'off') return null;
  if (field.tagName === 'TEXTAREA') return 'text';
  if (field.tagName !== 'INPUT') return null;
  if (['number', 'tel'].includes(field.type)) return 'number';
  if (['text', 'search', 'email', 'url', 'password'].includes(field.type)) return 'text';
  return null;
}

// Edit the selection instead of always appending. Native number inputs do not
// expose a caret; callers use the end of their value for those fields.
export function keyboardEdit(value, start, end, key, maxLength = -1) {
  if (key === 'Clear') return { value: '', caret: 0 };
  if (key === 'Backspace') {
    if (start === end && start > 0) {
      start -= [...value.slice(0, start)].at(-1).length;
    }
    return { value: value.slice(0, start) + value.slice(end), caret: start };
  }
  const available = maxLength < 0 ? Infinity : maxLength - (value.length - (end - start));
  const insertion = [...key].reduce(
    (text, character) => (text.length + character.length <= available ? text + character : text),
    '',
  );
  return {
    value: value.slice(0, start) + insertion + value.slice(end),
    caret: start + insertion.length,
  };
}

// Time steppers contain a padded value already. Treat the first digit as a
// replacement, then build the new number without clamping every extra digit.
export function numberPadEdit(value, key, { replace = false, max = '' } = {}) {
  const base = replace && /^\d$/.test(key) ? '' : value;
  const next =
    key === '-'
      ? base.startsWith('-')
        ? base.slice(1)
        : `-${base}`
      : keyboardEdit(base, base.length, base.length, key).value;
  if (!/^-?\d*(\.\d*)?$/.test(next)) return value;
  if (max !== '' && Number(next) > Number(max)) return value;
  return next;
}

// Once a bounded time value is complete, the next digit starts a replacement.
// Two digits complete 11/30; a single 9 also completes an hour because 90 cannot fit.
export function timeEntryComplete(value, max) {
  return (
    /^\d+$/.test(value) && (value.length >= String(max).length || Number(value) * 10 > Number(max))
  );
}
