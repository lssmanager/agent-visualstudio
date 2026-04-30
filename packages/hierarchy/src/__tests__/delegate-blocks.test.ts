/**
 * Tests para parseDelegateBlocks() y decomposeTask() en modo integración.
 *
 * Criterio de cierre F2a-05c:
 *   test 1 — bloque nominal completo
 *   test 2 — sin TO → descartado
 *   test 3 — CONTEXT malformado → context = {}
 *   test 4 — texto libre entre bloques ignorado
 *   test 5 — PRIORITY inválida → 'medium'
 *   test 6 — integración decomposeTask() con LLM que lanza → no lanza, retorna 1 HierarchyTask
 */

import { describe, expect, it, jest } from '@jest/globals'
import { parseDelegateBlocks } from '../hierarchy-orchestrator.js'
import { HierarchyOrchestrator } from '../hierarchy-orchestrator.js'
import type { HierarchyNode, AgentExecutorFn } from '../hierarchy-orchestrator.js'

// ── helpers ────────────────────────────────────────────────────────────────────

function makeNode(
  id:    string,
  level: HierarchyNode['level'] = 'agent',
): HierarchyNode {
  return {
    id,
    name:  id,
    level,
    agentConfig: {
      model:        'test-model',
      systemPrompt: `You are ${id}.`,
    },
  }
}

function makeTree(agents: HierarchyNode[]): HierarchyNode {
  return {
    id:       'root',
    name:     'Root',
    level:    'agency',
    children: agents,
  }
}

/** Executor falso que nunca se llama en los tests de descomposición */
const neverCalledExecutor: AgentExecutorFn = jest.fn(async () => ({
  response: 'should not be called',
}))

/** Prisma mock mínimo — solo los métodos que usa RunRepository */
const mockPrisma = {
  run: {
    create:     jest.fn(async (args: unknown) => ({ id: 'run-1', ...(args as Record<string, unknown>) })),
    update:     jest.fn(async () => ({})),
    findUnique: jest.fn(async () => null),
  },
  runStep: {
    create:     jest.fn(async (args: unknown) => ({ id: 'step-1', ...(args as Record<string, unknown>) })),
    update:     jest.fn(async () => ({})),
    findUnique: jest.fn(async () => null),
  },
  approval: {
    create:     jest.fn(async (args: unknown) => ({ id: 'approval-1', ...(args as Record<string, unknown>) })),
    update:     jest.fn(async () => ({})),
    findUnique: jest.fn(async () => null),
    findFirst:  jest.fn(async () => null),
  },
} as unknown as import('@prisma/client').PrismaClient

// ── Unit tests: parseDelegateBlocks() ─────────────────────────────────────────

describe('parseDelegateBlocks()', () => {
  it('test 1 — bloque nominal completo', () => {
    const raw = [
      '---DELEGATE---',
      'TO: a1',
      'TASK: Write report',
      'CONTEXT: {"fmt":"pdf"}',
      'PRIORITY: high',
      '---END---',
    ].join('\n')

    const result = parseDelegateBlocks(raw)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      to:       'a1',
      task:     'Write report',
      context:  { fmt: 'pdf' },
      priority: 'high',
    })
  })

  it('test 2 — sin TO → descartado', () => {
    const raw = [
      '---DELEGATE---',
      'TASK: Do it',
      '---END---',
    ].join('\n')

    const result = parseDelegateBlocks(raw)

    expect(result).toHaveLength(0)
  })

  it('test 3 — CONTEXT malformado → context = {}', () => {
    const raw = [
      '---DELEGATE---',
      'TO: a1',
      'TASK: t',
      'CONTEXT: {bad',
      '---END---',
    ].join('\n')

    const result = parseDelegateBlocks(raw)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      to:      'a1',
      task:    't',
      context: {},
    })
  })

  it('test 4 — texto libre entre bloques ignorado', () => {
    const raw = [
      'Sure!',
      '---DELEGATE---',
      'TO: a1',
      'TASK: t1',
      '---END---',
      'Done.',
      '---DELEGATE---',
      'TO: a2',
      'TASK: t2',
      '---END---',
    ].join('\n')

    const result = parseDelegateBlocks(raw)

    expect(result).toHaveLength(2)
    expect(result[0].to).toBe('a1')
    expect(result[1].to).toBe('a2')
  })

  it('test 5 — PRIORITY inválida → medium', () => {
    const raw = [
      '---DELEGATE---',
      'TO: a1',
      'TASK: t',
      'PRIORITY: urgent',
      '---END---',
    ].join('\n')

    const result = parseDelegateBlocks(raw)

    expect(result).toHaveLength(1)
    expect(result[0].priority).toBe('medium')
  })
})

// ── Integration test: decomposeTask() con LLM que lanza ───────────────────────

describe('HierarchyOrchestrator.decomposeTask() integración', () => {
  it('test 6 — supervisorFn que lanza → retorna 1 HierarchyTask, no lanza', async () => {
    const agentA = makeNode('agentA', 'agent')
    const agentB = makeNode('agentB', 'agent')
    const hierarchy = makeTree([agentA, agentB])

    const throwingSupervisor = async (_prompt: string): Promise<string> => {
      throw new Error('timeout')
    }

    const orchestrator = new HierarchyOrchestrator(
      hierarchy,
      neverCalledExecutor,
      mockPrisma,
      throwingSupervisor,
    )

    // Acceder al método privado para test unitario
    // (cast a any — patrón aceptable en tests de caja blanca)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orch = orchestrator as unknown as Record<string, (...args: any[]) => any>

    const collectAgents: HierarchyNode[] = orch['collectAgentNodes'](hierarchy) as HierarchyNode[]
    const result = await orch['decomposeTask']('Write a summary', collectAgents, {})

    expect(result).toHaveLength(1)
    // No debe lanzar — si llega aquí el test pasa
    expect(typeof result[0].id).toBe('string')
    expect(typeof result[0].assignedNodeId).toBe('string')
  })
})
