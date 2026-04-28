/**
 * DashboardQueryService
 * Capa de agregación pura sobre RunRepository + workspaceStore.
 * Sin efectos secundarios — solo lectura y cómputo.
 */
import type { RunSpec, RunStep } from '../../../../../packages/core-types/src';
import { RunRepository } from '../../../../../packages/run-engine/src';
import { workspaceStore, studioConfig } from '../../config';

const runRepo = new RunRepository(studioConfig.workspaceRoot);

// ─── helpers ────────────────────────────────────────────────────────────────

function allRuns(): RunSpec[] {
  return runRepo.findAll();
}

function allSteps(runs: RunSpec[]): RunStep[] {
  return runs.flatMap((r) => r.steps);
}

function filterByWindow(runs: RunSpec[], windowMs: number): RunSpec[] {
  const cutoff = Date.now() - windowMs;
  return runs.filter((r) => new Date(r.startedAt).getTime() >= cutoff);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// ─── Fase 4: Overview metrics ───────────────────────────────────────────────

export class DashboardQueryService {
  // GET /dashboard/metrics/kpis
  getKpis() {
    const runs = allRuns();
    const last24h = filterByWindow(runs, DAY);
    const prev24h = runs.filter((r) => {
      const t = new Date(r.startedAt).getTime();
      return t >= Date.now() - 2 * DAY && t < Date.now() - DAY;
    });

    const completed24h = last24h.filter((r) => r.status === 'completed').length;
    const failed24h = last24h.filter((r) => r.status === 'failed').length;
    const total24h = last24h.length;
    const prevTotal = prev24h.length;

    const steps24h = allSteps(last24h);
    const costUsd = steps24h.reduce((s, st) => s + (st.costUsd ?? 0), 0);
    const tokens = steps24h.reduce((s, st) => s + (st.tokenUsage?.input ?? 0) + (st.tokenUsage?.output ?? 0), 0);

    const successRate = total24h > 0 ? (completed24h / total24h) * 100 : 0;
    const prevSuccessRate =
      prevTotal > 0
        ? (prev24h.filter((r) => r.status === 'completed').length / prevTotal) * 100
        : 0;

    const latencies = last24h
      .filter((r) => r.completedAt)
      .map((r) => new Date(r.completedAt!).getTime() - new Date(r.startedAt).getTime());
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);

    return {
      period: '24h',
      totalRuns: total24h,
      completedRuns: completed24h,
      failedRuns: failed24h,
      successRate: round2(successRate),
      successRateDelta: round2(successRate - prevSuccessRate),
      costUsd: round4(costUsd),
      tokens,
      latencyP50Ms: p50,
      latencyP95Ms: p95,
      activeAgents: countActiveAgents(runs),
    };
  }

  // GET /dashboard/metrics/runs
  getRunsTimeline(query: { window?: string; bucket?: string }) {
    const windowMs = parseWindow(query.window ?? '7d');
    const bucketMs = parseBucket(query.bucket ?? '1h');
    const runs = filterByWindow(allRuns(), windowMs);

    const buckets = buildTimeBuckets(Date.now() - windowMs, Date.now(), bucketMs);

    for (const run of runs) {
      const t = new Date(run.startedAt).getTime();
      const idx = Math.floor((t - (Date.now() - windowMs)) / bucketMs);
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].total += 1;
        if (run.status === 'completed') buckets[idx].completed += 1;
        if (run.status === 'failed') buckets[idx].failed += 1;
      }
    }

    return { window: query.window ?? '7d', bucket: query.bucket ?? '1h', buckets };
  }

  // GET /dashboard/metrics/tokens
  getTokensTimeline(query: { window?: string; bucket?: string }) {
    const windowMs = parseWindow(query.window ?? '7d');
    const bucketMs = parseBucket(query.bucket ?? '1h');
    const runs = filterByWindow(allRuns(), windowMs);

    const buckets = buildTimeBuckets(Date.now() - windowMs, Date.now(), bucketMs).map((b) => ({
      ...b,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    }));

    for (const run of runs) {
      const t = new Date(run.startedAt).getTime();
      const idx = Math.floor((t - (Date.now() - windowMs)) / bucketMs);
      if (idx >= 0 && idx < buckets.length) {
        for (const step of run.steps) {
          buckets[idx].inputTokens += step.tokenUsage?.input ?? 0;
          buckets[idx].outputTokens += step.tokenUsage?.output ?? 0;
          buckets[idx].costUsd += step.costUsd ?? 0;
        }
      }
    }

    const totals = buckets.reduce(
      (acc, b) => ({
        inputTokens: acc.inputTokens + b.inputTokens,
        outputTokens: acc.outputTokens + b.outputTokens,
        costUsd: acc.costUsd + b.costUsd,
      }),
      { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    );

    return { window: query.window ?? '7d', bucket: query.bucket ?? '1h', totals, buckets };
  }

  // GET /dashboard/metrics/budget
  getBudgetStatus() {
    const workspace = workspaceStore.readWorkspace();
    const policies = (workspaceStore as any).listBudgetPolicies?.() ?? [];

    const runs = filterByWindow(allRuns(), DAY);
    const steps = allSteps(runs);
    const spent24h = steps.reduce((s, st) => s + (st.costUsd ?? 0), 0);

    const weekRuns = filterByWindow(allRuns(), WEEK);
    const spentWeek = allSteps(weekRuns).reduce((s, st) => s + (st.costUsd ?? 0), 0);

    const policyStatuses = policies.map((p: any) => ({
      id: p.id,
      name: p.name,
      scope: p.scope,
      limitUsd: p.limitUsd,
      spentUsd: round4(p.scope === 'daily' ? spent24h : spentWeek),
      utilizationPct: round2(((p.scope === 'daily' ? spent24h : spentWeek) / p.limitUsd) * 100),
      status: getUtilizationStatus(p.scope === 'daily' ? spent24h : spentWeek, p.limitUsd),
    }));

    return {
      spent24hUsd: round4(spent24h),
      spentWeekUsd: round4(spentWeek),
      policies: policyStatuses,
    };
  }

  // GET /dashboard/metrics/model-mix
  getModelMix(query: { window?: string }) {
    const windowMs = parseWindow(query.window ?? '7d');
    const runs = filterByWindow(allRuns(), windowMs);
    const steps = allSteps(runs);

    const modelMap = new Map<
      string,
      { calls: number; inputTokens: number; outputTokens: number; costUsd: number }
    >();

    for (const step of steps) {
      const model = (step as any).model ?? 'unknown';
      if (!modelMap.has(model)) modelMap.set(model, { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
      const entry = modelMap.get(model)!;
      entry.calls += 1;
      entry.inputTokens += step.tokenUsage?.input ?? 0;
      entry.outputTokens += step.tokenUsage?.output ?? 0;
      entry.costUsd += step.costUsd ?? 0;
    }

    const totalCost = Array.from(modelMap.values()).reduce((s, e) => s + e.costUsd, 0);

    const models = Array.from(modelMap.entries())
      .map(([model, data]) => ({
        model,
        ...data,
        costUsd: round4(data.costUsd),
        sharePct: round2((data.costUsd / (totalCost || 1)) * 100),
      }))
      .sort((a, b) => b.costUsd - a.costUsd);

    return { window: query.window ?? '7d', totalCostUsd: round4(totalCost), models };
  }

  // GET /dashboard/metrics/latency
  getLatencyStats(query: { window?: string; groupBy?: string }) {
    const windowMs = parseWindow(query.window ?? '7d');
    const runs = filterByWindow(allRuns(), windowMs).filter((r) => r.completedAt);
    const groupBy = query.groupBy ?? 'flow';

    const groupMap = new Map<string, number[]>();

    for (const run of runs) {
      const key = groupBy === 'agent' ? ((run.steps[0] as any)?.agentId ?? 'unknown') : run.flowId;
      const latency = new Date(run.completedAt!).getTime() - new Date(run.startedAt).getTime();
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(latency);
    }

    const allLatencies = runs.map(
      (r) => new Date(r.completedAt!).getTime() - new Date(r.startedAt).getTime(),
    );

    const groups = Array.from(groupMap.entries()).map(([key, latencies]) => ({
      key,
      count: latencies.length,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
      meanMs: Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length),
    }));

    return {
      window: query.window ?? '7d',
      groupBy,
      overall: {
        p50Ms: percentile(allLatencies, 50),
        p95Ms: percentile(allLatencies, 95),
        p99Ms: percentile(allLatencies, 99),
        meanMs: allLatencies.length
          ? Math.round(allLatencies.reduce((s, v) => s + v, 0) / allLatencies.length)
          : 0,
      },
      groups,
    };
  }

  // ─── Fase 5: Operations metrics ──────────────────────────────────────────

  // GET /dashboard/operations/runtime-state
  getRuntimeState() {
    const runs = allRuns();
    const running = runs.filter((r) => r.status === 'running');
    const waiting = runs.filter((r) => r.status === 'waiting_approval');
    const queued = runs.filter((r) => r.status === 'queued');

    const agents = (workspaceStore as any).listAgents?.() ?? [];
    const flows = (workspaceStore as any).listFlows?.() ?? [];

    return {
      timestamp: new Date().toISOString(),
      runningRuns: running.length,
      waitingApproval: waiting.length,
      queuedRuns: queued.length,
      totalAgents: agents.length,
      totalFlows: flows.length,
      activeRunIds: running.map((r) => r.id),
      waitingRunIds: waiting.map((r) => r.id),
    };
  }

  // GET /dashboard/operations/recent-runs
  getRecentRuns(query: { limit?: string; status?: string; flowId?: string }) {
    let runs = allRuns();

    if (query.status) runs = runs.filter((r) => r.status === query.status);
    if (query.flowId) runs = runs.filter((r) => r.flowId === query.flowId);

    runs = runs
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, Math.min(parseInt(query.limit ?? '20', 10), 100));

    return runs.map((r) => ({
      id: r.id,
      flowId: r.flowId,
      status: r.status,
      trigger: r.trigger,
      startedAt: r.startedAt,
      completedAt: r.completedAt ?? null,
      durationMs: r.completedAt
        ? new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()
        : null,
      stepCount: r.steps.length,
      costUsd: round4(r.steps.reduce((s, st) => s + (st.costUsd ?? 0), 0)),
      tokens: r.steps.reduce(
        (acc, st) => ({
          input: acc.input + (st.tokenUsage?.input ?? 0),
          output: acc.output + (st.tokenUsage?.output ?? 0),
        }),
        { input: 0, output: 0 },
      ),
    }));
  }

  // GET /dashboard/operations/alerts
  getAlerts() {
    const alerts: Array<{
      id: string;
      severity: 'critical' | 'warning' | 'info';
      type: string;
      message: string;
      context: Record<string, unknown>;
      detectedAt: string;
    }> = [];

    const now = Date.now();
    const runs = allRuns();

    // Alerta: runs corriendo por más de 5 minutos
    for (const run of runs.filter((r) => r.status === 'running')) {
      const age = now - new Date(run.startedAt).getTime();
      if (age > 5 * 60_000) {
        alerts.push({
          id: `long-run-${run.id}`,
          severity: age > 15 * 60_000 ? 'critical' : 'warning',
          type: 'long_running_run',
          message: `Run ${run.id} lleva ${Math.round(age / 60_000)} min en ejecución`,
          context: { runId: run.id, flowId: run.flowId, ageMs: age },
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Alerta: tasa de error > 20% en última hora
    const lastHour = filterByWindow(runs, HOUR);
    if (lastHour.length >= 5) {
      const errRate = lastHour.filter((r) => r.status === 'failed').length / lastHour.length;
      if (errRate > 0.2) {
        alerts.push({
          id: 'high-error-rate',
          severity: errRate > 0.5 ? 'critical' : 'warning',
          type: 'high_error_rate',
          message: `Tasa de error ${round2(errRate * 100)}% en la última hora (${lastHour.filter((r) => r.status === 'failed').length}/${lastHour.length} runs)`,
          context: { errorRate: errRate, total: lastHour.length },
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Alerta: runs esperando aprobación por más de 30 minutos
    for (const run of runs.filter((r) => r.status === 'waiting_approval')) {
      const age = now - new Date(run.startedAt).getTime();
      if (age > 30 * 60_000) {
        alerts.push({
          id: `stale-approval-${run.id}`,
          severity: 'warning',
          type: 'stale_approval',
          message: `Run ${run.id} esperando aprobación por ${Math.round(age / 60_000)} min`,
          context: { runId: run.id, ageMs: age },
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Alerta: presupuesto diario > 80%
    const spent24h = allSteps(filterByWindow(runs, DAY)).reduce((s, st) => s + (st.costUsd ?? 0), 0);
    const policies = (workspaceStore as any).listBudgetPolicies?.() ?? [];
    for (const policy of policies.filter((p: any) => p.scope === 'daily')) {
      const pct = (spent24h / policy.limitUsd) * 100;
      if (pct >= 80) {
        alerts.push({
          id: `budget-${policy.id}`,
          severity: pct >= 100 ? 'critical' : 'warning',
          type: 'budget_threshold',
          message: `Política "${policy.name}" al ${round2(pct)}% del límite diario ($${round4(policy.limitUsd)})`,
          context: { policyId: policy.id, spentUsd: round4(spent24h), limitUsd: policy.limitUsd, pct: round2(pct) },
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return {
      count: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      alerts: alerts.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      }),
    };
  }

  // GET /dashboard/operations/budgets
  getBudgets() {
    const policies = (workspaceStore as any).listBudgetPolicies?.() ?? [];
    const runs = allRuns();
    const spent24h = allSteps(filterByWindow(runs, DAY)).reduce((s, st) => s + (st.costUsd ?? 0), 0);
    const spentWeek = allSteps(filterByWindow(runs, WEEK)).reduce((s, st) => s + (st.costUsd ?? 0), 0);
    const spentMonth = allSteps(filterByWindow(runs, 30 * DAY)).reduce((s, st) => s + (st.costUsd ?? 0), 0);

    return {
      summary: {
        spent24hUsd: round4(spent24h),
        spentWeekUsd: round4(spentWeek),
        spentMonthUsd: round4(spentMonth),
      },
      policies: policies.map((p: any) => {
        const spent = p.scope === 'daily' ? spent24h : p.scope === 'weekly' ? spentWeek : spentMonth;
        return {
          id: p.id,
          name: p.name,
          scope: p.scope,
          limitUsd: p.limitUsd,
          spentUsd: round4(spent),
          remainingUsd: round4(Math.max(0, p.limitUsd - spent)),
          utilizationPct: round2((spent / p.limitUsd) * 100),
          status: getUtilizationStatus(spent, p.limitUsd),
          onExceedAction: p.onExceedAction ?? 'alert',
          enabled: p.enabled ?? true,
        };
      }),
    };
  }

  // GET /dashboard/operations/policies
  getPolicies() {
    const policies = (workspaceStore as any).listBudgetPolicies?.() ?? [];
    return { count: policies.length, policies };
  }

  // PATCH /dashboard/operations/policies/:id
  patchPolicy(id: string, patch: Partial<{ limitUsd: number; enabled: boolean; onExceedAction: string }>) {
    const updatePolicy = (workspaceStore as any).updateBudgetPolicy;
    if (typeof updatePolicy !== 'function') {
      throw new Error('workspaceStore.updateBudgetPolicy not implemented');
    }
    return updatePolicy(id, patch);
  }
}

// ─── private helpers ─────────────────────────────────────────────────────────

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function countActiveAgents(runs: RunSpec[]): number {
  const active = runs.filter((r) => r.status === 'running');
  const agentIds = new Set(active.flatMap((r) => r.steps.map((s) => (s as any).agentId)).filter(Boolean));
  return agentIds.size;
}

function getUtilizationStatus(spent: number, limit: number): 'ok' | 'warning' | 'critical' | 'exceeded' {
  const pct = (spent / limit) * 100;
  if (pct >= 100) return 'exceeded';
  if (pct >= 90) return 'critical';
  if (pct >= 75) return 'warning';
  return 'ok';
}

function parseWindow(w: string): number {
  const match = w.match(/^(\d+)([hdwm])$/);
  if (!match) return WEEK;
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case 'h': return n * HOUR;
    case 'd': return n * DAY;
    case 'w': return n * WEEK;
    case 'm': return n * 30 * DAY;
    default: return WEEK;
  }
}

function parseBucket(b: string): number {
  const match = b.match(/^(\d+)([hmd])$/);
  if (!match) return HOUR;
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case 'h': return n * HOUR;
    case 'd': return n * DAY;
    case 'm': return n * 60_000;
    default: return HOUR;
  }
}

function buildTimeBuckets(from: number, to: number, bucketMs: number) {
  const buckets: Array<{ ts: string; total: number; completed: number; failed: number }> = [];
  for (let t = from; t < to; t += bucketMs) {
    buckets.push({ ts: new Date(t).toISOString(), total: 0, completed: 0, failed: 0 });
  }
  return buckets;
}
