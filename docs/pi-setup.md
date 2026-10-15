# Local Raspberry Pi installation

Prepared for a future Raspberry Pi running **Raspberry Pi OS 64-bit Desktop**
with the Labwc desktop. This installs directly on the Pi; no cloud database,
Docker, separate development server, or manual SQL commands are required.
The script has not yet been exercised on physical Pi hardware.

## First installation

1. Install the OS and set its timezone to America/New_York. Enable desktop
   automatic login if the display should open unattended after boot.
2. Copy this project/release folder to the Pi. Internet is needed for installation.
3. From the project folder, as your normal desktop user, run:

   ```sh
   sudo bash scripts/install-pi.sh
   ```

The installer installs PostgreSQL, Chromium and the official Node 24 ARM64
runtime; creates a database and a generated local password; builds the frontend;
initializes all tables; and enables backend startup, crash restart and daily
database backups. It also adds a Hubby applications-menu shortcut and Labwc
desktop autostart for the user who invoked sudo. Launch **Hubby** or reboot.
Chromium is the fullscreen shell for this preparation stage; an Electron shell
or a graphical installer can replace it later without moving the database.

If a database/role named `hubby` already exists, the installer preserves it and
asks for its connection in `/etc/hubby/hubby.env`. It never resets the password
or replaces an existing database. A partially interrupted first installation may
also require that configuration before retrying.

## Where everything lives

| Data                                                    | Location                                         |
| ------------------------------------------------------- | ------------------------------------------------ |
| Household records and schema history                    | Local PostgreSQL database `hubby`                |
| PostgreSQL files                                        | OS-managed directory under `/var/lib/postgresql` |
| Connection and Telegram configuration                   | `/etc/hubby/hubby.env`                           |
| Daily database backups                                  | `/var/lib/hubby/backups`                         |
| Display preferences and per-screen snooze/dismiss state | `~/.local/share/hubby/browser-profile`           |
| Application files                                       | `/opt/hubby/app`                                 |
| Node runtime                                            | `/opt/hubby/node`                                |

Notes, groceries, family members, events, chores, recurrence completion history
and scheduled Telegram reminders use PostgreSQL. Display preferences and popup
dismissals currently remain per-screen, in Chromium's persistent profile on the
Pi, rather than in PostgreSQL. Replacing the app folder preserves both stores.
Weather and sports are fetched again when online; their caches are temporary.

The installer intentionally does not copy your development `.env` or templates.
To enable the same Telegram bot/chat, edit the installed configuration once:

```sh
sudo nano /etc/hubby/hubby.env
sudo systemctl restart hubby
```

For access from other household devices, change `HOST` to `0.0.0.0`, restart
Hubby, and open `http://PI_HOSTNAME:3001` on the same home network. PostgreSQL
itself can stay local to the Pi. Another device has its own display preferences
and reminder-dismissal state; household records remain shared on the Pi.

## Startup, updates and recovery

PostgreSQL initializes/replays its durable storage when it restarts. Hubby waits
for schema initialization before accepting requests or scheduling messages.
Schema revisions run transactionally under a database lock, and unchanged
schemas are skipped. A database error stops startup rather than silently
switching to disposable memory storage.

Copy a new release folder to the Pi and rerun its installer. It backs up the
previous database before replacing app code, preserves configuration and data,
and applies table changes automatically. Do not overwrite the browser profile
or PostgreSQL directory when updating. Failed/uncertain Telegram deliveries
retain their existing no-automatic-resend behavior after a restart.

```sh
sudo systemctl status hubby
sudo journalctl -u hubby -n 50
sudo systemctl restart hubby
```

## Backups

The timer runs at about 3 AM daily and catches up after a missed run. It keeps
the latest 14 database snapshots. Set `BACKUP_KEEP` in the installed configuration
to change retention (1–365). To make a snapshot immediately:

```sh
sudo systemctl start hubby-backup.service
sudo journalctl -u hubby-backup.service -n 20
```

On a development computer with `pg_dump` installed and a valid `.env`, use
`npm run db:backup`. `BACKUP_DIR` chooses the destination; `PG_DUMP_PATH` can
specify a full executable path when it is not on PATH. Backups use PostgreSQL's
compressed custom archive format. Credentials are not passed on the command line.

Backups cover database records, not `/etc/hubby/hubby.env` or the browser profile.
Keep a copy of those separately. Copy snapshots to a USB drive or another device
occasionally: a backup on the same SD card does not survive that card failing.
Normal restarts retain committed data; no installer can guarantee survival of
damaged storage or every abrupt power loss. Leave PostgreSQL's default durable
write settings enabled.

To test recovery without replacing your working data, restore a snapshot into a
new database and inspect it:

```sh
sudo -u postgres createdb -O hubby hubby_recovery
sudo -u hubby cat /var/lib/hubby/backups/YOUR_BACKUP.dump | \
  sudo -u postgres pg_restore --no-owner --role=hubby --dbname=hubby_recovery
```

Once verified, stop the backend, point `DATABASE_URL` at the recovered database,
and start the backend again. Browser preferences remain in the original profile.

## Installer formats

A Windows `.exe` installer and a Raspberry Pi installer are separate builds.
This is the Pi's local installation foundation, not a Windows executable or an
Electron package. Both can reuse the same database initialization and storage
ports. The intended future graphical installer would wrap these setup steps.
