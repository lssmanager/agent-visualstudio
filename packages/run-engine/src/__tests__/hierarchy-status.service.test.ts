/**
 * Tests para HierarchyStatusService, isBlocked() y deriveParentStatus().
 * Prisma completamente mockeado — sin conexión a BD.
 *
 * Tests 1-5:  escenarios F2a-08 (mantenidos)
 * Tests 6-9:  isBlocked()
 * Tests 10-18: deriveParentStatus()
 * Tests 19-20: integración en assembleTree()
 */

import {
  HierarchyStatusService,
  isBlocked,
  deriveParentStatus,
} from '../hierarchy-status.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:               'step-1',
    runId:            'run-1',
    nodeId:           'node-1',
    nodeType:         'agent',
    status:           'completed',
    index:            0,
    input:            {},
    output:           'ok',
    error:            null,
    startedAt:        new Date(Date.now() - 5_000),
    completedAt:      new Date(),
    createdAt:        new Date(Date.now() - 6_000),
    model:            'gpt-4o-mini',
    provider:         'openai',
    promptTokens:     100,
    completionTokens: 50,
    totalTokens:      150,
    costUsd:          0.002,
    ...overrides,
  }
}

function makeRun(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id:          'run-1',
    workspaceId: 'ws-1',
    agentId:     null,
    status:      'completed',
    inputData:   { task: 'test' },
    outputData:  'result',
    error:       null,
    metadata:    {},
    createdAt:   new Date(Date.now() - 10_000),
    startedAt:   new Date(Date.now() - 9_000),
    completedAt: new Date(),
    steps:       [] as ReturnType<typeof makeStep>[],
    ...overrides,
  }
}

function makePrisma() {
  return {
    run: {
      findUnique: jest.fn(),
      findFirst:  jest.fn(),
      findMany:   jest.fn(),
    },
  } as unknown as Parameters<typeof HierarchyStatusService['prototype']['constructor']>[0]
}

// ── Tests F2a-08 (1-5) ─────────────────────────────────────────────────────────

describe('HierarchyStatusService — F2a-08 escenarios', () => {

  it('1. returns null when run does not exist', async () => {
    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(null)
    const svc = new HierarchyStatusService(prisma as any)
    expect(await svc.getRunStatus('non-existent')).toBeNull()
  })

  it('2. returns flat tree with correct aggregates', async () => {
    const s1  = makeStep({ id: 's1', totalTokens: 150, costUsd: 0.002 })
    const s2  = makeStep({ id: 's2', totalTokens: 200, costUsd: 0.003 })
    const run = makeRun({ steps: [s1, s2] })
    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(run)
    const result = await new HierarchyStatusService(prisma as any).getRunStatus('run-1')
    expect(result!.totalSteps).toBe(2)
    expect(result!.completedSteps).toBe(2)
    expect(result!.totalTokens).toBe(350)
    expect(result!.totalCostUsd).toBeCloseTo(0.005)
  })

  it('3. expands delegation step with child run', async () => {
    const delStep   = makeStep({ id: 'step-del', nodeId: 'node-dept', nodeType: 'delegation', status: 'completed' })
    const parentRun = makeRun({ steps: [delStep] })
    const childStep = makeStep({ id: 'child-step', nodeId: 'node-agent', nodeType: 'agent' })
    const childRun  = makeRun({ id: 'child-run', metadata: { hierarchyRoot: 'node-dept' }, steps: [childStep] })
    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(parentRun)
    ;(prisma.run.findFirst  as jest.Mock).mockResolvedValue(childRun)
    const result = await new HierarchyStatusService(prisma as any).getRunStatus('run-1')
    const del = result!.steps.find((s) => s.nodeType === 'delegation')
    expect(del!.childRun!.runId).toBe('child-run')
    expect(del!.childRun!.depth).toBe(1)
  })

  it('4. does not throw when child run query fails', async () => {
    const delStep = makeStep({ nodeType: 'delegation', status: 'running', startedAt: new Date() })
    const run     = makeRun({ steps: [delStep] })
    const prisma  = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(run)
    ;(prisma.run.findFirst  as jest.Mock).mockRejectedValue(new Error('DB error'))
    const result = await new HierarchyStatusService(prisma as any).getRunStatus('run-1')
    expect(result).not.toBeNull()
    expect(result!.steps[0].childRun).toBeNull()
  })

  it('5. counts blocked delegation steps (D-22e: queued + no startedAt + expired)', async () => {
    const ago31s = new Date(Date.now() - 31_000)
    // Forzar env a 30000 para este test (puede haber override en CI)
    const blockedStep = makeStep({
      id:        'blocked',
      nodeType:  'delegation',
      status:    'queued',
      startedAt: null,
      createdAt: ago31s,
    })
    const normalStep = makeStep({ id: 'normal', nodeType: 'agent', status: 'completed' })
    const run        = makeRun({ steps: [blockedStep, normalStep] })
    const prisma     = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(run)
    ;(prisma.run.findFirst  as jest.Mock).mockResolvedValue(null)
    const result = await new HierarchyStatusService(prisma as any).getRunStatus('run-1')
    expect(result!.blockedSteps).toBe(1)
  })
})

