/**
 * DashboardService — F0-07
 *
 * Reemplaza workspaceStore (JSON en memoria) con consultas Prisma reales.
 * Recibe PrismaClient via constructor (sin new PrismaClient() en el módulo).
 *
 * Métodos implementados:
 *   Metrics : getKpis, getRunsTimeline, getTokensTimeline,
 *             getBudgetStatus, getModelMix, getLatencyStats
 *   Ops     : getRuntimeState, getRecentRuns, getAlerts,
 *             getBudgets, getPolicies, patchPolicy
 */

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
  // auto-bucket
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
  window?: string   // '1h' | '24h' | '7d' | '30d'
  bucket?: string   // '1h' | '6h' | '1d'
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
  ts:              string
  promptTokens:    number
  completionTokens: number
  totalTokens:     number
  costUsd:         number
}

export interface ModelMixRow {
  model:        string
  costUsd:      number
  costPct:      number
  steps:        number
}

export interface LatencyResult {
  p50: number
  p75: number
  p95: number
  p99: number
  samples: number
}

export interface RuntimeState {
  running:          number
  queued:           number
  waitingApproval:  number
  total:            number
}

export interface RecentRunRow {
  id:           string
  flowId:       string
  flowName:     string
  agencyId:     string | null
  status:       string
  startedAt:    Date
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
  alertAt:         number
  spentUsd:        number
  remainingUsd:    number
  utilizationPct:  number
  isOverBudget:    boolean
  isNearLimit:     boolean
}

export interface PatchPolicyInput {
  limitUsd?:   number
  periodDays?: number
  alertAt?:    number
}

