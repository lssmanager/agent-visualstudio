import { Router } from 'express';
import { DashboardQueryService } from './dashboard-query.service';

const svc = new DashboardQueryService();

export function registerDashboardRoutes(router: Router) {
  // ── Fase 4: Overview metrics ─────────────────────────────────────────────

  /**
   * GET /dashboard/metrics/kpis
   * KPIs principales: totalRuns, successRate, costUsd, tokens, latencia p50/p95, agentes activos.
   */
  router.get('/dashboard/metrics/kpis', (_req, res) => {
    try {
      res.json(svc.getKpis());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/metrics/runs
   * Timeline de runs agrupada por bucket temporal.
   * Query: window=7d|24h|1h|30d, bucket=1h|6h|1d
   */
  router.get('/dashboard/metrics/runs', (req, res) => {
    try {
      res.json(svc.getRunsTimeline(req.query as any));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/metrics/tokens
   * Consumo de tokens e ingesta de costo por ventana temporal.
   * Query: window, bucket (igual que /runs)
   */
  router.get('/dashboard/metrics/tokens', (req, res) => {
    try {
      res.json(svc.getTokensTimeline(req.query as any));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/metrics/budget
   * Estado de presupuesto: gasto 24h, semana, y estado por política.
   */
  router.get('/dashboard/metrics/budget', (_req, res) => {
    try {
      res.json(svc.getBudgetStatus());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/metrics/model-mix
   * Distribución de costo y tokens por modelo LLM.
   * Query: window=7d
   */
  router.get('/dashboard/metrics/model-mix', (req, res) => {
    try {
      res.json(svc.getModelMix(req.query as any));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/metrics/latency
   * Percentiles de latencia p50/p95/p99 por flow o agente.
   * Query: window=7d, groupBy=flow|agent
   */
  router.get('/dashboard/metrics/latency', (req, res) => {
    try {
      res.json(svc.getLatencyStats(req.query as any));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Fase 5: Operations ──────────────────────────────────────────────────

  /**
   * GET /dashboard/operations/runtime-state
   * Estado instantáneo del runtime: runs activos, en cola, esperando aprobación.
   */
  router.get('/dashboard/operations/runtime-state', (_req, res) => {
    try {
      res.json(svc.getRuntimeState());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/operations/recent-runs
   * Runs recientes con resumen de costo, tokens, duración.
   * Query: limit=20, status=running|completed|failed, flowId
   */
  router.get('/dashboard/operations/recent-runs', (req, res) => {
    try {
      res.json(svc.getRecentRuns(req.query as any));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/operations/alerts
   * Alertas activas: runs lentos, tasa de error alta, presupuesto crítico, aprobaciones vencidas.
   */
  router.get('/dashboard/operations/alerts', (_req, res) => {
    try {
      res.json(svc.getAlerts());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/operations/budgets
   * Resumen financiero completo: gasto 24h/semana/mes + estado por política.
   */
  router.get('/dashboard/operations/budgets', (_req, res) => {
    try {
      res.json(svc.getBudgets());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /dashboard/operations/policies
   * Lista de políticas de presupuesto configuradas.
   */
  router.get('/dashboard/operations/policies', (_req, res) => {
    try {
      res.json(svc.getPolicies());
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * PATCH /dashboard/operations/policies/:id
   * Actualiza limitUsd, enabled, onExceedAction de una política.
   * Body: { limitUsd?: number, enabled?: boolean, onExceedAction?: string }
   */
  router.patch('/dashboard/operations/policies/:id', (req, res) => {
    try {
      const updated = svc.patchPolicy(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      if (err.message?.includes('not implemented')) {
        res.status(501).json({ error: err.message });
      } else if (err.message?.includes('not found')) {
        res.status(404).json({ error: err.message });
      } else {
        res.status(500).json({ error: String(err) });
      }
    }
  });
}
