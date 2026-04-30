/**
 * Tests para HierarchyOrchestrator.getStepStatus()
 *
 * Estrategia: mock mínimo de PrismaClient — solo runStep.findUnique.
 * No depende de BD real ni de otros métodos de RunRepository.
 */

import type { PrismaClient } from '@prisma/client'
import {
  HierarchyOrchestrator,
  type HierarchyNode,
  type AgentExecutorFn,
  type StepStatusResult,
} from '../hierarchy-orchestrator.js'

// ── Helpers de setup ───────────────────────────────────────────────────────────

const ROOT_NODE: HierarchyNode = {
  id:    'root-agent',
  name:  'Root Agent',
  level: 'agent',
  agentConfig: {
    model:        'openai/gpt-4o-mini',
    systemPrompt: 'You are a test agent.',
  },
}

const MOCK_EXECUTOR: AgentExecutorFn = jest.fn().mockResolvedValue({
  response: 'test response',
  model:    'openai/gpt-4o-mini',
  provider: 'openai',
  promptTokens:     10,
  completionTokens: 5,
  totalTokens:      15,
  costUsd:          0.0001,
})

/**
 * Crea un mock de PrismaClient con runStep.findUnique configurable.
 * Solo mockea los métodos que getStepStatus() usa en la cadena de llamadas.
 */
function makePrisma(stepRow: unknown = null): PrismaClient {
  return {
    runStep: {
      findUnique: jest.fn().mockResolvedValue(stepRow),
      // Los demás métodos no son llamados por getStepStatus
      findFirst:  jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      findMany:   jest.fn(),
    },
    run:      { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    approval: { create: jest.fn(), findUnique: jest.fn() },
  } as unknown as PrismaClient
}

function makeOrchestrator(prisma: PrismaClient): HierarchyOrchestrator {
  return new HierarchyOrchestrator(ROOT_NODE, MOCK_EXECUTOR, prisma)
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const STEP_DATE = new Date('2026-04-29T22:00:00.000Z')

const MOCK_STEP_ROW = {
  id:               'step-abc-123',
  runId:            'run-xyz-456',
  nodeId:           'root-agent',
  nodeType:         'agent',
  status:           'completed',
  index:            0,
  input:            { task: 'test task' },
  output:           'test response',
  error:            null,
  model:            'openai/gpt-4o-mini',
  provider:         'openai',
  promptTokens:     10,
  completionTokens: 5,
  totalTokens:      15,
  costUsd:          0.0001,
  startedAt:        STEP_DATE,
  completedAt:      STEP_DATE,   // schema usa completedAt → StepStatusResult.finishedAt
  createdAt:        STEP_DATE,
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('HierarchyOrchestrator.getStepStatus()', () => {

  it('returns null for a non-existent stepId', async () => {
    const orchestrator = makeOrchestrator(makePrisma(null))
    const result = await orchestrator.getStepStatus('non-existent-step-id')
    expect(result).toBeNull()
  })

  it('calls prisma.runStep.findUnique with the given stepId', async () => {
    const prisma = makePrisma(null)
    const orchestrator = makeOrchestrator(prisma)

    await orchestrator.getStepStatus('step-to-query')

    expect((prisma.runStep.findUnique as jest.Mock)).toHaveBeenCalledWith({
      where: { id: 'step-to-query' },
    })
  })

  it('returns a StepStatusResult with all fields mapped correctly', async () => {
    const orchestrator = makeOrchestrator(makePrisma(MOCK_STEP_ROW))
    const result = await orchestrator.getStepStatus('step-abc-123')

    expect(result).not.toBeNull()
    const r = result as StepStatusResult

    expect(r.stepId).toBe('step-abc-123')
    expect(r.runId).toBe('run-xyz-456')
    expect(r.nodeId).toBe('root-agent')
    expect(r.nodeType).toBe('agent')
    expect(r.status).toBe('completed')
    expect(r.index).toBe(0)
    expect(r.input).toEqual({ task: 'test task' })
    expect(r.output).toBe('test response')
    expect(r.error).toBeNull()
    expect(r.model).toBe('openai/gpt-4o-mini')
    expect(r.provider).toBe('openai')
    expect(r.promptTokens).toBe(10)
    expect(r.completionTokens).toBe(5)
    expect(r.totalTokens).toBe(15)
    expect(r.costUsd).toBe(0.0001)
    expect(r.startedAt).toBe(STEP_DATE)
    expect(r.createdAt).toBe(STEP_DATE)
  })

  it('maps RunStep.completedAt → StepStatusResult.finishedAt', async () => {
    const orchestrator = makeOrchestrator(makePrisma(MOCK_STEP_ROW))
    const result = await orchestrator.getStepStatus('step-abc-123')

    // completedAt en el schema → finishedAt en el resultado público
    expect(result!.finishedAt).toBe(STEP_DATE)
  })

  it('returns null fields for optional DB columns when absent', async () => {
    const minimalStep = {
      ...MOCK_STEP_ROW,
      error:            null,
      model:            null,
      provider:         null,
      promptTokens:     null,
      completionTokens: null,
      totalTokens:      null,
      costUsd:          null,
      startedAt:        null,
      completedAt:      null,
    }
    const orchestrator = makeOrchestrator(makePrisma(minimalStep))
    const result = await orchestrator.getStepStatus('step-abc-123')

    expect(result!.model).toBeNull()
    expect(result!.provider).toBeNull()
    expect(result!.promptTokens).toBeNull()
    expect(result!.completionTokens).toBeNull()
    expect(result!.totalTokens).toBeNull()
    expect(result!.costUsd).toBeNull()
    expect(result!.startedAt).toBeNull()
    expect(result!.finishedAt).toBeNull()
  })

  it('does NOT throw when stepId does not exist — returns null', async () => {
    const orchestrator = makeOrchestrator(makePrisma(null))
    await expect(orchestrator.getStepStatus('ghost-step')).resolves.toBeNull()
  })

})
