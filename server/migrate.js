import pg from 'pg';
import { initializeDatabase, databaseErrorMessage } from './database.js';
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env first.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await initializeDatabase(pool);
  console.log('Database schema ready.');
} catch (error) {
  console.error(databaseErrorMessage(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
