import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Render the actual JSX through Vite: a successful bundle alone cannot catch
// exceptions that occur when React calls a component to draw the screen.
test('calendar, editor and reminder popup render without crashing', async () => {
  const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  try {
    const { Calendar } = await vite.ssrLoadModule('/src/components/Calendar.jsx');
    const props = { weekStart: 0, onSelect() {}, onEdit() {} };
    const empty = renderToStaticMarkup(React.createElement(Calendar, { ...props, items: [] }));
    assert.match(empty, /THE FAMILY PLAN/);

    const items = Array.from({ length: 3 }, (_, index) => ({
      id: `event-${index}`,
      title: `Meeting ${index}`,
      type: 'event',
      startsAt: new Date().toISOString(),
      done: false,
    }));
    const populated = renderToStaticMarkup(React.createElement(Calendar, { ...props, items }));
    assert.match(populated, /Edit event: Meeting 0/);
    assert.match(populated, /\+1 more/);

    const { ReminderCenter } = await vite.ssrLoadModule('/src/components/ReminderCenter.jsx');
    const popup = renderToStaticMarkup(
      React.createElement(ReminderCenter, {
        reminders: [{ ...items[0], reminderKey: 'due-meeting' }],
        now: Date.now(),
        members: [],
        onSnooze() {},
        onDismiss() {},
        storageError: '',
      }),
    );
    assert.match(popup, /role="dialog"/);
    assert.match(popup, /Meeting 0/);
    assert.match(popup, /Snooze/);
    assert.match(popup, /Dismiss/);

    const { EventEditor } = await vite.ssrLoadModule('/src/components/EventEditor.jsx');
    const editor = renderToStaticMarkup(
      React.createElement(EventEditor, {
        draft: { ...items[0], startsAt: '2026-10-08T09:00', reminderMinutes: 15 },
        onChange() {},
        onSubmit() {},
        onCancel() {},
        weekStart: 0,
        busy: false,
        error: '',
      }),
    );
    assert.match(editor, /When should we remind you/);
    assert.match(editor, /15 minutes before/);
    const { EventDetails } = await vite.ssrLoadModule('/src/components/EventDetails.jsx');
    const detailProps = { members: [], onEdit() {}, onDelete() {}, onClose() {} };
    const details = renderToStaticMarkup(
      React.createElement(EventDetails, {
        ...detailProps,
        item: { ...items[0], location: 'Community center' },
      }),
    );
    assert.match(details, /Community center/);
    assert.match(details, /Edit Event/);
    assert.match(details, /Delete Event/);
    const reminderDetails = renderToStaticMarkup(
      React.createElement(EventDetails, {
        ...detailProps,
        item: { ...items[0], type: 'reminder', location: 'Hidden location' },
      }),
    );
    assert.doesNotMatch(reminderDetails, /Hidden location/);
    assert.match(reminderDetails, /Edit Reminder/);
  } finally {
    await vite.close();
  }
});
