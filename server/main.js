import pg from 'pg';
import { createHub } from './domain/hub.js';
import { createMemoryRepository } from './adapters/memory.js';
import { createPostgresRepository } from './adapters/postgres.js';
import { createApp } from './http.js';
import { createWeather } from './domain/weather.js';
import { createOpenMeteo } from './adapters/openMeteo.js';
import { createSports } from './domain/sports.js';
import { createEspn } from './adapters/espn.js';

// Composition root: the only place that chooses concrete backend adapters.
const storage = process.env.STORAGE || 'postgres';
if (!['postgres', 'memory'].includes(storage))
  throw new Error('STORAGE must be postgres or memory.');
if (storage === 'postgres' && !process.env.DATABASE_URL)
  throw new Error('Set DATABASE_URL or use STORAGE=memory for a temporary demo.');
const pool =
  storage === 'postgres' ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
if (pool) await pool.query('SELECT 1 FROM hub_items LIMIT 1');
else console.warn('Memory demo: changes will be lost on restart.');
const repo = pool ? createPostgresRepository(pool) : createMemoryRepository();
const weather = createWeather(createOpenMeteo());
const server = createApp(
  createHub(repo),
  storage,
  async () => {
    if (pool) await pool.query('SELECT 1');
  },
  weather,
  createSports(createEspn()),
).listen(process.env.PORT || 3001, process.env.HOST || '127.0.0.1', () =>
  console.log('Hubby API ready on port', process.env.PORT || 3001),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await pool?.end();
      process.exit(0);
    }),
  );
