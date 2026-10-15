import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// The database itself is provisioned by the installer. The app owns its tables
// and initializes/upgrades them before accepting requests or running schedulers.
export async function initializeDatabase(pool) {
  const sql = (await readFile(new URL('./schema.sql', import.meta.url), 'utf8')).replace(
    /\r\n/g,
    '\n',
  );
  const version = createHash('sha256').update(sql).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Two starting processes must not apply the same schema concurrently.
    await client.query('SELECT pg_advisory_xact_lock($1)', [48281923]);
    await client.query(`CREATE TABLE IF NOT EXISTS hub_schema_migrations (
      version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const existing = await client.query(
      'SELECT version FROM hub_schema_migrations WHERE version = $1',
      [version],
    );
    if (!existing.rowCount) {
      await client.query(sql);
      await client.query('INSERT INTO hub_schema_migrations (version) VALUES ($1)', [version]);
    }
    await client.query('COMMIT');
    return { applied: !existing.rowCount };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Connection errors should explain the fix without printing a connection URL
// or the pg client's configuration, which can contain credentials.
export function databaseErrorMessage(error) {
  if (error.code === '28P01' || error.code === '28000') {
    return 'PostgreSQL rejected the credentials. Check DATABASE_URL or run the Pi installer.';
  }
  if (error.code === '3D000') return 'The database does not exist yet. Run the Pi installer first.';
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) {
    return 'PostgreSQL is not reachable. Check that its service is running and DATABASE_URL is correct.';
  }
  return 'PostgreSQL initialization failed. Check database availability and schema permissions.';
}
