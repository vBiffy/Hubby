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
    const { KeyboardKeys } = await vite.ssrLoadModule('/src/components/TouchKeyboard.jsx');
    const numberKeys = renderToStaticMarkup(
      React.createElement(KeyboardKeys, {
        layout: 'number',
        onKey() {},
      }),
    );
    assert.match(numberKeys, /Backspace/);
    assert.match(numberKeys, /Next/);
    assert.doesNotMatch(numberKeys, /Caps|Space|New line/);
    const textKeys = renderToStaticMarkup(
      React.createElement(KeyboardKeys, {
        layout: 'text',
        multiline: true,
        uppercase: true,
        onKey() {},
      }),
    );
    assert.match(textKeys, /Caps/);
    assert.match(textKeys, /New line/);
    assert.match(textKeys, />Q</);
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
    assert.match(setup, /disabled=""[^>]*>Continue to Hubby/);
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
    assert.match(editor, /plan-editor-form/);
    assert.doesNotMatch(editor, /Repeat through|Repeat every week on/);
    const { RepeatEditor } = await vite.ssrLoadModule('/src/components/RepeatEditor.jsx');
    const repeatEditor = renderToStaticMarkup(
      React.createElement(RepeatEditor, {
        draft: { ...items[0], startsAt: '2026-10-08T09:00', repeat: 'custom', repeatDays: [2, 4] },
        weekStart: 0,
        onApply() {},
        onCancel() {},
      }),
    );
    assert.match(repeatEditor, /Repeat settings/);
    assert.equal((repeatEditor.match(/type="radio"/g) || []).length, 6);
    assert.doesNotMatch(repeatEditor, /shared-select-menu/);
    assert.match(repeatEditor, /Repeat every week on/);
    assert.match(repeatEditor, /Repeat through/);
    assert.match(repeatEditor, /Apply repeat/);
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
    const { Groceries } = await vite.ssrLoadModule('/src/components/Groceries.jsx');
    const groceryProps = { onSave() {}, onDelete() {} };
    const noChecked = renderToStaticMarkup(
      React.createElement(Groceries, {
        ...groceryProps,
        items: [{ id: 'milk', title: 'Milk', done: false }],
      }),
    );
    assert.match(noChecked, /disabled=""[^>]*>Clear checked items/);
    const withChecked = renderToStaticMarkup(
      React.createElement(Groceries, {
        ...groceryProps,
        items: [{ id: 'milk', title: 'Milk', done: true }],
      }),
    );
    assert.match(withChecked, /<button type="button">Clear checked items/);
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
    assert.match(sports, /sports-controls/);
    assert.match(sports, /sports-header-actions[\s\S]*Favorites[\s\S]*(Refresh|Updating)/);
    assert.match(sports, /Game filter/);
    assert.match(sports, /AP Top 25/);
    assert.doesNotMatch(sports, /Filter by conference|sports-leagues/);
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
    const favoriteSettings = renderToStaticMarkup(
      React.createElement(Customize, {
        initialSection: 'sports',
        settings: {},
        repository: {},
        onChange() {},
      }),
    );
    assert.match(favoriteSettings, /Your teams/);
    assert.doesNotMatch(favoriteSettings, /Your hub, your way/);

    const { HubOverview } = await vite.ssrLoadModule('/src/components/HubOverview.jsx');
    const { Chores, ChoreEditor, ChoreRow } = await vite.ssrLoadModule(
      '/src/components/Chores.jsx',
    );
    const futureChore = renderToStaticMarkup(
      React.createElement(ChoreRow, {
        item: {
          title: 'Take out the trash',
          startsOn: '2026-10-18',
          dueOn: '2026-10-18',
          occurrenceDate: '2026-10-18',
          timeOfDay: '17:00',
          done: false,
        },
        today: '2026-10-14',
      }),
    );
    assert.doesNotMatch(futureChore, /chore-overdue|Overdue/);
    assert.match(futureChore, /Due 2026-10-18 at 5:00 PM/);
    const choreMembers = [
      { id: 'mom', title: 'Mom', color: '#a64b78' },
      { id: 'dad', title: 'Dad', color: '#326d9c' },
    ];
    const choreItems = [
      {
        id: 'chore',
        title: 'Wash dishes',
        memberId: 'mom',
        startsOn: '2026-10-08',
        dueOn: '2026-10-09',
        done: false,
      },
    ];
    const board = renderToStaticMarkup(
      React.createElement(Chores, {
        repository: {},
        items: choreItems,
        members: choreMembers,
        onSave() {},
        onDelete() {},
        now: new Date('2026-10-10T12:00Z'),
      }),
    );
    assert.match(board, /Family chores/);
    assert.match(board, /Take out the trash/);
    assert.match(board, /Overdue since 2026-10-09/);
    const recurringEditor = renderToStaticMarkup(
      React.createElement(ChoreEditor, {
        item: { ...choreItems[0], repeat: 'daily', timeOfDay: '17:00', missedPolicy: 'skip' },
        members: choreMembers,
        configured: true,
        onSave() {},
        onClose() {},
      }),
    );
    assert.match(recurringEditor, /First occurrence and scheduled time/);
    assert.match(recurringEditor, /Forget it when the next day starts/);
    assert.match(recurringEditor, /mark overdue the next morning/);
    assert.doesNotMatch(recurringEditor, /Set a due date|Telegram reminder time/);

    const choresOnHub = renderToStaticMarkup(
      React.createElement(HubOverview, {
        items: [],
        notes: [],
        chores: choreItems,
        members: choreMembers,
        showAgenda: true,
        showNotes: false,
        onSaveChore() {},
        now: new Date('2026-10-10T12:00Z'),
      }),
    );
    assert.equal((choresOnHub.match(/Wash dishes/g) || []).length, 6);
    assert.match(choresOnHub, /Complete Wash dishes/);
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
    assert.match(hub, /aria-label="Previous week"/);
    assert.match(hub, /aria-label="Next week"/);
    assert.match(hub, /Our week at a glance/);
    assert.doesNotMatch(hub, /Next game/);
    assert.match(hub, /hub-timeline-scroll/);
    assert.doesNotMatch(hub, /Remember milk/);
    assert.match(hub, /Notes \(1\)/);
    assert.doesNotMatch(hub, /calendar-grid/);
    const familyHub = renderToStaticMarkup(
      React.createElement(HubOverview, {
        items: [
          {
            ...items[0],
            title: 'Dad meeting',
            memberIds: ['dad'],
            startsAt: '2026-10-09T12:00:00',
          },
          {
            ...items[1],
            title: 'Mom appointment',
            memberIds: ['mom'],
            startsAt: '2026-10-09T13:00:00',
          },
          { ...items[2], title: 'Family dinner', memberIds: [], startsAt: '2026-10-09T18:00:00' },
        ],
        notes: [],
        members: [
          { id: 'dad', title: 'Dad', color: '#326d9c' },
          { id: 'mom', title: 'Mom', color: '#a64b78' },
        ],
        showAgenda: true,
        showNotes: true,
        onOpenEvent() {},
        now: new Date('2026-10-09T09:00:00'),
      }),
    );
    assert.doesNotMatch(familyHub, /aria-label="Everyone&#x27;s daily plans"/);
    assert.match(familyHub, />Everyone<\/button>/);
    const { QuickReminders } = await vite.ssrLoadModule('/src/components/QuickReminders.jsx');
    const quickButton = renderToStaticMarkup(
      React.createElement(QuickReminders, { repository: {} }),
    );
    assert.match(quickButton, /Quick reminders/);
    assert.match(familyHub, /Dad meeting/);
    assert.match(familyHub, /Mom appointment/);
    assert.match(familyHub, /Family dinner/);
    const { timelineBlocks } = await vite.ssrLoadModule('/src/components/HubTimeline.jsx');
    const day = new Date('2026-10-09T00:00:00');
    const overlapping = timelineBlocks(
      [
        { id: 'a', startsAt: '2026-10-09T09:00:00', endsAt: '2026-10-09T10:00:00' },
        { id: 'b', startsAt: '2026-10-09T09:30:00', endsAt: '2026-10-09T11:00:00' },
        { id: 'c', startsAt: '2026-10-09T12:00:00', endsAt: '2026-10-09T13:00:00' },
        { id: 'overnight', startsAt: '2026-10-08T23:00:00', endsAt: '2026-10-09T01:00:00' },
      ],
      day,
    );
    assert.equal(overlapping.find((b) => b.item.id === 'a').lanes, 2);
    assert.equal(overlapping.find((b) => b.item.id === 'b').lane, 1);
    assert.equal(overlapping.find((b) => b.item.id === 'c').lanes, 1);
    assert.equal(overlapping.find((b) => b.item.id === 'overnight').top, 0);
    const { HubNotes } = await vite.ssrLoadModule('/src/components/HubNotes.jsx');
    const notesPopup = renderToStaticMarkup(
      React.createElement(HubNotes, {
        items: [{ id: 'note', title: 'Shopping', body: 'Remember milk' }],
        onSave() {},
        onDelete() {},
        onClose() {},
      }),
    );
    assert.match(notesPopup, /<dialog/);
    assert.match(notesPopup, /Remember milk/);
    assert.match(notesPopup, /Open notebook/);
    const { SportsCalendar, SportsCalendarDialog } = await vite.ssrLoadModule(
      '/src/components/SportsCalendar.jsx',
    );
    const sportsCalendarProps = {
      items: [
        {
          ...items[0],
          title: 'Favorite team match',
          sportsSource: 'ESPN',
          sportsColors: ['#cc2233'],
          repeat: 'none',
        },
      ],
      weekStart: 0,
    };
    const separateCalendar = renderToStaticMarkup(
      React.createElement(SportsCalendar, sportsCalendarProps),
    );
    assert.match(separateCalendar, /THE SPORTS PLAN/);
    assert.match(separateCalendar, /Favorite team match/);
    assert.doesNotMatch(separateCalendar, /Touch a date to add a plan/);
    const calendarPopup = renderToStaticMarkup(
      React.createElement(SportsCalendarDialog, { ...sportsCalendarProps, onClose() {} }),
    );
    assert.match(calendarPopup, /<dialog/);
    assert.match(calendarPopup, /Sports calendar/);
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
    assert.doesNotMatch(saturday, /4 plans for the day/);
    assert.doesNotMatch(saturday, /Saturday game 3/);
    assert.match(saturday, /Sports calendar/);
    assert.doesNotMatch(saturday, /Nothing on the calendar for this day/);
  } finally {
    await vite.close();
  }
});
