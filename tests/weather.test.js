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
    assert.equal(url.searchParams.get('forecast_days'), '1');
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
          time: ['2026-10-08'],
          temperature_2m_max: [65],
          temperature_2m_min: [45],
          precipitation_probability_max: [20],
        },
      }),
    };
  });
  assert.deepEqual(await provider.getToday(lansing), forecast);
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
