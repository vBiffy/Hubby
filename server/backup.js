import { spawn } from 'node:child_process';
import { mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

function runDump(command, args, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { env, windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolveRun() : reject(new Error('Backup failed.'))));
  });
}

// pg_dump creates a consistent database snapshot while the app remains online.
// Pass credentials through its environment, never command arguments or logs.
export async function backupDatabase({
  connectionString,
  directory,
  keep = 14,
  command = 'pg_dump',
  run = runDump,
}) {
  if (!connectionString) throw new Error('Set DATABASE_URL before making a backup.');
  if (!Number.isInteger(keep) || keep < 1 || keep > 365) {
    throw new Error('BACKUP_KEEP must be a whole number from 1 to 365.');
  }
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Use a PostgreSQL URL.');
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGCONNECT_TIMEOUT: '15',
  };
  if (url.searchParams.has('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode');
  const folder = resolve(directory || 'backups');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const name = `hubby-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.dump`;
  const target = join(folder, name);
  const partial = `${target}.partial`;
  const handle = await open(partial, 'wx', 0o600);
  await handle.close();
  try {
    await run(command, ['--format=custom', '--no-owner', '--file', partial], env);
    await rename(partial, target);
  } catch {
    await unlink(partial).catch(() => {});
    throw new Error('Backup failed. Check PostgreSQL connectivity and that pg_dump is installed.');
  }
  // Rotate only this tool's completed files. No recursive delete, and no
  // pruning until a new snapshot has successfully finished.
  const snapshots = (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^hubby-[\dTZ-]+-[0-9a-f-]{36}\.dump$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const old of snapshots.slice(keep)) await unlink(join(folder, old));
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const file = await backupDatabase({
      connectionString: process.env.DATABASE_URL,
      directory: process.env.BACKUP_DIR,
      keep: Number(process.env.BACKUP_KEEP || 14),
      command: process.env.PG_DUMP_PATH || 'pg_dump',
    });
    console.log('Database backup saved:', file);
  } catch {
    console.error(
      'Database backup failed. Check DATABASE_URL, BACKUP_DIR and pg_dump availability.',
    );
    process.exitCode = 1;
  }
}
