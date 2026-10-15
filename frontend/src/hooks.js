import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads data and re-polls while the tab is visible. */
export function usePolling(load, intervalMs, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    reload();
    if (!intervalMs) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, intervalMs, ...deps]);

  return { data, error, reload, setData };
}
