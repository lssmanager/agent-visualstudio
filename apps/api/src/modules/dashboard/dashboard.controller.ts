/**
 * Dashboard router — F0-07
 *
 * Usa DashboardService (Prisma, sin workspaceStore).
 * Recibe prisma como parámetro para permitir DI desde el entry-point.
 * Todas las llamadas al servicio son async/await.
 */

import { Router, Request, Response } from 'express'
import type { PrismaClient } from '@prisma/client'
import { DashboardService }  from './dashboard.service'

export function registerDashboardRoutes(router: Router, prisma: PrismaClient) {
  const svc = new DashboardService(prisma)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function handle<T>(
    res: Response,
    fn: () => Promise<T>,
  ): void {
    fn()
      .then(data => res.json(data))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('not found')) {
          res.status(404).json({ error: msg })
        } else {
          res.status(500).json({ error: msg })
        }
      })
  }

  // ── GET /dashboard/metrics/kpis ───────────────────────────────────────────
  router.get('/dashboard/metrics/kpis', (_req: Request, res: Response) => {
    handle(res, () => svc.getKpis())
  })

  // ── GET /dashboard/metrics/runs?window=24h|7d|30d&bucket=1h|6h|1d ────────
  router.get('/dashboard/metrics/runs', (req: Request, res: Response) => {
    handle(res, () => svc.getRunsTimeline({
      window: req.query.window as string | undefined,
      bucket: req.query.bucket as string | undefined,
    }))
  })

  // ── GET /dashboard/metrics/tokens ────────────────────────────────────
  router.get('/dashboard/metrics/tokens', (req: Request, res: Response) => {
    handle(res, () => svc.getTokensTimeline({
      window: req.query.window as string | undefined,
      bucket: req.query.bucket as string | undefined,
    }))
  })

  // ── GET /dashboard/metrics/budget?agencyId=... ───────────────────────
  router.get('/dashboard/metrics/budget', (req: Request, res: Response) => {
    handle(res, () => svc.getBudgetStatus(
      req.query.agencyId as string | undefined,
    ))
  })

  // ── GET /dashboard/metrics/model-mix?window=7d ───────────────────────
  router.get('/dashboard/metrics/model-mix', (req: Request, res: Response) => {
    handle(res, () => svc.getModelMix({
      window: req.query.window as string | undefined,
    }))
  })

  // ── GET /dashboard/metrics/latency?window=7d&groupBy=flow|agent ────────
  router.get('/dashboard/metrics/latency', (req: Request, res: Response) => {
    handle(res, () => svc.getLatencyStats({
      window:  req.query.window  as string | undefined,
      groupBy: req.query.groupBy as 'flow' | 'agent' | undefined,
    }))
  })

  // ── GET /dashboard/operations/runtime-state ────────────────────────
  router.get('/dashboard/operations/runtime-state', (_req: Request, res: Response) => {
    handle(res, () => svc.getRuntimeState())
  })

  // ── GET /dashboard/operations/recent-runs?limit=20&status=&flowId= ──────
  router.get('/dashboard/operations/recent-runs', (req: Request, res: Response) => {
    handle(res, () => svc.getRecentRuns({
      limit:  req.query.limit  ? Number(req.query.limit)  : undefined,
      status: req.query.status as string | undefined,
      flowId: req.query.flowId as string | undefined,
    }))
  })

  // ── GET /dashboard/operations/alerts ──────────────────────────────
  router.get('/dashboard/operations/alerts', (_req: Request, res: Response) => {
    handle(res, () => svc.getAlerts())
  })

  // ── GET /dashboard/operations/budgets ─────────────────────────────
  router.get('/dashboard/operations/budgets', (_req: Request, res: Response) => {
    handle(res, () => svc.getBudgets())
  })

  // ── GET /dashboard/operations/policies ────────────────────────────
  router.get('/dashboard/operations/policies', (_req: Request, res: Response) => {
    handle(res, () => svc.getPolicies())
  })

  // ── PATCH /dashboard/operations/policies/:id ───────────────────────
  router.patch('/dashboard/operations/policies/:id', (req: Request, res: Response) => {
    handle(res, () => svc.patchPolicy(req.params.id, req.body))
  })
}
