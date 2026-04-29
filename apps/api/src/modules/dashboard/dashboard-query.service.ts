/**
 * DashboardQueryService — F0 fix
 * Migrado de workspaceStore (JSON) a Prisma.
 * Sin efectos secundarios — solo lectura y cómputo.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const HOUR = 3_600_000;
const DAY  = 24 * HOUR;
const WEEK = 7  * DAY;

function windowStart(ms: number): Date {
  return new Date(Date.now() - ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface KpiResult {
  totalRuns:        number;
  successRate:      number;
  avgDurationMs:    number;
  totalCostUsd:     number;
  runsVsPrev:       number; // % change vs previous 24h
  costVsPrev:       number; // % change vs previous 24h
}

export interface RunsOverTime {
  buckets: { ts: string; count: number; costUsd: number }[];
}

export interface AgentLeaderboard {
  rows: {
    agentId:      string;
    agentName:    string;
    runs:         number;
    successRate:  number;
    avgCostUsd:   number;
    totalCostUsd: number;
  }[];
}

export interface RecentRun {
  id:          string;
  flowId:      string;
  flowName:    string;
  agencyId:    string | null;
  status:      string;
  startedAt:   Date;
  completedAt: Date | null;
  totalCostUsd: number;
  trigger:     Prisma.JsonValue;
}

// ─────────────────────────────────────────────────────────────────────────────
export class DashboardQueryService {

  // ── GET /dashboard/metrics/kpis ───────────────────────────────────────────
  async getKpis(): Promise<KpiResult> {
    const since24h = windowStart(DAY);
    const since48h = windowStart(2 * DAY);

    const [curr, prev] = await Promise.all([
      prisma.run.findMany({
        where: { startedAt: { gte: since24h } },
        select: { status: true, startedAt: true, completedAt: true, totalCostUsd: true },
      }),
      prisma.run.findMany({
        where: { startedAt: { gte: since48h, lt: since24h } },
        select: { status: true, totalCostUsd: true },
      }),
    ]);

    const completed    = curr.filter(r => r.status === 'completed');
    const successRate  = curr.length ? completed.length / curr.length : 0;
    const totalCost    = curr.reduce((s, r) => s + r.totalCostUsd, 0);
    const prevCost     = prev.reduce((s, r) => s + r.totalCostUsd, 0);

    const durations = completed
      .filter(r => r.completedAt)
      .map(r => r.completedAt!.getTime() - r.startedAt.getTime());
    const avgDurationMs = durations.length
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : 0;

    const pct = (curr: number, prev: number) =>
      prev === 0 ? 0 : ((curr - prev) / prev) * 100;

    return {
      totalRuns:     curr.length,
      successRate:   Math.round(successRate * 100) / 100,
      avgDurationMs: Math.round(avgDurationMs),
      totalCostUsd:  Math.round(totalCost * 10_000) / 10_000,
      runsVsPrev:    Math.round(pct(curr.length, prev.length) * 10) / 10,
      costVsPrev:    Math.round(pct(totalCost, prevCost) * 10) / 10,
    };
  }

  // ── GET /dashboard/metrics/runs-over-time?window=24h|7d ──────────────────
  async getRunsOverTime(windowKey: '24h' | '7d' = '24h'): Promise<RunsOverTime> {
    const windowMs  = windowKey === '7d' ? WEEK : DAY;
    const bucketMs  = windowKey === '7d' ? HOUR * 6 : HOUR;
    const since     = windowStart(windowMs);

    const runs = await prisma.run.findMany({
      where:  { startedAt: { gte: since } },
      select: { startedAt: true, totalCostUsd: true },
      orderBy: { startedAt: 'asc' },
    });

    // bucket into time slots
    const bucketMap = new Map<number, { count: number; costUsd: number }>();
    for (const run of runs) {
      const slot = Math.floor(run.startedAt.getTime() / bucketMs) * bucketMs;
      const b    = bucketMap.get(slot) ?? { count: 0, costUsd: 0 };
      b.count++;
      b.costUsd += run.totalCostUsd;
      bucketMap.set(slot, b);
    }

    const buckets = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, v]) => ({
        ts:      new Date(ts).toISOString(),
        count:   v.count,
        costUsd: Math.round(v.costUsd * 10_000) / 10_000,
      }));

    return { buckets };
  }

  // ── GET /dashboard/metrics/agent-leaderboard ──────────────────────────────
  async getAgentLeaderboard(limit = 10): Promise<AgentLeaderboard> {
    const since = windowStart(WEEK);

    const steps = await prisma.runStep.findMany({
      where: {
        nodeType: 'agent',
        agentId:  { not: null },
        createdAt: { gte: since },
      },
      select: {
        agentId: true,
        status:  true,
        costUsd: true,
        agent:   { select: { name: true } },
      },
    });

    // aggregate per agentId
    const map = new Map<string, {
      name: string; runs: number; completed: number; totalCost: number;
    }>();

    for (const s of steps) {
      if (!s.agentId) continue;
      const entry = map.get(s.agentId) ?? {
        name: s.agent?.name ?? s.agentId,
        runs: 0, completed: 0, totalCost: 0,
      };
      entry.runs++;
      if (s.status === 'completed') entry.completed++;
      entry.totalCost += s.costUsd;
      map.set(s.agentId, entry);
    }

    const rows = Array.from(map.entries())
      .sort(([, a], [, b]) => b.runs - a.runs)
      .slice(0, limit)
      .map(([agentId, e]) => ({
        agentId,
        agentName:    e.name,
        runs:         e.runs,
        successRate:  e.runs ? Math.round((e.completed / e.runs) * 100) / 100 : 0,
        avgCostUsd:   e.runs ? Math.round((e.totalCost / e.runs) * 10_000) / 10_000 : 0,
        totalCostUsd: Math.round(e.totalCost * 10_000) / 10_000,
      }));

    return { rows };
  }

  // ── GET /dashboard/runs/recent?limit=20 ───────────────────────────────────
  async getRecentRuns(limit = 20): Promise<RecentRun[]> {
    const runs = await prisma.run.findMany({
      take:    limit,
      orderBy: { startedAt: 'desc' },
      select: {
        id:          true,
        flowId:      true,
        flow:        { select: { name: true } },
        agencyId:    true,
        status:      true,
        startedAt:   true,
        completedAt: true,
        totalCostUsd: true,
        trigger:     true,
      },
    });

    return runs.map(r => ({
      id:          r.id,
      flowId:      r.flowId,
      flowName:    r.flow.name,
      agencyId:    r.agencyId,
      status:      r.status,
      startedAt:   r.startedAt,
      completedAt: r.completedAt,
      totalCostUsd: r.totalCostUsd,
      trigger:     r.trigger,
    }));
  }

  // ── GET /dashboard/runs/active ────────────────────────────────────────────
  async getActiveRuns(): Promise<RecentRun[]> {
    const runs = await prisma.run.findMany({
      where:   { status: { in: ['queued', 'running', 'waiting_approval'] } },
      orderBy: { startedAt: 'desc' },
      select: {
        id:          true,
        flowId:      true,
        flow:        { select: { name: true } },
        agencyId:    true,
        status:      true,
        startedAt:   true,
        completedAt: true,
        totalCostUsd: true,
        trigger:     true,
      },
    });

    return runs.map(r => ({
      id:          r.id,
      flowId:      r.flowId,
      flowName:    r.flow.name,
      agencyId:    r.agencyId,
      status:      r.status,
      startedAt:   r.startedAt,
      completedAt: r.completedAt,
      totalCostUsd: r.totalCostUsd,
      trigger:     r.trigger,
    }));
  }

  // ── GET /dashboard/budget/summary?agencyId=... ───────────────────────────
  async getBudgetSummary(agencyId?: string): Promise<{
    limitUsd: number;
    spentUsd: number;
    remainingUsd: number;
    utilizationPct: number;
  }> {
    const policy = agencyId
      ? await prisma.budgetPolicy.findUnique({ where: { agencyId } })
      : null;

    const since = policy
      ? new Date(Date.now() - policy.periodDays * DAY)
      : windowStart(30 * DAY);

    const where = agencyId
      ? { agencyId, startedAt: { gte: since } }
      : { startedAt: { gte: since } };

    const agg = await prisma.run.aggregate({
      where,
      _sum: { totalCostUsd: true },
    });

    const spentUsd   = agg._sum.totalCostUsd ?? 0;
    const limitUsd   = policy?.limitUsd ?? Infinity;
    const remaining  = limitUsd === Infinity ? Infinity : limitUsd - spentUsd;
    const utilPct    = limitUsd === Infinity ? 0 : Math.round((spentUsd / limitUsd) * 10_000) / 100;

    return {
      limitUsd:       limitUsd === Infinity ? -1 : limitUsd,
      spentUsd:       Math.round(spentUsd * 10_000) / 10_000,
      remainingUsd:   remaining === Infinity ? -1 : Math.round(remaining * 10_000) / 10_000,
      utilizationPct: utilPct,
    };
  }
}
