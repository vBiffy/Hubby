# Hubby

A kitchen touchscreen hub with a React calendar, upcoming events/reminders, a notes widget and full notebook, and customizable display preferences. JavaScript throughout; Node/Express and PostgreSQL backend. Hexagonal architecture keeps application rules independent of HTTP and storage.

## Quick demo

Requires Node.js 22.12+ (Node 24 LTS recommended). In Windows PowerShell, use `npm.cmd` when execution policy blocks `npm`.

```powershell
npm.cmd install
Copy-Item .env.example .env
# Edit .env and set STORAGE=memory
npm.cmd run dev
```

Open http://localhost:5173. Memory mode starts empty and loses data on restart; the screen labels it explicitly. Use PostgreSQL for persistent storage.

## PostgreSQL

Install Docker with Compose or use an existing PostgreSQL server. Copy `.env.example` to `.env`. Set `STORAGE=postgres`, add `POSTGRES_PASSWORD` with your own password, and use that password in `DATABASE_URL` (URL-encode special characters).

```sh
docker compose up -d db
npm run db:migrate
npm run dev
```

For existing PostgreSQL, create a database/user, set `DATABASE_URL`, skip Docker, and run the migration. The migration is explicit and idempotent; startup checks the schema. Docker stores data in a named volume. Back up with `pg_dump` before schema changes.

## Raspberry Pi

Use Raspberry Pi OS 64-bit Desktop, Chromium, and a supported Node version. PostgreSQL can run on the Pi or another machine. Docker must be installed separately if using Compose.

```sh
npm ci
npm run db:migrate
npm run build
npm start
# Run from the Pi desktop session:
chromium --kiosk http://127.0.0.1:3001
```

The production API also serves the built app. Use [the service template](docs/hubby.service) for backend autostart, replacing paths/user before installing and enabling it with systemd. Launch Chromium from the desktop session. Follow the official [Raspberry Pi kiosk guide](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/) for desktop autostart and configure an OS on-screen keyboard for text entry. Set the Pi timezone correctly; entries display in local time. The responsive UI has touch targets of at least 44px.

This starter has no authentication and binds to localhost by default. Add authentication and HTTPS before network sharing. No cloud account is required. Fonts have system fallbacks when offline.

## Development and customization

### Popup reminders

Calendar entries can be dragged to another day without changing their local time.
On touchscreens, press and hold an entry before dragging. With a keyboard, focus
an entry, press Space, then focus a destination date and press Enter; Escape cancels.
For recurring plans, only the selected occurrence moves. Its original date is
skipped and its completion state follows it; other occurrences keep their schedule.
Moves can cross month boundaries and the original series end date. Reminder alerts
follow the new date. This update requires no database migration.

When adding or editing either an event or reminder, choose **When should we remind
you?**: at the scheduled time, a preset lead time, a custom number of minutes (up
to seven days), or no popup. New plans default to 15 minutes before; existing plans
stay silent until you enable reminders for them.

A popup appears on any app tab when an alert becomes due, with **Snooze** (5, 10,
15, 30, or 60 minutes) and **Dismiss**. Multiple alerts appear together. Dismiss
silences only that occurrence and does not mark the plan complete. Snoozes and
dismissals are saved per browser/screen across reloads; another device has its own
delivery state. Changing a plan's start or lead time schedules a fresh alert.

Keep the app open for alerts. It checks every ten seconds and when the screen
regains focus, catching up on alerts due in the last 24 hours. Closed apps and
sleeping computers cannot display popups; browser background throttling can delay
delivery until the app resumes. Popups wait until an open event editor is closed.
This is an in-app framework; it does not send OS notifications or play sounds.
No database migration is needed for the new event reminder setting.

Calendar time entry uses a 12-hour clock with AM/PM. Under **Customize → Family
members**, add/edit household members with a required unique six-digit hex color.
Assign a member when adding or editing a calendar entry; its color and name appear
in the calendar legend and agenda. Unassigned entries belong to the whole household.

Plans can repeat daily, weekly, monthly, or yearly, with an optional inclusive end
date. Editing/deleting affects the whole series; checking off an agenda occurrence
affects only that date. Monthly/yearly dates that do not exist are skipped (e.g.
February 31). Recurrences follow the screen's local timezone and preserve local
clock time across daylight saving changes; configure the Pi timezone accordingly.
The full agenda shows the last 30 days and next year; the month view expands the
displayed month. Old events remain valid as non-repeating, household entries.

For PostgreSQL, run `npm.cmd run db:migrate` after this update to enable family
records and database-enforced unique colors. Memory mode needs no migration.
Reassign a member's events before deleting that member.

