import { Router } from 'express';

import { RunsService } from './runs.service';

export function registerRunsRoutes(router: Router) {
  const service = new RunsService();

  // GET /runs — list all runs
  router.get('/runs', (_req, res) => {
    res.json(service.findAll());
  });

  // GET /runs/compare?ids=a,b — compare two or more runs (must be before :id)
  router.get('/runs/compare', (req, res) => {
    const idsParam = req.query.ids as string | undefined;
    if (!idsParam) {
      return res.status(400).json({ ok: false, error: 'ids query param required (comma-separated)' });
    }
    try {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length < 2) {
        return res.status(400).json({ ok: false, error: 'At least 2 run ids required' });
      }
      return res.json(service.compareRuns(ids));
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // GET /runs/:id — single run with steps
  router.get('/runs/:id', (req, res) => {
    const run = service.findById(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }
    return res.json(run);
  });

  // POST /runs — start a new run
  router.post('/runs', (req, res) => {
    try {
      const { flowId, trigger } = req.body;
      if (!flowId) {
        return res.status(400).json({ ok: false, error: 'flowId is required' });
      }
      const run = service.startRun(flowId, trigger);
      return res.status(201).json(run);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // POST /runs/:id/cancel — cancel a run
  router.post('/runs/:id/cancel', (req, res) => {
    const run = service.cancelRun(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }
    return res.json(run);
  });

  // POST /runs/:id/steps/:stepId/approve — approve a step
  router.post('/runs/:id/steps/:stepId/approve', async (req, res) => {
    try {
      const run = await service.approveStep(req.params.id, req.params.stepId);
      if (!run) {
        return res.status(404).json({ ok: false, error: 'Run or step not found' });
      }
      return res.json(run);
    } catch (error) {
      return res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  // POST /runs/:id/steps/:stepId/reject — reject a step
  router.post('/runs/:id/steps/:stepId/reject', async (req, res) => {
    try {
      const { reason } = req.body ?? {};
      const run = await service.rejectStep(req.params.id, req.params.stepId, reason);
      if (!run) {
        return res.status(404).json({ ok: false, error: 'Run or step not found' });
      }
      return res.json(run);
    } catch (error) {
      return res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  // GET /runs/:id/trace — full trace of steps
  router.get('/runs/:id/trace', (req, res) => {
    const run = service.getTrace(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }
    return res.json({ runId: run.id, flowId: run.flowId, status: run.status, steps: run.steps });
  });

  // ── Sprint 7: Operations Advanced ──────────────────────────────────

  // POST /runs/:id/replay — replay a completed run
  router.post('/runs/:id/replay', (req, res) => {
    try {
      const run = service.replayRun(req.params.id);
      return res.status(201).json(run);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // GET /runs/:id/cost — cost breakdown by step
  router.get('/runs/:id/cost', (req, res) => {
    const result = service.getRunCost(req.params.id);
    if (!result) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }
    return res.json(result);
  });

  // GET /usage — aggregated usage/cost
  router.get('/usage', (req, res) => {
    const { from, to, groupBy } = req.query as { from?: string; to?: string; groupBy?: string };
    return res.json(service.getUsage({ from, to, groupBy }));
  });

  // GET /usage/by-agent — usage grouped by agent
  router.get('/usage/by-agent', (_req, res) => {
    return res.json(service.getUsageByAgent());
  });
}
