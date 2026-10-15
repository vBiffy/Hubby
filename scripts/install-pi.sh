#!/usr/bin/env bash
# Run from a copied Hubby checkout on Raspberry Pi OS 64-bit:
#   sudo bash scripts/install-pi.sh
# Re-running preserves /etc/hubby, PostgreSQL data and the desktop browser profile.
set -euo pipefail
umask 027

if [[ ${EUID} -ne 0 ]]; then
  echo 'Run with sudo: sudo bash scripts/install-pi.sh' >&2
  exit 1
fi
if [[ $(uname -s) != Linux || $(uname -m) != aarch64 ]]; then
  echo 'This installer targets Raspberry Pi OS 64-bit (aarch64), not Windows.' >&2
  exit 1
fi
if ! command -v apt-get >/dev/null || ! command -v systemctl >/dev/null; then
  echo 'This installer requires a Debian-based OS with systemd.' >&2
  exit 1
fi

source_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
app_dir=/opt/hubby/app
node_dir=/opt/hubby/node
config_file=/etc/hubby/hubby.env
if [[ ! -f "$source_dir/package.json" || ! -f "$source_dir/package-lock.json" \
  || ! -f "$source_dir/server/main.js" ]]; then
  echo 'Copy the complete Hubby project/release folder before running this installer.' >&2
  exit 1
fi
if [[ "$app_dir" == "$source_dir/"* ]]; then
  echo 'The source project must not contain /opt/hubby/app. Use a separate release folder.' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y postgresql postgresql-client chromium curl ca-certificates xz-utils rsync
systemctl enable --now postgresql
id hubby >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/hubby hubby
install -d -o hubby -g hubby /var/lib/hubby /var/lib/hubby/backups "$app_dir"
install -d -o root -g hubby -m 0750 /etc/hubby
install -d "$node_dir"

# Install the official ARM64 Node 24 LTS binary, without depending on the older
# Node version that some Raspberry Pi OS package repositories provide.
if [[ ! -x "$node_dir/bin/node" ]]; then
  download_dir=$(mktemp -d)
  curl --fail --location --silent --show-error \
    https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$download_dir/SHASUMS256.txt"
  archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-arm64\.tar\.xz$/ {print $2}' \
    "$download_dir/SHASUMS256.txt")
  [[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-arm64\.tar\.xz$ ]] || {
    echo 'Could not identify the official Node ARM64 archive.' >&2; exit 1;
  }
  curl --fail --location --silent --show-error \
    "https://nodejs.org/dist/latest-v24.x/$archive" -o "$download_dir/$archive"
  (cd "$download_dir" && awk -v file="$archive" '$2 == file' SHASUMS256.txt | sha256sum --check)
  tar -xJf "$download_dir/$archive" --strip-components=1 -C "$node_dir"
  # Only the two files downloaded by this invocation are removed.
  rm -- "$download_dir/$archive" "$download_dir/SHASUMS256.txt"
  rmdir -- "$download_dir"
fi
export PATH="$node_dir/bin:$PATH"
node --input-type=module -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) process.exit(1);
'

if [[ ! -f "$config_file" ]]; then
  # Do not take over a manually configured database or rotate its password.
  existing=$(runuser -u postgres -- psql -XAt -v ON_ERROR_STOP=1 -d postgres \
    -c "SELECT count(*) FROM pg_roles WHERE rolname = 'hubby'")
  database=$(runuser -u postgres -- psql -XAt -v ON_ERROR_STOP=1 -d postgres \
    -c "SELECT count(*) FROM pg_database WHERE datname = 'hubby'")
  if [[ "$existing" != 0 || "$database" != 0 ]]; then
    echo "Existing hubby database/role found. Create $config_file with its DATABASE_URL, then rerun." >&2
    exit 1
  fi
  password=$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))')
  # Password is passed over stdin, not interpolated into a shell command or logged.
  runuser -u postgres -- psql -Xq -v ON_ERROR_STOP=1 -d postgres <<SQL
CREATE ROLE hubby LOGIN PASSWORD '$password';
SQL
  runuser -u postgres -- createdb --owner=hubby hubby
  cat > "$config_file" <<EOF
STORAGE=postgres
DATABASE_URL=postgres://hubby:$password@127.0.0.1:5432/hubby
HOST=127.0.0.1
PORT=3001
BACKUP_DIR=/var/lib/hubby/backups
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
EOF
  chown root:hubby "$config_file"
  chmod 0640 "$config_file"
fi

# Keep the old installation backed up before replacing application code.
if [[ -f "$app_dir/server/backup.js" ]]; then
  runuser -u hubby -- "$node_dir/bin/node" --env-file="$config_file" "$app_dir/server/backup.js"
fi
systemctl stop hubby.service 2>/dev/null || true
if [[ "$source_dir" != "$app_dir" ]]; then
  rsync -a --exclude='.git' --exclude='.env*' --exclude='node_modules' \
    --exclude='dist' --exclude='.tmp' --exclude='backups' "$source_dir/" "$app_dir/"
fi
chown -R hubby:hubby "$app_dir"
runuser -u hubby -- env PATH="$PATH" bash -c 'cd /opt/hubby/app && npm ci && npm run build'
runuser -u hubby -- "$node_dir/bin/node" --env-file="$config_file" "$app_dir/server/migrate.js"

cat > /etc/systemd/system/hubby.service <<EOF
[Unit]
Description=Hubby kitchen hub
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=simple
User=hubby
WorkingDirectory=$app_dir
EnvironmentFile=$config_file
ExecStart=$node_dir/bin/node $app_dir/server/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/hubby-backup.service <<EOF
[Unit]
Description=Back up Hubby household database
After=postgresql.service

[Service]
Type=oneshot
User=hubby
EnvironmentFile=$config_file
ExecStart=$node_dir/bin/node $app_dir/server/backup.js
EOF
cat > /etc/systemd/system/hubby-backup.timer <<EOF
[Unit]
Description=Daily Hubby backup

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now hubby.service hubby-backup.timer

install -m 0755 "$app_dir/scripts/open-hubby.sh" /opt/hubby/open-hubby
desktop_user=${SUDO_USER:-}
if [[ -n "$desktop_user" && "$desktop_user" != root ]]; then
  desktop_home=$(getent passwd "$desktop_user" | cut -d: -f6)
  desktop_group=$(id -gn "$desktop_user")
  runuser -u "$desktop_user" -- mkdir -p \
    "$desktop_home/.local/share/applications" "$desktop_home/.config/labwc"
  cat > "$desktop_home/.local/share/applications/hubby.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Hubby
Comment=Your household hub
Exec=/opt/hubby/open-hubby
Terminal=false
Categories=Utility;
EOF
  autostart="$desktop_home/.config/labwc/autostart"
  touch "$autostart"
  if ! grep -Fxq '/opt/hubby/open-hubby &' "$autostart"; then
    printf '\n/opt/hubby/open-hubby &\n' >> "$autostart"
  fi
  chown "$desktop_user:$desktop_group" "$autostart" \
    "$desktop_home/.local/share/applications/hubby.desktop"
fi

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:3001/api/health >/dev/null; then
    echo 'Hubby is ready: http://127.0.0.1:3001'
    echo "Configuration: $config_file"
    echo 'Database backups: /var/lib/hubby/backups'
    echo 'Desktop launcher: Hubby in the applications menu (or /opt/hubby/open-hubby).'
    echo 'Labwc desktop autostart is configured for the user who invoked sudo.'
    exit 0
  fi
  sleep 1
done
echo 'Service did not become ready. Check: sudo journalctl -u hubby -n 50' >&2
exit 1
