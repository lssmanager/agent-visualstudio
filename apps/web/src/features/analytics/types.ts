export const ANALYTICS_WINDOWS = [
  '1H',
  '4H',
  '6H',
  '8H',
  '12H',
  '24H',
  '3D',
  '7D',
  '15D',
  '1M',
  '2M',
  '3M',
  '1Y',
] as const;

export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];
export type AnalyticsGranularity = '5M' | '15M' | '1H' | '6H' | '1D' | '1W';
export type AnalyticsState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'runtime_offline'
  | 'runtime_degraded'
  | 'unsupported_for_scope'
  | 'planned_not_operational';

export const ANALYTICS_STATE_LABELS: Record<AnalyticsState, string> = {
  ready: 'Ready',
  loading: 'Loading',
  empty: 'No data',
  runtime_offline: 'Runtime offline',
  runtime_degraded: 'Runtime degraded',
  unsupported_for_scope: 'Unsupported for scope',
  planned_not_operational: 'Planned - not operational',
};
