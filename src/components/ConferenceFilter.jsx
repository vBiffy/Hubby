import { useSports } from '../hooks/useSports.js';
import { Select } from './Select.jsx';

// Carry the loaded conference membership with the selection; changing leagues
// remounts this control so membership cannot leak into another sport.
export function ConferenceFilter({ repository, league, value, onChange }) {
  const { data, loading, error, refresh } = useSports(repository, league, 'conferences');
  return (
    <div>
      <label>
        Game filter
        <Select
          value={value === 'top25' ? 'top25' : value?.id || 'all'}
          onChange={(event) =>
            onChange(
              event.target.value === 'top25'
                ? 'top25'
                : data?.find((item) => item.id === event.target.value) || null,
            )
          }
        >
          <option value="all">All games</option>
          <option value="top25">AP Top 25</option>
          {(data || []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </label>
      {loading && <small role="status">Loading conferences...</small>}
      {error && (
        <small role="alert">
          Conferences unavailable. <button onClick={refresh}>Retry</button>
        </small>
      )}
    </div>
  );
}
