import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  keyboardEdit,
  keyboardLayout,
  numberPadEdit,
  timeEntryComplete,
} from '../shared/keyboard.js';

test('keyboard chooses entry layout and leaves native controls and locked fields alone', () => {
  for (const type of ['text', 'email', 'url', 'password', 'search']) {
    assert.equal(keyboardLayout({ tagName: 'INPUT', type }), 'text');
  }
  for (const type of ['number', 'tel']) {
    assert.equal(keyboardLayout({ tagName: 'INPUT', type }), 'number');
  }
  assert.equal(keyboardLayout({ tagName: 'TEXTAREA' }), 'text');
  for (const type of ['checkbox', 'color', 'date', 'radio', 'range', 'file']) {
    assert.equal(keyboardLayout({ tagName: 'INPUT', type }), null);
  }
  for (const restriction of [{ disabled: true }, { readOnly: true }, { keyboard: 'off' }]) {
    assert.equal(keyboardLayout({ tagName: 'INPUT', type: 'text', ...restriction }), null);
  }
});

test('keyboard inserts at caret, replaces selections, clears and deletes whole Unicode characters', () => {
  assert.deepEqual(keyboardEdit('Laundry', 0, 0, 'Do '), { value: 'Do Laundry', caret: 3 });
  assert.deepEqual(keyboardEdit('Laundry', 0, 7, 'Dishes'), { value: 'Dishes', caret: 6 });
  assert.deepEqual(keyboardEdit('Laundry', 3, 6, 'Backspace'), { value: 'Lauy', caret: 3 });
  assert.deepEqual(keyboardEdit('Hi\u{1f44b}', 4, 4, 'Backspace'), { value: 'Hi', caret: 2 });
  assert.deepEqual(keyboardEdit('', 0, 0, 'Backspace'), { value: '', caret: 0 });
  assert.deepEqual(keyboardEdit('60', 2, 2, 'Clear'), { value: '', caret: 0 });
  assert.deepEqual(keyboardEdit('a', 1, 1, '\n'), { value: 'a\n', caret: 2 });
});

test('keyboard respects character limits including selection replacement', () => {
  assert.deepEqual(keyboardEdit('abc', 3, 3, 'd', 3), { value: 'abc', caret: 3 });
  assert.deepEqual(keyboardEdit('abc', 0, 2, 'hello', 3), { value: 'hec', caret: 2 });
  assert.deepEqual(keyboardEdit('a', 1, 1, '\u{1f44b}', 2), { value: 'a', caret: 1 });
});

test('time keypad replaces existing padded values and does not saturate hours or minutes', () => {
  let hour = numberPadEdit('12', '0', { replace: true, max: '12' });
  assert.equal(hour, '0');
  hour = numberPadEdit(hour, '9', { max: '12' });
  assert.equal(hour, '09');
  assert.equal(numberPadEdit(hour, '9', { max: '12' }), '09');
  let minute = numberPadEdit('59', '3', { replace: true, max: '59' });
  minute = numberPadEdit(minute, '0', { max: '59' });
  assert.equal(minute, '30');
  assert.equal(numberPadEdit('59', '9', { max: '59' }), '59');
  assert.equal(numberPadEdit('59', 'Clear', { max: '59' }), '');
  assert.equal(numberPadEdit('60', '5'), '605');
});

test('completed time entries can be replaced without clearing or refocusing', () => {
  let value = '12';
  let replace = true;
  for (const [key, expected] of [
    ['1', '1'],
    ['1', '11'],
    ['9', '9'],
    ['1', '1'],
    ['0', '10'],
  ]) {
    value = numberPadEdit(value, key, { replace, max: '12' });
    replace = timeEntryComplete(value, '12');
    assert.equal(value, expected);
  }
  assert.equal(timeEntryComplete('0', '12'), false);
  assert.equal(timeEntryComplete('5', '59'), false);
  assert.equal(timeEntryComplete('59', '59'), true);
  assert.equal(numberPadEdit('59', '3', { replace: true, max: '59' }), '3');
});
