import { currentApPoll } from '../../shared/sports.js';

export function ApRankings({ poll, favorites = [] }) {
  if (!poll?.teams?.length) return <p className="empty">No AP poll is available yet.</p>;
  const fresh = currentApPoll(poll, Date.now());
  return (
    <section aria-label="AP Top 25 rankings">
      <h3>AP Top 25</h3>
      <p className="hint">
        {fresh ? 'Published' : 'Older poll · published'}{' '}
        {new Date(poll.publishedAt).toLocaleDateString(undefined, {
          timeZone: 'America/Detroit',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
        .{!fresh && ' Older polls are not used for game badges.'}
      </p>
      <ol className="ap-rankings">
        {poll.teams.map((team) => (
          <li key={team.id} className={favorites.includes(team.id) ? 'ap-favorite' : ''}>
            <span className="ap-rank" aria-label={`AP rank ${team.rank}`}>
              #{team.rank}
            </span>
            <strong>
              {team.name}
              {favorites.includes(team.id) && ' ★'}
            </strong>
            <small>
              {team.previous === null
                ? 'New'
                : team.previous === team.rank
                  ? 'Unchanged'
                  : team.previous > team.rank
                    ? `Up ${team.previous - team.rank}`
                    : `Down ${team.rank - team.previous}`}
            </small>
          </li>
        ))}
      </ol>
    </section>
  );
}
