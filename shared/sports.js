// League identifiers are shared; provider URLs remain inside the ESPN adapter.
export const sportsLeagues = [
  { id: 'ncaaf', name: 'FBS College Football', path: 'football/college-football', group: '80' },
  { id: 'nfl', name: 'NFL', path: 'football/nfl' },
  { id: 'epl', name: 'English Premier League', path: 'soccer/eng.1' },
  { id: 'wnba', name: 'WNBA', path: 'basketball/wnba' },
  {
    id: 'ncaam',
    name: 'Men’s College Basketball',
    path: 'basketball/mens-college-basketball',
    group: '50',
  },
];

export function favoriteGame(game, favorites) {
  return game.teams.some((team) => favorites.includes(team.id));
}

export function sportsDay(game) {
  return new Date(game.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Detroit' });
}

export function currentApPoll(poll, now) {
  const age = now - Date.parse(poll?.publishedAt);
  return Number.isFinite(age) && age >= -86400000 && age <= 14 * 86400000;
}

export function applyApRanks(games, poll, now) {
  const ranks = new Map(
    currentApPoll(poll, now) ? poll.teams.map((team) => [team.id, team.rank]) : [],
  );
  // Current polls do not describe historical results: omit badges on completed games.
  return games.map((game) => ({
    ...game,
    teams: game.teams.map((team) => ({
      ...team,
      apRank: game.state === 'post' ? null : ranks.get(team.id) || null,
    })),
  }));
}

// Source-managed calendar entries have stable identities across fetches and devices.
// They are projections, not copies in the household database, so schedule changes
// and removed favorites cannot leave duplicate or stale imported events behind.
export function sportsCalendarEvents(leagueId, games, teams, favorites) {
  return games
    .filter((game) => favoriteGame(game, favorites) && !/cancel/i.test(game.status || ''))
    .map((game) => {
      const favoriteTeams = game.teams.filter((team) => favorites.includes(team.id));
      const colors = favoriteTeams
        .map((team) => teams.find((item) => item.id === team.id)?.color || team.color)
        .filter((color) => /^#[0-9a-f]{6}$/i.test(color || ''));
      return {
        id: `espn:${leagueId}:${game.id}`,
        title: game.teams
          .map((team) => `${team.apRank ? `#${team.apRank} ` : ''}${team.name}`)
          .join(' at '),
        type: 'event',
        startsAt: game.startsAt,
        endsAt: null,
        allDay: game.timeTbd,
        reminderMinutes: null,
        done: false,
        repeat: 'none',
        memberId: null,
        memberIds: [],
        location: game.venue || '',
        sportsSource: 'ESPN',
        sportsColors: colors,
        sportsLeague: leagueId,
        sportsStatus: game.status,
        favoriteTeamIds: favoriteTeams.map((team) => team.id),
        favoriteTeamNames: favoriteTeams.map((team) => team.name),
        sportsTimeTbd: game.timeTbd,
      };
    });
}

export function sortUpcoming(games, favorites) {
  return [...games].sort(
    (a, b) =>
      sportsDay(a).localeCompare(sportsDay(b)) ||
      Number(favoriteGame(b, favorites)) - Number(favoriteGame(a, favorites)) ||
      Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
}

// Include cross-conference matchups when either participant belongs to the filter.
export function conferenceGames(games, conference) {
  if (!conference) return games;
  const ids = new Set(conference.teamIds);
  return games.filter((game) => game.teams.some((team) => ids.has(team.id)));
}

// Use poll membership rather than badges: completed games intentionally omit
// current-rank badges, but still belong in the selected Top 25 game list.
export function filterSportsGames(games, filter, poll, now) {
  if (filter !== 'top25') return conferenceGames(games, filter);
  if (!currentApPoll(poll, now)) return [];
  const ids = new Set(
    (poll.teams || [])
      .filter((team) => Number.isInteger(team.rank) && team.rank >= 1 && team.rank <= 25)
      .map((team) => team.id),
  );
  return games.filter((game) => game.teams.some((team) => ids.has(team.id)));
}
