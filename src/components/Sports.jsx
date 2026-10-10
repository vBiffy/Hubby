import { useState } from 'react';
import { sportsLeagues, sortUpcoming, favoriteGame, sportsDay } from '../../shared/sports.js';
import { useSports } from '../hooks/useSports.js';
import { ApRankings } from './ApRankings.jsx';
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

export function Sports({ repository, favorites = {} }) {
  const [league, setLeague] = useState('ncaaf');
  const [pickedDay, setPickedDay] = useState(null);
  const [view, setView] = useState('games');
  const college = ['ncaaf', 'ncaam'].includes(league);
  const selected = favorites[league] || [];
  const { data, loading, error, refresh } = useSports(repository, league, 'games', selected);
  const games = data?.games || [];
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
          <p className="eyebrow">GAME DAY, TOGETHER</p>
          <h2>Games & scores</h2>
        </div>
        <button disabled={loading} onClick={refresh}>
          {loading ? 'Updating…' : 'Refresh'}
        </button>
      </div>
      <div className="sports-leagues" role="group" aria-label="Sports league">
        {sportsLeagues.map((item) => (
          <button
            key={item.id}
            aria-pressed={league === item.id}
            onClick={() => {
              setLeague(item.id);
              setPickedDay(null);
              setView('games');
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      {college && (
        <div className="sports-view-toggle" role="group" aria-label="College sports view">
          <button aria-pressed={view === 'games'} onClick={() => setView('games')}>
            Games
          </button>
          <button aria-pressed={view === 'rankings'} onClick={() => setView('rankings')}>
            AP Top 25
          </button>
        </div>
      )}
      <p className="hint">
        Favorites come first within each day. Choose yours in <a href="#settings">Customize</a>.
        Game times use Lansing time.
      </p>
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
      {data && view === 'rankings' && (
        <div className="sports-results" tabIndex={0} role="region" aria-label="AP rankings">
          <ApRankings poll={data.apPoll} favorites={selected} />
        </div>
      )}
      {data && view === 'games' && (
        <>
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
          <div
            className="sports-results"
            key={`${league}:${activeDay}`}
            tabIndex={0}
            role="region"
            aria-label={`Games and scores for ${activeDay}`}
          >
            {data.apPoll && currentApPoll(data.apPoll, Date.now()) && (
              <p className="hint">
                Badges use the current AP poll, published{' '}
                {new Date(data.apPoll.publishedAt).toLocaleDateString(undefined, {
                  timeZone: 'America/Detroit',
                  month: 'short',
                  day: 'numeric',
                })}
                .
              </p>
            )}
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
    </section>
  );
}