// ── service ───────────────────────────────────────────────────────────────────────────

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  // ───────────────────────────────────────────────────────────────────────
  // METRICS
  // ───────────────────────────────────────────────────────────────────────

  /** KPIs principales de las últimas 24 h vs las 24 h anteriores. */
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
    const totalCost   = curr.reduce((s, r) => s + r.totalCostUsd, 0)
    const prevCost    = prev.reduce((s, r) => s + r.totalCostUsd, 0)

    const durations = completed
      .filter(r => r.completedAt)
      .map(r => r.completedAt!.getTime() - r.startedAt.getTime())

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

  /** Timeline de ejecuciones agrupadas en buckets temporales. */
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
      const slot = Math.floor(r.startedAt.getTime() / bMs) * bMs
      const b    = map.get(slot) ?? { count: 0, costUsd: 0 }
      b.count++
      b.costUsd += r.totalCostUsd
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

  /**
   * Timeline de consumo de tokens e
   * imputación de costo por bucket temporal.
   * tokenUsage es JSONB con estructura { prompt_tokens, completion_tokens, total_tokens }.
   */
  async getTokensTimeline(q: TimelineQuery = {}): Promise<{ buckets: TokenBucket[] }> {
    const wMs = resolveWindowMs(q.window)
    const bMs = resolveBucketMs(q.window, q.bucket)
    const s   = sinceMs(wMs)

    const steps = await this.prisma.runStep.findMany({
      where:   { startedAt: { gte: s }, tokenUsage: { not: null } },
      select:  { startedAt: true, tokenUsage: true, costUsd: true },
      orderBy: { startedAt: 'asc' },
    })

    type TokenBucketAcc = { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number }
    const map = new Map<number, TokenBucketAcc>()

    for (const step of steps) {
      const slot = Math.floor(step.startedAt.getTime() / bMs) * bMs
      const b    = map.get(slot) ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 }
      const tu   = step.tokenUsage as Record<string, number> | null ?? {}
      b.promptTokens     += tu.prompt_tokens     ?? 0
      b.completionTokens += tu.completion_tokens ?? 0
      b.totalTokens      += tu.total_tokens      ?? (tu.prompt_tokens ?? 0) + (tu.completion_tokens ?? 0)
      b.costUsd          += step.costUsd
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

  /** Estado de presupuesto global o por agencia. */
  async getBudgetStatus(agencyId?: string): Promise<{
    limitUsd:       number
    spentUsd:       number
    remainingUsd:   number
    utilizationPct: number
    periodDays:     number
  }> {
    const policy = agencyId
      ? await this.prisma.budgetPolicy.findUnique({ where: { agencyId } })
      : null

    const periodDays = policy?.periodDays ?? 30
    const s          = sinceMs(periodDays * DAY)
    const where      = agencyId
      ? { agencyId, startedAt: { gte: s } }
      : { startedAt: { gte: s } }

    const agg = await this.prisma.run.aggregate({
      where,
      _sum: { totalCostUsd: true },
    })

    const spentUsd  = agg._sum.totalCostUsd ?? 0
    const limitUsd  = policy?.limitUsd ?? Infinity
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

  /** Distribución de costo y pasos por modelo LLM en la ventana temporal. */
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
      e.costUsd += s.costUsd
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

  /** Percentiles de latencia de runs completados en la ventana temporal. */
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

    const all = runs.map(r => r.completedAt!.getTime() - r.startedAt.getTime())
    const overall = calcPercentiles(all)

    const groupMap = new Map<string, { name: string; durations: number[] }>()
    for (const r of runs) {
      const key  = r.flowId
      const name = r.flow.name
      const d    = r.completedAt!.getTime() - r.startedAt.getTime()
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

  /** Estado instantáneo del runtime. */
  async getRuntimeState(): Promise<RuntimeState> {
    const [running, queued, waiting] = await Promise.all([
      this.prisma.run.count({ where: { status: 'running' } }),
      this.prisma.run.count({ where: { status: 'queued' } }),
      this.prisma.run.count({ where: { status: 'waiting_approval' } }),
    ])
    return {
      running,
      queued,
      waitingApproval: waiting,
      total: running + queued + waiting,
    }
  }

  /** Runs recientes con filtros opcionales. */
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
      where,
      take:    limit,
      orderBy: { startedAt: 'desc' },
      select: {
        id:           true,
        flowId:       true,
        flow:         { select: { name: true } },
        agencyId:     true,
        status:       true,
        startedAt:    true,
        completedAt:  true,
        totalCostUsd: true,
      },
    })

    return runs.map(r => ({
      id:           r.id,
      flowId:       r.flowId,
      flowName:     r.flow.name,
      agencyId:     r.agencyId,
      status:       r.status,
      startedAt:    r.startedAt,
      completedAt:  r.completedAt,
      durationMs:   r.completedAt
        ? r.completedAt.getTime() - r.startedAt.getTime()
        : null,
      totalCostUsd: r.totalCostUsd,
    }))
  }

  /**
   * Alertas activas calculadas a partir del estado actual:
   *   - tasa de error > 20% en las últimas 2 h
   *   - runs activos con duración > 30 min (runs lentos)
   *   - políticas de presupuesto sobre el umbral alertAt
   *   - aprobaciones pendientes > 10 min
   */
  async getAlerts(): Promise<{ alerts: AlertItem[] }> {
    const alerts: AlertItem[] = []
    const s2h = sinceMs(2 * HOUR)
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
        },
      }),
    ])

    // tasa de error
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

    // runs lentos
    for (const r of longRunning) {
      const durationMin = Math.round((Date.now() - r.startedAt.getTime()) / 60_000)
      alerts.push({
        level:   durationMin > 60 ? 'critical' : 'warning',
        type:    'slow_run',
        message: `Run ${r.id} has been running for ${durationMin} min`,
        meta:    { runId: r.id, flowId: r.flowId, durationMin },
      })
    }

    // presupuesto
    for (const pol of policies) {
      const s    = sinceMs(pol.periodDays * DAY)
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
      const spent   = agg._sum.totalCostUsd ?? 0
      const utilPct = spent / pol.limitUsd

      if (utilPct >= 1) {
        alerts.push({
          level:   'critical',
          type:    'budget_exceeded',
          message: `Budget exceeded: $${spent.toFixed(4)} / $${pol.limitUsd} (${Math.round(utilPct * 100)}%)`,
          meta:    { policyId: pol.id, spent, limit: pol.limitUsd },
        })
      } else if (utilPct >= pol.alertAt) {
        alerts.push({
          level:   'warning',
          type:    'budget_near_limit',
          message: `Budget at ${Math.round(utilPct * 100)}% of $${pol.limitUsd} limit`,
          meta:    { policyId: pol.id, spent, limit: pol.limitUsd },
        })
      }
    }

    return { alerts }
  }

  /** Resumen financiero completo con gasto real por cada política. */
  async getBudgets(): Promise<{ rows: BudgetRow[] }> {
    const policies = await this.prisma.budgetPolicy.findMany()
    const rows: BudgetRow[] = []

    for (const pol of policies) {
      const s     = sinceMs(pol.periodDays * DAY)
      const scope = pol.agencyId     ? { scope: 'agency',     scopeId: pol.agencyId,     where: { agencyId:     pol.agencyId     } }
                  : pol.departmentId ? { scope: 'department', scopeId: pol.departmentId, where: { departmentId: pol.departmentId } }
                  : pol.workspaceId  ? { scope: 'workspace',  scopeId: pol.workspaceId,  where: { workspaceId:  pol.workspaceId  } }
                  : pol.agentId      ? { scope: 'agent',      scopeId: pol.agentId,      where: { agentId:      pol.agentId      } }
                  : { scope: 'global', scopeId: null, where: {} }

      const agg = await this.prisma.run.aggregate({
        where: { ...scope.where, startedAt: { gte: s } } as never,
        _sum:  { totalCostUsd: true },
      })

      const spentUsd   = agg._sum.totalCostUsd ?? 0
      const remaining  = pol.limitUsd - spentUsd
      const utilPct    = Math.round((spentUsd / pol.limitUsd) * 10_000) / 100

      rows.push({
        policyId:       pol.id,
        scope:          scope.scope,
        scopeId:        scope.scopeId,
        limitUsd:       pol.limitUsd,
        periodDays:     pol.periodDays,
        alertAt:        pol.alertAt,
        spentUsd:       Math.round(spentUsd  * 10_000) / 10_000,
        remainingUsd:   Math.round(remaining * 10_000) / 10_000,
        utilizationPct: utilPct,
        isOverBudget:   spentUsd > pol.limitUsd,
        isNearLimit:    spentUsd >= pol.alertAt * pol.limitUsd,
      })
    }

    return { rows }
  }

  /** Lista todas las políticas de presupuesto. */
  async getPolicies() {
    return this.prisma.budgetPolicy.findMany({
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Actualiza limitUsd, periodDays o alertAt de una BudgetPolicy.
   * No permite cambiar el scope (agencyId/departmentId/…).
   */
  async patchPolicy(id: string, body: PatchPolicyInput) {
    const existing = await this.prisma.budgetPolicy.findUnique({ where: { id } })
    if (!existing) {
      throw new Error(`BudgetPolicy ${id} not found`)
    }

    const data: Partial<PatchPolicyInput> = {}
    if (body.limitUsd   !== undefined) data.limitUsd   = Number(body.limitUsd)
    if (body.periodDays !== undefined) data.periodDays = Number(body.periodDays)
    if (body.alertAt    !== undefined) data.alertAt    = Number(body.alertAt)

    return this.prisma.budgetPolicy.update({ where: { id }, data })
  }
}
