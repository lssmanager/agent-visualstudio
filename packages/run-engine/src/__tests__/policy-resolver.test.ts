/**
 * policy-resolver.test.ts
 *
 * Unit tests for PolicyResolver and the standalone resolveModelPolicy /
 * resolveBudgetPolicy helpers.
 *
 * Strategy: mock PrismaClient at the repository layer. Each test controls
 * which scope levels return a row by configuring `mockFindUnique` side effects.
 *
 * Cascade under test:
 *   agent → workspace → department → agency
 *
 * Both policies (budget + model) are resolved independently — a run can
 * inherit budget from workspace while using model policy from agency.
 */

import {
  PolicyResolver,
  resolveModelPolicy,
  resolveBudgetPolicy,
  toBudgetSpec,
  toModelSpec,
  type PolicyResolverContext,
} from '../policy-resolver';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date('2026-01-01T00:00:00Z');

function makeBudgetRow(overrides: Partial<{
  id: string;
  agentId: string | null;
  workspaceId: string | null;
  departmentId: string | null;
  agencyId: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'bp-1',
    limitUsd: 100,
    periodDays: 30,
    alertAt: 0.8,
    agentId:      overrides.agentId      ?? null,
    workspaceId:  overrides.workspaceId  ?? null,
    departmentId: overrides.departmentId ?? null,
    agencyId:     overrides.agencyId     ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeModelRow(overrides: Partial<{
  id: string;
  primaryModel: string;
  fallbackChain: string[];
  agentId: string | null;
  workspaceId: string | null;
  departmentId: string | null;
  agencyId: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'mp-1',
    primaryModel:  overrides.primaryModel  ?? 'openai/gpt-4o',
    fallbackChain: overrides.fallbackChain ?? [],
    temperature:   null,
    maxTokens:     null,
    agentId:      overrides.agentId      ?? null,
    workspaceId:  overrides.workspaceId  ?? null,
    departmentId: overrides.departmentId ?? null,
    agencyId:     overrides.agencyId     ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const BASE_CTX: PolicyResolverContext = {
  agentId:      'agent-1',
  workspaceId:  'ws-1',
  departmentId: 'dept-1',
  agencyId:     'agency-1',
};

/**
 * Build a minimal PrismaClient mock.
 * `budgetMap` and `modelMap` are keyed by the WHERE argument JSON:
 *   { agentId: 'x' }       → JSON.stringify key
 * If no entry → returns null (policy not configured at that scope).
 */
function makePrisma(opts: {
  budgetMap?: Record<string, ReturnType<typeof makeBudgetRow>>;
  modelMap?:  Record<string, ReturnType<typeof makeModelRow>>;
}) {
  const budgetMap = opts.budgetMap ?? {};
  const modelMap  = opts.modelMap  ?? {};

  const budgetFindUnique = jest.fn((args: { where: Record<string, unknown> }) => {
    const key = JSON.stringify(args.where);
    return Promise.resolve(budgetMap[key] ?? null);
  });

  const modelFindUnique = jest.fn((args: { where: Record<string, unknown> }) => {
    const key = JSON.stringify(args.where);
    return Promise.resolve(modelMap[key] ?? null);
  });

  return {
    budgetPolicy: { findUnique: budgetFindUnique },
    modelPolicy:  { findUnique: modelFindUnique },
    _budgetFindUnique: budgetFindUnique,
    _modelFindUnique:  modelFindUnique,
  } as unknown as ReturnType<typeof makePrismaTyped>;
}

function makePrismaTyped() {
  return makePrisma({}) as any;
}

// ─── 1. ModelPolicy cascade ───────────────────────────────────────────────────

describe('PolicyResolver.resolveModel() — cascade', () => {
  it('returns agent-level policy when agent has a row', async () => {
    const agentRow = makeModelRow({ id: 'mp-agent', agentId: 'agent-1' });
    const db = makePrisma({
      modelMap: { '{"agentId":"agent-1"}': agentRow },
    });
    const resolver = new PolicyResolver(db);
    const result   = await resolver.resolveModel(BASE_CTX);

    expect(result?.level).toBe('agent');
    expect(result?.policy.id).toBe('mp-agent');
  });

  it('falls through to workspace when no agent policy', async () => {
    const wsRow = makeModelRow({ id: 'mp-ws', workspaceId: 'ws-1' });
    const db = makePrisma({
      modelMap: { '{"workspaceId":"ws-1"}': wsRow },
    });
    const resolver = new PolicyResolver(db);
    const result   = await resolver.resolveModel(BASE_CTX);

    expect(result?.level).toBe('workspace');
    expect(result?.policy.id).toBe('mp-ws');
  });

  it('falls through to department when no agent/workspace policy', async () => {
    const deptRow = makeModelRow({ id: 'mp-dept', departmentId: 'dept-1' });
    const db = makePrisma({
      modelMap: { '{"departmentId":"dept-1"}': deptRow },
    });
    const resolver = new PolicyResolver(db);
    const result   = await resolver.resolveModel(BASE_CTX);

    expect(result?.level).toBe('department');
    expect(result?.policy.id).toBe('mp-dept');
  });

  it('falls through to agency when no higher-level policy', async () => {
    const agencyRow = makeModelRow({ id: 'mp-agency', agencyId: 'agency-1' });
    const db = makePrisma({
      modelMap: { '{"agencyId":"agency-1"}': agencyRow },
    });
    const resolver = new PolicyResolver(db);
    const result   = await resolver.resolveModel(BASE_CTX);

    expect(result?.level).toBe('agency');
    expect(result?.policy.id).toBe('mp-agency');
  });

  it('returns null when no policy at any level', async () => {
    const db = makePrisma({ modelMap: {} });
    const resolver = new PolicyResolver(db);
    const result   = await resolver.resolveModel(BASE_CTX);

    expect(result).toBeNull();
  });

  it('agent-level policy short-circuits — workspace/dept/agency are NOT queried', async () => {
    const agentRow = makeModelRow({ id: 'mp-agent', agentId: 'agent-1' });
    const db = makePrisma({
      modelMap: {
        '{"agentId":"agent-1"}':     agentRow,
        '{"workspaceId":"ws-1"}':    makeModelRow({ id: 'mp-ws' }),
        '{"departmentId":"dept-1"}': makeModelRow({ id: 'mp-dept' }),
        '{"agencyId":"agency-1"}':   makeModelRow({ id: 'mp-agency' }),
      },
    });
    const resolver = new PolicyResolver(db);
    await resolver.resolveModel(BASE_CTX);

    // findUnique called only once (agent) — cascade stops
    expect((db as any)._modelFindUnique).toHaveBeenCalledTimes(1);
    expect((db as any)._modelFindUnique.mock.calls[0][0].where).toEqual({ agentId: 'agent-1' });
  });
});

// ─── 2. BudgetPolicy cascade ──────────────────────────────────────────────────

describe('PolicyResolver.resolveBudget() — cascade', () => {
  it('returns agent-level budget when agent has a row', async () => {
    const row = makeBudgetRow({ id: 'bp-agent', agentId: 'agent-1' });
    const db  = makePrisma({ budgetMap: { '{"agentId":"agent-1"}': row } });
    const res = await new PolicyResolver(db).resolveBudget(BASE_CTX);

    expect(res?.level).toBe('agent');
    expect(res?.policy.limitUsd).toBe(100);
  });

  it('falls through to workspace', async () => {
    const row = makeBudgetRow({ id: 'bp-ws', workspaceId: 'ws-1' });
    const db  = makePrisma({ budgetMap: { '{"workspaceId":"ws-1"}': row } });
    const res = await new PolicyResolver(db).resolveBudget(BASE_CTX);

    expect(res?.level).toBe('workspace');
  });

  it('falls through to department', async () => {
    const row = makeBudgetRow({ id: 'bp-dept', departmentId: 'dept-1' });
    const db  = makePrisma({ budgetMap: { '{"departmentId":"dept-1"}': row } });
    const res = await new PolicyResolver(db).resolveBudget(BASE_CTX);

    expect(res?.level).toBe('department');
  });

  it('falls through to agency', async () => {
    const row = makeBudgetRow({ id: 'bp-agency', agencyId: 'agency-1' });
    const db  = makePrisma({ budgetMap: { '{"agencyId":"agency-1"}': row } });
    const res = await new PolicyResolver(db).resolveBudget(BASE_CTX);

    expect(res?.level).toBe('agency');
  });

  it('returns null when no budget policy anywhere', async () => {
    const res = await new PolicyResolver(makePrisma({})).resolveBudget(BASE_CTX);
    expect(res).toBeNull();
  });
});

// ─── 3. resolve() — combined + independent resolution ────────────────────────

describe('PolicyResolver.resolve() — combined policy', () => {
  it('resolves budget and model from different hierarchy levels independently', async () => {
    // Budget at workspace, model at agency
    const budgetRow = makeBudgetRow({ id: 'bp-ws', workspaceId: 'ws-1' });
    const modelRow  = makeModelRow({ id: 'mp-agency', agencyId: 'agency-1' });
    const db = makePrisma({
      budgetMap: { '{"workspaceId":"ws-1"}':  budgetRow },
      modelMap:  { '{"agencyId":"agency-1"}': modelRow  },
    });

    const policy = await new PolicyResolver(db).resolve(BASE_CTX);

    expect(policy.budgetResolvedFrom).toBe('workspace');
    expect(policy.modelResolvedFrom).toBe('agency');
    expect(policy.budget?.id).toBe('bp-ws');
    expect(policy.model?.id).toBe('mp-agency');
  });

  it('returns null for both when no policies exist', async () => {
    const policy = await new PolicyResolver(makePrisma({})).resolve(BASE_CTX);

    expect(policy.budget).toBeNull();
    expect(policy.model).toBeNull();
    expect(policy.budgetResolvedFrom).toBeNull();
    expect(policy.modelResolvedFrom).toBeNull();
  });

  it('resolves both policies when both present at agent level', async () => {
    const bRow = makeBudgetRow({ id: 'bp-a', agentId: 'agent-1' });
    const mRow = makeModelRow({ id: 'mp-a', agentId: 'agent-1' });
    const db = makePrisma({
      budgetMap: { '{"agentId":"agent-1"}': bRow },
      modelMap:  { '{"agentId":"agent-1"}': mRow },
    });

    const policy = await new PolicyResolver(db).resolve(BASE_CTX);

    expect(policy.budgetResolvedFrom).toBe('agent');
    expect(policy.modelResolvedFrom).toBe('agent');
  });
});

// ─── 4. Standalone helpers ────────────────────────────────────────────────────

describe('resolveModelPolicy() standalone', () => {
  it('returns ModelPolicySpec when policy found at agent level', async () => {
    const row = makeModelRow({ id: 'mp-s', agentId: 'agent-1', primaryModel: 'anthropic/claude-3-7-sonnet' });
    const db  = makePrisma({ modelMap: { '{"agentId":"agent-1"}': row } });
    const result = await resolveModelPolicy(db as any, BASE_CTX);

    expect(result).not.toBeNull();
    expect(result!.primaryModel).toBe('anthropic/claude-3-7-sonnet');
    expect(result!.fallbackChain).toEqual([]);
  });

  it('returns null when no model policy at any level', async () => {
    const result = await resolveModelPolicy(makePrisma({}) as any, BASE_CTX);
    expect(result).toBeNull();
  });

  it('exposes fallbackChain array correctly', async () => {
    const chain = ['qwen/qwen-plus', 'openai/gpt-4o-mini'];
    const row   = makeModelRow({ agentId: 'agent-1', fallbackChain: chain });
    const db    = makePrisma({ modelMap: { '{"agentId":"agent-1"}': row } });
    const result = await resolveModelPolicy(db as any, BASE_CTX);

    expect(result!.fallbackChain).toEqual(chain);
  });
});

describe('resolveBudgetPolicy() standalone', () => {
  it('returns BudgetPolicySpec at agency level', async () => {
    const row    = makeBudgetRow({ id: 'bp-agy', agencyId: 'agency-1' });
    const db     = makePrisma({ budgetMap: { '{"agencyId":"agency-1"}': row } });
    const result = await resolveBudgetPolicy(db as any, BASE_CTX);

    expect(result?.limitUsd).toBe(100);
    expect(result?.periodDays).toBe(30);
    expect(result?.alertAt).toBe(0.8);
  });

  it('returns null when no budget policy', async () => {
    const result = await resolveBudgetPolicy(makePrisma({}) as any, BASE_CTX);
    expect(result).toBeNull();
  });
});

// ─── 5. Spec mapper correctness ───────────────────────────────────────────────

describe('toBudgetSpec() mapper', () => {
  it('serialises Date fields to ISO strings', () => {
    const row  = makeBudgetRow({ agentId: 'a' });
    const spec = toBudgetSpec(row);

    expect(spec.createdAt).toBe(NOW.toISOString());
    expect(spec.updatedAt).toBe(NOW.toISOString());
    expect(typeof spec.limitUsd).toBe('number');
  });
});

describe('toModelSpec() mapper', () => {
  it('serialises Date fields and preserves fallbackChain', () => {
    const row  = makeModelRow({ fallbackChain: ['x', 'y'] });
    const spec = toModelSpec(row);

    expect(spec.createdAt).toBe(NOW.toISOString());
    expect(spec.fallbackChain).toEqual(['x', 'y']);
  });

  it('passes temperature and maxTokens through (including null)', () => {
    const row  = makeModelRow();
    const spec = toModelSpec(row);

    expect(spec.temperature).toBeNull();
    expect(spec.maxTokens).toBeNull();
  });
});
