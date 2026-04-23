import { Router } from 'express';

import type {
  BindProfileRequestDto,
  EditorInheritanceDto,
  EditorReadinessDto,
  EditorSectionStatusDto,
  EditorVersionsDto,
  EditorSkillsToolsPatchDto,
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

  router.get('/dashboard/operations/alerts', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getOperationsAlerts(query.value, query.warnings));
  });

  router.get('/dashboard/operations/actions-heatmap', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getOperationsActionsHeatmap(query.value, query.warnings));
  });

  router.get('/dashboard/operations/pending-actions', async (req, res) => {
    res.json(await service.getOperationsPendingActions(parseScope(req as any)));
  });

  router.get('/dashboard/operations/budgets', async (req, res) => {
    res.json(await service.getOperationsBudgets(parseScope(req as any)));
  });

  router.get('/dashboard/operations/cost-profile', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getOperationsCostProfile(query.value, query.warnings));
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

  router.get('/dashboard/metrics/sessions-heatmap', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsSessionsHeatmap(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/runs-token-correlation', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsRunsTokenCorrelation(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/budget-forecast', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getMetricsBudgetForecast(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/cost-anomaly-bands', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getMetricsCostAnomalyBands(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/fallback-transitions', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getMetricsFallbackTransitions(query.value, query.warnings));
  });

  router.get('/dashboard/metrics/budget-guardrail-simulation', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getMetricsBudgetGuardrailSimulation(query.value, query.warnings));
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

  router.get('/dashboard/connections/routing-decision-flow', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getConnectionsRoutingDecisionFlow(query.value, query.warnings));
  });

  router.get('/dashboard/connections/org-chart', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getConnectionsOrgChart(query.value, query.warnings));
  });

  router.get('/dashboard/connections/hierarchy', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    const mode = req.query.mode === 'treemap' ? 'treemap' : req.query.mode === 'sunburst' ? 'sunburst' : null;
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    if (!mode) {
      return res.status(422).json({ ok: false, error: 'mode must be sunburst or treemap' });
    }
    res.json(await service.getConnectionsHierarchy(query.value, mode, query.warnings));
  });

  router.get('/dashboard/connections/edge-reliability', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getConnectionsEdgeReliability(query.value, query.warnings));
  });

  router.get('/dashboard/connections/hook-blast-radius', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getConnectionsHookBlastRadius(query.value, query.warnings));
  });

  router.get('/dashboard/connections/routing-drift', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getConnectionsRoutingDrift(query.value, query.warnings));
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

  router.get('/editor/skills-tools', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getEditorSkillsTools(query.value, query.warnings));
  });

  router.patch('/editor/skills-tools', async (req, res) => {
    const payload = req.body as EditorSkillsToolsPatchDto;
    if (!payload?.level || !payload?.id) {
      return res.status(400).json({ ok: false, error: 'level and id are required' });
    }
    return res.json(await service.patchEditorSkillsTools(payload));
  });

  router.get('/editor/readiness-by-workspace', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getEditorReadinessByWorkspace(query.value, query.warnings));
  });

  router.get('/editor/dependencies', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) {
      return sendMetricValidationError(res, query.errors);
    }
    res.json(await service.getEditorDependencies(query.value, query.warnings));
  });

  router.get('/dashboard/operations/approval-forecast', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getOperationsApprovalForecast(query.value, query.warnings));
  });

  router.get('/dashboard/operations/policy-conflicts', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getOperationsPolicyConflicts(query.value, query.warnings));
  });

  router.get('/dashboard/operations/runtime-recovery-simulation', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getOperationsRuntimeRecoverySimulation(query.value, query.warnings));
  });

  router.get('/editor/prompt-graph', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getEditorPromptGraph(query.value, query.warnings));
  });

  router.get('/editor/section-dependency-impact', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getEditorSectionDependencyImpact(query.value, query.warnings));
  });

  router.get('/editor/rollback-risk', async (req, res) => {
    const query = parseMetricInput(req as any, { allowGranularity: false });
    if (!query.ok || !query.value) return sendMetricValidationError(res, query.errors);
    res.json(await service.getEditorRollbackRisk(query.value, query.warnings));
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
