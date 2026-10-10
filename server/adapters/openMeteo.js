// Outbound adapter: provider-specific field names never reach React components.
// Fahrenheit, mph, and the Lansing timezone are explicit instead of OS defaults.
export function createOpenMeteo(fetchWeather = fetch) {
  return {
    async getToday(location) {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone,
        temperature_unit: 'fahrenheit',
        wind_speed_unit: 'mph',
        forecast_days: '7',
        current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        hourly:
          'temperature_2m,apparent_temperature,weather_code,precipitation_probability,wind_speed_10m',
      });

      const response = await fetchWeather(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Weather provider request failed.');
      const { current, daily, hourly } = await response.json();
      const result = {
        day: daily?.time?.[0],
        temperature: current?.temperature_2m,
        feelsLike: current?.apparent_temperature,
        code: current?.weather_code,
        wind: current?.wind_speed_10m,
        high: daily?.temperature_2m_max?.[0],
        low: daily?.temperature_2m_min?.[0],
        precipitationChance: daily?.precipitation_probability_max?.[0],
      };

      // Missing provider values must not become misleading 0°F readings.
      const numbers = Object.entries(result).filter(([key]) => key !== 'day');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(result.day || '')) throw new Error('Missing forecast date.');
      if (numbers.some(([, value]) => !Number.isFinite(value))) {
        throw new Error('Incomplete weather response.');
      }
      // Normalize provider arrays at the boundary. Never turn a missing value into zero.
      function rows(source, fields) {
        if (!Array.isArray(source?.time) || !source.time.length) {
          throw new Error('Missing forecast timeline.');
        }
        return source.time.map((time, index) => {
          const row = { time };
          for (const [name, field] of Object.entries(fields)) {
            const value = source[field]?.[index];
            if (!Number.isFinite(value)) throw new Error('Incomplete forecast timeline.');
            row[name] = value;
          }
          return row;
        });
      }
      result.daily = rows(daily, {
        code: 'weather_code',
        high: 'temperature_2m_max',
        low: 'temperature_2m_min',
        precipitationChance: 'precipitation_probability_max',
      }).map(({ time, ...values }) => ({ day: time, ...values }));
      if (
        result.daily.length !== 7 ||
        result.daily.some((entry) => !/^\d{4}-\d{2}-\d{2}$/.test(entry.day))
      )
        throw new Error('Incomplete weekly forecast.');
      // These strings are Lansing wall times, not UTC or the device's timezone.
      result.hourly = rows(hourly, {
        temperature: 'temperature_2m',
        feelsLike: 'apparent_temperature',
        code: 'weather_code',
        precipitationChance: 'precipitation_probability',
        wind: 'wind_speed_10m',
      }).filter((entry) => entry.time?.startsWith(`${result.day}T`));
      if (
        !result.hourly.length ||
        result.hourly.some((entry) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(entry.time))
      ) {
        throw new Error('Missing hourly forecast for today.');
      }
      return result;
    },
  };
}
