import { Router } from 'express';

import { RunsService } from './runs.service';

export function registerRunsRoutes(router: Router) {
  const service = new RunsService();

  /** Extrae workspaceId del header x-workspace-id o del query param. */
  const getWorkspaceId = (req: any): string =>
    (req.headers['x-workspace-id'] as string) ??
    (req.query.workspaceId as string) ??
    'default';

  // GET /runs — list all runs
  router.get('/runs', async (req, res) => {
    try {
      return res.json(await service.findAll(getWorkspaceId(req)));
    } catch (error) {
      return res.status(500).json({ ok: false, error: (error as Error).message });
    }
  });

  // GET /runs/compare?ids=a,b — compare two or more runs (must be before :id)
  router.get('/runs/compare', async (req, res) => {
    const idsParam = req.query.ids as string | undefined;
    if (!idsParam) {
      return res.status(400).json({ ok: false, error: 'ids query param required (comma-separated)' });
    }
    try {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length < 2) {
        return res.status(400).json({ ok: false, error: 'At least 2 run ids required' });
      }
      return res.json(await service.compareRuns(ids));
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // GET /runs/:id — single run with steps
  router.get('/runs/:id', async (req, res) => {
    const run = await service.findById(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }
    return res.json(run);
  });

  // POST /runs — start a new run
  router.post('/runs', async (req, res) => {
    try {
      const { flowId, agentId, inputData, metadata } = req.body;
      if (!flowId) {
        return res.status(400).json({ ok: false, error: 'flowId is required' });
      }
      const run = await service.startRun({
        workspaceId: getWorkspaceId(req),
        flowId,
        agentId,
        inputData,
        metadata,
      });
      return res.status(201).json(run);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // POST /runs/:id/cancel — cancel a run
  router.post('/runs/:id/cancel', async (req, res) => {
    try {
      const run = await service.cancelRun(req.params.id);
      if (!run) {
        return res.status(404).json({ ok: false, error: 'Run not found' });
      }
      return res.json(run);
    } catch (error) {
      return res.status(404).json({ ok: false, error: (error as Error).message });
    }
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
  router.get('/runs/:id/trace', async (req, res) => {
    const run = await service.getTrace(req.params.id);
    if (!run) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }
    const replayMetadata = await service.getReplayMetadata(req.params.id);
    return res.json({
      runId:            run.id,
      flowId:           run.flowId,
      status:           run.status,
      steps:            run.steps,
      topologyEvents:   replayMetadata?.topologyEvents   ?? [],
      handoffs:         replayMetadata?.handoffs         ?? [],
      redirects:        replayMetadata?.redirects        ?? [],
      stateTransitions: replayMetadata?.stateTransitions ?? [],
      replay:           replayMetadata?.replay           ?? {},
    });
  });

  // GET /runs/:id/replay-metadata
  router.get('/runs/:id/replay-metadata', async (req, res) => {
    const replayMetadata = await service.getReplayMetadata(req.params.id);
    if (!replayMetadata) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }
    return res.json(replayMetadata);
  });

  // POST /runs/:id/replay — replay a completed run
  router.post('/runs/:id/replay', async (req, res) => {
    try {
      const run = await service.replayRun(req.params.id);
      return res.status(201).json(run);
    } catch (error) {
      return res.status(422).json({ ok: false, error: (error as Error).message });
    }
  });

  // GET /runs/:id/cost — cost breakdown by step
  router.get('/runs/:id/cost', async (req, res) => {
    const result = await service.getRunCost(req.params.id);
    if (!result) {
      return res.status(404).json({ ok: false, error: 'Run not found' });
    }
    return res.json(result);
  });

  // GET /usage — aggregated usage/cost
  router.get('/usage', async (req, res) => {
    const { from, to, groupBy } = req.query as { from?: string; to?: string; groupBy?: string };
    return res.json(await service.getUsage(getWorkspaceId(req), { from, to, groupBy }));
  });

  // GET /usage/by-agent — usage grouped by agent
  router.get('/usage/by-agent', async (req, res) => {
    return res.json(await service.getUsageByAgent(getWorkspaceId(req)));
  });
}
