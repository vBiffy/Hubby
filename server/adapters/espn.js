const site = 'https://site.api.espn.com/apis/site/v2/sports/';

export function normalizeApPoll(data) {
  // Never substitute Coaches/CFP rankings when the AP poll is missing.
  if (!Array.isArray(data.rankings)) throw new Error('Missing ESPN rankings.');
  const poll = data.rankings.find((item) => String(item.id) === '1' && /^AP\b/i.test(item.name));
  if (!poll) return null;
  if (!Array.isArray(poll.ranks) || !Number.isFinite(Date.parse(poll.date))) {
    throw new Error('Incomplete AP poll.');
  }
  return {
    name: 'AP Top 25',
    publishedAt: poll.date,
    teams: poll.ranks
      .filter(
        (item) =>
          Number.isInteger(item.current) &&
          item.current >= 1 &&
          item.current <= 25 &&
          item.team?.id,
      )
      .map((item) => ({
        id: String(item.team.id),
        rank: item.current,
        name:
          item.team.displayName || [item.team.location, item.team.name].filter(Boolean).join(' '),
        previous: Number.isInteger(item.previous) && item.previous > 0 ? item.previous : null,
        points: Number.isFinite(item.points) ? item.points : null,
      }))
      .sort((a, b) => a.rank - b.rank),
  };
}

// Normalize both scoreboard and team-schedule payloads behind the sports port.
export function normalizeGame(event) {
  const competition = event.competitions?.[0];
  const status = competition?.status || event.status;
  if (
    !event.id ||
    !Number.isFinite(Date.parse(event.date)) ||
    competition?.competitors?.length !== 2 ||
    !status?.type?.state
  )
    return null;
  // Use the favorite flags rather than the sign of ESPN's spread field, which
  // differs across payloads. Missing odds must never appear as a zero-point line.
  const odds = competition.odds?.find(
    (item) =>
      Number.isFinite(item?.spread) &&
      item.spread !== 0 &&
      (item.awayTeamOdds?.favorite || item.homeTeamOdds?.favorite),
  );
  const teams = competition.competitors
    .map((competitor) => {
      const score =
        typeof competitor.score === 'object'
          ? (competitor.score?.displayValue ?? competitor.score?.value)
          : competitor.score;
      return {
        id: String(competitor.team?.id || competitor.id),
        name: competitor.team?.displayName || competitor.team?.name || 'Team TBD',
        homeAway: competitor.homeAway,
        score: score == null ? null : String(score),
        winner: competitor.winner === true,
        spread:
          odds &&
          (competitor.homeAway === 'away'
            ? odds.awayTeamOdds?.favorite
            : odds.homeTeamOdds?.favorite)
            ? -Math.abs(odds.spread)
            : null,
        color: /^[0-9a-f]{6}$/i.test(competitor.team?.color || '')
          ? `#${competitor.team.color.toLowerCase()}`
          : null,
      };
    })
    .sort((a, b) => (a.homeAway === 'away' ? -1 : 1) - (b.homeAway === 'away' ? -1 : 1));
  return {
    id: String(event.id),
    startsAt: event.date,
    teams,
    state: status.type.completed ? 'post' : status.type.state,
    status: status.type.shortDetail || status.type.detail || status.type.description,
    timeTbd: competition.timeValid === false || event.timeValid === false,
    venue: competition.venue?.fullName || '',
    broadcast: (competition.broadcasts || []).flatMap((item) => item.names || []).join(', '),
  };
}

// Keep upstream concurrency modest when fetching individual calendar days.
async function mapLimited(values, action) {
  const result = new Array(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        result[index] = await action(values[index]);
      }
    }),
  );
  return result;
}

// Standings group conferences directly; divisions contribute to their parent conference.
export function normalizeConferences(data) {
  if (!Array.isArray(data.children)) throw new Error('Missing ESPN conferences.');
  function teamIds(group) {
    return [
      ...(group.standings?.entries || []).map((entry) => String(entry.team?.id || '')),
      ...(group.children || []).flatMap(teamIds),
    ].filter((id) => /^\d+$/.test(id));
  }
  const conferences = data.children
    .map((group) => ({
      id: String(group.id),
      name: group.name,
      teamIds: [...new Set(teamIds(group))],
    }))
    .filter(
      (group) => /^\d+$/.test(group.id) && typeof group.name === 'string' && group.teamIds.length,
    );
  if (!conferences.length) throw new Error('Incomplete ESPN conferences.');
  return conferences.sort((a, b) => a.name.localeCompare(b.name));
}

