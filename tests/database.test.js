import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeDatabase, databaseErrorMessage } from '../server/database.js';

function database({ failSchema = false } = {}) {
  const calls = [];
  const versions = new Set();
  let released = 0;
  let staged;
  const client = {
    async query(sql, parameters = []) {
      calls.push(sql);
      if (sql === 'BEGIN') staged = new Set(versions);
      if (sql.startsWith('SELECT version'))
        return { rowCount: versions.has(parameters[0]) ? 1 : 0 };
      if (sql.includes('CREATE TABLE IF NOT EXISTS hub_items') && failSchema)
        throw new Error('Schema error');
      if (sql.startsWith('INSERT INTO hub_schema_migrations')) staged.add(parameters[0]);
      if (sql === 'COMMIT') {
        for (const version of staged) versions.add(version);
      }
      return { rowCount: 0 };
    },
    release() {
      released++;
    },
  };
  return {
    pool: { connect: async () => client },
    calls,
    versions,
    get released() {
      return released;
    },
  };
}

test('startup initializes a fresh schema atomically and skips unchanged schema on restart', async () => {
  const db = database();
  assert.deepEqual(await initializeDatabase(db.pool), { applied: true });
  assert.equal(db.calls[0], 'BEGIN');
  assert.match(db.calls[1], /pg_advisory_xact_lock/);
  assert.equal(db.calls.at(-1), 'COMMIT');
  assert.equal(db.versions.size, 1);
  const queries = db.calls.length;
  assert.deepEqual(await initializeDatabase(db.pool), { applied: false });
  assert.equal(
    db.calls.slice(queries).some((sql) => sql.includes('ALTER TABLE hub_items')),
    false,
  );
  assert.equal(db.released, 2);
});

test('a failed schema initialization rolls back and releases the connection', async () => {
  const db = database({ failSchema: true });
  await assert.rejects(initializeDatabase(db.pool), /Schema error/);
  assert.equal(db.calls.at(-1), 'ROLLBACK');
  assert.equal(db.versions.size, 0);
  assert.equal(db.released, 1);
});

test('database diagnostics explain credential, connection and missing-database errors without secrets', () => {
  for (const code of ['28P01', 'ECONNREFUSED', '3D000', 'unknown']) {
    const message = databaseErrorMessage({ code, message: 'postgres://user:SECRET@host/database' });
    assert.doesNotMatch(message, /SECRET|postgres:\/\//);
  }
  assert.match(databaseErrorMessage({ code: '28P01' }), /credentials/);
});
