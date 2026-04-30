/**
 * BUG-FIX (test flakiness): DELEGATION_TIMEOUT_MS is a module-level constant
 * read at import time. To control its value in tests we set the env var BEFORE
 * any import from hierarchy-status.service.ts and use jest.isolateModules() for
 * the blocked-step scenario so the module re-evaluates the constant.
 *
 * Default (no env var) → 30 000 ms. Tests that need a different threshold use
 * jest.isolateModules() to load a fresh module copy.
 */

// Set default timeout env before any static imports evaluate the constant.
process.env['DELEGATION_TIMEOUT_MS'] = '30000'

import {
  HierarchyStatusService,
  isBlocked,
  deriveParentStatus,
  DELEGATION_TIMEOUT_MS,
} from '../hierarchy-status.service.js'

// ── Prisma mock factory ───────────────────────────────────────────────────

function makePrisma(
  overrides: {
    findUnique?: jest.Mock
    findMany?:  jest.Mock
    findFirst?: jest.Mock
  } = {},
) {
  return {
    run: {
      findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
      findMany:   overrides.findMany  ?? jest.fn().mockResolvedValue([]),
      findFirst:  overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    },
  } as any
}

// ── Helpers ───────────────────────────────────────────────────────────────

const NOW = new Date('2026-01-01T12:00:00Z')

