import { useId, useRef } from 'react';

// Native horizontal scrolling supports touch swipes; arrows also work with a mouse or keyboard.
function ForecastStrip({ title, children, className, hint }) {
  const track = useRef(null);
  const id = useId();
  function scroll(direction) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.current.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }
  return (
    <section className="weather-forecast" aria-labelledby={id}>
      <div className="forecast-heading">
        <div>
          <h3 id={id}>{title}</h3>
          <p className="hint">{hint}</p>
        </div>
        <div className="actions">
          <button type="button" aria-label={`Scroll ${title} backward`} onClick={() => scroll(-1)}>
            {'\u2039'}
          </button>
          <button type="button" aria-label={`Scroll ${title} forward`} onClick={() => scroll(1)}>
            {'\u203a'}
          </button>
        </div>
      </div>
      <div className={className} ref={track} tabIndex={0} role="region" aria-labelledby={id}>
        {children}
      </div>
    </section>
  );
}

function WeatherIcon({ code }) {
  const clear = code === 0 || code === 1;
  const wet = code >= 51;
  return (
    <svg
      className="weather-icon"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {clear ? (
        <>
          <circle cx="24" cy="24" r="9" />
          <path d="M24 4v5m0 30v5M4 24h5m30 0h5M10 10l4 4m20 20l4 4M10 38l4-4m20-20l4-4" />
        </>
      ) : (
        <>
          <path d="M12 33a8 8 0 1 1 2-16 11 11 0 0 1 21-1 9 9 0 0 1 1 17H12Z" />
          {wet && <path d="m16 38-2 5m12-5-2 5m12-5-2 5" />}
        </>
      )}
    </svg>
  );
}

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
          <p className="eyebrow">LANSING, MICHIGAN</p>
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
            <WeatherIcon code={weather.code} />
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
          <ForecastStrip
            title="The week ahead"
            className="weather-week"
            hint="Swipe through the next seven days."
          >
            {(weather.daily || []).map((day, index) => (
              <article key={day.day} className="weather-day">
                <h4 className="weather-day-date">
                  <span>
                    {index === 0
                      ? 'Today'
                      : new Date(`${day.day}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: 'short',
                        })}
                  </span>
                  <span>
                    {new Date(`${day.day}T12:00:00`).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </h4>
                <WeatherIcon code={day.code} />
                <p className="weather-condition">{conditions(day.code)}</p>
                <div className="weather-range">
                  <strong>{degrees(day.high)}</strong>{' '}
                  <span className="weather-low">/ {degrees(day.low)}</span>
                </div>
                <small>{day.precipitationChance}% chance of precipitation</small>
              </article>
            ))}
            {!weather.daily?.length && <p className="empty">Weekly forecast unavailable.</p>}
          </ForecastStrip>
          <ForecastStrip
            title="Today, hour by hour"
            className="weather-hours"
            hint="Swipe for more hours · Lansing time."
          >
            {(weather.hourly || []).map((hour, index) => {
              // Format the provider's wall-clock hour directly to avoid device timezone shifts.
              const hour24 = Number(hour.time.slice(11, 13));
              const label = `${hour24 % 12 || 12} ${hour24 >= 12 ? 'PM' : 'AM'}`;
              return (
                <article key={`${hour.time}:${index}`} className="weather-hour">
                  <h4>{label}</h4>
                  <WeatherIcon code={hour.code} />
                  <strong>{degrees(hour.temperature)}</strong>
                  <p className="weather-condition">{conditions(hour.code)}</p>
                  <small>Feels like {degrees(hour.feelsLike)}</small>
                  <small>{hour.precipitationChance}% precipitation</small>
                  <small>Wind {Math.round(hour.wind)} mph</small>
                </article>
              );
            })}
            {!weather.hourly?.length && <p className="empty">Hourly forecast unavailable.</p>}
          </ForecastStrip>
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
