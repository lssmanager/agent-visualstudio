/**
 * Tests para HierarchyStatusService
 * Prisma completamente mockeado — sin conexión a BD.
 */

import { HierarchyStatusService } from '../hierarchy-status.service'

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
    model:            'gpt-4o-mini',
    provider:         'openai',
    promptTokens:     100,
    completionTokens: 50,
    totalTokens:      150,
    costUsd:          0.002,
    createdAt:        new Date(),
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

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      findUnique: jest.fn(),
      findFirst:  jest.fn(),
      findMany:   jest.fn(),
    },
    ...overrides,
  } as unknown as Parameters<typeof HierarchyStatusService['prototype']['constructor']>[0]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HierarchyStatusService', () => {

  // 1. getRunStatus() devuelve null si el runId no existe
  it('returns null when run does not exist', async () => {
    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(null)

    const svc = new HierarchyStatusService(prisma as any)
    const result = await svc.getRunStatus('non-existent-id')

    expect(result).toBeNull()
  })

  // 2. Árbol plano con agregados correctos
  it('returns flat tree with correct aggregates', async () => {
    const step1 = makeStep({ id: 's1', status: 'completed', totalTokens: 150, costUsd: 0.002 })
    const step2 = makeStep({ id: 's2', status: 'completed', totalTokens: 200, costUsd: 0.003 })
    const run   = makeRun({ steps: [step1, step2] })

    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(run)

    const svc    = new HierarchyStatusService(prisma as any)
    const result = await svc.getRunStatus('run-1')

    expect(result).not.toBeNull()
    expect(result!.totalSteps).toBe(2)
    expect(result!.completedSteps).toBe(2)
    expect(result!.failedSteps).toBe(0)
    expect(result!.totalTokens).toBe(350)
    expect(result!.totalCostUsd).toBeCloseTo(0.005)
    expect(result!.depth).toBe(0)
  })

  // 3. Expande un delegation step cuando existe Run hijo
  it('expands delegation step with child run', async () => {
    const delegationStep = makeStep({
      id:       'step-del',
      nodeId:   'node-dept',
      nodeType: 'delegation',
      status:   'completed',
    })
    const parentRun = makeRun({ steps: [delegationStep] })

    const childStep = makeStep({ id: 'child-step', nodeId: 'node-agent', nodeType: 'agent' })
    const childRun  = makeRun({
      id:       'child-run',
      metadata: { hierarchyRoot: 'node-dept' },
      steps:    [childStep],
    })

    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(parentRun)
    ;(prisma.run.findFirst  as jest.Mock).mockResolvedValue(childRun)

    const svc    = new HierarchyStatusService(prisma as any)
    const result = await svc.getRunStatus('run-1')

    expect(result).not.toBeNull()
    const delNode = result!.steps.find((s) => s.nodeType === 'delegation')
    expect(delNode).toBeDefined()
    expect(delNode!.childRun).not.toBeNull()
    expect(delNode!.childRun!.runId).toBe('child-run')
    expect(delNode!.childRun!.depth).toBe(1)
  })

  // 4. NO lanza cuando findAndExpandChildRun falla
  it('does not throw when child run query fails', async () => {
    const delegationStep = makeStep({
      nodeType: 'delegation',
      status:   'running',
      startedAt: new Date(),
    })
    const run = makeRun({ steps: [delegationStep] })

    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(run)
    ;(prisma.run.findFirst  as jest.Mock).mockRejectedValue(new Error('DB connection lost'))

    const svc = new HierarchyStatusService(prisma as any)

    await expect(svc.getRunStatus('run-1')).resolves.not.toBeNull()

    const result = await svc.getRunStatus('run-1')
    const delNode = result!.steps.find((s) => s.nodeType === 'delegation')
    expect(delNode!.childRun).toBeNull()
  })

  // 5. blockedSteps = 1 cuando hay delegation step en 'running' hace >10 min
  it('counts blocked delegation steps correctly', async () => {
    const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000)

    const blockedStep = makeStep({
      id:        'blocked-step',
      nodeType:  'delegation',
      status:    'running',
      startedAt: elevenMinutesAgo,
    })
    const normalStep = makeStep({
      id:       'normal-step',
      nodeType: 'agent',
      status:   'completed',
    })
    const run = makeRun({ steps: [blockedStep, normalStep] })

    const prisma = makePrisma()
    ;(prisma.run.findUnique as jest.Mock).mockResolvedValue(run)
    ;(prisma.run.findFirst  as jest.Mock).mockResolvedValue(null)

    const svc    = new HierarchyStatusService(prisma as any)
    const result = await svc.getRunStatus('run-1')

    expect(result).not.toBeNull()
    expect(result!.blockedSteps).toBe(1)
    expect(result!.runningSteps).toBe(1)
  })
})
