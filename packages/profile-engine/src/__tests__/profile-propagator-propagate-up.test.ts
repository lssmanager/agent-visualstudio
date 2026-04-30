/**
 * Tests for ProfilePropagatorService.propagateUp() - F2b-01.
 *
 * Verifica que propagateUp() solo propaga al agente orquestador de cada nivel
 * y nunca itera sobre colecciones de agentes (D-24f).
 */

import { ProfilePropagatorService } from '../profile-propagator.service'
import type { PropagateProfileInput } from '../profile-propagator.service'

const NOW = new Date('2024-01-01T00:00:00.000Z')
const INPUT: PropagateProfileInput = { systemPrompt: 'test prompt' }

function makeProfileRow() {
  return {
    systemPrompt:   'test prompt',
    persona:        {},
    knowledgeBase:  [],
    responseFormat: null,
    contextWindow:  8192,
    memoryEnabled:  false,
    version:        1,
    propagatedAt:   NOW,
  }
}

function buildPrismaMock(overrides: {
  sourceAgent?:              { workspaceId: string } | null
  workspace?:                { id: string; departmentId?: string | null } | null
  department?:               { id: string; agencyId?: string | null } | null
  workspaceOrchestrator?:    { id: string } | null
  departmentWorkspace?:      { id: string } | null
  departmentOrchestrator?:   { id: string } | null
  agencyDepartment?:         { id: string } | null
  agencyWorkspace?:          { id: string } | null
  agencyOrchestrator?:       { id: string } | null
  agentProfile?:             unknown
  runtimeModels?:            Record<string, { fields: Array<{ name: string }> }>
}) {
  const agentsByWorkspace = new Map<string, { id: string } | null>([
    ['ws-1', overrides.workspaceOrchestrator ?? null],
    ['dep-ws', overrides.departmentOrchestrator ?? null],
    ['agc-ws', overrides.agencyOrchestrator ?? null],
  ])

  return {
    _runtimeDataModel: {
      models: overrides.runtimeModels ?? {
        Agent:      { fields: [{ name: 'id' }, { name: 'workspaceId' }, { name: 'isLevelOrchestrator' }] },
        Workspace:  { fields: [{ name: 'id' }, { name: 'departmentId' }, { name: 'isLevelOrchestrator' }] },
        Department: { fields: [{ name: 'id' }, { name: 'agencyId' }, { name: 'isLevelOrchestrator' }] },
      },
    },
    agent: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(overrides.sourceAgent ?? null)
        .mockResolvedValue({ id: 'propagate-target' }),
      findFirst: jest.fn(({ where }: { where: { workspaceId: string } }) =>
        Promise.resolve(agentsByWorkspace.get(where.workspaceId) ?? null),
      ),
    },
    workspace: {
      findUnique: jest.fn().mockResolvedValue(overrides.workspace ?? null),
      findFirst:  jest.fn(({ where }: { where: { departmentId: string } }) => {
        if (where.departmentId === 'dep-1') return Promise.resolve(overrides.departmentWorkspace ?? null)
        if (where.departmentId === 'agc-dep') return Promise.resolve(overrides.agencyWorkspace ?? null)
        return Promise.resolve(null)
      }),
    },
    department: {
      findUnique: jest.fn().mockResolvedValue(overrides.department ?? null),
      findFirst:  jest.fn(({ where }: { where: { agencyId: string } }) =>
        Promise.resolve(where.agencyId === 'agc-1' ? overrides.agencyDepartment ?? null : null),
      ),
    },
    agentProfile: {
      findUnique: jest.fn().mockResolvedValue(overrides.agentProfile ?? null),
      upsert:     jest.fn().mockResolvedValue(makeProfileRow()),
    },
  }
}