// ── Tests isBlocked() (6-9) ──────────────────────────────────────────────────────

describe('isBlocked()', () => {

  it('6. returns false when status is not queued', () => {
    expect(isBlocked({
      status:    'running',
      startedAt: null,
      createdAt: new Date(Date.now() - 60_000),
    })).toBe(false)
  })

  it('7. returns false when startedAt is not null', () => {
    expect(isBlocked({
      status:    'queued',
      startedAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 61_000),
    })).toBe(false)
  })

  it('8. returns false when createdAt is within threshold', () => {
    expect(isBlocked({
      status:    'queued',
      startedAt: null,
      createdAt: new Date(Date.now() - 10_000), // 10s < 30s default
    })).toBe(false)
  })

  it('9. returns true when queued + no startedAt + createdAt > 30s ago', () => {
    expect(isBlocked({
      status:    'queued',
      startedAt: null,
      createdAt: new Date(Date.now() - 31_000), // 31s > 30s default
    })).toBe(true)
  })
})

// ── Tests deriveParentStatus() (10-18) ────────────────────────────────────────

describe('deriveParentStatus()', () => {

  it('10. empty array returns completed', () => {
    expect(deriveParentStatus([])).toBe('completed')
  })

  it('11. all completed returns completed', () => {
    expect(deriveParentStatus([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
    ])).toBe('completed')
  })

  it('12. completed + skipped + cancelled returns completed', () => {
    expect(deriveParentStatus([
      { status: 'completed' },
      { status: 'skipped' },
      { status: 'cancelled' },
    ])).toBe('completed')
  })

  it('13. completed + queued returns queued', () => {
    expect(deriveParentStatus([
      { status: 'completed' },
      { status: 'queued' },
    ])).toBe('queued')
  })

  it('14. completed + running returns running', () => {
    expect(deriveParentStatus([
      { status: 'completed' },
      { status: 'running' },
    ])).toBe('running')
  })

  it('15. running + failed returns failed (failed has priority)', () => {
    expect(deriveParentStatus([
      { status: 'running' },
      { status: 'failed' },
    ])).toBe('failed')
  })

  it('16. running + blocked returns blocked (blocked > running)', () => {
    expect(deriveParentStatus([
      { status: 'running' },
      { status: 'blocked' },
    ])).toBe('blocked')
  })

  it('17. failed + blocked returns failed (failed > blocked)', () => {
    expect(deriveParentStatus([
      { status: 'failed' },
      { status: 'blocked' },
    ])).toBe('failed')
  })

  it('18. waitingapproval + completed returns running (fallback)', () => {
    expect(deriveParentStatus([
      { status: 'waitingapproval' },
      { status: 'completed' },
    ])).toBe('running')
  })
})

// ── Tests integración assembleTree() (19-20) ────────────────────────────────────

describe('assembleTree() integration', () => {

  it('19. derivedStatus differs from run.status when steps are mixed', async () => {
    const s1 = makeStep({ id: 's1', status: 'completed' })
    const s2 = makeStep({ id: 's2', status: 'queued', startedAt: null })
    // run.status = 'running' (BD), pero derivedStatus debe ser 'queued'
    const run = makeRun({ status: 'running', steps: [s1, s2] })
    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(run)
    const result = await new HierarchyStatusService(prisma as any).getRunStatus('run-1')
    expect(result!.status).toBe('running')          // valor real en BD
    expect(result!.derivedStatus).toBe('queued')    // calculado
  })

  it('20. delegation step effectiveStatus inherits childRun.derivedStatus', async () => {
    const delStep   = makeStep({ id: 'del', nodeType: 'delegation', nodeId: 'nd', status: 'running' })
    const parentRun = makeRun({ status: 'running', steps: [delStep] })

    // Child run tiene un step fallido → su derivedStatus = 'failed'
    const failedChildStep = makeStep({ id: 'cf', status: 'failed' })
    const childRun = makeRun({ id: 'crun', status: 'running', steps: [failedChildStep] })

    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(parentRun)
    ;(prisma.run.findFirst  as jest.Mock).mockResolvedValue(childRun)

    const result = await new HierarchyStatusService(prisma as any).getRunStatus('run-1')
    const del = result!.steps.find((s) => s.nodeType === 'delegation')!
    expect(del.status).toBe('running')              // valor real en BD
    expect(del.effectiveStatus).toBe('failed')       // heredado de childRun.derivedStatus
    expect(del.childRun!.derivedStatus).toBe('failed')
  })
})
