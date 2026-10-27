import { ConferenceFilter } from './ConferenceFilter.jsx';
import { filterSportsGames } from '../../shared/sports.js';
import { SportsCalendar } from './SportsCalendar.jsx';
import { useState } from 'react';
import { sportsLeagues, sortUpcoming, favoriteGame, sportsDay } from '../../shared/sports.js';
import { useSports } from '../hooks/useSports.js';
import { Select } from './Select.jsx';
import { currentApPoll } from '../../shared/sports.js';

export function Game({ game, favorites }) {
  return (
    <article className={`sports-game ${favoriteGame(game, favorites) ? 'favorite-game' : ''}`}>
      <div className="sports-game-heading">
        <span className={game.state === 'in' ? 'sports-live' : 'hint'}>
          {game.state === 'in'
            ? `LIVE · ${game.status}`
            : game.state === 'post'
              ? game.status
              : new Date(game.startsAt).toLocaleString(undefined, {
                  timeZone: 'America/Detroit',
                  month: 'short',
                  day: 'numeric',
                  ...(game.timeTbd ? {} : { hour: 'numeric', minute: '2-digit', hour12: true }),
                }) + (game.timeTbd ? ' · Time TBD' : '')}
        </span>
        {favoriteGame(game, favorites) && <span className="sports-favorite">Favorite</span>}
      </div>
      {game.teams.map((team) => (
        <div key={team.id} className="sports-team">
          <span className={team.winner ? 'sports-winner' : ''}>
            <span className="sports-team-name">
              {team.apRank && (
                <span className="ap-rank" aria-label={`AP rank ${team.apRank}`}>
                  #{team.apRank}
                </span>
              )}
              <span>{team.name}</span>
              {Number.isFinite(team.spread) && (
                <span
                  className="sports-spread"
                  aria-label={`Favored by ${Math.abs(team.spread)} points`}
                >
                  {team.spread}
                </span>
              )}
              {favorites.includes(team.id) && <span aria-label="Favorite team"> ★</span>}
            </span>
            <small>{team.homeAway === 'home' ? 'Home' : 'Away'}</small>
          </span>
          {game.state !== 'pre' && <strong>{team.score ?? '—'}</strong>}
        </div>
      ))}
      {game.state === 'pre' && (
        <small className="sports-game-meta">
          {[game.venue, game.broadcast].filter(Boolean).join(' · ')}
        </small>
      )}
    </article>
  );
}

