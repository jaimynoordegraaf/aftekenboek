import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

type Result<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
  reload: () => Promise<void>;
  /** Apply a local change without waiting for a round trip. */
  patch: (next: T) => void;
};

/**
 * Load something, then reload it whenever the screen comes back into focus —
 * which is how an opkomst you just created appears in the list behind the
 * modal you closed.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Result<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Not every dependency is stable across renders; the caller lists what matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        const next = await run();
        if (alive.current) {
          setData(next);
          setError(null);
        }
      } catch (e) {
        if (alive.current) setError(e);
      } finally {
        if (alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [run],
  );

  useEffect(() => {
    setLoading(true);
    void load(false);
  }, [load]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void load(false);
    }, [load]),
  );

  return {
    data,
    loading,
    refreshing,
    error,
    reload: () => load(true),
    patch: setData,
  };
}
