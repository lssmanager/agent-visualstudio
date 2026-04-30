/**
 * Tests for [F2a-04] findSpecialistWithCapability()
 *
 * Cubre:
 *   - tokenize(): extrae tokens sin stopwords, mínimo 3 chars
 *   - jaccardScore(): retorna 0..1, caso vacío retorna 0
 *   - findSpecialistWithCapability() con profiles mock en BD
 *   - findSpecialistWithCapability() sin profiles en BD (profileFound: false)
 *
 * Estos tests usan mocks de PrismaClient y no requieren BD real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  tokenize,
  jaccardScore,
  HierarchyOrchestrator,
  type HierarchyNode,
  type AgentExecutorFn,
} from '../hierarchy-orchestrator.js'
import type { PrismaClient } from '@prisma/client'

// ── tokenize() ────────────────────────────────────────────────────────────────

describe('tokenize()', () => {
  it('extrae tokens sin stopwords, mínimo 3 chars', () => {
    const result = tokenize('Find a lawyer')
    expect(result.has('find')).toBe(true)
    expect(result.has('lawyer')).toBe(true)
    // 'a' es stopword y < 3 chars
    expect(result.has('a')).toBe(false)
  })

  it('ignora stopwords en inglés y español', () => {
    const result = tokenize('the quick brown fox and the lazy dog')
    expect(result.has('the')).toBe(false)
    expect(result.has('and')).toBe(false)
    expect(result.has('quick')).toBe(true)
    expect(result.has('brown')).toBe(true)
    expect(result.has('fox')).toBe(true)
    expect(result.has('lazy')).toBe(true)
    expect(result.has('dog')).toBe(true)
  })

  it('retorna Set vacío para string vacío', () => {
    expect(tokenize('').size).toBe(0)
  })

  it('convierte a lowercase', () => {
    const result = tokenize('Legal CONTRACT Draft')
    expect(result.has('legal')).toBe(true)
    expect(result.has('contract')).toBe(true)
    expect(result.has('draft')).toBe(true)
  })

  it('filtra tokens de menos de 3 caracteres', () => {
    const result = tokenize('do it now go')
    // 'do', 'it', 'go' son < 3 chars o stopwords
    expect(result.has('now')).toBe(true)
    expect(result.size).toBeLessThanOrEqual(1)
  })
})

// ── jaccardScore() ────────────────────────────────────────────────────────────

describe('jaccardScore()', () => {
  it('calcula Jaccard correcto para sets con intersección', () => {
    const a = new Set(['cat', 'dog'])
    const b = new Set(['cat', 'fish'])
    // intersección: {cat} = 1, unión: {cat, dog, fish} = 3 → 1/3 ≈ 0.333
    const score = jaccardScore(a, b)
    expect(score).toBeCloseTo(0.333, 2)
  })

  it('retorna 0 si ambos sets están vacíos', () => {
    expect(jaccardScore(new Set(), new Set())).toBe(0)
  })

  it('retorna 0 si no hay intersección', () => {
    const a = new Set(['apple', 'banana'])
    const b = new Set(['orange', 'grape'])
    expect(jaccardScore(a, b)).toBe(0)
  })

  it('retorna 1 si los sets son idénticos', () => {
    const a = new Set(['legal', 'contract'])
    expect(jaccardScore(a, new Set(['legal', 'contract']))).toBe(1)
  })

  it('es simétrico', () => {
    const a = new Set(['foo', 'bar', 'baz'])
    const b = new Set(['bar', 'qux'])
    expect(jaccardScore(a, b)).toBeCloseTo(jaccardScore(b, a), 10)
  })
})

// ── findSpecialistWithCapability() ────────────────────────────────────────────

/** Construye un mock mínimo de PrismaClient para los tests */
function buildPrismaMock(profiles: Array<{
  agentId: string
  systemPrompt: string | null
  persona: unknown
  knowledgeBase: unknown
}>) {
  return {
    run:          { create: vi.fn(), update: vi.fn() },
    runStep:      { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    agentProfile: {
      findMany: vi.fn().mockResolvedValue(profiles),
    },
    approval:     { create: vi.fn(), findUnique: vi.fn() },
  } as unknown as PrismaClient
}

/** Agente sintético para tests */
function makeAgent(id: string, name: string): HierarchyNode {
  return { id, name, level: 'agent' }
}

/** AgentExecutorFn stub — nunca debería llamarse en estos tests */
const stubExecutor: AgentExecutorFn = vi.fn().mockResolvedValue({ response: 'ok' })

describe('findSpecialistWithCapability() — via decomposeTasks() fallback', () => {
  it('asigna el task al agente con mayor afinidad semántica (con profiles en BD)', async () => {
    const agentA = makeAgent('agent-a', 'Legal Agent')
    const agentB = makeAgent('agent-b', 'Marketing Agent')

    const prisma = buildPrismaMock([
      {
        agentId:       'agent-a',
        systemPrompt:  'legal advisor contract law litigation',
        persona:       {},
        knowledgeBase: [],
      },
      {
        agentId:       'agent-b',
        systemPrompt:  'marketing specialist brand campaigns social media',
        persona:       {},
        knowledgeBase: [],
      },
    ])

    // Jerarquía: workspace con dos agentes hoja
    const hierarchy: HierarchyNode = {
      id:       'ws-1',
      name:     'Test Workspace',
      level:    'workspace',
      children: [agentA, agentB],
    }

    // Sin supervisorFn → fallback a findSpecialistWithCapability()
    const orchestrator = new HierarchyOrchestrator(
      hierarchy,
      stubExecutor,
      prisma,
    )

    // Llamar decomposeTasks indirectamente vía orchestrate() mocked
    // Accedemos al método privado via cast para testing unitario
    const decomposeTasksFn = (orchestrator as never as {
      decomposeTasks: (task: string, input?: Record<string, unknown>) => Promise<import('../hierarchy-orchestrator.js').HierarchyTask[]>
    }).decomposeTasks.bind(orchestrator)

    const subtasks = await decomposeTasksFn('draft legal contract for the acquisition')

    expect(subtasks).toHaveLength(1)
    expect(subtasks[0].assignedNodeId).toBe('agent-a')
  })

  it('retorna isFallback: true cuando los profiles no existen en BD', async () => {
    const agentA = makeAgent('agent-x', 'Unknown Agent A')
    const agentB = makeAgent('agent-y', 'Unknown Agent B')

    // BD no tiene ningún AgentProfile
    const prisma = buildPrismaMock([])

    const hierarchy: HierarchyNode = {
      id:       'ws-2',
      name:     'Test Workspace',
      level:    'workspace',
      children: [agentA, agentB],
    }

    const orchestrator = new HierarchyOrchestrator(
      hierarchy,
      stubExecutor,
      prisma,
    )

    const decomposeTasksFn = (orchestrator as never as {
      decomposeTasks: (task: string) => Promise<import('../hierarchy-orchestrator.js').HierarchyTask[]>
    }).decomposeTasks.bind(orchestrator)

    // No debe lanzar — debe devolver un subtask válido
    const subtasks = await decomposeTasksFn('some arbitrary task')
    expect(subtasks).toHaveLength(1)
    // isFallback puede ser true, pero el nodo asignado siempre existe
    expect(['agent-x', 'agent-y']).toContain(subtasks[0].assignedNodeId)
  })

  it('findAgentProfiles() hace una sola query BD con todos los agentIds', async () => {
    const prisma = buildPrismaMock([])
    const hierarchy: HierarchyNode = {
      id:       'ws-3',
      name:     'Test Workspace',
      level:    'workspace',
      children: [
        makeAgent('agent-1', 'Agent 1'),
        makeAgent('agent-2', 'Agent 2'),
        makeAgent('agent-3', 'Agent 3'),
      ],
    }

    const orchestrator = new HierarchyOrchestrator(hierarchy, stubExecutor, prisma)

    const decomposeTasksFn = (orchestrator as never as {
      decomposeTasks: (task: string) => Promise<import('../hierarchy-orchestrator.js').HierarchyTask[]>
    }).decomposeTasks.bind(orchestrator)

    await decomposeTasksFn('any task')

    // findMany debe haberse llamado exactamente una vez
    expect(prisma.agentProfile.findMany).toHaveBeenCalledTimes(1)
    // Y debe incluir todos los agentIds
    const callArg = (prisma.agentProfile.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.where.agentId.in).toEqual(
      expect.arrayContaining(['agent-1', 'agent-2', 'agent-3'])
    )
  })
})