export function Sports({
  repository,
  favorites = {},
  calendarItems = [],
  calendarError,
  weekStart = 0,
}) {
  const [league, setLeague] = useState('ncaaf');
  const [pickedDay, setPickedDay] = useState(null);
  const [conference, setConference] = useState(null);
  const [view, setView] = useState('games');
  const college = ['ncaaf', 'ncaam'].includes(league);
  const selected = favorites[league] || [];
  const { data, loading, error, refresh } = useSports(repository, league, 'games', selected);
  const games = filterSportsGames(
    data?.games || [],
    college ? conference : null,
    data?.apPoll,
    Date.now(),
  );
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Detroit' });
  const days = [...new Set([today, ...games.map(sportsDay)])].sort();
  // Default to today when games exist, otherwise the next scheduled day.
  const activeDay =
    pickedDay && days.includes(pickedDay)
      ? pickedDay
      : games.some((game) => sportsDay(game) === today)
        ? today
        : days.find((day) => day > today) || today;
  const upcoming = sortUpcoming(
    games.filter(
      (game) =>
        sportsDay(game) === activeDay &&
        game.state === 'pre' &&
        (Date.parse(game.startsAt) >= Date.now() ||
          (game.timeTbd &&
            new Date(game.startsAt).toLocaleDateString('en-CA', { timeZone: 'America/Detroit' }) >=
              today)),
    ),
    selected,
  );
  const scores = games
    .filter((game) => sportsDay(game) === activeDay && game.state !== 'pre')
    .sort(
      (a, b) =>
        Number(b.state === 'in') - Number(a.state === 'in') ||
        Number(favoriteGame(b, selected)) - Number(favoriteGame(a, selected)) ||
        Date.parse(b.startsAt) - Date.parse(a.startsAt),
    );
  return (
    <section className="panel sports-panel">
      <div className="panel-heading">
        <div>
          <h2>Games & scores</h2>
        </div>
        <div className="sports-header-actions">
          <button
            onClick={() => {
              window.location.hash = 'settings?section=sports';
            }}
          >
            Favorites
          </button>
          <button disabled={loading} onClick={refresh}>
            {loading ? 'Updating…' : 'Refresh'}
          </button>
        </div>
      </div>
      <div className="sports-controls">
        <label>
          View
          <Select value={view} onChange={(event) => setView(event.target.value)}>
            <option value="games">Games &amp; scores</option>
            <option value="calendar">Sports calendar</option>
          </Select>
        </label>
        {view === 'games' && (
          <>
            <label>
              League
              <Select
                value={league}
                onChange={(event) => {
                  setLeague(event.target.value);
                  setConference(null);
                  setPickedDay(null);
                }}
              >
                {sportsLeagues.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            {college && (
              <ConferenceFilter
                key={league}
                repository={repository}
                league={league}
                value={conference}
                onChange={(value) => {
                  setConference(value);
                  setPickedDay(null);
                }}
              />
            )}
          </>
        )}
      </div>
      {view === 'games' && (
        <div className="sports-day-picker" role="group" aria-label="Choose game day">
          {days.map((day) => (
            <button key={day} aria-pressed={activeDay === day} onClick={() => setPickedDay(day)}>
              {day === today
                ? 'Today'
                : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
            </button>
          ))}
        </div>
      )}
      {view === 'calendar' && (
        <div className="sports-results" tabIndex={0} role="region" aria-label="Sports calendar">
          <SportsCalendar items={calendarItems} error={calendarError} weekStart={weekStart} />
        </div>
      )}
      {view !== 'calendar' && (
        <>
          {error && (
            <p role="alert" className="error">
              {error}
              {data && ' Showing the last loaded scores.'}
            </p>
          )}
          {data?.warning && (
            <p role="status" className="hint">
              {data.warning}
            </p>
          )}
          {loading && !data && (
            <p role="status" className="empty">
              Loading games from ESPN…
            </p>
          )}
          {conference === 'top25' && data && !currentApPoll(data.apPoll, Date.now()) && (
            <p role="status" className="hint">
              No current AP poll is available. Choose All games or a conference to see games.
            </p>
          )}
          {data && view === 'games' && (
            <>
              <div
                className="sports-results"
                key={`${league}:${activeDay}:${conference?.id || conference || 'all'}`}
                tabIndex={0}
                role="region"
                aria-label={`Games and scores for ${activeDay}`}
              >
                <h3>
                  {new Date(`${activeDay}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <h3>Upcoming games</h3>
                <div className="sports-games">
                  {upcoming.map((game) => (
                    <Game key={game.id} game={game} favorites={selected} />
                  ))}
                </div>
                {!upcoming.length && (
                  <p className="empty">No upcoming games on this day. Choose another day above.</p>
                )}
                <h3>Live & recent scores</h3>
                <div className="sports-games">
                  {scores.map((game) => (
                    <Game key={game.id} game={game} favorites={selected} />
                  ))}
                </div>
                {!scores.length && <p className="empty">No live games or results on this day.</p>}
              </div>
              <p className="hint">
                Last updated{' '}
                {new Date(data.fetchedAt).toLocaleTimeString(undefined, {
                  timeZone: 'America/Detroit',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
                . Updates every minute while this tab is open.
              </p>
            </>
          )}
          <p className="hint">
            Scores and schedules from{' '}
            <a href="https://www.espn.com/" target="_blank" rel="noreferrer">
              ESPN
            </a>
            .
          </p>
        </>
      )}
    </section>
  );
}