function makeStep(overrides: Partial<any> = {}): any {
  return {
    id:          'step-1',
    runId:       'run-1',
    nodeId:      'node-1',
    nodeType:    'agent',
    status:      'completed',
    input:       { prompt: 'hello' },
    output:      { text: 'world' },
    error:       null,
    startedAt:   NOW,
    completedAt: NOW,
    createdAt:   NOW,
    costUsd:     0.001,
    tokenUsage:  { model: 'gpt-4o', provider: 'openai', promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    retryCount:  0,
    agentId:     'agent-1',
    ...overrides,
  }
}

function makeRun(steps: any[] = [], overrides: Partial<any> = {}): any {
  return {
    id:          'run-1',
    flowId:      'flow-1',
    agencyId:    null,
    status:      'running',
    trigger:     { type: 'manual' },
    error:       null,
    startedAt:   NOW,
    completedAt: null,
    metadata:    {},
    createdAt:   NOW,
    steps,
    flow: { agent: { id: 'agent-1', workspaceId: 'ws-1' } },
    ...overrides,
  }
}

// ── isBlocked() ───────────────────────────────────────────────────────────

describe('isBlocked()', () => {
  const longAgo = new Date(Date.now() - 60_000)  // 60 s ago
  const recent  = new Date(Date.now() - 5_000)   // 5 s ago

  it('returns false when status is not queued', () => {
    expect(isBlocked({ status: 'running', startedAt: null, createdAt: longAgo })).toBe(false)
  })

  it('returns false when startedAt is not null (step already started)', () => {
    expect(isBlocked({ status: 'queued', startedAt: new Date(), createdAt: longAgo })).toBe(false)
  })

  it('returns false when createdAt is within the timeout threshold', () => {
    expect(isBlocked({ status: 'queued', startedAt: null, createdAt: recent })).toBe(false)
  })

  it('returns true when queued, never started, and older than DELEGATION_TIMEOUT_MS', () => {
    expect(isBlocked({ status: 'queued', startedAt: null, createdAt: longAgo })).toBe(true)
  })
})

// ── deriveParentStatus() ──────────────────────────────────────────────────

describe('deriveParentStatus()', () => {
  it('returns completed for empty children array', () => {
    expect(deriveParentStatus([])).toBe('completed')
  })

  it('returns completed when all children are completed', () => {
    const cs = [{ status: 'completed' as const }, { status: 'completed' as const }]
    expect(deriveParentStatus(cs)).toBe('completed')
  })

  it('returns completed when all children are completed/skipped/cancelled', () => {
    const cs = [
      { status: 'completed' as const },
      { status: 'skipped'   as const },
      { status: 'cancelled' as const },
    ]
    expect(deriveParentStatus(cs)).toBe('completed')
  })

  it('returns queued when any child is queued', () => {
    const cs = [{ status: 'completed' as const }, { status: 'queued' as const }]
    expect(deriveParentStatus(cs)).toBe('queued')
  })

  it('returns running when any child is running (no failed/blocked)', () => {
    const cs = [{ status: 'completed' as const }, { status: 'running' as const }]
    expect(deriveParentStatus(cs)).toBe('running')
  })

  it('returns failed over running (failed has higher priority)', () => {
    const cs = [{ status: 'running' as const }, { status: 'failed' as const }]
    expect(deriveParentStatus(cs)).toBe('failed')
  })

  it('returns blocked over running (blocked has higher priority than running)', () => {
    const cs = [{ status: 'running' as const }, { status: 'blocked' as const }]
    expect(deriveParentStatus(cs)).toBe('blocked')
  })

  it('returns failed over blocked (failed has highest priority)', () => {
    const cs = [{ status: 'failed' as const }, { status: 'blocked' as const }]
    expect(deriveParentStatus(cs)).toBe('failed')
  })

  it('returns running as fallback for waiting_approval', () => {
    const cs = [{ status: 'waiting_approval' as const }, { status: 'completed' as const }]
    expect(deriveParentStatus(cs)).toBe('running')
  })
})

// ── DELEGATION_TIMEOUT_MS constant ───────────────────────────────────────

describe('DELEGATION_TIMEOUT_MS', () => {
  it('equals 30000 when env var is set to "30000"', () => {
    expect(DELEGATION_TIMEOUT_MS).toBe(30_000)
  })

  it('falls back to 30000 when env var is non-numeric (NaN guard)', async () => {
    // Use jest.isolateModules to load a fresh copy with a bad env value
    let badTimeout: number | undefined
    jest.isolateModules(() => {
      process.env['DELEGATION_TIMEOUT_MS'] = 'not-a-number'
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const m = require('../hierarchy-status.service.js') as typeof import('../hierarchy-status.service.js')
      badTimeout = m.DELEGATION_TIMEOUT_MS
    })
    expect(badTimeout).toBe(30_000)
    // Restore
    process.env['DELEGATION_TIMEOUT_MS'] = '30000'
  })
})

// ── HierarchyStatusService.getRunStatus() ────────────────────────────────

describe('HierarchyStatusService.getRunStatus()', () => {
  it('returns null when the runId does not exist', async () => {
    const svc = new HierarchyStatusService(makePrisma())
    const result = await svc.getRunStatus('nonexistent')
    expect(result).toBeNull()
  })

  it('returns a flat RunStatusTree with correct aggregates (no delegation steps)', async () => {
    const steps = [
      makeStep({ id: 'step-1', status: 'completed', costUsd: 0.002,
        tokenUsage: { totalTokens: 100 } }),
      makeStep({ id: 'step-2', status: 'completed', costUsd: 0.003,
        tokenUsage: { totalTokens: 200 } }),
    ]
    const run = makeRun(steps, { id: 'run-flat' })
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(run) })
    const svc = new HierarchyStatusService(prisma)

    const tree = await svc.getRunStatus('run-flat')

    expect(tree).not.toBeNull()
    expect(tree!.runId).toBe('run-flat')
    expect(tree!.workspaceId).toBe('ws-1')
    expect(tree!.totalSteps).toBe(2)
    expect(tree!.completedSteps).toBe(2)
    expect(tree!.failedSteps).toBe(0)
    expect(tree!.blockedSteps).toBe(0)
    expect(tree!.totalCostUsd).toBeCloseTo(0.005)
    expect(tree!.totalTokens).toBe(300)
    expect(tree!.depth).toBe(0)
  })

  it('returns RunStatusTree with empty steps array when run has no steps', async () => {
    const run = makeRun([], { id: 'run-empty' })
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(run) })
    const svc = new HierarchyStatusService(prisma)

    const tree = await svc.getRunStatus('run-empty')
    expect(tree!.totalSteps).toBe(0)
    expect(tree!.derivedStatus).toBe('completed')
  })

  it('expands a delegation step when a child Run exists', async () => {
    const delegationStep = makeStep({
      id: 'step-del', nodeType: 'delegation', nodeId: 'node-del',
      status: 'running', startedAt: NOW, completedAt: null,
    })
    const parentRun = makeRun([delegationStep], { id: 'run-parent' })

    const childStep = makeStep({ id: 'step-child', status: 'completed' })
    const childRun  = makeRun([childStep], {
      id:       'run-child',
      metadata: { hierarchyRoot: 'node-del' },
      status:   'completed',
    })

    const findUnique = jest.fn().mockResolvedValue(parentRun)
    const findFirst  = jest.fn().mockResolvedValue(childRun)
    const svc = new HierarchyStatusService(makePrisma({ findUnique, findFirst }))

    const tree = await svc.getRunStatus('run-parent')
    const delNode = tree!.steps.find((s) => s.nodeType === 'delegation')

    expect(delNode).toBeDefined()
    expect(delNode!.childRun).not.toBeNull()
    expect(delNode!.childRun!.runId).toBe('run-child')
    expect(delNode!.childRun!.depth).toBe(1)
  })

  it('looks up child runs by parentRunId and parentStepId metadata', async () => {
    const delegationStep = makeStep({
      id: 'step-del', runId: 'run-parent', nodeType: 'delegation', nodeId: 'node-del',
      status: 'running', startedAt: NOW, completedAt: null,
    })
    const parentRun = makeRun([delegationStep], { id: 'run-parent' })
    const childRun  = makeRun([], {
      id:       'run-child',
      metadata: { hierarchyRoot: 'node-del', parentRunId: 'run-parent', parentStepId: 'step-del' },
      status:   'completed',
    })

    const findUnique = jest.fn().mockResolvedValue(parentRun)
    const findFirst  = jest.fn().mockResolvedValue(childRun)
    const svc = new HierarchyStatusService(makePrisma({ findUnique, findFirst }))

    await svc.getRunStatus('run-parent')

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: parentRun.createdAt },
          flow:      { agent: { workspaceId: 'ws-1' } },
          AND: [
            { metadata: { path: ['hierarchyRoot'], equals: 'node-del' } },
            { metadata: { path: ['parentRunId'], equals: 'run-parent' } },
            { metadata: { path: ['parentStepId'], equals: 'step-del' } },
          ],
        }),
      }),
    )
  })

  it('does NOT throw when findAndExpandChildRun fails — returns partial tree', async () => {
    const delegationStep = makeStep({
      id: 'step-del', nodeType: 'delegation', nodeId: 'node-del',
      status: 'running', startedAt: NOW,
    })
    const parentRun = makeRun([delegationStep], { id: 'run-parent' })

    const findUnique = jest.fn().mockResolvedValue(parentRun)
    const findFirst  = jest.fn().mockRejectedValue(new Error('DB error'))
    const svc = new HierarchyStatusService(makePrisma({ findUnique, findFirst }))

    await expect(svc.getRunStatus('run-parent')).resolves.not.toBeNull()
    const tree = await svc.getRunStatus('run-parent')
    expect(tree!.steps[0].childRun).toBeNull()  // null, not thrown
  })

  it('falls back to hierarchyRoot-only child lookup for legacy runs', async () => {
    const delegationStep = makeStep({
      id: 'step-del', runId: 'run-parent', nodeType: 'delegation', nodeId: 'node-del',
      status: 'running', startedAt: NOW, completedAt: null,
    })
    const parentRun = makeRun([delegationStep], { id: 'run-parent' })
    const childRun  = makeRun([], {
      id:       'run-child-legacy',
      metadata: { hierarchyRoot: 'node-del' },
      status:   'completed',
    })

    const findUnique = jest.fn().mockResolvedValue(parentRun)
    const findFirst  = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(childRun)
    const svc = new HierarchyStatusService(makePrisma({ findUnique, findFirst }))

    const tree = await svc.getRunStatus('run-parent')

    expect(findFirst).toHaveBeenCalledTimes(2)
    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: parentRun.createdAt },
          metadata:  { path: ['hierarchyRoot'], equals: 'node-del' },
          flow:      { agent: { workspaceId: 'ws-1' } },
        }),
      }),
    )
    expect(tree!.steps[0].childRun!.runId).toBe('run-child-legacy')
  })

  it('sets blockedSteps=1 when delegation step is queued for >30s without starting', async () => {
    // BUG-FIX: process.env set before module load — DELEGATION_TIMEOUT_MS=30000
    const oldCreatedAt = new Date(Date.now() - 31_000)  // 31 s ago
    const blockedStep = makeStep({
      id: 'step-blocked', nodeType: 'delegation', nodeId: 'node-blocked',
      status: 'queued', startedAt: null, createdAt: oldCreatedAt,
    })
    const run = makeRun([blockedStep], { id: 'run-blocked' })
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(run) })
    const svc = new HierarchyStatusService(prisma)

    const tree = await svc.getRunStatus('run-blocked')
    expect(tree!.blockedSteps).toBe(1)
  })

  it('sets blockedSteps=0 when delegation step is queued for <30s', async () => {
    const recentCreatedAt = new Date(Date.now() - 5_000)  // 5 s ago
    const recentStep = makeStep({
      id: 'step-recent', nodeType: 'delegation', nodeId: 'node-recent',
      status: 'queued', startedAt: null, createdAt: recentCreatedAt,
    })
    const run = makeRun([recentStep], { id: 'run-recent' })
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(run) })
    const svc = new HierarchyStatusService(prisma)

    const tree = await svc.getRunStatus('run-recent')
    expect(tree!.blockedSteps).toBe(0)
  })

  it('does not derive blocked status from old queued non-delegation steps', async () => {
    const oldCreatedAt = new Date(Date.now() - 31_000)
    const queuedAgentStep = makeStep({
      id: 'step-agent-queued', nodeType: 'agent', nodeId: 'agent-queued',
      status: 'queued', startedAt: null, createdAt: oldCreatedAt,
    })
    const run = makeRun([queuedAgentStep], { id: 'run-agent-queued' })
    const prisma = makePrisma({ findUnique: jest.fn().mockResolvedValue(run) })
    const svc = new HierarchyStatusService(prisma)

    const tree = await svc.getRunStatus('run-agent-queued')
    expect(tree!.derivedStatus).toBe('queued')
    expect(tree!.blockedSteps).toBe(0)
  })
})

