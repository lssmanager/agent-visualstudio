/**
 * useDashboard.ts
 * Hooks de datos para el dashboard analítico.
 * Cada hook gestiona loading / error / data y polling opcional.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dashboardApi,
  type KpisResponse,
  type RunsTimelineResponse,
  type TokensTimelineResponse,
  type BudgetStatusResponse,
  type ModelMixResponse,
  type LatencyResponse,
} from './dashboard-api';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  pollMs?: number,
): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err) => setState((s) => ({ ...s, loading: false, error: String(err) })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
    if (pollMs) {
      timerRef.current = setInterval(run, pollMs);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [run, pollMs]);

  return { ...state, refetch: run };
}

export function useKpis(pollMs?: number) {
  return useAsync<KpisResponse>(() => dashboardApi.getKpis(), [], pollMs);
}

export function useRunsTimeline(window = '7d', bucket = '1h') {
  return useAsync<RunsTimelineResponse>(
    () => dashboardApi.getRunsTimeline(window, bucket),
    [window, bucket],
  );
}

export function useTokensTimeline(window = '7d', bucket = '1h') {
  return useAsync<TokensTimelineResponse>(
    () => dashboardApi.getTokensTimeline(window, bucket),
    [window, bucket],
  );
}

export function useBudgetStatus(pollMs?: number) {
  return useAsync<BudgetStatusResponse>(() => dashboardApi.getBudgetStatus(), [], pollMs);
}

export function useModelMix(window = '7d') {
  return useAsync<ModelMixResponse>(() => dashboardApi.getModelMix(window), [window]);
}

export function useLatency(window = '7d', groupBy = 'flow') {
  return useAsync<LatencyResponse>(() => dashboardApi.getLatency(window, groupBy), [window, groupBy]);
}
