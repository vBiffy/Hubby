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