describe('ProfilePropagatorService.propagateUp()', () => {
  const AGENT_ID = 'agent-1'
  const WS_ORCH  = 'ws-orchestrator'
  const DEP_ORCH = 'dep-orchestrator'
  const AGC_ORCH = 'agc-orchestrator'

  it('propaga al orquestador del workspace cuando existe y es distinto al agentId', async () => {
    const prisma = buildPrismaMock({
      sourceAgent:           { workspaceId: 'ws-1' },
      workspace:             { id: 'ws-1', departmentId: null },
      workspaceOrchestrator: { id: WS_ORCH },
    })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(1)
    expect(result.updated[0].agentId).toBe(WS_ORCH)
    expect(result.skipped).toHaveLength(0)
    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where:  { workspaceId: 'ws-1', isLevelOrchestrator: true },
      select: { id: true },
    })
  })

  it('propaga a workspace, department y agency usando isLevelOrchestrator', async () => {
    const prisma = buildPrismaMock({
      sourceAgent:            { workspaceId: 'ws-1' },
      workspace:              { id: 'ws-1', departmentId: 'dep-1' },
      department:             { id: 'dep-1', agencyId: 'agc-1' },
      workspaceOrchestrator:  { id: WS_ORCH },
      departmentWorkspace:    { id: 'dep-ws' },
      departmentOrchestrator: { id: DEP_ORCH },
      agencyDepartment:       { id: 'agc-dep' },
      agencyWorkspace:        { id: 'agc-ws' },
      agencyOrchestrator:     { id: AGC_ORCH },
    })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated.map((p) => p.agentId)).toEqual([WS_ORCH, DEP_ORCH, AGC_ORCH])
    expect(result.skipped).toHaveLength(0)
    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      where:  { departmentId: 'dep-1', isLevelOrchestrator: true },
      select: { id: true },
    })
    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where:  { agencyId: 'agc-1', isLevelOrchestrator: true },
      select: { id: true },
    })
  })

  it('aÃ±ade a skipped cuando el workspace no tiene orquestador', async () => {
    const prisma = buildPrismaMock({
      sourceAgent: { workspaceId: 'ws-1' },
      workspace:   { id: 'ws-1', departmentId: null },
    })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(0)
    expect(result.skipped).toContain('workspace:ws-1')
  })

  it('aÃ±ade a skipped cuando el orquestador del workspace es el agentId fuente', async () => {
    const prisma = buildPrismaMock({
      sourceAgent:           { workspaceId: 'ws-1' },
      workspace:             { id: 'ws-1', departmentId: null },
      workspaceOrchestrator: { id: AGENT_ID },
    })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(0)
    expect(result.skipped).toContain('workspace:ws-1')
  })

  it('no propaga a department ni agency cuando workspace.departmentId es null', async () => {
    const prisma = buildPrismaMock({
      sourceAgent:           { workspaceId: 'ws-1' },
      workspace:             { id: 'ws-1', departmentId: null },
      workspaceOrchestrator: { id: WS_ORCH },
    })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(1)
    expect(prisma.department.findUnique).not.toHaveBeenCalled()
    expect(prisma.department.findFirst).not.toHaveBeenCalled()
  })

  it('lanza Error si el agente no existe en BD', async () => {
    const prisma = buildPrismaMock({ sourceAgent: null })

    const svc = new ProfilePropagatorService(prisma as never)
    await expect(svc.propagateUp('non-existent', INPUT)).rejects.toThrow(
      'Agent "non-existent" not found',
    )
  })

  it('omite niveles jerÃ¡rquicos cuando el PrismaClient no expone esos modelos/campos', async () => {
    const prisma = buildPrismaMock({
      sourceAgent:           { workspaceId: 'ws-1' },
      workspace:             { id: 'ws-1' },
      workspaceOrchestrator: { id: WS_ORCH },
      runtimeModels: {
        Agent:     { fields: [{ name: 'id' }, { name: 'workspaceId' }, { name: 'role' }] },
        Workspace: { fields: [{ name: 'id' }] },
      },
    })
    delete (prisma as never as { department?: unknown }).department

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated.map((p) => p.agentId)).toEqual([WS_ORCH])
    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where:  { workspaceId: 'ws-1', role: 'orchestrator' },
      select: { id: true },
    })
  })
})
