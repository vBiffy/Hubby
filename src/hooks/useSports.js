import { useCallback, useEffect, useRef, useState } from 'react';

// Fetch only while a sports screen is mounted, and discard replies for older selections.
export function useSports(repository, league, resource, favorites = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const favoriteKey = [...favorites].sort().join(',');
  const path = `sports/${league}/${resource}${
    resource === 'games' ? `?favorites=${encodeURIComponent(favoriteKey)}` : ''
  }`;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const result = await repository.request(path);
      if (request === generation.current) {
        setData(result);
        setError('');
      }
    } catch (error) {
      if (request === generation.current) setError(error.message);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [repository, path]);
  useEffect(() => {
    setData(null);
    setError('');
    refresh();
    const timer = resource === 'games' ? setInterval(refresh, 60000) : null;
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [refresh, resource]);
  return { data, error, loading, refresh };
}
