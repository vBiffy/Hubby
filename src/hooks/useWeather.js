import { useCallback, useEffect, useRef, useState } from 'react';

// Weather failure stays separate from notes/calendar/database availability.
export function useWeather(repository) {
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const active = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const forecast = await repository.request('weather');
      if (active.current) {
        setWeather(forecast);
        setError('');
      }
    } catch (err) {
      // Retain the last result but label a failed update rather than hiding it.
      if (active.current) setError(err.message);
    } finally {
      if (active.current) setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    active.current = true;
    refresh();
    const timer = setInterval(refresh, 10 * 60 * 1000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  return { weather, error, loading, onRefresh: refresh };
}
