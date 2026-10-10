import { Select } from './Select.jsx';
import { useState } from 'react';
import { sportsLeagues } from '../../shared/sports.js';
import { useSports } from '../hooks/useSports.js';

export function SportsFavorites({
  repository,
  favorites = {},
  onChange,
  calendarTeams = {},
  onCalendarChange,
}) {
  const [league, setLeague] = useState('ncaaf');
  const [search, setSearch] = useState('');
  const { data: teams, loading, error, refresh } = useSports(repository, league, 'teams');
  const selected = favorites[league] || [];
  function toggle(id) {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    if (next.length <= 20) onChange({ ...favorites, [league]: next });
  }
  return (
    <section className="panel sports-settings">
      <h2>Your teams</h2>
      <p className="hint">
        Choose up to 20 teams per league. Their upcoming games appear first. Favorites are saved on
        this screen.
      </p>
      <label>
        League
        <Select
          value={league}
          onChange={(event) => {
            setLeague(event.target.value);
            setSearch('');
          }}
        >
          {sportsLeagues.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Find a team
        <input
          type="search"
          value={search}
          placeholder="Search team names"
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {loading && <p role="status">Loading teams…</p>}
      {error && (
        <>
          <p role="alert" className="error">
            {error}
          </p>
          <button onClick={refresh}>Retry</button>
        </>
      )}
      <p className="hint">{selected.length} / 20 selected</p>
      <div className="sports-team-picker">
        {(teams || [])
          .filter((team) => team.name.toLowerCase().includes(search.toLowerCase()))
          .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)))
          .map((team) => (
            <div className="sports-favorite-row" key={team.id}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={selected.includes(team.id)}
                  disabled={selected.length >= 20 && !selected.includes(team.id)}
                  onChange={() => toggle(team.id)}
                />
                {team.name}
              </label>
              {selected.includes(team.id) && onCalendarChange && (
                <label className="check sports-calendar-toggle">
                  <input
                    type="checkbox"
                    checked={(calendarTeams[league] || []).includes(team.id)}
                    onChange={(event) => {
                      const current = calendarTeams[league] || [];
                      const next = event.target.checked
                        ? [...new Set([...current, team.id])]
                        : current.filter((id) => id !== team.id);
                      onCalendarChange({ ...calendarTeams, [league]: next });
                    }}
                  />
                  Show {team.name} games on calendar
                </label>
              )}
            </div>
          ))}
      </div>
      {teams && !teams.some((team) => team.name.toLowerCase().includes(search.toLowerCase())) && (
        <p className="empty">No teams match this search.</p>
      )}
    </section>
  );
}
