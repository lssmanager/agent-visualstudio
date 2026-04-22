import express, { Router } from 'express';
import request from 'supertest';

import { registerDashboardRoutes } from '../src/modules/dashboard/dashboard.controller';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';

function buildApp() {
  const app = express();
  app.use(express.json());
  const router = Router();
  registerDashboardRoutes(router);
  app.use(router);
  return app;
}

describe('GET /dashboard/operations/* dedicated projections', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns runtime-state projection with scope + sessions', async () => {
    jest.spyOn(DashboardService.prototype, 'getOperationsRuntimeState').mockResolvedValue({
      scope: { level: 'workspace', id: 'workspace-1' },
      lineage: [
        { level: 'agency', id: 'agency-default', name: 'Agency' },
        { level: 'workspace', id: 'workspace-1', name: 'Workspace One' },
      ],
      recentSessions: [{ id: 's-1', status: 'active', channel: 'web' }],
    } as any);

    const app = buildApp();
    const res = await request(app).get('/dashboard/operations/runtime-state?level=workspace&id=workspace-1');

    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({ level: 'workspace', id: 'workspace-1' });
    expect(Array.isArray(res.body.recentSessions)).toBe(true);
  });

  it('returns recent-runs projection with scope + runs list', async () => {
    jest.spyOn(DashboardService.prototype, 'getOperationsRecentRuns').mockResolvedValue({
      scope: { level: 'workspace', id: 'workspace-1' },
      lineage: [{ level: 'workspace', id: 'workspace-1', name: 'Workspace One' }],
      recentRuns: [{ id: 'run-1', flowId: 'flow-1', status: 'running', startedAt: '2026-01-01T00:00:00.000Z', costUsd: 1 }],
    } as any);

    const app = buildApp();
    const res = await request(app).get('/dashboard/operations/recent-runs?level=workspace&id=workspace-1');

    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({ level: 'workspace', id: 'workspace-1' });
    expect(Array.isArray(res.body.recentRuns)).toBe(true);
  });

  it('returns pending-actions projection with queue details', async () => {
    jest.spyOn(DashboardService.prototype, 'getOperationsPendingActions').mockResolvedValue({
      scope: { level: 'workspace', id: 'workspace-1' },
      lineage: [{ level: 'workspace', id: 'workspace-1', name: 'Workspace One' }],
      pendingActions: [{ id: 'runtime-health', type: 'runtime', severity: 'critical', message: 'Runtime degraded' }],
      approvalQueue: [{ runId: 'run-1', stepId: 'step-1', nodeId: 'node-1', requestedAt: '2026-01-01T00:00:00.000Z' }],
    } as any);

    const app = buildApp();
    const res = await request(app).get('/dashboard/operations/pending-actions?level=workspace&id=workspace-1');

    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({ level: 'workspace', id: 'workspace-1' });
    expect(Array.isArray(res.body.pendingActions)).toBe(true);
    expect(Array.isArray(res.body.approvalQueue)).toBe(true);
  });
});

