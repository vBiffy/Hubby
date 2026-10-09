import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Render the actual JSX through Vite: a successful bundle alone cannot catch
// exceptions that occur when React calls a component to draw the screen.
test('calendar renders empty and populated days without crashing', async () => {
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
  } finally {
    await vite.close();
  }
});
