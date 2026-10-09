// WMO condition codes are defined by the provider documentation.
function conditions(code) {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([56, 57, 66, 67].includes(code)) return 'Freezing precipitation';
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return 'Conditions unavailable';
}

const degrees = (value) => `${Math.round(value)}°F`;

// The header and full tab share one forecast; this feature owns no fetching.
export function WeatherSummary({ weather, error, loading }) {
  return (
    <a href="#weather" className="weather-summary" aria-label="Open Lansing weather">
      <span className="picker-caption">LANSING, MI</span>
      {weather ? (
        <>
          <strong>{degrees(weather.temperature)}</strong>
          <span>{conditions(weather.code)}</span>
          {error && <small>Update unavailable</small>}
        </>
      ) : (
        <span>{loading ? 'Loading weather…' : 'Weather unavailable'}</span>
      )}
    </a>
  );
}

export function Weather({ weather, error, loading, onRefresh }) {
  return (
    <section className="panel weather-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">TODAY IN LANSING, MICHIGAN</p>
          <h2>Your local weather</h2>
        </div>
        <button disabled={loading} onClick={onRefresh}>
          {loading ? 'Updating…' : 'Refresh'}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!weather && (
        <p className="empty">
          {loading
            ? 'Checking today’s forecast…'
            : 'Connect to the internet and refresh to check the weather.'}
        </p>
      )}
      {weather && (
        <>
          <div className="weather-current">
            <strong>{degrees(weather.temperature)}</strong>
            <div>
              <h3>{conditions(weather.code)}</h3>
              <p>Feels like {degrees(weather.feelsLike)}</p>
              <p>
                {new Date(`${weather.day}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
          <dl className="weather-details">
            {[
              ['High', degrees(weather.high)],
              ['Low', degrees(weather.low)],
              ['Chance of precipitation', `${weather.precipitationChance}%`],
              ['Wind', `${Math.round(weather.wind)} mph`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">
            Last fetched{' '}
            {new Date(weather.fetchedAt).toLocaleTimeString(undefined, {
              timeZone: 'America/Detroit',
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            (Lansing time).
          </p>
        </>
      )}
      <p className="hint">
        Weather data by{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        . Updates automatically every 10 minutes.
      </p>
    </section>
  );
}
