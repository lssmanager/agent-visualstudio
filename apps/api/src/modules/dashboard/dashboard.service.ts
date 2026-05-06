/**
 * DashboardService — F0-07
 *
 * Reemplaza workspaceStore (JSON en memoria) con consultas Prisma reales.
 * Recibe PrismaClient via constructor (sin new PrismaClient() en el módulo).
 *
 * v2: Fix de tipos TSC:
 *   - Decimal → .toNumber() antes de aritmética
 *   - RunStatus: 'queued'→'pending', 'waiting_approval'→'paused'
 *   - agencyId no existe en Run → agentId
 *   - r.flow nullable → optional chaining
 *   - BudgetPolicy.alertAt es DateTime?, no number
 *   - findUnique({where:{agencyId}}) → findFirst
 */

import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

// ── constantes temporales ─────────────────────────────────────────────────────────

const HOUR = 3_600_000
const DAY  = 24 * HOUR
const WEEK = 7  * DAY

function sinceMs(ms: number): Date {
  return new Date(Date.now() - ms)
}

function resolveWindowMs(w = '24h'): number {
  if (w === '7d')  return WEEK
  if (w === '30d') return 30 * DAY
  if (w === '1h')  return HOUR
  return DAY
}

function resolveBucketMs(w = '24h', b?: string): number {
  if (b === '1d')  return DAY
  if (b === '6h')  return HOUR * 6
  if (b === '1h')  return HOUR
  if (w === '30d') return DAY
  if (w === '7d')  return HOUR * 6
  return HOUR
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return 0
  return Math.round(((curr - prev) / prev) * 1000) / 10
}

// ── tipos exportados ────────────────────────────────────────────────────────────────

export interface TimelineQuery {
  window?: string
  bucket?: string
}

export interface KpiResult {
  totalRuns:     number
  successRate:   number
  avgDurationMs: number
  totalCostUsd:  number
  runsVsPrev:    number
  costVsPrev:    number
}

export interface TimelineBucket {
  ts:      string
  count:   number
  costUsd: number
}

export interface TokenBucket {
  ts:               string
  promptTokens:     number
  completionTokens: number
  totalTokens:      number
  costUsd:          number
}

export interface ModelMixRow {
  model:   string
  costUsd: number
  costPct: number
  steps:   number
}

export interface LatencyResult {
  p50: number
  p75: number
  p95: number
  p99: number
  samples: number
}

export interface RuntimeState {
  running:         number
  queued:          number
  waitingApproval: number
  total:           number
}

export interface RecentRunRow {
  id:           string
  flowId:       string | null
  flowName:     string
  agentId:      string | null
  status:       string
  startedAt:    Date | null
  completedAt:  Date | null
  durationMs:   number | null
  totalCostUsd: number
}

export interface AlertItem {
  level:   'warning' | 'critical'
  type:    string
  message: string
  meta?:   Record<string, unknown>
}

export interface BudgetRow {
  policyId:        string
  scope:           string
  scopeId:         string | null
  limitUsd:        number
  periodDays:      number
  // Fix F: alertAt es DateTime? en Prisma, lo exponemos como ISO string o null
  alertAt:         string | null
  spentUsd:        number
  remainingUsd:    number
  utilizationPct:  number
  isOverBudget:    boolean
  isNearLimit:     boolean
}

export interface PatchPolicyInput {
  limitUsd?:   number
  periodDays?: number
  // Fix F: alertAt es DateTime? en Prisma — recibir como ISO string, no number
  alertAt?:    string
}

