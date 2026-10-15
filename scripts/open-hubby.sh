#!/usr/bin/env bash
# Run as the logged-in desktop user, never as root. The dedicated profile
# preserves display preferences and reminder dismissals across app updates.
set -euo pipefail
profile_dir="${XDG_DATA_HOME:-$HOME/.local/share}/hubby/browser-profile"
mkdir -p "$profile_dir"
for attempt in {1..60}; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:3001/api/health >/dev/null; then
    for browser in chromium chromium-browser; do
      if command -v "$browser" >/dev/null; then
        exec "$browser" --kiosk --no-first-run --noerrdialogs \
          --user-data-dir="$profile_dir" http://127.0.0.1:3001
      fi
    done
    echo 'Install Chromium to open the Hubby touchscreen.' >&2
    exit 1
  fi
  sleep 1
done
echo 'Hubby is not ready. Check: sudo systemctl status hubby' >&2
exit 1