For meetings on multiple weekdays, choose **Repeat → Custom weekdays** and check
days such as **Tue** and **Thu**. The event repeats every week on those days at the
selected time, beginning on or after its start date. At least one day is required;
the optional end date and individual occurrence completion still apply. This update
needs no additional database migration.

The **Weather** tab (`/#weather`) shows current conditions and today's high/low,
precipitation chance, and wind for Lansing, MI. A compact weather link appears on
the kitchen header between the hub name and clock. Temperatures are Fahrenheit;
forecast dates use Lansing's timezone. It uses [Open-Meteo](https://open-meteo.com/en/docs)
without an API key and requires internet access from the backend. Both views share
one result, refreshed every ten minutes, with a Refresh button on the full tab.
The backend caches requests for ten minutes and times out provider calls after
eight seconds. Failed updates are labeled while the screen retains its last result.
No database migration is required for weather.

Code uses two-space indentation and a target line width of 100 characters. Prettier
configuration and `.editorconfig` keep new edits consistent. Enable your editor's
Prettier format-on-save support, or run:

```sh
npm run format
npm run format:check
```

The browser entry point is `src/main.jsx`; the app shell lives in `src/App.jsx`.
Feature screens and editors live in separate files under `src/components`.

The **Groceries** tab (`/#groceries`) supports adding/editing items with optional quantities, checking off purchases, and deleting items. It uses the same configured storage as notes and events. After updating an existing PostgreSQL installation, run `npm.cmd run db:migrate` to allow grocery records; this preserves existing data. Memory mode needs no migration.

```sh
npm test
npm run build
```

The Customize tab controls hub name, accent color, dark mode, larger text, week start, and widget visibility. Preferences are per browser; notes/events are shared in the database. Open `/#notes` or `/#calendar` to use a full feature view. Widgets receive their own data/actions and can be composed independently.

