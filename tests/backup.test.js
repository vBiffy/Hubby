import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupDatabase } from '../server/backup.js';

test('database backup hides credentials, rotates only completed app backups and cleans failed dumps', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'hubby-backup-test-'));
  const previous = 'hubby-2020-01-01T00-00-00-000Z-11111111-1111-1111-1111-111111111111.dump';
  try {
    await writeFile(join(folder, previous), 'old');
    await writeFile(join(folder, 'family-photo.txt'), 'keep');
    const output = await backupDatabase({
      connectionString: 'postgres://hubby:secret%21@127.0.0.1:5432/hubby',
      directory: folder,
      keep: 1,
      run: async (command, args, env) => {
        assert.equal(command, 'pg_dump');
        assert.equal(env.PGPASSWORD, 'secret!');
        assert.equal(env.PGDATABASE, 'hubby');
        assert.doesNotMatch(args.join(' '), /secret/);
        await writeFile(args.at(-1), 'snapshot');
      },
    });
    assert.equal(await readFile(output, 'utf8'), 'snapshot');
    assert.deepEqual(
      (await readdir(folder)).sort(),
      ['family-photo.txt', output.split(/[\\/]/).at(-1)].sort(),
    );
    await assert.rejects(
      backupDatabase({
        connectionString: 'postgres://hubby:secret@localhost/hubby',
        directory: folder,
        run: async () => {
          throw new Error('secret');
        },
      }),
      /Backup failed/,
    );
    assert.equal(
      (await readdir(folder)).some((name) => name.endsWith('.partial')),
      false,
    );
    assert.equal(await readFile(join(folder, 'family-photo.txt'), 'utf8'), 'keep');
  } finally {
    // Delete only files created in this test's fresh directory; no recursive deletion.
    for (const file of await readdir(folder)) await unlink(join(folder, file));
    await rmdir(folder);
  }
});
