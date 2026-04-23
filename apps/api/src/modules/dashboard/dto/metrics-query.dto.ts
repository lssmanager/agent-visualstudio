import type { CanonicalNodeLevel } from '../../../../../../packages/core-types/src';

export const SUPPORTED_METRIC_WINDOWS = [
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

export const SUPPORTED_METRIC_GRANULARITY = ['5M', '15M', '1H', '6H', '1D', '1W'] as const;

const SCOPE_LEVELS: CanonicalNodeLevel[] = ['agency', 'department', 'workspace', 'agent', 'subagent'];
const WINDOW_NORMALIZATION: Record<string, (typeof SUPPORTED_METRIC_WINDOWS)[number]> = {
  '1h': '1H',
  '4h': '4H',
  '6h': '6H',
  '8h': '8H',
  '12h': '12H',
  '24h': '24H',
  '3d': '3D',
  '7d': '7D',
  '15d': '15D',
  '1m': '1M',
  '2m': '2M',
  '3m': '3M',
  '1y': '1Y',
};

export type SupportedMetricWindow = (typeof SUPPORTED_METRIC_WINDOWS)[number];
export type SupportedMetricGranularity = (typeof SUPPORTED_METRIC_GRANULARITY)[number];

export interface MetricsQueryDto {
  level: CanonicalNodeLevel;
  id: string;
  window: SupportedMetricWindow;
  granularity?: SupportedMetricGranularity;
}

export interface MetricsQueryValidationError {
  field: 'level' | 'id' | 'window' | 'granularity';
  reason: string;
  value: unknown;
}

export interface MetricsQueryValidationResult {
  ok: boolean;
  value?: MetricsQueryDto;
  warnings: string[];
  errors: MetricsQueryValidationError[];
}

export function validateMetricsQuery(
  query: Record<string, unknown>,
  options?: {
    requireGranularity?: boolean;
    allowGranularity?: boolean;
  },
): MetricsQueryValidationResult {
  const warnings: string[] = [];
  const errors: MetricsQueryValidationError[] = [];

  const level = typeof query.level === 'string' ? query.level : '';
  const id = typeof query.id === 'string' ? query.id.trim() : '';
  const rawWindow = typeof query.window === 'string' ? query.window.trim() : '';
  const rawGranularity = typeof query.granularity === 'string' ? query.granularity.trim() : '';
  const allowGranularity = options?.allowGranularity ?? true;
  const requireGranularity = options?.requireGranularity ?? false;

  if (!SCOPE_LEVELS.includes(level as CanonicalNodeLevel)) {
    errors.push({
      field: 'level',
      reason: `Must be one of: ${SCOPE_LEVELS.join(', ')}`,
      value: query.level,
    });
  }

  if (!id) {
    errors.push({
      field: 'id',
      reason: 'Scope id is required',
      value: query.id,
    });
  }

  if (!rawWindow) {
    errors.push({
      field: 'window',
      reason: `Window is required and must be one of: ${SUPPORTED_METRIC_WINDOWS.join(', ')}`,
      value: query.window,
    });
  }

  const normalizedWindow =
    (WINDOW_NORMALIZATION[rawWindow.toLowerCase()] ??
      (SUPPORTED_METRIC_WINDOWS.includes(rawWindow as SupportedMetricWindow) ? (rawWindow as SupportedMetricWindow) : undefined));

  if (rawWindow && !normalizedWindow) {
    errors.push({
      field: 'window',
      reason: `Unsupported window. Allowed values: ${SUPPORTED_METRIC_WINDOWS.join(', ')}`,
      value: query.window,
    });
  }

  if (normalizedWindow && rawWindow !== normalizedWindow) {
    warnings.push(`window '${rawWindow}' normalized to '${normalizedWindow}'`);
  }

  if (!allowGranularity && rawGranularity) {
    errors.push({
      field: 'granularity',
      reason: 'Granularity is not supported for this endpoint',
      value: query.granularity,
    });
  }

  if (allowGranularity && rawGranularity && !SUPPORTED_METRIC_GRANULARITY.includes(rawGranularity as SupportedMetricGranularity)) {
    errors.push({
      field: 'granularity',
      reason: `Unsupported granularity. Allowed values: ${SUPPORTED_METRIC_GRANULARITY.join(', ')}`,
      value: query.granularity,
    });
  }

  if (requireGranularity && !rawGranularity) {
    errors.push({
      field: 'granularity',
      reason: 'Granularity is required for this endpoint',
      value: query.granularity,
    });
  }

  if (errors.length > 0 || !normalizedWindow) {
    return { ok: false, errors, warnings };
  }

  return {
    ok: true,
    warnings,
    errors: [],
    value: {
      level: level as CanonicalNodeLevel,
      id,
      window: normalizedWindow,
      granularity: rawGranularity ? (rawGranularity as SupportedMetricGranularity) : undefined,
    },
  };
}
