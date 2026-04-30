/**
 * dashboard.service.test.ts — F0-07
 *
 * Unit tests for DashboardService verifying that all methods
 * use the injected PrismaClient and no longer depend on workspaceStore.
 */

import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import type {
  KpiResult,
  RuntimeState,
  TimelineBucket,
  TokenBucket,
  ModelMixRow,
  LatencyResult,
} from '../src/modules/dashboard/dashboard.service';

// ── Minimal PrismaClient mock ────────────────────────────────────────────────

function mockFindMany(rows: unknown[]) {
  return jest.fn().mockResolvedValue(rows);
}

function mockCount(n: number) {
  return jest.fn().mockResolvedValue(n);
}

function mockAggregate(sum: Record<string, unknown>) {
  return jest.fn().mockResolvedValue({ _sum: sum });
}

function mockFindUnique(row: unknown) {
  return jest.fn().mockResolvedValue(row);
}

function buildPrismaMock(overrides: Partial<{
  runFindMany: jest.Mock;
  runCount: jest.Mock;
  runAggregate: jest.Mock;
  runStepFindMany: jest.Mock;
  budgetPolicyFindMany: jest.Mock;
  budgetPolicyFindUnique: jest.Mock;
  budgetPolicyUpdate: jest.Mock;
}> = {}) {
  const now = new Date();
  const completedAt = new Date(now.getTime() + 5_000);

  return {
    run: {
      findMany:  overrides.runFindMany   ?? mockFindMany([]),
      count:     overrides.runCount      ?? mockCount(0),
      aggregate: overrides.runAggregate  ?? mockAggregate({ totalCostUsd: 0 }),
    },
    runStep: {
      findMany: overrides.runStepFindMany ?? mockFindMany([]),
    },
    budgetPolicy: {
      findMany:   overrides.budgetPolicyFindMany   ?? mockFindMany([]),
      findUnique: overrides.budgetPolicyFindUnique ?? mockFindUnique(null),
      update:     overrides.budgetPolicyUpdate     ?? jest.fn(),
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardService (F0-07 — Prisma migration)', () => {

  it('is instantiated with a PrismaClient — no workspaceStore', () => {
    const prisma = buildPrismaMock();
    const svc = new DashboardService(prisma as any);
    expect(svc).toBeInstanceOf(DashboardService);
  });

  // ── getKpis ──────────────────────────────────────────────────────────────

  describe('getKpis()', () => {
    it('returns zero-state kpis when there are no runs', async () => {
      const svc = new DashboardService(buildPrismaMock() as any);
      const result: KpiResult = await svc.getKpis();

      expect(result.totalRuns).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.avgDurationMs).toBe(0);
      expect(result.totalCostUsd).toBe(0);
    });

    it('calculates successRate from completed runs', async () => {
      const now = new Date();
      const completed = { status: 'completed', startedAt: now, completedAt: new Date(now.getTime() + 2_000), totalCostUsd: 0.01 };
      const failed    = { status: 'failed',    startedAt: now, completedAt: null, totalCostUsd: 0 };

      const prisma = buildPrismaMock({
        runFindMany: jest.fn()
          .mockResolvedValueOnce([completed, failed]) // curr window
          .mockResolvedValueOnce([]),                  // prev window
      });
      const svc = new DashboardService(prisma as any);
      const result = await svc.getKpis();

      expect(result.totalRuns).toBe(2);
      expect(result.successRate).toBe(0.5);
      expect(result.avgDurationMs).toBe(2_000);
      expect(result.totalCostUsd).toBe(0.01);
    });
  });

  // ── getRunsTimeline ───────────────────────────────────────────────────────

  describe('getRunsTimeline()', () => {
    it('returns empty buckets when there are no runs', async () => {
      const svc = new DashboardService(buildPrismaMock() as any);
      const result = await svc.getRunsTimeline();
      expect(result.buckets).toEqual([]);
    });

    it('groups runs into hourly buckets', async () => {
      const base = new Date('2024-01-01T12:00:00Z');
      const runs = [
        { startedAt: base,                           totalCostUsd: 0.01 },
        { startedAt: new Date(base.getTime() + 600_000), totalCostUsd: 0.02 },
      ];
      const prisma = buildPrismaMock({ runFindMany: mockFindMany(runs) });
      const svc    = new DashboardService(prisma as any);
      const result = await svc.getRunsTimeline({ window: '24h', bucket: '1h' });

      expect(result.buckets.length).toBe(1);
      const bucket: TimelineBucket = result.buckets[0];
      expect(bucket.count).toBe(2);
      expect(bucket.costUsd).toBeCloseTo(0.03, 4);
    });
  });

  // ── getTokensTimeline ─────────────────────────────────────────────────────

  describe('getTokensTimeline()', () => {
    it('returns empty buckets when there are no steps', async () => {
      const svc = new DashboardService(buildPrismaMock() as any);
      const result = await svc.getTokensTimeline();
      expect(result.buckets).toEqual([]);
    });

    it('reads tokenUsage using input/output keys (run-engine convention)', async () => {
      const base = new Date('2024-01-01T12:00:00Z');
      const steps = [
        { startedAt: base, tokenUsage: { input: 100, output: 50 }, costUsd: 0.005 },
      ];
      const prisma = buildPrismaMock({ runStepFindMany: mockFindMany(steps) });
      const svc    = new DashboardService(prisma as any);
      const result = await svc.getTokensTimeline({ window: '24h', bucket: '1h' });

      expect(result.buckets.length).toBe(1);
      const bucket: TokenBucket = result.buckets[0];
      expect(bucket.promptTokens).toBe(100);
      expect(bucket.completionTokens).toBe(50);
      expect(bucket.totalTokens).toBe(150);
    });

    it('also reads tokenUsage using prompt_tokens/completion_tokens keys (OpenAI convention)', async () => {
      const base = new Date('2024-01-01T12:00:00Z');
      const steps = [
        { startedAt: base, tokenUsage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 }, costUsd: 0.01 },
      ];
      const prisma = buildPrismaMock({ runStepFindMany: mockFindMany(steps) });
      const svc    = new DashboardService(prisma as any);
      const result = await svc.getTokensTimeline({ window: '24h', bucket: '1h' });

      expect(result.buckets.length).toBe(1);
      const bucket: TokenBucket = result.buckets[0];
      expect(bucket.promptTokens).toBe(200);
      expect(bucket.completionTokens).toBe(80);
      expect(bucket.totalTokens).toBe(280);
    });
  });

  // ── getRuntimeState ────────────────────────────────────────────────────────

  describe('getRuntimeState()', () => {
    it('returns correct counts by status', async () => {
      const prisma = buildPrismaMock({
        runCount: jest.fn()
          .mockResolvedValueOnce(3)   // running
          .mockResolvedValueOnce(7)   // queued
          .mockResolvedValueOnce(1),  // waiting_approval
      });
      const svc = new DashboardService(prisma as any);
      const result: RuntimeState = await svc.getRuntimeState();

      expect(result.running).toBe(3);
      expect(result.queued).toBe(7);
      expect(result.waitingApproval).toBe(1);
      expect(result.total).toBe(11);
    });
  });

  // ── getModelMix ────────────────────────────────────────────────────────────

  describe('getModelMix()', () => {
    it('returns empty rows when there are no steps', async () => {
      const svc = new DashboardService(buildPrismaMock() as any);
      const result = await svc.getModelMix();
      expect(result.rows).toEqual([]);
    });

    it('computes cost distribution per model', async () => {
      const steps = [
        { costUsd: 0.10, agent: { model: 'gpt-4o' } },
        { costUsd: 0.30, agent: { model: 'gpt-4o' } },
        { costUsd: 0.20, agent: { model: 'claude-3' } },
      ];
      const prisma = buildPrismaMock({ runStepFindMany: mockFindMany(steps) });
      const svc    = new DashboardService(prisma as any);
      const result = await svc.getModelMix();

      expect(result.rows.length).toBe(2);
      const gpt4o = result.rows.find((r: ModelMixRow) => r.model === 'gpt-4o')!;
      expect(gpt4o.costUsd).toBeCloseTo(0.4, 4);
      expect(gpt4o.costPct).toBeCloseTo(66.67, 1);
      expect(gpt4o.steps).toBe(2);
    });
  });

  // ── getAlerts ──────────────────────────────────────────────────────────────

  describe('getAlerts()', () => {
    it('returns no alerts in a quiet system', async () => {
      const svc = new DashboardService(buildPrismaMock() as any);
      const result = await svc.getAlerts();
      expect(result.alerts).toEqual([]);
    });

    it('raises high_error_rate alert when > 20% failed in last 2h', async () => {
      const recent = [
        { status: 'failed' }, { status: 'failed' }, { status: 'failed' },
        { status: 'completed' }, { status: 'completed' }, { status: 'completed' },
        { status: 'completed' }, { status: 'completed' }, { status: 'completed' },
        // 3/9 ≈ 33% error rate → warning
      ];
      const prisma = buildPrismaMock({
        runFindMany: jest.fn()
          .mockResolvedValueOnce(recent)   // recent 2h runs
          .mockResolvedValueOnce([]),       // long-running runs
        budgetPolicyFindMany: mockFindMany([]),
      });
      const svc = new DashboardService(prisma as any);
      const result = await svc.getAlerts();

      const errAlert = result.alerts.find(a => a.type === 'high_error_rate');
      expect(errAlert).toBeDefined();
      expect(errAlert!.level).toBe('warning');
    });
  });

  // ── getPolicies ───────────────────────────────────────────────────────────

  describe('getPolicies()', () => {
    it('delegates to prisma.budgetPolicy.findMany', async () => {
      const policies = [
        { id: 'p1', limitUsd: 100, periodDays: 30, alertAt: 0.8 },
      ];
      const prisma = buildPrismaMock({ budgetPolicyFindMany: mockFindMany(policies) });
      const svc    = new DashboardService(prisma as any);
      const result = await svc.getPolicies();

      expect(result).toEqual(policies);
    });
  });

  // ── patchPolicy ────────────────────────────────────────────────────────────

  describe('patchPolicy()', () => {
    it('throws when policy is not found', async () => {
      const prisma = buildPrismaMock({
        budgetPolicyFindUnique: mockFindUnique(null),
      });
      const svc = new DashboardService(prisma as any);
      await expect(svc.patchPolicy('nonexistent', { limitUsd: 50 }))
        .rejects.toThrow('not found');
    });

    it('calls prisma.budgetPolicy.update with only provided fields', async () => {
      const existing = { id: 'p1', limitUsd: 100, periodDays: 30, alertAt: 0.8 };
      const updated  = { ...existing, limitUsd: 200 };
      const updateMock = jest.fn().mockResolvedValue(updated);
      const prisma = buildPrismaMock({
        budgetPolicyFindUnique: mockFindUnique(existing),
        budgetPolicyUpdate:     updateMock,
      });
      const svc    = new DashboardService(prisma as any);
      const result = await svc.patchPolicy('p1', { limitUsd: 200 });

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data:  { limitUsd: 200 },
      });
      expect(result).toEqual(updated);
    });
  });

});
