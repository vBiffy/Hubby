import { useEffect, useState } from 'react';
import { sportsLeagues, sportsCalendarEvents } from '../../shared/sports.js';

export function useSportsCalendar(repository, favorites = {}) {
  const [forecasts, setForecasts] = useState({});
  const [error, setError] = useState('');
  const key = JSON.stringify(
    sportsLeagues.map((league) => [league.id, favorites[league.id] || []]),
  );
  useEffect(() => {
    let active = true;
    const selections = JSON.parse(key).filter(([, ids]) => ids.length);
    async function refresh() {
      const results = await Promise.allSettled(
        selections.map(async ([league, ids]) => {
          const [data, teams] = await Promise.all([
            repository.request(
              `sports/${league}/games?favorites=${encodeURIComponent(ids.join(','))}`,
            ),
            repository.request(`sports/${league}/teams`),
          ]);
          return [league, { games: data.games, teams }];
        }),
      );
      if (!active) return;
      setForecasts((previous) => ({
        ...previous,
        ...Object.fromEntries(
          results.filter((result) => result.status === 'fulfilled').map((result) => result.value),
        ),
      }));
      setError(
        results.some((result) => result.status === 'rejected')
          ? 'Some sports calendar updates are unavailable. Showing the last loaded games.'
          : '',
      );
    }
    refresh();
    const timer = setInterval(refresh, 5 * 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [repository, key]);
  const events = sportsLeagues.flatMap((league) =>
    forecasts[league.id]
      ? sportsCalendarEvents(
          league.id,
          forecasts[league.id].games,
          forecasts[league.id].teams,
          favorites[league.id] || [],
        )
      : [],
  );
  return { events, error };
}