// ── service ───────────────────────────────────────────────────────────────────────────

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  // ───────────────────────────────────────────────────────────────────────
  // METRICS
  // ───────────────────────────────────────────────────────────────────────

  async getKpis(): Promise<KpiResult> {
    const s24 = sinceMs(DAY)
    const s48 = sinceMs(2 * DAY)

    const [curr, prev] = await Promise.all([
      this.prisma.run.findMany({
        where:  { startedAt: { gte: s24 } },
        select: { status: true, startedAt: true, completedAt: true, totalCostUsd: true },
      }),
      this.prisma.run.findMany({
        where:  { startedAt: { gte: s48, lt: s24 } },
        select: { status: true, totalCostUsd: true },
      }),
    ])

    const completed   = curr.filter(r => r.status === 'completed')
    const successRate = curr.length ? completed.length / curr.length : 0
    // Fix A: totalCostUsd es Decimal? — convertir a number
    const totalCost   = curr.reduce((s, r) => s + (r.totalCostUsd?.toNumber() ?? 0), 0)
    const prevCost    = prev.reduce((s, r) => s + (r.totalCostUsd?.toNumber() ?? 0), 0)

    const durations = completed
      .filter(r => r.completedAt && r.startedAt)
      .map(r => r.completedAt!.getTime() - r.startedAt!.getTime())

    return {
      totalRuns:     curr.length,
      successRate:   Math.round(successRate * 100) / 100,
      avgDurationMs: durations.length
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : 0,
      totalCostUsd:  Math.round(totalCost  * 10_000) / 10_000,
      runsVsPrev:    pct(curr.length, prev.length),
      costVsPrev:    pct(totalCost,   prevCost),
    }
  }

  async getRunsTimeline(q: TimelineQuery = {}): Promise<{ buckets: TimelineBucket[] }> {
    const wMs = resolveWindowMs(q.window)
    const bMs = resolveBucketMs(q.window, q.bucket)
    const s   = sinceMs(wMs)

    const runs = await this.prisma.run.findMany({
      where:   { startedAt: { gte: s } },
      select:  { startedAt: true, totalCostUsd: true },
      orderBy: { startedAt: 'asc' },
    })

    const map = new Map<number, { count: number; costUsd: number }>()
    for (const r of runs) {
      if (!r.startedAt) continue
      const slot = Math.floor(r.startedAt.getTime() / bMs) * bMs
      const b    = map.get(slot) ?? { count: 0, costUsd: 0 }
      b.count++
      // Fix A: Decimal → number
      b.costUsd += r.totalCostUsd?.toNumber() ?? 0
      map.set(slot, b)
    }

    const buckets = Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, v]) => ({
        ts:      new Date(ts).toISOString(),
        count:   v.count,
        costUsd: Math.round(v.costUsd * 10_000) / 10_000,
      }))

    return { buckets }
  }

  async getTokensTimeline(q: TimelineQuery = {}): Promise<{ buckets: TokenBucket[] }> {
    const wMs = resolveWindowMs(q.window)
    const bMs = resolveBucketMs(q.window, q.bucket)
    const s   = sinceMs(wMs)

    const steps = await this.prisma.runStep.findMany({
      where:   { startedAt: { gte: s }, tokenUsage: { not: Prisma.DbNull } },
      select:  { startedAt: true, tokenUsage: true, costUsd: true },
      orderBy: { startedAt: 'asc' },
    })

    type TokenBucketAcc = { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number }
    const map = new Map<number, TokenBucketAcc>()

    for (const step of steps) {
      if (!step.startedAt) continue
      const slot = Math.floor(step.startedAt.getTime() / bMs) * bMs
      const b    = map.get(slot) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 }
      // tokenUsage es Int en schema v10 (no JSONB) — usar directamente
      const tu   = typeof step.tokenUsage === 'number' ? step.tokenUsage : 0
      b.totalTokens += tu
      // Fix A: costUsd es Decimal? → .toNumber()
      b.costUsd += step.costUsd?.toNumber() ?? 0
      map.set(slot, b)
    }

    const buckets = Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, v]) => ({
        ts:               new Date(ts).toISOString(),
        promptTokens:     v.promptTokens,
        completionTokens: v.completionTokens,
        totalTokens:      v.totalTokens,
        costUsd:          Math.round(v.costUsd * 10_000) / 10_000,
      }))

    return { buckets }
  }

  async getBudgetStatus(agencyId?: string): Promise<{
    limitUsd:       number
    spentUsd:       number
    remainingUsd:   number
    utilizationPct: number
    periodDays:     number
  }> {
    // Fix G: findUnique({where:{agencyId}}) es inválido — agencyId no es @unique
    // Usar findFirst con el campo directo agencyId (Fix 5A del schema v10)
    const policy = agencyId
      ? await this.prisma.budgetPolicy.findFirst({ where: { agencyId } })
      : null

    const periodDays = policy?.periodDays ?? 30
    const s          = sinceMs(periodDays * DAY)
    const where      = agencyId
      ? { agentId: agencyId, startedAt: { gte: s } }
      : { startedAt: { gte: s } }

    const agg = await this.prisma.run.aggregate({
      where: where as never,
      _sum:  { totalCostUsd: true },
    })

    // Fix A: Decimal → number
    const spentUsd  = agg._sum.totalCostUsd?.toNumber() ?? 0
    const limitUsd  = policy?.limitUsd?.toNumber() ?? Infinity
    const remaining = limitUsd === Infinity ? Infinity : limitUsd - spentUsd
    const utilPct   = limitUsd === Infinity ? 0 : Math.round((spentUsd / limitUsd) * 10_000) / 100

    return {
      limitUsd:       limitUsd === Infinity ? -1 : limitUsd,
      spentUsd:       Math.round(spentUsd  * 10_000) / 10_000,
      remainingUsd:   remaining === Infinity ? -1 : Math.round(remaining * 10_000) / 10_000,
      utilizationPct: utilPct,
      periodDays,
    }
  }

  async getModelMix(q: TimelineQuery = {}): Promise<{ rows: ModelMixRow[] }> {
    const wMs = resolveWindowMs(q.window ?? '7d')
    const s   = sinceMs(wMs)

    const steps = await this.prisma.runStep.findMany({
      where:   { startedAt: { gte: s }, nodeType: 'agent', agentId: { not: null } },
      select:  { costUsd: true, agent: { select: { model: true } } },
    })

    const map = new Map<string, { costUsd: number; steps: number }>()
    for (const s of steps) {
      const model = s.agent?.model ?? 'unknown'
      const e     = map.get(model) ?? { costUsd: 0, steps: 0 }
      // Fix A: Decimal → number
      e.costUsd += s.costUsd?.toNumber() ?? 0
      e.steps++
      map.set(model, e)
    }

    const totalCost = Array.from(map.values()).reduce((acc, v) => acc + v.costUsd, 0)

    const rows = Array.from(map.entries())
      .sort(([, a], [, b]) => b.costUsd - a.costUsd)
      .map(([model, v]) => ({
        model,
        costUsd:  Math.round(v.costUsd * 10_000) / 10_000,
        costPct:  totalCost > 0 ? Math.round((v.costUsd / totalCost) * 10_000) / 100 : 0,
        steps:    v.steps,
      }))

    return { rows }
  }

  async getLatencyStats(q: TimelineQuery & { groupBy?: 'flow' | 'agent' } = {}): Promise<{
    overall: LatencyResult
    groups:  Array<{ id: string; name: string } & LatencyResult>
  }> {
    const wMs = resolveWindowMs(q.window ?? '7d')
    const s   = sinceMs(wMs)

    const runs = await this.prisma.run.findMany({
      where:   { startedAt: { gte: s }, status: 'completed', completedAt: { not: null } },
      select:  { flowId: true, startedAt: true, completedAt: true, flow: { select: { name: true } } },
    })

    function calcPercentiles(durations: number[]): LatencyResult {
      if (!durations.length) return { p50: 0, p75: 0, p95: 0, p99: 0, samples: 0 }
      const sorted = [...durations].sort((a, b) => a - b)
      const at = (pct: number) => sorted[Math.ceil((pct / 100) * sorted.length) - 1] ?? 0
      return { p50: at(50), p75: at(75), p95: at(95), p99: at(99), samples: sorted.length }
    }

    // Fix B: startedAt es Date|null — filtrar nulos antes de operar
    const all = runs
      .filter(r => r.startedAt && r.completedAt)
      .map(r => r.completedAt!.getTime() - r.startedAt!.getTime())
    const overall = calcPercentiles(all)

    const groupMap = new Map<string, { name: string; durations: number[] }>()
    for (const r of runs) {
      if (!r.startedAt || !r.completedAt || !r.flowId) continue
      const key  = r.flowId
      // Fix E: r.flow es nullable
      const name = r.flow?.name ?? r.flowId
      const d    = r.completedAt.getTime() - r.startedAt.getTime()
      const e    = groupMap.get(key) ?? { name, durations: [] }
      e.durations.push(d)
      groupMap.set(key, e)
    }

    const groups = Array.from(groupMap.entries())
      .map(([id, { name, durations }]) => ({ id, name, ...calcPercentiles(durations) }))
      .sort((a, b) => b.p95 - a.p95)

    return { overall, groups }
  }

  // ───────────────────────────────────────────────────────────────────────
  // OPERATIONS
  // ───────────────────────────────────────────────────────────────────────

  async getRuntimeState(): Promise<RuntimeState> {
    // Fix C: 'queued' → 'pending', 'waiting_approval' → 'paused'
    const [running, queued, waiting] = await Promise.all([
      this.prisma.run.count({ where: { status: 'running' } }),
      this.prisma.run.count({ where: { status: 'pending' } }),
      this.prisma.run.count({ where: { status: 'paused' } }),
    ])
    return {
      running,
      queued,
      waitingApproval: waiting,
      total: running + queued + waiting,
    }
  }

  async getRecentRuns(opts: {
    limit?:  number
    status?: string
    flowId?: string
  } = {}): Promise<RecentRunRow[]> {
    const limit = Math.min(Number(opts.limit ?? 20), 100)
    const where: Record<string, unknown> = {}
    if (opts.status) where.status = opts.status
    if (opts.flowId) where.flowId = opts.flowId

    const runs = await this.prisma.run.findMany({
      where:   where as never,
      take:    limit,
      orderBy: { startedAt: 'desc' },
      select: {
        id:           true,
        flowId:       true,
        flow:         { select: { name: true } },
        // Fix D: agencyId no existe en Run — usar agentId
        agentId:      true,
        status:       true,
        startedAt:    true,
        completedAt:  true,
        totalCostUsd: true,
      },
    })

    return runs.map(r => ({
      id:           r.id,
      flowId:       r.flowId,
      // Fix E: r.flow es nullable
      flowName:     r.flow?.name ?? '',
      agentId:      r.agentId,
      status:       r.status,
      startedAt:    r.startedAt,
      completedAt:  r.completedAt,
      durationMs:   r.completedAt && r.startedAt
        ? r.completedAt.getTime() - r.startedAt.getTime()
        : null,
      // Fix A: Decimal → number
      totalCostUsd: r.totalCostUsd?.toNumber() ?? 0,
    }))
  }

  async getAlerts(): Promise<{ alerts: AlertItem[] }> {
    const alerts: AlertItem[] = []
    const s2h  = sinceMs(2 * HOUR)
    const s30m = sinceMs(30 * 60_000)

    const [recent, longRunning, policies] = await Promise.all([
      this.prisma.run.findMany({
        where:  { startedAt: { gte: s2h } },
        select: { status: true },
      }),
      this.prisma.run.findMany({
        where:  { status: 'running', startedAt: { lte: s30m } },
        select: { id: true, flowId: true, startedAt: true },
      }),
      this.prisma.budgetPolicy.findMany({
        select: {
          id: true, limitUsd: true, alertAt: true,
          periodDays: true, agencyId: true, departmentId: true,
          workspaceId: true, agentId: true,
          alertPct: true,
        },
      }),
    ])

    if (recent.length > 5) {
      const errors   = recent.filter(r => r.status === 'failed').length
      const errorPct = errors / recent.length
      if (errorPct > 0.2) {
        alerts.push({
          level:   errorPct > 0.5 ? 'critical' : 'warning',
          type:    'high_error_rate',
          message: `Error rate ${Math.round(errorPct * 100)}% in the last 2h`,
          meta:    { errorPct: Math.round(errorPct * 100) },
        })
      }
    }

    for (const r of longRunning) {
      if (!r.startedAt) continue
      const durationMin = Math.round((Date.now() - r.startedAt.getTime()) / 60_000)
      alerts.push({
        level:   durationMin > 60 ? 'critical' : 'warning',
        type:    'slow_run',
        message: `Run ${r.id} has been running for ${durationMin} min`,
        meta:    { runId: r.id, flowId: r.flowId, durationMin },
      })
    }

    for (const pol of policies) {
      const periodDays = pol.periodDays ?? 30
      const s    = sinceMs(periodDays * DAY)
      const scope = pol.agencyId     ? { agencyId:     pol.agencyId     }
                  : pol.departmentId ? { departmentId: pol.departmentId }
                  : pol.workspaceId  ? { workspaceId:  pol.workspaceId  }
                  : pol.agentId      ? { agentId:      pol.agentId      }
                  : null
      if (!scope) continue

      const agg = await this.prisma.run.aggregate({
        where: { ...scope, startedAt: { gte: s } } as never,
        _sum:  { totalCostUsd: true },
      })
      // Fix A: Decimal → number
      const spent    = agg._sum.totalCostUsd?.toNumber() ?? 0
      const limitNum = pol.limitUsd?.toNumber() ?? 0
      if (limitNum === 0) continue
      const utilPct  = spent / limitNum
      // Fix F: alertAt es DateTime? — usar alertPct (Int) para el threshold
      const alertThreshold = (pol.alertPct ?? 80) / 100

      if (utilPct >= 1) {
        alerts.push({
          level:   'critical',
          type:    'budget_exceeded',
          message: `Budget exceeded: $${spent.toFixed(4)} / $${limitNum} (${Math.round(utilPct * 100)}%)`,
          meta:    { policyId: pol.id, spent, limit: limitNum },
        })
      } else if (utilPct >= alertThreshold) {
        alerts.push({
          level:   'warning',
          type:    'budget_near_limit',
          message: `Budget at ${Math.round(utilPct * 100)}% of $${limitNum} limit`,
          meta:    { policyId: pol.id, spent, limit: limitNum },
        })
      }
    }

    return { alerts }
  }

  async getBudgets(): Promise<{ rows: BudgetRow[] }> {
    const policies = await this.prisma.budgetPolicy.findMany()
    const rows: BudgetRow[] = []

    for (const pol of policies) {
      const periodDays = pol.periodDays ?? 30
      const s     = sinceMs(periodDays * DAY)
      const scope = pol.agencyId     ? { scope: 'agency',     scopeId: pol.agencyId,     where: { agencyId:     pol.agencyId     } }
                  : pol.departmentId ? { scope: 'department', scopeId: pol.departmentId, where: { departmentId: pol.departmentId } }
                  : pol.workspaceId  ? { scope: 'workspace',  scopeId: pol.workspaceId,  where: { workspaceId:  pol.workspaceId  } }
                  : pol.agentId      ? { scope: 'agent',      scopeId: pol.agentId,      where: { agentId:      pol.agentId      } }
                  : { scope: 'global', scopeId: null as string | null, where: {} as Record<string,unknown> }

      const agg = await this.prisma.run.aggregate({
        where: { ...scope.where, startedAt: { gte: s } } as never,
        _sum:  { totalCostUsd: true },
      })

      // Fix A: Decimal → number
      const spentUsd  = agg._sum.totalCostUsd?.toNumber() ?? 0
      const limitUsd  = pol.limitUsd?.toNumber() ?? 0
      const remaining = limitUsd > 0 ? limitUsd - spentUsd : 0
      const utilPct   = limitUsd > 0 ? Math.round((spentUsd / limitUsd) * 10_000) / 100 : 0

      rows.push({
        policyId:       pol.id,
        scope:          scope.scope,
        scopeId:        scope.scopeId,
        limitUsd,
        periodDays,
        // Fix F: alertAt es DateTime? — exportar como ISO string
        alertAt:        pol.alertAt?.toISOString() ?? null,
        spentUsd:       Math.round(spentUsd  * 10_000) / 10_000,
        remainingUsd:   Math.round(remaining * 10_000) / 10_000,
        utilizationPct: utilPct,
        isOverBudget:   spentUsd > limitUsd,
        // Fix F: isNearLimit usa alertPct (Int) como threshold
        isNearLimit:    limitUsd > 0 && spentUsd >= ((pol.alertPct ?? 80) / 100) * limitUsd,
      })
    }

    return { rows }
  }

  async getPolicies() {
    return this.prisma.budgetPolicy.findMany({
      orderBy: { createdAt: 'asc' },
    })
  }

  async patchPolicy(id: string, body: PatchPolicyInput) {
    const existing = await this.prisma.budgetPolicy.findUnique({ where: { id } })
    if (!existing) {
      throw new Error(`BudgetPolicy ${id} not found`)
    }

    const data: Record<string, unknown> = {}
    if (body.limitUsd   !== undefined) data.limitUsd   = Number(body.limitUsd)
    if (body.periodDays !== undefined) data.periodDays = Number(body.periodDays)
    // Fix F: alertAt es DateTime? — parsear ISO string a Date
    if (body.alertAt    !== undefined) data.alertAt    = new Date(body.alertAt)

    return this.prisma.budgetPolicy.update({ where: { id }, data: data as never })
  }
}