export function createEspn(fetchSports = fetch) {
  async function json(url) {
    const response = await fetchSports(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('ESPN request failed.');
    return response.json();
  }
  return {
    async conferences(league, now = Date.now()) {
      if (league.id === 'ncaam') {
        // Before November, standings have no team rows for the upcoming season.
        // The core season directory is complete, unlike the site groups endpoint
        // which silently returns only the first 25 conferences.
        const date = new Date(now);
        const year = date.getUTCFullYear() + (date.getUTCMonth() >= 6 ? 1 : 0);
        const base =
          'https://sports.core.api.espn.com/v2/sports/basketball/' +
          `leagues/mens-college-basketball/seasons/${year}/types/2/groups/`;
        const directory = await json(`${base}50/children?limit=1000`);
        if (!Array.isArray(directory.items) || directory.items.length !== directory.count) {
          throw new Error('Incomplete conference directory.');
        }
        const groups = await mapLimited(directory.items, async (entry) => {
          const id = entry.$ref?.match(/\/groups\/(\d+)/)?.[1];
          if (!id) throw new Error('Missing conference ID.');
          const [group, teams] = await Promise.all([
            json(`${base}${id}`),
            json(`${base}${id}/teams?limit=1000`),
          ]);
          if (!Array.isArray(teams.items) || teams.items.length !== teams.count) {
            throw new Error('Incomplete conference membership.');
          }
          return {
            id,
            name: group.name,
            standings: {
              entries: teams.items.map((team) => ({
                team: { id: team.$ref?.match(/\/teams\/(\d+)/)?.[1] },
              })),
            },
          };
        });
        return normalizeConferences({ children: groups });
      }
      return normalizeConferences(
        await json(`https://site.api.espn.com/apis/v2/sports/${league.path}/standings`),
      );
    },
    async rankings(league) {
      return normalizeApPoll(await json(`${site}${league.path}/rankings`));
    },
    async teams(league, now) {
      const data = await json(`${site}${league.path}/teams?limit=1000`);
      let teams = data.sports?.[0]?.leagues?.[0]?.teams;
      if (!Array.isArray(teams) || !teams.length) throw new Error('Missing ESPN teams.');
      if (league.id === 'ncaaf') {
        // The site teams endpoint ignores groups=80; use actual season FBS membership.
        const date = new Date(now);
        const year = date.getUTCFullYear() - (date.getUTCMonth() === 0 ? 1 : 0);
        const members = await json(
          'https://sports.core.api.espn.com/v2/sports/football/' +
            `leagues/college-football/seasons/${year}/types/2/groups/80/teams?limit=1000`,
        );
        if (!Array.isArray(members.items) || members.items.length !== members.count) {
          throw new Error('Incomplete FBS directory.');
        }
        const ids = new Set(
          members.items.map((item) => item.$ref?.match(/\/teams\/(\d+)/)?.[1]).filter(Boolean),
        );
        teams = teams.filter((item) => ids.has(String(item.team.id)));
      }
      return teams
        .filter((item) => item.team.isActive !== false && !item.team.isAllStar)
        .map(({ team }) => ({
          id: String(team.id),
          name: team.displayName,
          color: /^[0-9a-f]{6}$/i.test(team.color || '') ? `#${team.color.toLowerCase()}` : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async games(league, days) {
      const results = await mapLimited(days, async (day) => {
        const url = new URL(`${site}${league.path}/scoreboard`);
        url.search = new URLSearchParams({
          dates: day.replaceAll('-', ''),
          // ESPN silently falls back to 25 for an oversized scoreboard limit.
          // 100 includes the evening games on a full FBS Saturday.
          limit: '100',
          ...(league.group ? { groups: league.group } : {}),
        });
        const data = await json(url);
        if (!Array.isArray(data.events)) throw new Error('Missing ESPN scoreboard.');
        return data.events.map(normalizeGame).filter(Boolean);
      });
      return [...new Map(results.flat().map((game) => [game.id, game])).values()];
    },
    async schedule(league, teamId) {
      const data = await json(`${site}${league.path}/teams/${teamId}/schedule`);
      if (!Array.isArray(data.events)) throw new Error('Missing ESPN schedule.');
      return data.events.map(normalizeGame).filter(Boolean);
    },
  };
}
