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

describe('GET operations governance projections', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns budgets through dashboard and operations aliases', async () => {
    jest.spyOn(DashboardService.prototype, 'getOperationsBudgets').mockResolvedValue({
      scope: { level: 'workspace', id: 'workspace-1' },
      lineage: [{ level: 'workspace', id: 'workspace-1', name: 'Workspace One' }],
      budgets: [
        {
          id: 'budget-1',
          name: 'Workspace monthly budget',
          scope: 'workspace',
          targetId: 'workspace-1',
          limitUsd: 1000,
          periodDays: 30,
          currentUsageUsd: 120,
          enabled: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as any);

    const app = buildApp();
    const dashboardRes = await request(app).get('/dashboard/operations/budgets?level=workspace&id=workspace-1');
    const operationsRes = await request(app).get('/operations/budgets?level=workspace&id=workspace-1');

    expect(dashboardRes.status).toBe(200);
    expect(operationsRes.status).toBe(200);
    expect(dashboardRes.body.scope).toEqual({ level: 'workspace', id: 'workspace-1' });
    expect(Array.isArray(dashboardRes.body.budgets)).toBe(true);
    expect(Array.isArray(operationsRes.body.budgets)).toBe(true);
  });

  it('returns policies through dashboard and operations aliases', async () => {
    jest.spyOn(DashboardService.prototype, 'getOperationsPolicies').mockResolvedValue({
      scope: { level: 'workspace', id: 'workspace-1' },
      lineage: [{ level: 'workspace', id: 'workspace-1', name: 'Workspace One' }],
      policies: [
        {
          id: 'policy-1',
          name: 'Default Policy',
          description: 'Baseline policy',
          toolAllowlist: [],
          toolDenylist: [],
          channelRules: {},
          runtimeLimits: {},
          enabled: true,
        },
      ],
    } as any);

    const app = buildApp();
    const dashboardRes = await request(app).get('/dashboard/operations/policies?level=workspace&id=workspace-1');
    const operationsRes = await request(app).get('/operations/policies?level=workspace&id=workspace-1');

    expect(dashboardRes.status).toBe(200);
    expect(operationsRes.status).toBe(200);
    expect(dashboardRes.body.scope).toEqual({ level: 'workspace', id: 'workspace-1' });
    expect(Array.isArray(dashboardRes.body.policies)).toBe(true);
    expect(Array.isArray(operationsRes.body.policies)).toBe(true);
  });
});

