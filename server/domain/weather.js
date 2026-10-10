export class WeatherUnavailableError extends Error {}

export const lansing = {
  name: 'Lansing, MI',
  latitude: 42.7325,
  longitude: -84.5555,
  timezone: 'America/Detroit',
};

// Provider port: getToday(location) returns current, seven-day and today's hourly weather.
// Cache and retry policy live here, independently of HTTP or the provider API.
export function createWeather(provider, now = () => Date.now()) {
  let cached;
  let expiresAt = 0;
  let pending;

  function localDay() {
    return new Date(now()).toLocaleDateString('en-CA', { timeZone: lansing.timezone });
  }

  return {
    async today() {
      if (cached && cached.day === localDay() && now() < expiresAt) return cached;
      if (pending) return pending;

      // Coalesce simultaneous requests from multiple kitchen screens.
      pending = (async () => {
        try {
          const forecast = await provider.getToday(lansing);
          cached = {
            ...forecast,
            location: lansing.name,
            fetchedAt: new Date(now()).toISOString(),
          };
          expiresAt = now() + 10 * 60 * 1000;
          return cached;
        } catch {
          throw new WeatherUnavailableError('Weather unavailable. Please try again shortly.');
        } finally {
          pending = undefined;
        }
      })();

      return pending;
    },
  };
}
