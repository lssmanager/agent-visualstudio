/**
 * Tests for ProfilePropagatorService.propagateUp() — F2b-01
 *
 * Verifica que propagateUp() solo propaga al orchestratorId de cada nivel
 * y nunca itera sobre colecciones de agentes (D-24f).
 *
 * Usa Prisma completamente mockeado con jest.fn() — no instancia real.
 */

import { ProfilePropagatorService } from '../profile-propagator.service'
import type { PropagateProfileInput, ResolvedProfile } from '../profile-propagator.service'

// ── Helpers para construir mocks ──────────────────────────────────────────

const NOW = new Date('2024-01-01T00:00:00.000Z')

function makeResolvedProfile(agentId: string, version = 1): ResolvedProfile {
  return {
    agentId,
    version,
    systemPrompt:   'mock prompt',
    persona:        {},
    knowledgeBase:  [],
    responseFormat: null,
    contextWindow:  8192,
    memoryEnabled:  false,
    propagatedAt:   NOW,
  }
}

const INPUT: PropagateProfileInput = { systemPrompt: 'test prompt' }

// ── Mock factory ─────────────────────────────────────────────────────────

function buildPrismaMock(overrides: {
  agent?:       { workspaceId: string } | null
  workspace?:   { id: string; orchestratorId: string | null; departmentId: string | null } | null
  department?:  { id: string; orchestratorId: string | null; agencyId: string | null } | null
  agency?:      { id: string; orchestratorId: string | null } | null
  agentProfile?: unknown
}) {
  return {
    agent: {
      findUnique: jest.fn().mockResolvedValue(overrides.agent ?? null),
    },
    workspace: {
      findUnique: jest.fn().mockResolvedValue(overrides.workspace ?? null),
    },
    department: {
      findUnique: jest.fn().mockResolvedValue(overrides.department ?? null),
    },
    agency: {
      findUnique: jest.fn().mockResolvedValue(overrides.agency ?? null),
    },
    agentProfile: {
      findUnique: jest.fn().mockResolvedValue(overrides.agentProfile ?? null),
      upsert:     jest.fn(),
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('ProfilePropagatorService.propagateUp()', () => {
  const AGENT_ID = 'agent-1'
  const WS_ORCH  = 'ws-orchestrator'
  const DEP_ORCH = 'dep-orchestrator'
  const AGC_ORCH = 'agc-orchestrator'

  // ── Case 1: propaga al workspace orchestrator cuando existe y es distinto al agentId ──
  it('propaga al orchestratorId del workspace cuando existe y es distinto al agentId', async () => {
    const prisma = buildPrismaMock({
      agent:        { workspaceId: 'ws-1' },
      workspace:    { id: 'ws-1', orchestratorId: WS_ORCH, departmentId: null },
      agentProfile: null,
    })
    // Mock the profile returned by upsert (used internally by propagate())
    prisma.agentProfile.upsert.mockResolvedValue({
      systemPrompt: 'test prompt', persona: {}, knowledgeBase: [],
      responseFormat: null, contextWindow: 8192, memoryEnabled: false,
      version: 1, propagatedAt: NOW,
    })
    // propagate() calls agent.findUnique too — make it return valid agent for orchestrator
    prisma.agent.findUnique
      .mockResolvedValueOnce({ workspaceId: 'ws-1' })  // call for agentId
      .mockResolvedValueOnce({ id: WS_ORCH, name: 'WS Orch' }) // call inside propagate()

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(1)
    expect(result.updated[0].agentId).toBe(WS_ORCH)
    expect(result.skipped).toHaveLength(0)
  })

  // ── Case 2: propaga a workspace + department + agency cuando todos tienen orchestratorId ──
  it('propaga a workspace, department y agency cuando todos tienen orchestratorId', async () => {
    const prisma = buildPrismaMock({
      agent:      { workspaceId: 'ws-1' },
      workspace:  { id: 'ws-1', orchestratorId: WS_ORCH,  departmentId: 'dep-1' },
      department: { id: 'dep-1', orchestratorId: DEP_ORCH, agencyId: 'agc-1' },
      agency:     { id: 'agc-1', orchestratorId: AGC_ORCH },
    })

    const mockUpsert = (agentId: string) => ({
      systemPrompt: 'prompt', persona: {}, knowledgeBase: [],
      responseFormat: null, contextWindow: 8192, memoryEnabled: false,
      version: 1, propagatedAt: NOW,
    })

    // agent.findUnique: first call = source agent, subsequent = inside propagate() per orchestrator
    prisma.agent.findUnique
      .mockResolvedValueOnce({ workspaceId: 'ws-1' })          // propagateUp source
      .mockResolvedValueOnce({ id: WS_ORCH,  name: 'WS Orch' })  // inside propagate(WS_ORCH)
      .mockResolvedValueOnce({ id: DEP_ORCH, name: 'Dep Orch' }) // inside propagate(DEP_ORCH)
      .mockResolvedValueOnce({ id: AGC_ORCH, name: 'Agc Orch' }) // inside propagate(AGC_ORCH)

    prisma.agentProfile.upsert
      .mockResolvedValueOnce(mockUpsert(WS_ORCH))
      .mockResolvedValueOnce(mockUpsert(DEP_ORCH))
      .mockResolvedValueOnce(mockUpsert(AGC_ORCH))

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(3)
    expect(result.updated[0].agentId).toBe(WS_ORCH)
    expect(result.updated[1].agentId).toBe(DEP_ORCH)
    expect(result.updated[2].agentId).toBe(AGC_ORCH)
    expect(result.skipped).toHaveLength(0)
  })

  // ── Case 3: añade a skipped cuando workspace.orchestratorId es null ──
  it('añade a skipped cuando workspace.orchestratorId es null', async () => {
    const prisma = buildPrismaMock({
      agent:     { workspaceId: 'ws-1' },
      workspace: { id: 'ws-1', orchestratorId: null, departmentId: null },
    })
    prisma.agent.findUnique.mockResolvedValueOnce({ workspaceId: 'ws-1' })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(0)
    expect(result.skipped).toContain('workspace:ws-1')
  })

  // ── Case 4: añade a skipped cuando workspace.orchestratorId === agentId (anti-loop) ──
  it('añade a skipped cuando workspace.orchestratorId === agentId (anti-loop)', async () => {
    const prisma = buildPrismaMock({
      agent:     { workspaceId: 'ws-1' },
      workspace: { id: 'ws-1', orchestratorId: AGENT_ID, departmentId: null },
    })
    prisma.agent.findUnique.mockResolvedValueOnce({ workspaceId: 'ws-1' })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(0)
    expect(result.skipped).toContain('workspace:ws-1')
  })

  // ── Case 5: no propaga a niveles intermedios ausentes (workspace sin departmentId) ──
  it('no propaga a department ni agency cuando workspace.departmentId es null', async () => {
    const prisma = buildPrismaMock({
      agent:     { workspaceId: 'ws-1' },
      workspace: { id: 'ws-1', orchestratorId: WS_ORCH, departmentId: null },
    })
    prisma.agent.findUnique
      .mockResolvedValueOnce({ workspaceId: 'ws-1' })
      .mockResolvedValueOnce({ id: WS_ORCH, name: 'WS Orch' })
    prisma.agentProfile.upsert.mockResolvedValueOnce({
      systemPrompt: 'prompt', persona: {}, knowledgeBase: [],
      responseFormat: null, contextWindow: 8192, memoryEnabled: false,
      version: 1, propagatedAt: NOW,
    })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(1)
    expect(prisma.department.findUnique).not.toHaveBeenCalled()
    expect(prisma.agency.findUnique).not.toHaveBeenCalled()
  })

  // ── Case 6: lanza Error si el agente no existe en BD ──
  it('lanza Error si el agente no existe en BD', async () => {
    const prisma = buildPrismaMock({ agent: null })
    prisma.agent.findUnique.mockResolvedValueOnce(null)

    const svc = new ProfilePropagatorService(prisma as never)
    await expect(svc.propagateUp('non-existent', INPUT)).rejects.toThrow(
      'Agent "non-existent" not found',
    )
  })

  // ── Case 7: updated contiene los ResolvedProfile en orden workspace → department → agency ──
  it('updated contiene ResolvedProfile en orden: workspace → department → agency', async () => {
    const prisma = buildPrismaMock({
      agent:      { workspaceId: 'ws-1' },
      workspace:  { id: 'ws-1', orchestratorId: WS_ORCH,  departmentId: 'dep-1' },
      department: { id: 'dep-1', orchestratorId: DEP_ORCH, agencyId: 'agc-1' },
      agency:     { id: 'agc-1', orchestratorId: AGC_ORCH },
    })

    prisma.agent.findUnique
      .mockResolvedValueOnce({ workspaceId: 'ws-1' })
      .mockResolvedValueOnce({ id: WS_ORCH,  name: 'WS Orch' })
      .mockResolvedValueOnce({ id: DEP_ORCH, name: 'Dep Orch' })
      .mockResolvedValueOnce({ id: AGC_ORCH, name: 'Agc Orch' })

    const makeProfile = (id: string) => ({
      systemPrompt: `${id} prompt`, persona: {}, knowledgeBase: [],
      responseFormat: null, contextWindow: 8192, memoryEnabled: false,
      version: 1, propagatedAt: NOW,
    })

    prisma.agentProfile.upsert
      .mockResolvedValueOnce(makeProfile(WS_ORCH))
      .mockResolvedValueOnce(makeProfile(DEP_ORCH))
      .mockResolvedValueOnce(makeProfile(AGC_ORCH))

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    const ids = result.updated.map((p) => p.agentId)
    expect(ids).toEqual([WS_ORCH, DEP_ORCH, AGC_ORCH])
  })
})
