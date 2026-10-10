import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeather, lansing, WeatherUnavailableError } from '../server/domain/weather.js';
import { createOpenMeteo } from '../server/adapters/openMeteo.js';
import { createApp } from '../server/http.js';
import { createHub } from '../server/domain/hub.js';
import { createMemoryRepository } from '../server/adapters/memory.js';

const forecast = {
  day: '2026-10-08',
  temperature: 60,
  feelsLike: 58,
  code: 2,
  high: 65,
  low: 45,
  wind: 8,
  precipitationChance: 20,
};

test('weather adapter requests Lansing units/timezone and normalizes provider data', async () => {
  const provider = createOpenMeteo(async (url, options) => {
    assert.equal(url.searchParams.get('latitude'), String(lansing.latitude));
    assert.equal(url.searchParams.get('longitude'), String(lansing.longitude));
    assert.equal(url.searchParams.get('timezone'), 'America/Detroit');
    assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
    assert.equal(url.searchParams.get('forecast_days'), '7');
    assert.match(url.searchParams.get('hourly'), /precipitation_probability/);
    assert.ok(options.signal);
    return {
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 60,
          apparent_temperature: 58,
          weather_code: 2,
          wind_speed_10m: 8,
        },
        daily: {
          time: Array.from(
            { length: 7 },
            (_, index) => `2026-10-${8 + index < 10 ? '0' : ''}${8 + index}`,
          ),
          weather_code: Array(7).fill(2),
          temperature_2m_max: Array(7).fill(65),
          temperature_2m_min: Array(7).fill(45),
          precipitation_probability_max: Array(7).fill(20),
        },
        hourly: {
          time: Array.from(
            { length: 48 },
            (_, index) =>
              `2026-10-${index < 24 ? '08' : '09'}T${String(index % 24).padStart(2, '0')}:00`,
          ),
          temperature_2m: Array(48).fill(60),
          apparent_temperature: Array(48).fill(58),
          weather_code: Array(48).fill(2),
          precipitation_probability: Array(48).fill(20),
          wind_speed_10m: Array(48).fill(8),
        },
      }),
    };
  });
  const { daily, hourly, ...today } = await provider.getToday(lansing);
  assert.deepEqual(today, forecast);
  assert.equal(daily.length, 7);
  assert.equal(daily[6].day, '2026-10-14');
  assert.equal(hourly.length, 24);
  assert.equal(hourly[0].time, '2026-10-08T00:00');
  assert.equal(hourly[23].time, '2026-10-08T23:00');
  assert.equal(hourly[0].temperature, 60);
});

test('weather adapter rejects incomplete data and upstream errors', async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => ({}) }]) {
    const provider = createOpenMeteo(async () => response);
    await assert.rejects(provider.getToday(lansing));
  }
});

test('weather cache coalesces requests and refreshes after expiry and local midnight', async () => {
  let time = Date.parse('2026-10-08T23:55:00-04:00');
  let calls = 0;
  const weather = createWeather(
    {
      getToday: async (location) => {
        assert.deepEqual(location, lansing);
        calls++;
        return { ...forecast, day: calls < 2 ? '2026-10-08' : '2026-10-09' };
      },
    },
    () => time,
  );
  const results = await Promise.all([weather.today(), weather.today()]);
  assert.equal(calls, 1);
  assert.equal(results[0].location, 'Lansing, MI');
  await weather.today();
  assert.equal(calls, 1);
  time += 6 * 60 * 1000;
  await weather.today();
  assert.equal(calls, 2);
  time += 11 * 60 * 1000;
  await weather.today();
  assert.equal(calls, 3);
});

test('weather failures are retryable and do not return an unlabeled old forecast', async () => {
  let fail = true;
  const weather = createWeather({
    getToday: async () => {
      if (fail) throw new Error('Network down');
      return forecast;
    },
  });
  await assert.rejects(weather.today(), WeatherUnavailableError);
  fail = false;
  assert.equal((await weather.today()).temperature, 60);
});

test('weather HTTP route bypasses records and reports provider failures as 503', async (t) => {
  let fail = false;
  const service = {
    today: async () => {
      if (fail) throw new WeatherUnavailableError('Weather unavailable.');
      return forecast;
    },
  };
  const app = createApp(createHub(createMemoryRepository()), 'memory', async () => {}, service);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const response = await fetch(`${base}/weather`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), forecast);
  fail = true;
  assert.equal((await fetch(`${base}/weather`)).status, 503);
  assert.equal((await fetch(`${base}/notes`)).status, 200);
});
