/**
 * Tests para el PropagateHook en AgentRepository — F2b-04
 *
 * Estrategia: Prisma mock con jest.fn() — sin BD real.
 * 8 casos cubriendo todos los criterios de cierre.
 */

import { AgentRepository } from '../agent.repository'
import type { CreateAgentInput, UpdateAgentInput } from '../agent.repository'

// ── Prisma mock factory ────────────────────────────────────────────────────

function makePrismaMock() {
  return {
    agent: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  }
}

const FAKE_AGENT = {
  id:                  'agent-uuid-001',
  workspaceId:         'ws-001',
  name:                'Test Agent',
  slug:                'test-agent',
  kind:                null,
  systemPrompt:        null,
  isLevelOrchestrator: false,
  modelId:             null,
  providerId:          null,
  maxTokens:           null,
  temperature:         null,
  metadata:            {},
  deletedAt:           null,
  createdAt:           new Date(),
  updatedAt:           new Date(),
}

const CREATE_INPUT: CreateAgentInput = {
  workspaceId: 'ws-001',
  name:        'Test Agent',
  slug:        'test-agent',
}

// ── create() con hook ──────────────────────────────────────────────────

describe('create() con hook', () => {
  it('hook es llamado DESPUÉS de que prisma.agent.create resuelve', async () => {
    const prisma = makePrismaMock()
    const callOrder: string[] = []

    prisma.agent.create.mockImplementation(async () => {
      callOrder.push('prisma.create')
      return FAKE_AGENT
    })

    const hook = jest.fn(async () => {
      callOrder.push('hook')
    })

    const repo = new AgentRepository(prisma as never, hook)
    await repo.create(CREATE_INPUT)
    // Esperar microtask del fire-and-forget
    await new Promise((r) => setTimeout(r, 0))

    expect(callOrder).toEqual(['prisma.create', 'hook'])
  })

  it('hook recibe el agentId retornado por prisma (no el input)', async () => {
    const prisma = makePrismaMock()
    prisma.agent.create.mockResolvedValue(FAKE_AGENT)

    const hook = jest.fn().mockResolvedValue(undefined)
    const repo = new AgentRepository(prisma as never, hook)
    await repo.create(CREATE_INPUT)
    await new Promise((r) => setTimeout(r, 0))

    expect(hook).toHaveBeenCalledWith(FAKE_AGENT.id)
  })

  it('create() devuelve el agent de Prisma aunque el hook falle', async () => {
    const prisma = makePrismaMock()
    prisma.agent.create.mockResolvedValue(FAKE_AGENT)

    const hook = jest.fn().mockRejectedValue(new Error('propagation failed'))
    const repo = new AgentRepository(prisma as never, hook)

    const result = await repo.create(CREATE_INPUT)
    await new Promise((r) => setTimeout(r, 0))

    expect(result).toEqual(FAKE_AGENT)
  })

  it('si el hook falla, console.warn es llamado con el agentId', async () => {
    const prisma = makePrismaMock()
    prisma.agent.create.mockResolvedValue(FAKE_AGENT)

    const hook = jest.fn().mockRejectedValue(new Error('hook error'))
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

    const repo = new AgentRepository(prisma as never, hook)
    await repo.create(CREATE_INPUT)
    await new Promise((r) => setTimeout(r, 0))

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(FAKE_AGENT.id),
      expect.any(String),
    )

    warnSpy.mockRestore()
  })
})

// ── softDelete() con hook ──────────────────────────────────────────────

describe('softDelete() con hook', () => {
  const DELETED_AGENT = { ...FAKE_AGENT, deletedAt: new Date() }

  it('hook es llamado después de que prisma.agent.update (softDelete) resuelve', async () => {
    const prisma = makePrismaMock()
    prisma.agent.update.mockResolvedValue(DELETED_AGENT)

    const hook = jest.fn().mockResolvedValue(undefined)
    const repo = new AgentRepository(prisma as never, hook)
    await repo.softDelete(FAKE_AGENT.id)
    await new Promise((r) => setTimeout(r, 0))

    expect(hook).toHaveBeenCalledWith(FAKE_AGENT.id)
  })

  it('softDelete() devuelve el agent actualizado aunque el hook falle', async () => {
    const prisma = makePrismaMock()
    prisma.agent.update.mockResolvedValue(DELETED_AGENT)

    const hook = jest.fn().mockRejectedValue(new Error('soft-delete hook failed'))
    const repo = new AgentRepository(prisma as never, hook)

    const result = await repo.softDelete(FAKE_AGENT.id)
    await new Promise((r) => setTimeout(r, 0))

    expect(result).toEqual(DELETED_AGENT)
  })
})

// ── update() — SIN hook ────────────────────────────────────────────────

describe('update() — sin hook', () => {
  it('hook NO es llamado cuando se llama update()', async () => {
    const prisma = makePrismaMock()
    prisma.agent.update.mockResolvedValue(FAKE_AGENT)

    const hook = jest.fn().mockResolvedValue(undefined)
    const repo = new AgentRepository(prisma as never, hook)

    const updateData: UpdateAgentInput = { name: 'New Name' }
    await repo.update(FAKE_AGENT.id, updateData)
    await new Promise((r) => setTimeout(r, 0))

    expect(prisma.agent.update).toHaveBeenCalledTimes(1)
    expect(hook).not.toHaveBeenCalled()
  })
})

// ── sin hook (backward compat) ──────────────────────────────────────────

describe('sin hook (backward compat)', () => {
  it('create() y softDelete() funcionan sin errores cuando propagateHook no es pasado', async () => {
    const prisma = makePrismaMock()
    prisma.agent.create.mockResolvedValue(FAKE_AGENT)
    prisma.agent.update.mockResolvedValue({ ...FAKE_AGENT, deletedAt: new Date() })

    // Sin segundo argumento — backward compat
    const repo = new AgentRepository(prisma as never)

    await expect(repo.create(CREATE_INPUT)).resolves.toEqual(FAKE_AGENT)
    await expect(repo.softDelete(FAKE_AGENT.id)).resolves.toBeDefined()
  })
})
