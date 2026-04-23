import { Router } from 'express';

import type {
  BindProfileRequestDto,
  EditorInheritanceDto,
  EditorReadinessDto,
  EditorSectionStatusDto,
  EditorVersionsDto,
  ProfileOverrideRequestDto,
  RuntimeCommandRequestDto,
  UnbindProfileRequestDto,
} from './dashboard.dto';
import { validateMetricsQuery } from './dto/metrics-query.dto';
import { DashboardService } from './dashboard.service';

const VALID_SCOPE_LEVELS = new Set(['agency', 'department', 'workspace', 'agent', 'subagent']);
const VALID_RUNTIME_ACTIONS = new Set(['connect', 'disconnect', 'pause', 'reactivate', 'redirect', 'continue']);

function parseScope(req: { query: Record<string, unknown> }) {
  return {
    level: typeof req.query.level === 'string' ? req.query.level : undefined,
    id: typeof req.query.id === 'string' ? req.query.id : undefined,
  };
}

export function registerDashboardRoutes(router: Router) {
  const service = new DashboardService();

  router.get('/dashboard/overview', async (req, res) => {
    res.json(await service.getOverview(parseScope(req as any)));
  });

  router.get('/dashboard/connections', async (req, res) => {
    res.json(await service.getConnections(parseScope(req as any)));
  });

  router.get('/dashboard/inspector', async (req, res) => {
    res.json(await service.getInspector(parseScope(req as any)));
  });

  router.get('/dashboard/operations', async (req, res) => {
    res.json(await service.getOperations(parseScope(req as any)));
  });

  router.get('/dashboard/operations/runtime-state', async (req, res) => {
    res.json(await service.getOperationsRuntimeState(parseScope(req as any)));
  });

  router.get('/dashboard/operations/recent-runs', async (req, res) => {
    res.json(await service.getOperationsRecentRuns(parseScope(req as any)));
  });

  router.get('/dashboard/operations/pending-actions', async (req, res) => {
    res.json(await service.getOperationsPendingActions(parseScope(req as any)));
  });

  router.get('/dashboard/operations/budgets', async (req, res) => {
    res.json(await service.getOperationsBudgets(parseScope(req as any)));
  });

  router.get('/dashboard/operations/policies', async (req, res) => {
    res.json(await service.getOperationsPolicies(parseScope(req as any)));
  });

  router.get('/dashboard/operations/governance-state', async (req, res) => {
    res.json(await service.getOperationsGovernanceState(parseScope(req as any)));
  });

  // Operations aliases for governance surfaces
  router.get('/operations/budgets', async (req, res) => {
    res.json(await service.getOperationsBudgets(parseScope(req as any)));
  });

  router.get('/operations/policies', async (req, res) => {
    res.json(await service.getOperationsPolicies(parseScope(req as any)));
  });

  router.get('/dashboard/runs', async (req, res) => {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
    res.json(await service.getRuns(parseScope(req as any), { limit }));
  });

  router.get('/dashboard/effective-profile', async (req, res) => {
    res.json(await service.getEffectiveProfile(parseScope(req as any)));
  });

  // ── Analytics Metrics ──────────────────────────────────────────────────────
  function parseMetricInput(
    req: { query: Record<string, unknown> },
    options?: { allowGranularity?: boolean; requireGranularity?: boolean },
  ) {
    return validateMetricsQuery(req.query, options);
  }

  function sendMetricValidationError(res: any, errors: Array<{ field: string; reason: string; value: unknown }>) {
    return res.status(400).json({
      ok: false,
      code: 'INVALID_QUERY',
      errors,
    });
  }

  router.get('/dashboard/metrics/kpis', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsKpis(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/runs', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: true });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsRuns(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/tokens', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: true });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsTokens(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/sessions', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: true });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsSessions(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/budget', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsBudget(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/model-mix', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsModelMix(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/latency', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsLatency(query.value, query.warnings));
  });

  // ── Connections Visuals ────────────────────────────────────────────────────
  router.get('/dashboard/connections/metering', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getConnectionsMetering(query.value, query.warnings));
  });

  router.get('/dashboard/connections/radial', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getConnectionsRadial(query.value, query.warnings));
  });

  router.get('/dashboard/connections/dependency-graph', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getConnectionsDependencyGraph(query.value, query.warnings));
  });

  router.get('/dashboard/connections/topology', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getConnectionsTopology(query.value, query.warnings));
  });

  router.get('/dashboard/connections/flow-graph', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getConnectionsFlowGraph(query.value, query.warnings));
  });

  router.get('/editor/readiness', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getEditorReadiness(query.value, query.warnings) as EditorReadinessDto);
  });

  router.get('/editor/section-status', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getEditorSectionStatus(query.value, query.warnings) as EditorSectionStatusDto);
  });

  router.get('/editor/inheritance', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getEditorInheritance(query.value, query.warnings) as EditorInheritanceDto);
  });

  router.get('/editor/versions', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getEditorVersions(query.value, query.warnings) as EditorVersionsDto);
  });

  router.post('/dashboard/profile/bind', (req, res) => {
    const payload = req.body as BindProfileRequestDto;
    if (!payload?.level || !payload?.id || !payload?.profileId) {
      return res.status(400).json({ ok: false, error: 'level, id and profileId are required' });
    }

    return res.json(service.bindProfile(payload));
  });

  router.post('/dashboard/profile/unbind', (req, res) => {
    const payload = req.body as UnbindProfileRequestDto;
    if (!payload?.level || !payload?.id) {
      return res.status(400).json({ ok: false, error: 'level and id are required' });
    }

    return res.json(service.unbindProfile(payload));
  });

  router.post('/dashboard/profile/override', (req, res) => {
    const payload = req.body as ProfileOverrideRequestDto;
    if (!payload?.level || !payload?.id) {
      return res.status(400).json({ ok: false, error: 'level and id are required' });
    }

    return res.json(service.setProfileOverride(payload));
  });

  router.post('/dashboard/runtime/command', async (req, res) => {
    const payload = req.body as RuntimeCommandRequestDto;
    if (!payload?.level || !payload?.id || !payload?.action) {
      return res.status(400).json({ ok: false, error: 'level, id and action are required' });
    }
    if (!VALID_SCOPE_LEVELS.has(payload.level)) {
      return res.status(400).json({ ok: false, error: `Unsupported level: ${payload.level}` });
    }
    if (!VALID_RUNTIME_ACTIONS.has(payload.action)) {
      return res.status(400).json({ ok: false, error: `Unsupported runtime action: ${payload.action}` });
    }
    if ((payload.action === 'connect' || payload.action === 'redirect') && !payload.target) {
      return res.status(400).json({ ok: false, error: `target is required for ${payload.action}` });
    }
    if (payload.target) {
      if (!VALID_SCOPE_LEVELS.has(payload.target.level)) {
        return res.status(400).json({ ok: false, error: `Unsupported target level: ${payload.target.level}` });
      }
      if (!payload.target.id) {
        return res.status(400).json({ ok: false, error: 'target.id is required when target is provided' });
      }
    }

    try {
      const result = await service.executeRuntimeCommand(payload);
      // Always return 200; the operational outcome is carried in result.result.status.
      // Supported statuses: applied, partial, unsupported_by_runtime, rejected.
      // HTTP 4xx/5xx are reserved for request validation failures and unexpected server errors.
      return res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error executing runtime command';
      return res.status(500).json({
        ok: false,
        error: message,
        command: payload.action,
      });
    }
  });
}
