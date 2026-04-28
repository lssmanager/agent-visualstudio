/**
 * dashboard-api.ts
 * Cliente tipado para los endpoints de Fases 4-5.
 * Usa el mismo baseUrl que api.ts (import.meta.env.VITE_API_URL o /api).
 */

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface KpisResponse {
  period: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number;
  successRateDelta: number;
  costUsd: number;
  tokens: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  activeAgents: number;
}

export interface RunsBucket {
  ts: string;
  total: number;
  completed: number;
  failed: number;
}
export interface RunsTimelineResponse {
  window: string;
  bucket: string;
  buckets: RunsBucket[];
}

export interface TokensBucket {
  ts: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
export interface TokensTimelineResponse {
  window: string;
  bucket: string;
  totals: { inputTokens: number; outputTokens: number; costUsd: number };
  buckets: TokensBucket[];
}

export interface PolicyStatus {
  id: string;
  name: string;
  scope: string;
  limitUsd: number;
  spentUsd: number;
  utilizationPct: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
}
export interface BudgetStatusResponse {
  spent24hUsd: number;
  spentWeekUsd: number;
  policies: PolicyStatus[];
}

export interface ModelEntry {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  sharePct: number;
}
export interface ModelMixResponse {
  window: string;
  totalCostUsd: number;
  models: ModelEntry[];
}

export interface LatencyGroup {
  key: string;
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
}
export interface LatencyResponse {
  window: string;
  groupBy: string;
  overall: { p50Ms: number; p95Ms: number; p99Ms: number; meanMs: number };
  groups: LatencyGroup[];
}

// ── API calls ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  getKpis: () => get<KpisResponse>('/dashboard/metrics/kpis'),

  getRunsTimeline: (window = '7d', bucket = '1h') =>
    get<RunsTimelineResponse>('/dashboard/metrics/runs', { window, bucket }),

  getTokensTimeline: (window = '7d', bucket = '1h') =>
    get<TokensTimelineResponse>('/dashboard/metrics/tokens', { window, bucket }),

  getBudgetStatus: () => get<BudgetStatusResponse>('/dashboard/metrics/budget'),

  getModelMix: (window = '7d') =>
    get<ModelMixResponse>('/dashboard/metrics/model-mix', { window }),

  getLatency: (window = '7d', groupBy = 'flow') =>
    get<LatencyResponse>('/dashboard/metrics/latency', { window, groupBy }),

  patchPolicy: (id: string, body: Partial<{ limitUsd: number; enabled: boolean; onExceedAction: string }>) =>
    patch(`/dashboard/operations/policies/${id}`, body),
};
