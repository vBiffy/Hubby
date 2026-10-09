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
        forecast_days: '1',
        current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      });

      const response = await fetchWeather(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Weather provider request failed.');
      const { current, daily } = await response.json();
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
      return result;
    },
  };
}
