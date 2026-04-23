import { useEffect, useMemo, useState } from 'react';

import type { CanonicalNodeLevel } from '../../../lib/types';
import type { AnalyticsGranularity, AnalyticsState, AnalyticsWindow } from '../types';

interface UseAnalyticsMetricArgs<T> {
  level: CanonicalNodeLevel;
  id: string;
  window: AnalyticsWindow;
  granularity?: AnalyticsGranularity;
  fetcher: (level: CanonicalNodeLevel, id: string, window: AnalyticsWindow, granularity?: AnalyticsGranularity) => Promise<T>;
  getState?: (payload: T) => AnalyticsState | undefined;
}

interface UseAnalyticsMetricResult<T> {
  data: T | null;
  state: AnalyticsState;
  error: string | null;
}

export function useAnalyticsMetric<T>({
  level,
  id,
  window,
  granularity,
  fetcher,
  getState,
}: UseAnalyticsMetricArgs<T>): UseAnalyticsMetricResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<AnalyticsState>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError(null);

    fetcher(level, id, window, granularity)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        setState(getState?.(payload) ?? 'ready');
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
        setState('runtime_degraded');
      });

    return () => {
      cancelled = true;
    };
  }, [fetcher, getState, granularity, id, level, window]);

  return useMemo(
    () => ({
      data,
      state,
      error,
    }),
    [data, error, state],
  );
}