See [architecture and React basics](docs/ARCHITECTURE.md) for the code layout, ports, adapters, and extension steps. Comments explain boundaries and non-obvious behavior. References: [React basics](https://react.dev/learn), [React with Vite](https://react.dev/learn/build-a-react-app-from-scratch), [parameterized PostgreSQL queries](https://node-postgres.com/features/queries).

Current scope: calendar entries support timed single occurrences and recurring series. In-app popup reminders require an open app. Shared data refreshes every 30 seconds, writes need the API, and concurrent edits use last-write-wins. External calendar sync, accounts, and OS notifications are future extensions.

# Calendar planning

The calendar offers month, week, and day views and a family filter. Click an entry
to see its details. For repeating plans, choose **Only this occurrence** or
**Entire series** before editing or deleting. Individual edits, moves, and deleted
occurrences remain separate from the repeat schedule.

Enable **All day** for date-based plans, or **Set an end date/time** for a duration
or a multi-day span. All-day end dates include the entire final day. Their popup
reminders use 9 AM on the first day as the reference time. Overlap warnings apply
to events for the same person or the whole household and allow saving anyway.

Moves and deletions offer **Undo** for 30 seconds. Undo preserves the original
event ID and refuses to overwrite a newer edit. It is available in the current
session only. These fields use the existing PostgreSQL JSON records, so no schema
migration is needed; existing events continue to work.

The Weather tab shows a seven-day Lansing forecast and today's hourly temperature,
conditions, precipitation chances, and wind. Hour labels use Lansing time and
12-hour formatting. The kitchen header keeps its compact current-weather widget.
Both share the existing ten-minute forecast cache; no database migration is needed.

## Sports

The Sports tab covers FBS college football, NFL, English Premier League, WNBA,
and men's Division I college basketball. Select favorite teams under Customize →
Sports → Your teams to prioritize their games within each day. Use the day picker
to jump between dates; only the games list scrolls. Favorites are stored with the other
preferences on this device. No sports widget appears on the kitchen hub.

ESPN's public keyless endpoints provide scores and schedules through the backend.
The tab refreshes every minute while open, shows three days of recent results and
two weeks of upcoming scoreboards, and adds available future games from favorite
team schedules. Between seasons, an empty schedule is normal. ESPN's endpoints
are undocumented and may change; failures are labeled and can be retried.

Customize separates Display, Family, and Sports into subtabs so only the selected
settings section is shown.

Under Customize → Sports, each favorite has a **Show games on sports calendar** checkbox,
off by default. Enabled teams' games appear in the separate Sports calendar as synced ESPN entries with
no reminders and their primary team colors. If both teams are enabled, a single
entry shows both colors diagonally. These source-managed entries refresh every
five minutes and are not copied into PostgreSQL. Disable the toggle or remove
the favorite to hide them; household calendar events remain editable as usual.

College football and men's basketball offer an **AP Top 25** game filter. It shows
matchups involving either team in the current AP poll, including live/recent scores.
Current AP ranks appear beside teams in upcoming/live games and synced calendar
titles. Completed games omit current-rank badges. Polls older than two weeks are
not used; Coaches/CFP polls are never substituted. If no current AP poll is available,
choose All games or a conference instead. AP data refreshes hourly.

### Shared controls and first-time family setup

Dropdown menus are rendered by `src/components/Select.jsx` using the app theme,
with keyboard navigation, Escape, and outside-tap dismissal. Delete confirmations
use the shared themed `ConfirmDialog` through `DeleteButton` instead of browser prompts.

The kitchen shell waits for its initial data load. If no family members exist,
setup is required before any feature can be used, including direct tab links.
Add at least one member with a unique color, then choose **Continue to kitchen**.
The testing shortcut saves **Mom**, **Dad**, and **Kid** through the normal member API.
Removing the last member brings setup back. Failed initial connections offer retry;
they do not assume the family is empty. Memory-mode demo members reset on server restart.

### Send your grocery list to Telegram

Telegram replaces the paid SMS integration. Install Telegram on your phone;
no custom iOS app, SMS sender number, or paid broadcasting is needed.
The Groceries tab sends unchecked items and quantities to one fixed chat.

1. In Telegram, open the official [@BotFather](https://t.me/BotFather), send
   `/newbot`, and follow the prompts. Copy the bot token into your local `.env`
   as `TELEGRAM_BOT_TOKEN`. Keep it private; never use a `VITE_` prefix.
2. Open your new bot's chat on your phone and press **Start** (or send `/start`).
   Bots cannot initiate private conversations until you start them.
3. In the project terminal, run `npm run telegram:chat`. This read-only helper
   lists recent chat IDs without printing the bot token. Put your chat ID in `.env`
   as `TELEGRAM_CHAT_ID`. If several chats appear, choose your intended private chat.
   If none appear, send your bot another message and run the helper again.
4. Restart the API and refresh the app. Choose **Send to Telegram** and confirm.

```env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-numeric-chat-id
```

Use a dedicated bot without an existing webhook or another app consuming updates.
The setup helper reads updates only; it does not send a message or add groceries.
Old `TWILIO_*` and `SMS_TO_NUMBER` settings are no longer used and can be removed.

The backend keeps credentials and the destination out of React/localStorage,
loads the saved list, sends plain text, and refuses empty/fully checked lists.
Lists over 4,096 characters are rejected without truncation. Sends are limited
once per minute per running process with no automatic retries. Telegram acceptance
means the message was created, not that the phone has displayed a notification.
Tests use fake senders; no real messages are sent during testing.

Keep the API on your trusted household device/network; it currently has no user
authentication. Telegram receives a plain list only when you press **Send to Telegram**.
The app does not poll Telegram, listen for taps, or sync changes back from your phone.
Existing checkbox messages are no longer interactive; send a fresh plain list.
The chat-ID setup helper contacts Telegram only when you run it manually.

Provider references: [Bot setup](https://core.telegram.org/bots/features#botfather),
[sendMessage](https://core.telegram.org/bots/api#sendmessage),
[getUpdates](https://core.telegram.org/bots/api#getupdates).

### Hub family day cards

The Hub shows a week picker and full-width daily plans. Tap a family member's
name/colored initial. Everyone is a filter showing all member cards; selecting a
name shows only that person's card. Swipe horizontally across the member cards.
Whole-household plans appear in every person's day; assigned plans appear only
for their members. There is no duplicate Everyone card. Sports games are excluded. Cards scroll vertically for busy days and keep a consistent 320px width.
Wider screens reveal more cards; very narrow windows leave a small peek of the next card.

Notes is a button that opens a smaller themed popup with note creation, editing,
and deletion. The standalone Notes tab remains available. The Next game card has
been removed from the Hub. The default hub name is Our hub; existing custom names
are preserved, and the old default Our kitchen is updated automatically.

### Separate sports calendar and expanded Hub

ESPN games appear only in the **Sports ? Sports calendar** view. The main Calendar,
Hub week dots, daily family cards, and household agenda contain household plans only.
Existing favorite-team calendar toggles now control this sports-only calendar;
no data migration or duplicate stored events are needed.

Use the **Sports calendar** button on the Hub to open the same read-only calendar
in a themed popup. Tap a game for details; games cannot be edited, moved, or deleted.
Manage inclusion through Customize ? Sports. The Hub uses all available width on desktop displays; day cards have a moderate height and scroll internally when busy.
Small/short windows retain natural page scrolling.

For a compact landscape touchscreen preview, resize the browser to approximately
1024 ? 768 or 1280 ? 800. On Hub windows up to 1400px wide, the sidebar becomes
slimmer to leave more room for two family cards and the next card's edge.
Cards stay 320px wide and 240?360px tall rather than stretching down the screen.

### Quick household reminders and timers

In the Hub plans toolbar, beside Sports calendar and Notes, choose **Quick reminders**. Laundry (60 minutes), dryer (45), dishwasher
(120), oven check (20), and plants (30) presets immediately start a Telegram reminder when tapped. All use the same bot
and `TELEGRAM_CHAT_ID` as grocery messages. No separate recipient is needed.
Use the custom form to edit a message and duration (1?1,440 minutes) or start
an on-screen timer. Presets estimate time; they cannot detect appliance completion.

Timers display their completion by reopening the popup while the Hub stays open;
there is no audible alarm. Active countdowns can be cancelled, and recent outcomes
are shown in the popup. Telegram delivery does not require the browser or popup
open, but the API/Pi must keep running with internet access.

**Existing PostgreSQL installs:** run `npm.cmd run db:migrate` once before using
quick reminders; this adds the `quickReminders` record kind while preserving data.
Memory mode requires no migration but loses timers on API restart.

The server checks local stored deadlines every five seconds, not Telegram updates.
PostgreSQL reminders survive restarts and overdue scheduled reminders are handled
on startup. Use one API process. A message is claimed before delivery; failed or
ambiguous sends are not retried automatically. After a crash during delivery,
Sending may mean uncertain delivery: check Telegram before creating a replacement.
Recent completed/cancelled/failed records are cleaned up after seven days.

### Sports controls and college filters

The Sports toolbar uses themed dropdowns for **View**, **League**, and **Game filter**,
with a horizontally scrollable day picker below the filters. View switches between
Games & scores and the separate Sports calendar.

For college football and men's basketball, Game filter offers **All games**,
**AP Top 25**, and individual conferences. Conference filters include matchups
involving either participant, including cross-conference games. Both upcoming games
and scores follow the filter, and the day picker only lists matching dates plus Today.
Changing leagues resets the game filter and day selection.

Conference membership comes from ESPN and is cached for six hours. Basketball uses
complete upcoming-season conference directories rather than the previous season's
standings. A failed conference lookup leaves All games and AP Top 25 available.

### Built-in touch keyboard

Tap an editable text field to open the themed keyboard, or a numeric/phone field
for the number pad. It works in setup, every tab, and popups. Use Shift, Symbols,
Space, Backspace, Clear, and Next; note fields also offer New line. Done, Close,
or Escape dismisses the keyboard without saving or submitting the form. Tap the
field again to reopen it. Physical keyboards continue to work.

Checkboxes, dropdowns, color pickers, and date pickers retain their dedicated
controls. New editable fields automatically participate; `data-keyboard="off"`
opts a field out. The keyboard attempts to suppress the operating system keyboard
while open; platform behavior can vary. Styles use `.touch-keyboard` and
`.touch-number-pad` in `src/styles.css`.

### Compact plan editor

Add/Edit plan uses a two-column layout on landscape touchscreens. With three
family members, the standard event form fits at 1024x768, including an optional
end time. The keyboard opens only after selecting a field. Smaller windows,
expanded date pickers, larger text, and an open keyboard retain scrolling when
needed so controls remain reachable.

Choose **Repeat** to open a separate themed window for frequency, custom weekdays,
and the optional repeat-through date. **Apply repeat** updates the unsaved plan;
**Cancel** leaves its recurrence unchanged. Save the plan to persist it. Repeat
settings remain unavailable when editing only one occurrence.

The plan editor places Location beside separate All day and Set an end date/time
checkboxes. Start date/time is stacked in the left column; the end picker uses a
reserved right-column area below Location, so toggling it does not resize the
window. Repeat settings opens as a centered modal over the plan editor.

### Shared transitions

Screens, settings subtabs, popup windows, dropdown menus, date pickers, and the
touch keyboard use a consistent 350ms fade on opening. Popup size changes animate
at the same pace, and the Hub's family/day selection adds a small slide. Reduced
motion preferences disable these transitions. Adjust `hub-content-enter` in
`src/styles.css` for opening animations and `src/hooks/useAnimatedWindows.js`
for popup resizing.
