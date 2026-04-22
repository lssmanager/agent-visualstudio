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

describe('GET /dashboard/runs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns scoped runs in a dashboard-aligned envelope', async () => {
    jest.spyOn(DashboardService.prototype, 'getRuns').mockResolvedValue({
      scope: { level: 'workspace', id: 'workspace-1' },
      lineage: [
        { level: 'agency', id: 'agency-default', name: 'Agency' },
        { level: 'workspace', id: 'workspace-1', name: 'Workspace One' },
      ],
      mode: 'scoped',
      projection: 'dashboard_scoped_v1',
      total: 1,
      runs: [
        {
          id: 'run-1',
          workspaceId: 'workspace-1',
          flowId: 'flow-1',
          status: 'running',
          trigger: { type: 'manual' },
          steps: [],
          startedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as any);

    const app = buildApp();
    const res = await request(app).get('/dashboard/runs?level=workspace&id=workspace-1&limit=25');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        mode: 'scoped',
        projection: 'dashboard_scoped_v1',
        total: 1,
      }),
    );
    expect(res.body.scope).toEqual({ level: 'workspace', id: 'workspace-1' });
    expect(res.body.runs).toHaveLength(1);
    expect(res.body.runs[0]).toEqual(
      expect.objectContaining({
        id: 'run-1',
        workspaceId: 'workspace-1',
      }),
    );
  });
});
