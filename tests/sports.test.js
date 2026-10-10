import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEspn, normalizeGame, normalizeApPoll } from '../server/adapters/espn.js';
import { createSports, SportsUnavailableError } from '../server/domain/sports.js';
import { sportsLeagues, sortUpcoming, sportsDay, sportsCalendarEvents } from '../shared/sports.js';
import { planStyle } from '../shared/calendar.js';
import { dueReminders } from '../shared/reminders.js';
import { applyApRanks } from '../shared/sports.js';
import { ValidationError, createHub } from '../server/domain/hub.js';
import { createMemoryRepository } from '../server/adapters/memory.js';
import { createApp } from '../server/http.js';

const raw = {
  id: 'game',
  date: '2026-10-10T19:00Z',
  competitions: [
    {
      timeValid: false,
      status: { type: { state: 'in', shortDetail: 'Q2 4:00', completed: false } },
      competitors: [
        { team: { id: '1', displayName: 'Home' }, homeAway: 'home', score: { displayValue: '14' } },
        { team: { id: '2', displayName: 'Away' }, homeAway: 'away', score: '7' },
      ],
    },
  ],
};
const game = normalizeGame(raw);

test('game lines attach only to the favored team without inventing missing odds', () => {
  const withOdds = (odds) =>
    normalizeGame({ ...raw, competitions: [{ ...raw.competitions[0], odds: [odds] }] });
  const away = withOdds({ spread: 7.5, awayTeamOdds: { favorite: true } });
  assert.equal(away.teams[0].spread, -7.5);
  assert.equal(away.teams[1].spread, null);
  const home = withOdds({ spread: -3, homeTeamOdds: { favorite: true } });
  assert.equal(home.teams[1].spread, -3);
  assert.equal(home.teams[0].spread, null);
  assert.equal(game.teams[0].spread, null);
  assert.equal(withOdds({ spread: null, awayTeamOdds: { favorite: true } }).teams[0].spread, null);
});

test('ESPN adapter exposes AP fetching to the sports service, not to game records', async () => {
  const urls = [];
  const adapter = createEspn(async (input) => {
    const url = String(input);
    urls.push(url);
    return {
      ok: true,
      json: async () =>
        url.endsWith('/rankings')
          ? {
              rankings: [
                {
                  id: '1',
                  name: 'AP Top 25',
                  date: '2026-10-04T07:00Z',
                  ranks: [
                    { current: 7, previous: 9, team: { id: '1', location: 'Home', name: 'Team' } },
                  ],
                },
              ],
            }
          : { events: [raw] },
    };
  });
  assert.equal(typeof adapter.rankings, 'function');
  assert.equal(Object.hasOwn(game, 'rankings'), false);
  const service = createSports(adapter, () => Date.parse('2026-10-09T12:00Z'));
  const result = await service.games('ncaaf');
  assert.equal(result.apPoll.teams[0].rank, 7);
  assert.equal(result.games[0].teams.find((team) => team.id === '1').apRank, 7);
  assert.equal(urls.filter((url) => url.endsWith('/rankings')).length, 1);
});

test('only AP ranks decorate current games and calendar titles, with stale and final safeguards', () => {
  const now = Date.parse('2026-10-09T12:00Z');
  const poll = normalizeApPoll({
    rankings: [
      { id: '2', name: 'Coaches Poll', date: '2026-10-04', ranks: [] },
      {
        id: '1',
        name: 'AP Top 25',
        date: '2026-10-04T07:00Z',
        ranks: [
          {
            current: 7,
            previous: 9,
            points: 900,
            team: { id: '1', location: 'Home', name: 'Team' },
          },
          { current: 26, team: { id: '2' } },
        ],
      },
    ],
  });
  assert.equal(poll.teams.length, 1);
  const ranked = applyApRanks([game], poll, now);
  assert.equal(ranked[0].teams.find((team) => team.id === '1').apRank, 7);
  assert.match(sportsCalendarEvents('ncaaf', ranked, [], ['1'])[0].title, /#7 Home/);
  assert.equal(applyApRanks([{ ...game, state: 'post' }], poll, now)[0].teams[1].apRank, null);
  assert.equal(
    applyApRanks([game], { ...poll, publishedAt: '2026-04-07' }, now)[0].teams[1].apRank,
    null,
  );
  assert.equal(normalizeApPoll({ rankings: [{ id: '2', name: 'Coaches Poll' }] }), null);
  assert.throws(() => normalizeApPoll({ rankings: [{ id: '1', name: 'AP Top 25' }] }));
});

test('AP poll failure does not prevent college games loading', async () => {
  const service = createSports({
    games: async () => [game],
    rankings: async () => {
      throw new Error('Poll unavailable');
    },
  });
  const result = await service.games('ncaaf');
  assert.equal(result.games.length, 1);
  assert.equal(result.apPoll, null);
  assert.match(result.warning, /AP rankings are unavailable/);
});

test('sports calendar entries are stable, silent, colored and removed with disabled selection', () => {
  const teams = [
    { id: '1', name: 'Home', color: '#112233' },
    { id: '2', name: 'Away', color: '#445566' },
  ];
  const events = sportsCalendarEvents('nfl', [game], teams, ['1']);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'espn:nfl:game');
  assert.equal(events[0].reminderMinutes, null);
  assert.equal(planStyle(events[0], []).backgroundColor, '#112233');
  assert.equal(dueReminders(events, {}, Date.parse(game.startsAt)).length, 0);
  assert.equal(sportsCalendarEvents('nfl', [game], teams, []).length, 0);
  const shared = sportsCalendarEvents('nfl', [game], teams, ['1', '2']);
  assert.equal(shared.length, 1);
  assert.match(planStyle(shared[0], []).backgroundImage, /135deg/);
});

