import { MessagingUnavailableError } from './domain/groceryText.js';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ValidationError, NotFoundError } from './domain/hub.js';
import { WeatherUnavailableError } from './domain/weather.js';
import { SportsUnavailableError } from './domain/sports.js';

function errorStatus(error) {
  if (error instanceof MessagingUnavailableError) return 503;
  if (error instanceof WeatherUnavailableError) return 503;
  if (error instanceof SportsUnavailableError) return 503;
  if (error.type === 'entity.too.large') return 413;
  if (error instanceof ValidationError || error.type === 'entity.parse.failed') return 400;
  if (error instanceof NotFoundError) return 404;

  return 500;
}

// Inbound adapter: translate HTTP requests into application use cases.
export function createApp(
  hub,
  storage,
  health = async () => {},
  weather,
  sports,
  groceryText,
  quickReminders,
  chores,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', async (req, res) => {
    await health();
    res.json({ status: 'ok', storage });
  });
  // Register before /:kind: weather is an integration, not a stored record.
  app.get('/api/weather', async (req, res) => {
    if (!weather) throw new WeatherUnavailableError('Weather is not configured.');
    res.set('Cache-Control', 'no-store').json(await weather.today());
  });
  app.get('/api/sports/:league/:resource', async (req, res) => {
    if (!sports) throw new SportsUnavailableError('Sports is not configured.');
    const { league, resource } = req.params;
    if (!['teams', 'games', 'conferences'].includes(resource))
      throw new ValidationError('Unknown sports resource.');
    const favorites =
      typeof req.query.favorites === 'string' ? req.query.favorites.split(',').filter(Boolean) : [];
    res
      .set('Cache-Control', 'no-store')
      .json(
        resource === 'teams'
          ? await sports.teams(league)
          : resource === 'conferences'
            ? await sports.conferences(league)
            : await sports.games(league, favorites),
      );
  });
  app.get('/api/groceries/text/configuration', (req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .json(groceryText?.configuration() || { configured: false });
  });
  app.post('/api/groceries/text', async (req, res) => {
    if (!groceryText) throw new MessagingUnavailableError('Telegram is not configured yet.');
    res
      .set('Cache-Control', 'no-store')
      .status(202)
      .json(await groceryText.send());
  });
  app.get('/api/quick-reminders', async (req, res) => {
    if (!quickReminders) throw new ValidationError('Quick reminders are not configured.');
    res.set('Cache-Control', 'no-store').json(await quickReminders.list());
  });
  app.post('/api/quick-reminders', async (req, res) => {
    if (!quickReminders) throw new ValidationError('Quick reminders are not configured.');
    res.status(201).json(await quickReminders.create(req.body));
  });
  app.delete('/api/quick-reminders/:id', async (req, res) => {
    if (!quickReminders) throw new ValidationError('Quick reminders are not configured.');
    await quickReminders.cancel(req.params.id);
    res.sendStatus(204);
  });
  // Chores have their own use cases; they never become calendar records.
  app.get('/api/chores/configuration', (req, res) =>
    res.json(chores?.configuration() || { configured: false }),
  );
  app.use('/api/chores', (req, res, next) => {
    if (!chores) throw new ValidationError('Chores are not configured.');
    next();
  });
  app.get('/api/chores', async (req, res) => res.json(await chores.list()));
  app.post('/api/chores', async (req, res) => res.status(201).json(await chores.save(req.body)));
  app.put('/api/chores/:id', async (req, res) =>
    res.json(await chores.save(req.body, req.params.id)),
  );
  app.put('/api/chores/:id/occurrences/:day', async (req, res) =>
    res.json(await chores.completeOccurrence(req.params.id, req.params.day, req.body?.done)),
  );
  app.delete('/api/chores/:id', async (req, res) => {
    await chores.remove(req.params.id);
    res.sendStatus(204);
  });
  app.get('/api/:kind', async (req, res) => res.json(await hub.list(req.params.kind)));
  app.post('/api/events/:id/restore', async (req, res) =>
    res.status(201).json(await hub.save('events', req.body, req.params.id, true)),
  );
  app.post('/api/:kind', async (req, res) =>
    res.status(201).json(await hub.save(req.params.kind, req.body)),
  );
  app.put('/api/:kind/:id', async (req, res) =>
    res.json(await hub.save(req.params.kind, req.body, req.params.id)),
  );
  app.delete('/api/:kind/:id', async (req, res) => {
    await hub.remove(req.params.kind, req.params.id);
    res.sendStatus(204);
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));
  // A production build is served by the API, so a Pi needs only one process.
  const dist = resolve('dist');
  if (existsSync(dist)) app.use(express.static(dist));
  app.use((error, req, res, next) => {
    const status = errorStatus(error);
    if (status === 500) console.error(error);
    res
      .status(status)
      .json({ error: status === 500 ? 'Storage unavailable. Please try again.' : error.message });
  });
  return app;
}
