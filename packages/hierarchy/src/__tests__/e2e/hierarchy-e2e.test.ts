import { PrismaClient } from '@prisma/client'

const DATABASE_URL_TEST = process.env['DATABASE_URL_TEST']
const describeE2E = DATABASE_URL_TEST ? describe : describe.skip

const allNodeIds = ['agency-1', 'dept-1', 'ws-1', 'agent-1']

type AgentExecutionResult = {
  response: string
  model?: string
  provider?: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsd?: number
}

type AgentExecutorFn = (
  agentId: string,
  systemPrompt: string,
  task: string,
  skills?: string[],
) => Promise<AgentExecutionResult>

type HierarchyNode = {
  id: string
  name: string
  level: 'agency' | 'department' | 'workspace' | 'agent' | 'subagent'
  children?: HierarchyNode[]
  agentConfig?: {
    model: string
    systemPrompt: string
    skills?: string[]
    requiresApproval?: boolean
  }
}

type HierarchyRunStep = {
  nodeId: string
  nodeType: string
  status: string
}

type HierarchyOrchestratorCtor = new (
  hierarchy: HierarchyNode,
  executorFn: AgentExecutorFn,
  prisma: PrismaClient,
  supervisorFn?: ((prompt: string) => Promise<string>) | undefined,
  opts?: {
    maxRetries?: number
    subtaskTimeoutMs?: number
    parallel?: boolean
  },
  emitter?: unknown,
) => {
  orchestrate(
    workspaceId: string,
    rootTask: string,
    input?: Record<string, unknown>,
  ): Promise<{
    runId: string
    status: 'completed' | 'partial' | 'failed'
    consolidatedOutput: string
    subtaskResults: unknown[]
  }>
}

const hierarchy: HierarchyNode = {
  id:    'agency-1',
  name:  'Acme Agency',
  level: 'agency',
  children: [{
    id:    'dept-1',
    name:  'Engineering Dept',
    level: 'department',
    children: [{
      id:    'ws-1',
      name:  'Backend Workspace',
      level: 'workspace',
      children: [{
        id:    'agent-1',
        name:  'API Developer',
        level: 'agent',
        agentConfig: {
          model:        'openai/gpt-4o-mini',
          systemPrompt: 'You are an expert API developer.',
        },
      }],
    }],
  }],
}

function makeExecutorFn(response = 'API endpoint designed'): jest.MockedFunction<AgentExecutorFn> {
  return jest.fn().mockResolvedValue({
    response,
    model:            'gpt-4o-mini',
    provider:         'openai',
    promptTokens:     50,
    completionTokens: 30,
    totalTokens:      80,
    costUsd:          0.001,
  } satisfies AgentExecutionResult)
}

function makeOrchestrator(
  HierarchyOrchestrator: HierarchyOrchestratorCtor,
  executorFn: AgentExecutorFn,
  prisma: PrismaClient,
) {
  return new HierarchyOrchestrator(
    hierarchy,
    executorFn,
    prisma,
    undefined,
    { maxRetries: 0, subtaskTimeoutMs: 5_000, parallel: false },
    undefined,
  )
}

function getHierarchySteps(prisma: PrismaClient) {
  return prisma.runStep.findMany({
    where:   { nodeId: { in: allNodeIds } },
    orderBy: { createdAt: 'asc' },
  }) as Promise<HierarchyRunStep[]>
}

describeE2E('E2E: 4-level hierarchy delegation', () => {
  let prisma: PrismaClient
  let HierarchyOrchestrator: HierarchyOrchestratorCtor

  jest.setTimeout(30_000)

  beforeAll(() => {
    ;({ HierarchyOrchestrator } = require('../../hierarchy-orchestrator.js') as {
      HierarchyOrchestrator: HierarchyOrchestratorCtor
    })
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL_TEST as string } },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.$transaction([
      prisma.runStep.deleteMany(),
      prisma.run.deleteMany(),
    ])
  })

  it('crea exactamente 4 RunSteps en BD para la cadena Agency->Dept->Workspace->Agent', async () => {
    const orchestrator = makeOrchestrator(HierarchyOrchestrator, makeExecutorFn(), prisma)

    await expect(orchestrator.orchestrate('ws-1', 'Design an API endpoint')).resolves.toBeDefined()

    await expect(prisma.runStep.count({
      where: { nodeId: { in: allNodeIds } },
    })).resolves.toBe(4)

    const steps = await getHierarchySteps(prisma)
    expect(steps.map((step) => step.nodeId).sort()).toEqual([...allNodeIds].sort())
  })

  it('los RunSteps de delegacion tienen nodeType=delegation y el agente tiene nodeType=agent', async () => {
    const orchestrator = makeOrchestrator(HierarchyOrchestrator, makeExecutorFn(), prisma)

    await orchestrator.orchestrate('ws-1', 'Design an API endpoint')

    const stepsByNodeId = new Map((await getHierarchySteps(prisma)).map((step) => [step.nodeId, step]))
    expect(stepsByNodeId.get('agency-1')?.nodeType).toBe('delegation')
    expect(stepsByNodeId.get('dept-1')?.nodeType).toBe('delegation')
    expect(stepsByNodeId.get('ws-1')?.nodeType).toBe('delegation')
    expect(stepsByNodeId.get('agent-1')?.nodeType).toBe('agent')
  })

  it('todos los RunSteps tienen status=completed tras orchestrate() exitoso', async () => {
    const orchestrator = makeOrchestrator(HierarchyOrchestrator, makeExecutorFn(), prisma)

    await orchestrator.orchestrate('ws-1', 'Design an API endpoint')

    const steps = await getHierarchySteps(prisma)
    expect(steps).toHaveLength(4)
    expect(steps.every((step) => step.status === 'completed')).toBe(true)
  })

  it('el RunStep del agent-1 persiste el output del executorFn en BD', async () => {
    const orchestrator = makeOrchestrator(
      HierarchyOrchestrator,
      makeExecutorFn('API endpoint designed'),
      prisma,
    )

    await orchestrator.orchestrate('ws-1', 'Design an API endpoint')

    const agentStep = await prisma.runStep.findFirst({ where: { nodeId: 'agent-1' } })
    expect(agentStep).not.toBeNull()
    expect(JSON.stringify(agentStep?.output)).toContain('API endpoint designed')
  })

  it('orchestrate() retorna status=completed con el consolidatedOutput correcto', async () => {
    const orchestrator = makeOrchestrator(
      HierarchyOrchestrator,
      makeExecutorFn('API endpoint designed'),
      prisma,
    )

    const result = await orchestrator.orchestrate('ws-1', 'Design an API endpoint')

    expect(result.status).toBe('completed')
    expect(result.subtaskResults).toHaveLength(1)
    expect(result.consolidatedOutput).toContain('API endpoint designed')
    await expect(prisma.run.findUnique({ where: { id: result.runId } })).resolves.not.toBeNull()
  })

  it('marca status=failed cuando el agente falla y persiste el error del RunStep del agente', async () => {
    const failingExecutor = jest.fn().mockRejectedValue(new Error('LLM unreachable'))
    const orchestrator = makeOrchestrator(HierarchyOrchestrator, failingExecutor, prisma)

    const result = await orchestrator.orchestrate('ws-1', 'Design an API endpoint')

    expect(result.status).toBe('failed')

    const agentStep = await prisma.runStep.findFirst({ where: { nodeId: 'agent-1' } })
    expect(agentStep?.status).toBe('failed')
    expect(agentStep?.error).toContain('LLM unreachable')
  })
})