// ── derivedStatus uses effectiveStatus (not status) ──────────────────────

describe('derivedStatus propagation via effectiveStatus', () => {
  it('parent derivedStatus=failed when delegation step has failed childRun', async () => {
    const delegationStep = makeStep({
      id: 'step-del', nodeType: 'delegation', nodeId: 'node-del',
      status: 'running', startedAt: NOW,
    })
    const parentRun = makeRun([delegationStep], { id: 'run-parent', status: 'running' })

    // Child run is failed
    const childStep = makeStep({ id: 'cs-1', status: 'failed' })
    const childRun  = makeRun([childStep], {
      id: 'run-child', status: 'running',  // DB status may lag
      metadata: { hierarchyRoot: 'node-del' },
    })

    const findUnique = jest.fn().mockResolvedValue(parentRun)
    const findFirst  = jest.fn().mockResolvedValue(childRun)
    const svc = new HierarchyStatusService(makePrisma({ findUnique, findFirst }))

    const tree = await svc.getRunStatus('run-parent')

    // effectiveStatus of delegation step = childRun.derivedStatus = 'failed'
    const delNode = tree!.steps[0]
    expect(delNode.effectiveStatus).toBe('failed')
    // Parent derivedStatus must be 'failed' (uses effectiveStatus)
    expect(tree!.derivedStatus).toBe('failed')
  })

  it('assembleTree derivedStatus is based on step.effectiveStatus, not step.status', async () => {
    // Delegation step status='running' but childRun.derivedStatus='blocked'
    const delegationStep = makeStep({
      id: 'step-del', nodeType: 'delegation', nodeId: 'node-del',
      status: 'running', startedAt: NOW,
    })
    const parentRun = makeRun([delegationStep], { id: 'run-p' })

    const blockedChildStep = makeStep({
      id: 'cstep', nodeType: 'delegation', nodeId: 'cn',
      status: 'queued', startedAt: null,
      createdAt: new Date(Date.now() - 31_000),  // blocked
    })
    const childRun = makeRun([blockedChildStep], {
      id: 'run-child', metadata: { hierarchyRoot: 'node-del' },
    })

    const svc = new HierarchyStatusService(
      makePrisma({
        findUnique: jest.fn().mockResolvedValue(parentRun),
        findFirst:  jest.fn().mockResolvedValue(childRun),
      }),
    )

    const tree = await svc.getRunStatus('run-p')
    // childRun.derivedStatus = 'blocked'
    expect(tree!.steps[0].childRun!.derivedStatus).toBe('blocked')
    // effectiveStatus inherits from childRun
    expect(tree!.steps[0].effectiveStatus).toBe('blocked')
    // parent derivedStatus = 'blocked' (via effectiveStatus, not raw 'running')
    expect(tree!.derivedStatus).toBe('blocked')
  })
})

