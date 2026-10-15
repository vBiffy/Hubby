import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access, unlink, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { initializeDatabase } from '../server/database.js';

// An isolated development cluster uses the already-installed PostgreSQL tools.
// It never changes the existing Windows PostgreSQL service, users or databases.
const folder = resolve('.local');
const settingsFile = join(folder, 'postgres-local.json');
const action = process.argv[2] || 'setup';
const exists = async (path) =>
  access(path)
    .then(() => true)
    .catch(() => false);
function command(bin, name, args, allowStopped = false) {
  const result = spawnSync(join(bin, `${name}.exe`), args, {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 60000,
    // The background server must not inherit pipes that keep this helper waiting.
    stdio: name === 'pg_ctl' && args[0] === 'start' ? 'ignore' : 'pipe',
  });
  if (allowStopped && result.status === 3) return false;
  if (result.error || result.status !== 0) {
    throw new Error(`${name} failed: ${result.stderr?.trim() || 'Check .local/postgres.log.'}`);
  }
  return true;
}
async function start(settings) {
  if (command(settings.bin, 'pg_ctl', ['status', '-D', settings.data], true)) return;
  command(settings.bin, 'pg_ctl', [
    'start',
    '-w',
    '-t',
    '30',
    '-D',
    settings.data,
    '-l',
    join(folder, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${settings.port}`,
  ]);
}

if (
  action === 'start-if-configured' &&
  (process.env.HUBBY_LOCAL_POSTGRES !== '1' || process.env.STORAGE === 'memory')
) {
  process.exit(0);
}
try {
  if (process.platform !== 'win32')
    throw new Error('Use the Pi installer on Linux; this helper is for Windows development.');
  await mkdir(folder, { recursive: true });
  let settings;
  if (await exists(settingsFile)) settings = JSON.parse(await readFile(settingsFile, 'utf8'));
  else {
    if (action !== 'setup') throw new Error('Run npm run db:local:setup first.');
    settings = {
      bin: process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin',
      data: join(folder, 'postgres-data'),
      port: 5433,
      password: randomBytes(24).toString('hex'),
    };
    if (!(await exists(join(settings.bin, 'initdb.exe'))))
      throw new Error('Set PG_BIN to your installed PostgreSQL bin folder.');
    await writeFile(settingsFile, JSON.stringify(settings), { mode: 0o600, flag: 'wx' });
  }
  if (action === 'stop') {
    command(settings.bin, 'pg_ctl', ['stop', '-w', '-D', settings.data, '-m', 'fast']);
    console.log('Local Hubby PostgreSQL stopped.');
    process.exit(0);
  }
  if (action === 'setup' && !(await exists(join(settings.data, 'PG_VERSION')))) {
    const passwordFile = join(folder, 'postgres-init-password');
    await writeFile(passwordFile, settings.password, { mode: 0o600 });
    try {
      command(settings.bin, 'initdb', [
        '-D',
        settings.data,
        '-U',
        'hubby',
        '--auth=scram-sha-256',
        '--pwfile',
        passwordFile,
        '--encoding=UTF8',
        '--locale=C',
      ]);
    } finally {
      await unlink(passwordFile).catch(() => {});
    }
  }
  await start(settings);
  if (action !== 'setup') {
    console.log('Local Hubby PostgreSQL is running on port 5433.');
    process.exit(0);
  }
  const base = `postgres://hubby:${settings.password}@127.0.0.1:${settings.port}`;
  const admin = new pg.Pool({ connectionString: `${base}/postgres` });
  try {
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname = 'hubby'")).rowCount) {
      await admin.query('CREATE DATABASE hubby');
    }
  } finally {
    await admin.end();
  }
  const pool = new pg.Pool({ connectionString: `${base}/hubby` });
  try {
    await initializeDatabase(pool);
    // A captured demo snapshot is imported once, without overwriting saved rows.
    if (
      (await exists(join(folder, 'memory-snapshot.json'))) &&
      !(await exists(join(folder, 'memory-imported')))
    ) {
      const snapshot = JSON.parse(await readFile(join(folder, 'memory-snapshot.json'), 'utf8'));
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const kind of [
          'members',
          'notes',
          'events',
          'groceries',
          'chores',
          'quickReminders',
        ]) {
          for (const item of snapshot[kind] || [])
            await client.query(
              'INSERT INTO hub_items (id,kind,payload,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
              [item.id, kind, item, item.updatedAt],
            );
        }
        await client.query('COMMIT');
        await writeFile(join(folder, 'memory-imported'), new Date().toISOString());
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
  const envFile = resolve('.env');
  if ((await exists(envFile)) && !(await exists(join(folder, 'env-before-postgres')))) {
    await copyFile(envFile, join(folder, 'env-before-postgres'));
  }
  let text = (await exists(envFile)) ? await readFile(envFile, 'utf8') : '';
  for (const [key, value] of Object.entries({
    STORAGE: 'postgres',
    DATABASE_URL: `${base}/hubby`,
    HUBBY_LOCAL_POSTGRES: '1',
    PG_DUMP_PATH: join(settings.bin, 'pg_dump.exe'),
    BACKUP_DIR: join(folder, 'backups'),
  })) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text)
      ? text.replace(pattern, () => `${key}=${value}`)
      : `${text.trimEnd()}\n${key}=${value}\n`;
  }
  await writeFile(envFile, text);
  console.log(
    'Local Hubby database and tables are ready. .env now selects PostgreSQL on port 5433.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
