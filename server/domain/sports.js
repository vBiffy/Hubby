import { sportsLeagues, applyApRanks } from '../../shared/sports.js';
import { ValidationError } from './hub.js';

export class SportsUnavailableError extends Error {}

export function createSports(provider, now = () => Date.now()) {
  const cached = new Map();
  const pending = new Map();
  function leagueFor(id) {
    const league = sportsLeagues.find((item) => item.id === id);
    if (!league) throw new ValidationError('Choose a supported sports league.');
    return league;
  }
  async function load(key, lifetime, action) {
    const entry = cached.get(key);
    if (entry && entry.expires > now()) return entry.value;
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      try {
        const value = await action();
        cached.set(key, { value, expires: now() + lifetime });
        return value;
      } catch {
        throw new SportsUnavailableError('ESPN sports unavailable. Please try again shortly.');
      } finally {
        pending.delete(key);
      }
    })();
    pending.set(key, request);
    return request;
  }
  async function teams(id) {
    const league = leagueFor(id);
    return load(`teams:${id}`, 6 * 60 * 60 * 1000, () => provider.teams(league, now()));
  }
  async function rankings(id) {
    const league = leagueFor(id);
    if (!['ncaaf', 'ncaam'].includes(id) || !provider.rankings) return null;
    return load(`rankings:${id}`, 60 * 60000, () => provider.rankings(league));
  }
  return {
    teams,
    async games(id, favorites = []) {
      const league = leagueFor(id);
      if (
        !Array.isArray(favorites) ||
        favorites.length > 20 ||
        favorites.some((value) => !/^\d+$/.test(value))
      ) {
        throw new ValidationError('Select up to 20 valid favorite teams per league.');
      }
      const ids = [...new Set(favorites)].sort();
      if (ids.length) {
        const directory = await teams(id);
        if (ids.some((value) => !directory.some((team) => team.id === value))) {
          throw new ValidationError('Choose teams from this league.');
        }
      }
      const today = new Date(now()).toLocaleDateString('en-CA', { timeZone: 'America/Detroit' });
      return load(`games:${id}:${today}:${ids.join(',')}`, 60000, async () => {
        const days = Array.from({ length: 18 }, (_, index) => {
          const date = new Date(`${today}T12:00:00Z`);
          date.setUTCDate(date.getUTCDate() + index - 3);
          return date.toISOString().slice(0, 10);
        });
        const games = await load(`scoreboard:${id}:${today}`, 60000, () =>
          provider.games(league, days),
        );
        // Favorite schedules extend beyond the two-week scoreboard window.
        const schedules = await Promise.allSettled(
          ids.map((team) =>
            load(`schedule:${id}:${team}`, 5 * 60000, () => provider.schedule(league, team)),
          ),
        );
        const extended = schedules.flatMap((result) =>
          result.status === 'fulfilled'
            ? result.value.filter(
                (game) => game.state === 'pre' && Date.parse(game.startsAt) >= now(),
              )
            : [],
        );
        const unique = [
          ...new Map([...extended, ...games].map((game) => [game.id, game])).values(),
        ];
        let apPoll = null;
        let pollWarning = '';
        try {
          apPoll = await rankings(id);
        } catch {
          pollWarning = 'AP rankings are unavailable; games and scores are still shown.';
        }
        return {
          games: applyApRanks(unique, apPoll, now()),
          apPoll,
          fetchedAt: new Date(now()).toISOString(),
          from: days[0],
          through: days.at(-1),
          warning: [
            schedules.some((result) => result.status === 'rejected')
              ? 'Some favorite schedules could not be loaded. Showing available scoreboards.'
              : '',
            pollWarning,
          ]
            .filter(Boolean)
            .join(' '),
        };
      });
    },
  };
}