test('sports grouping uses Lansing dates across UTC midnight', () => {
  assert.equal(sportsDay({ ...game, startsAt: '2026-10-10T02:00Z' }), '2026-10-09');
  assert.equal(sportsDay({ ...game, startsAt: '2026-10-10T06:00Z' }), '2026-10-10');
});

test('ESPN scoreboards and schedules normalize score objects, home/away, and TBD times', () => {
  assert.equal(game.teams[0].id, '2');
  assert.equal(game.teams[1].score, '14');
  assert.equal(game.status, 'Q2 4:00');
  assert.equal(game.timeTbd, true);
  assert.equal(normalizeGame({ id: 'broken' }), null);
  assert.equal(
    normalizeGame({
      ...raw,
      competitions: [
        {
          ...raw.competitions[0],
          status: { type: { state: 'in', completed: true, shortDetail: 'Final' } },
        },
      ],
    }).state,
    'post',
  );
});

test('upcoming dates stay chronological and favorites lead only within the same day', () => {
  const early = { ...game, id: 'early', startsAt: '2026-10-10T12:00Z', teams: [{ id: '9' }] };
  const favorite = { ...game, id: 'favorite', startsAt: '2026-10-20T12:00Z' };
  assert.deepEqual(
    sortUpcoming([early, favorite], ['1']).map((item) => item.id),
    ['early', 'favorite'],
  );
  const sameDay = { ...favorite, startsAt: '2026-10-10T21:00Z' };
  assert.deepEqual(
    sortUpcoming([early, sameDay], ['1']).map((item) => item.id),
    ['favorite', 'early'],
  );
  assert.deepEqual(
    sortUpcoming([favorite, early], []).map((item) => item.id),
    ['early', 'favorite'],
  );
});

test('FBS team directory filters the general ESPN catalog by actual season membership', async () => {
  const provider = createEspn(async (url) => ({
    ok: true,
    json: async () =>
      String(url).includes('sports.core')
        ? {
            count: 1,
            items: [{ $ref: 'http://sports.core.api.espn.com/v2/seasons/2026/teams/1?lang=en' }],
          }
        : {
            sports: [
              {
                leagues: [
                  {
                    teams: [
                      { team: { id: '1', displayName: 'FBS' } },
                      { team: { id: '2', displayName: 'FCS' } },
                    ],
                  },
                ],
              },
            ],
          },
  }));
  assert.deepEqual(await provider.teams(sportsLeagues[0], Date.parse('2026-10-09T12:00Z')), [
    { id: '1', name: 'FBS', color: null },
  ]);
});

test('scoreboard requests use individual dates and league groups and deduplicate games', async () => {
  const dates = [];
  const provider = createEspn(async (input) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get('groups'), '80');
    assert.equal(url.searchParams.get('limit'), '100');
    dates.push(url.searchParams.get('dates'));
    return { ok: true, json: async () => ({ events: [raw] }) };
  });
  assert.equal((await provider.games(sportsLeagues[0], ['2026-10-09', '2026-10-10'])).length, 1);
  assert.deepEqual(dates.sort(), ['20261009', '20261010']);
});

test('sports cache coalesces, extends favorite schedules, reuses scoreboards and refreshes', async () => {
  let now = Date.parse('2026-10-09T12:00Z');
  let calls = 0;
  const service = createSports(
    {
      teams: async () => [{ id: '1', name: 'Home' }],
      games: async (league, days) => {
        calls++;
        assert.equal(days.length, 18);
        assert.equal(days[0], '2026-10-06');
        return [game];
      },
      schedule: async () => [
        { ...game, state: 'pre', id: 'future', startsAt: '2026-11-10T12:00Z' },
      ],
    },
    () => now,
  );
  await Promise.all([service.games('nfl'), service.games('nfl')]);
  assert.equal(calls, 1);
  const result = await service.games('nfl', ['1']);
  assert.equal(result.games.length, 2);
  assert.equal(calls, 1);
  now += 61000;
  await service.games('nfl');
  assert.equal(calls, 2);
  await assert.rejects(service.games('nba'), ValidationError);
  await assert.rejects(service.games('nfl', ['missing']), ValidationError);
  await assert.rejects(service.games('nfl', ['3']), ValidationError);
});

test('failed sports fetches are retryable and favorite schedule failures are labeled', async () => {
  let failed = true;
  const service = createSports({
    teams: async () => [{ id: '1' }],
    games: async () => {
      if (failed) throw new Error('Offline');
      return [];
    },
    schedule: async () => {
      throw new Error('Schedule down');
    },
  });
  await assert.rejects(service.games('nfl'), SportsUnavailableError);
  failed = false;
  assert.match((await service.games('nfl', ['1'])).warning, /could not be loaded/);
});

test('sports HTTP routes are isolated from stored modules and report provider failure', async (t) => {
  const app = createApp(createHub(createMemoryRepository()), 'memory', async () => {}, null, {
    teams: async () => [{ id: '1', name: 'Team' }],
    games: async () => {
      throw new SportsUnavailableError('Unavailable');
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  assert.equal((await fetch(`${base}/sports/nfl/teams`)).status, 200);
  assert.equal((await fetch(`${base}/sports/nfl/games`)).status, 503);
  assert.equal((await fetch(`${base}/sports/nfl/unknown`)).status, 400);
  assert.equal((await fetch(`${base}/notes`)).status, 200);
});
