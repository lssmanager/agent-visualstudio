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

describe('dashboard metrics smoke', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates required scope + window params', async () => {
    const app = buildApp();
    const res = await request(app).get('/dashboard/metrics/kpis?level=workspace&id=workspace-1');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_QUERY');
  });

  it('normalizes legacy lowercase windows and returns payload', async () => {
    jest.spyOn(DashboardService.prototype, 'getMetricsKpis').mockResolvedValue({
      scope: { level: 'workspace', id: 'workspace-1' },
      window: '24H',
      state: 'ready',
      meta: { warnings: ["window '24h' normalized to '24H'"] },
      agents: { current: 1, delta: 0, trend: [] },
      sessions: { current: 0, delta: 0, trend: [] },
      runs: { current: 0, delta: 0, trend: [] },
      channels: { current: 0, delta: 0, trend: [] },
      running: 0,
      awaitingApproval: 0,
      paused: 0,
      snapshots: 0,
    } as any);

    const app = buildApp();
    const res = await request(app).get('/dashboard/metrics/kpis?level=workspace&id=workspace-1&window=24h');
    expect(res.status).toBe(200);
    expect(res.body.window).toBe('24H');
    expect(res.body.meta.warnings?.[0]).toContain('normalized');
  });

  it('rejects unsupported windows', async () => {
    const app = buildApp();
    const res = await request(app).get('/dashboard/metrics/runs?level=workspace&id=workspace-1&window=2H&granularity=1H');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_QUERY');
  });

  it('exposes editor analytics endpoints', async () => {
    jest.spyOn(DashboardService.prototype, 'getEditorReadiness').mockResolvedValue({
      scope: { level: 'workspace', id: 'workspace-1' },
      state: 'ready',
      data: [{ dimension: 'Identity', score: 1 }],
    } as any);

    const app = buildApp();
    const res = await request(app).get('/editor/readiness?level=workspace&id=workspace-1&window=24H');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('ready');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
