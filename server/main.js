import { createChores } from './domain/chores.js';
import { createQuickReminders } from './domain/quickReminders.js';
import { createGroceryText } from './domain/groceryText.js';
import { createTelegram } from './adapters/telegram.js';
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
const hub = createHub(repo);
const telegram = createTelegram();
const chores = createChores(repo, telegram);
const quickReminders = createQuickReminders(repo, {
  household: telegram,
});
// Local scheduler checks stored deadlines; it does not poll Telegram for messages.
const reminderTimer = setInterval(
  () =>
    Promise.all([quickReminders.tick(), chores.tick()]).catch(() =>
      console.warn('Reminder scheduler unavailable; checking again shortly.'),
    ),
  5000,
);
Promise.all([quickReminders.tick(), chores.tick()]).catch(() =>
  console.warn('Reminder scheduler unavailable.'),
);
const weather = createWeather(createOpenMeteo());
const server = createApp(
  hub,
  storage,
  async () => {
    if (pool) await pool.query('SELECT 1');
  },
  weather,
  createSports(createEspn()),
  createGroceryText(hub, telegram),
  quickReminders,
  chores,
).listen(process.env.PORT || 3001, process.env.HOST || '127.0.0.1', () =>
  console.log('Hubby API ready on port', process.env.PORT || 3001),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearInterval(reminderTimer);
    server.close(async () => {
      await pool?.end();
      process.exit(0);
    });
  });
