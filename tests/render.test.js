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
    const { FamilySetup, demoMembers } = await vite.ssrLoadModule(
      '/src/components/FamilySetup.jsx',
    );
    assert.equal(new Set(demoMembers.map((member) => member.color)).size, 3);
    const setup = renderToStaticMarkup(
      React.createElement(FamilySetup, {
        members: [],
        onSave() {},
        onContinue() {},
      }),
    );
    assert.match(setup, /Add Mom, Dad, and Kid for testing/);
    assert.match(setup, /disabled=""[^>]*>Continue to kitchen/);
    assert.doesNotMatch(setup, /<select/);
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
    assert.match(populated, /aria-label="Calendar view: month"/);
    assert.match(populated, /aria-haspopup="listbox"/);
    assert.match(populated, /Whole household/);

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
    const allDayEditor = renderToStaticMarkup(
      React.createElement(EventEditor, {
        draft: {
          ...items[0],
          startsAt: '2026-10-08T00:00',
          allDay: true,
          endsAt: '2026-10-09T23:59',
          repeat: 'weekly',
        },
        occurrenceOnly: true,
        conflicts: [{ title: 'Other meeting' }],
        onChange() {},
        onSubmit() {},
        onCancel() {},
        weekStart: 0,
      }),
    );
    assert.doesNotMatch(allDayEditor, /TIME/);
    assert.match(allDayEditor, /Saving changes only this occurrence/);
    assert.match(allDayEditor, /Overlaps with: Other meeting/);
    assert.doesNotMatch(allDayEditor, /Repeat through/);
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
    const recurringDetails = renderToStaticMarkup(
      React.createElement(EventDetails, {
        ...detailProps,
        item: { ...items[0], repeat: 'weekly' },
        onScope() {},
      }),
    );
    assert.match(recurringDetails, /Only this occurrence/);
    assert.match(recurringDetails, /Entire series/);
    const reminderDetails = renderToStaticMarkup(
      React.createElement(EventDetails, {
        ...detailProps,
        item: { ...items[0], type: 'reminder', location: 'Hidden location' },
      }),
    );
    assert.doesNotMatch(reminderDetails, /Hidden location/);
    assert.match(reminderDetails, /Edit Reminder/);
    const { Weather, WeatherSummary } = await vite.ssrLoadModule('/src/components/Weather.jsx');
    const weather = {
      day: '2026-10-09',
      temperature: 60,
      feelsLike: 58,
      high: 65,
      low: 45,
      code: 2,
      wind: 8,
      precipitationChance: 20,
      fetchedAt: '2026-10-09T12:00:00Z',
      daily: [{ day: '2026-10-09', high: 65, low: 45, code: 2, precipitationChance: 20 }],
      hourly: [
        {
          time: '2026-10-09T13:00',
          temperature: 60,
          feelsLike: 58,
          code: 2,
          wind: 8,
          precipitationChance: 20,
        },
      ],
    };
    const weatherTab = renderToStaticMarkup(React.createElement(Weather, { weather }));
    assert.match(weatherTab, /The week ahead/);
    assert.match(weatherTab, /Today, hour by hour/);
    assert.match(weatherTab, /1 PM/);
    const summary = renderToStaticMarkup(React.createElement(WeatherSummary, { weather }));
    assert.doesNotMatch(summary, /The week ahead/);
    assert.match(summary, /60°F/);
    const { Sports, Game } = await vite.ssrLoadModule('/src/components/Sports.jsx');
    const gameCard = renderToStaticMarkup(
      React.createElement(Game, {
        favorites: [],
        game: {
          id: 'game',
          startsAt: '2026-10-10T16:00Z',
          state: 'pre',
          teams: [
            { id: '1', name: 'Indiana Hoosiers', homeAway: 'away', apRank: 7, spread: -7.5 },
            { id: '2', name: 'Nebraska Cornhuskers', homeAway: 'home', spread: null },
          ],
        },
      }),
    );
    assert.match(gameCard, /sports-team-name/);
    assert.match(gameCard, /AP rank 7/);
    assert.match(gameCard, /Favored by 7.5 points/);
    assert.equal((gameCard.match(/sports-spread/g) || []).length, 1);
    const { SportsFavorites } = await vite.ssrLoadModule('/src/components/SportsFavorites.jsx');
    const sports = renderToStaticMarkup(React.createElement(Sports, { repository: {} }));
    assert.match(sports, /FBS College Football/);
    assert.match(sports, /English Premier League/);
    assert.match(sports, /WNBA/);
    assert.doesNotMatch(sports, />NBA</);
    assert.doesNotMatch(sports, /MLB/);
    const teams = renderToStaticMarkup(
      React.createElement(SportsFavorites, { repository: {}, onChange() {} }),
    );
    assert.match(teams, /Your teams/);
    assert.match(teams, /Find a team/);
    const { Customize } = await vite.ssrLoadModule('/src/components/Customize.jsx');
    const customize = renderToStaticMarkup(
      React.createElement(Customize, {
        settings: { name: 'Our kitchen', accent: '#264e42', weekStart: 0 },
        members: [],
        repository: {},
        onChange() {},
        onReset() {},
        onSaveMember() {},
        onDeleteMember() {},
      }),
    );
    assert.match(customize, /role="tablist"/);
    assert.match(customize, /Your hub, your way/);
    assert.doesNotMatch(customize, /Your teams/);
    const { HubOverview } = await vite.ssrLoadModule('/src/components/HubOverview.jsx');
    const hub = renderToStaticMarkup(
      React.createElement(HubOverview, {
        items: [
          { ...items[0], startsAt: '2026-10-09T12:00:00' },
          { ...items[1], sportsSource: 'ESPN', startsAt: '2026-10-10T12:00:00' },
        ],
        notes: [{ id: 'note', title: 'Shopping', body: 'Remember milk' }],
        members: [],
        showAgenda: true,
        showNotes: true,
        onOpenEvent() {},
        now: new Date('2026-10-09T09:00:00'),
      }),
    );
    assert.match(hub, /Your week/);
    assert.match(hub, /Today’s plans/);
    assert.match(hub, /Next game/);
    assert.match(hub, /Remember milk/);
    assert.doesNotMatch(hub, /calendar-grid/);
    const saturday = renderToStaticMarkup(
      React.createElement(HubOverview, {
        items: Array.from({ length: 4 }, (_, index) => ({
          ...items[0],
          id: `sport-${index}`,
          title: `Saturday game ${index}`,
          sportsSource: 'ESPN',
          startsAt: '2026-10-10T12:00:00',
        })),
        notes: [],
        members: [],
        showAgenda: true,
        showNotes: true,
        onOpenEvent() {},
        now: new Date('2026-10-10T09:00:00'),
      }),
    );
    assert.match(saturday, /4 plans for the day/);
    assert.match(saturday, /Saturday game 3/);
    assert.doesNotMatch(saturday, /Nothing on the calendar for this day/);
  } finally {
    await vite.close();
  }
});