// ── HierarchyStatusService.listWorkspaceRuns() ────────────────────────────

describe('HierarchyStatusService.listWorkspaceRuns()', () => {
  it('returns an empty array when no runs exist for the workspace', async () => {
    const svc = new HierarchyStatusService(makePrisma({ findMany: jest.fn().mockResolvedValue([]) }))
    const result = await svc.listWorkspaceRuns('ws-x')
    expect(result).toEqual([])
  })

  it('returns RunStatusTree[] without expanding delegation child runs', async () => {
    const delStep = makeStep({
      id: 'step-del', nodeType: 'delegation', nodeId: 'node-del',
      status: 'running', startedAt: NOW,
    })
    const run = makeRun([delStep], { id: 'run-list' })

    const findMany  = jest.fn().mockResolvedValue([run])
    const findFirst = jest.fn()  // should NOT be called
    const svc = new HierarchyStatusService(makePrisma({ findMany, findFirst }))

    const result = await svc.listWorkspaceRuns('ws-1')

    expect(result).toHaveLength(1)
    // Delegation step must have childRun=null (no expansion at depth=0)
    expect(result[0].steps[0].childRun).toBeNull()
    // findFirst must NOT have been called (no child run lookups)
    expect(findFirst).not.toHaveBeenCalled()
    // findMany called exactly once for the list
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('returns flat run summaries, forwards pagination filters, and preserves flat aggregates', async () => {
    const blockedCreatedAt = new Date(Date.now() - 31_000)
    const steps = [
      makeStep({
        id: 'step-del', nodeType: 'delegation', nodeId: 'node-del',
        status: 'queued', startedAt: null, createdAt: blockedCreatedAt,
      }),
      makeStep({
        id: 'step-running', nodeType: 'agent', nodeId: 'node-running',
        status: 'running', startedAt: NOW, completedAt: null,
      }),
      makeStep({
        id: 'step-complete', nodeType: 'agent', nodeId: 'node-complete',
        status: 'completed',
      }),
    ]
    const run = makeRun(steps, { id: 'run-list-flat', status: 'running' })
    const findMany  = jest.fn().mockResolvedValue([run])
    const findFirst = jest.fn().mockResolvedValue(makeRun([], { id: 'unrelated-child' }))
    const prisma = makePrisma({ findMany, findFirst })
    const svc = new HierarchyStatusService(prisma as any)

    const result = await svc.listWorkspaceRuns('ws-1', {
      status: 'running',
      limit:  10,
      offset: 20,
    })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          flow:   { agent: { workspaceId: 'ws-1' } },
          status: 'running',
        }),
        take: 10,
        skip: 20,
      }),
    )
    expect(findFirst).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0].depth).toBe(0)
    expect(result[0].steps[0].childRun).toBeNull()
    expect(result[0].totalSteps).toBe(3)
    expect(result[0].blockedSteps).toBe(1)
    expect(result[0].runningSteps).toBe(1)
    expect(result[0].completedSteps).toBe(1)
  })

  it('filters by workspaceId via flow.agent relation (not direct field)', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const svc = new HierarchyStatusService(makePrisma({ findMany }))

    await svc.listWorkspaceRuns('ws-target')

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          flow: { agent: { workspaceId: 'ws-target' } },
        }),
      }),
    )
  })

  it('passes status filter when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const svc = new HierarchyStatusService(makePrisma({ findMany }))

    await svc.listWorkspaceRuns('ws-1', { status: 'running' })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'running' }),
      }),
    )
  })

  it('respects limit and offset pagination options', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const svc = new HierarchyStatusService(makePrisma({ findMany }))

    await svc.listWorkspaceRuns('ws-1', { limit: 10, offset: 20 })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 20 }),
    )
  })

  it('returns correct workspaceId from flow.agent relation', async () => {
    const run = makeRun([], { id: 'run-ws' })
    const svc = new HierarchyStatusService(
      makePrisma({ findMany: jest.fn().mockResolvedValue([run]) }),
    )
    const result = await svc.listWorkspaceRuns('ws-1')
    expect(result[0].workspaceId).toBe('ws-1')
  })
})
