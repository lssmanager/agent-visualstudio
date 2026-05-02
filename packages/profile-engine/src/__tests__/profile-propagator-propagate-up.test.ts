/**
 * Tests for ProfilePropagatorService.propagateUp() — F2b-01
 *
 * Verifica que propagateUp() solo propaga al orchestrador de cada nivel
 * (identificado por isLevelOrchestrator: true en Agent) y nunca itera
 * sobre colecciones de agentes (D-24f).
 *
 * AUDIT-08 (#165): mock actualizado — orchestratorId NO existe en
 * Workspace/Department/Agency. Se usa agent.findFirst con
 * isLevelOrchestrator: true para cada nivel jerárquico.
 *
 * Usa Prisma completamente mockeado con jest.fn() — no instancia real.
 */

import { ProfilePropagatorService } from '../profile-propagator.service'
import type { PropagateProfileInput, ResolvedProfile } from '../profile-propagator.service'

// ── Helpers ──────────────────────────────────────────────────────────────

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

/** Objeto de perfil plano devuelto por agentProfile.upsert mock */
function makeFlatProfile(agentId: string) {
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

// ── Mock factory ──────────────────────────────────────────────────────────

/**
 * Construye el mock de Prisma siguiendo el schema canónico:
 *   - workspace/department/agency NO tienen orchestratorId
 *   - El orchestrador de cada nivel se obtiene via agent.findFirst({ isLevelOrchestrator: true })
 *
 * wsOrchAgent / depOrchAgent / agcOrchAgent: { id } del agente orchestrador de cada nivel,
 * o null si el nivel no tiene orchestrador.
 */
function buildPrismaMock(opts: {
  /** workspaceId del agente fuente */
  sourceAgentWorkspaceId: string | null
  /** Workspace sin orchestratorId — solo id + departmentId */
  workspace?:   { id: string; departmentId: string | null } | null
  /** Department sin orchestratorId — solo id + agencyId */
  department?:  { id: string; agencyId: string | null } | null
  /** Agency sin orchestratorId — solo id */
  agency?:      { id: string } | null
  /** Orchestrador del nivel workspace (agent con isLevelOrchestrator: true) */
  wsOrchAgent?:  { id: string } | null
  /** Orchestrador del nivel department */
  depOrchAgent?: { id: string } | null
  /** Orchestrador del nivel agency */
  agcOrchAgent?: { id: string } | null
  /** Perfil plano para agentProfile.upsert */
  agentProfile?: unknown
}) {
  // agent.findFirst devuelve el orchestrador según el nivel (orden de llamadas)
  const findFirstQueue: ({ id: string } | null)[] = [
    opts.wsOrchAgent  ?? null,
    opts.depOrchAgent ?? null,
    opts.agcOrchAgent ?? null,
  ]
  let findFirstCallIdx = 0

  return {
    agent: {
      /**
       * findUnique: primera llamada = agente fuente (devuelve workspaceId),
       * llamadas subsecuentes = dentro de propagate() para validar orchestrador.
       */
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        // devolver un objeto genérico que incluya workspaceId para la primera llamada
        if (where.id && opts.sourceAgentWorkspaceId !== null) {
          return Promise.resolve({ id: where.id, workspaceId: opts.sourceAgentWorkspaceId, name: where.id })
        }
        return Promise.resolve(null)
      }),
      /**
       * findFirst: devuelve el orchestrador de cada nivel en orden
       * workspace → department → agency, según las llamadas secuenciales.
       */
      findFirst: jest.fn().mockImplementation(() => {
        const result = findFirstQueue[findFirstCallIdx] ?? null
        findFirstCallIdx++
        return Promise.resolve(result)
      }),
    },
    workspace: {
      findUnique: jest.fn().mockResolvedValue(
        opts.workspace !== undefined ? opts.workspace : null
      ),
    },
    department: {
      findUnique: jest.fn().mockResolvedValue(
        opts.department !== undefined ? opts.department : null
      ),
    },
    agency: {
      findUnique: jest.fn().mockResolvedValue(
        opts.agency !== undefined ? opts.agency : null
      ),
    },
    agentProfile: {
      findUnique: jest.fn().mockResolvedValue(opts.agentProfile ?? null),
      upsert:     jest.fn(),
    },
  }
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ProfilePropagatorService.propagateUp()', () => {
  const AGENT_ID  = 'agent-1'
  const WS_ID     = 'ws-1'
  const WS_ORCH   = 'ws-orchestrator'
  const DEP_ID    = 'dep-1'
  const DEP_ORCH  = 'dep-orchestrator'
  const AGC_ID    = 'agc-1'
  const AGC_ORCH  = 'agc-orchestrator'

  // ── Case 1: propaga al orchestrador del workspace ────────────────────────────
  it('propaga al orchestrador del workspace (isLevelOrchestrator) cuando existe y es distinto al agentId', async () => {
    const prisma = buildPrismaMock({
      sourceAgentWorkspaceId: WS_ID,
      workspace:   { id: WS_ID, departmentId: null },
      wsOrchAgent: { id: WS_ORCH },
    })
    prisma.agentProfile.upsert.mockResolvedValue(makeFlatProfile(WS_ORCH))

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(1)
    expect(result.updated[0]!.agentId).toBe(WS_ORCH)
    expect(result.skipped).toHaveLength(0)
    // Verificar que se usó agent.findFirst (NO workspace.select{orchestratorId})
    expect(prisma.agent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isLevelOrchestrator: true }) })
    )
  })

  // ── Case 2: propaga a workspace + department + agency ────────────────────
  it('propaga a workspace, department y agency cuando todos tienen orchestrador', async () => {
    const prisma = buildPrismaMock({
      sourceAgentWorkspaceId: WS_ID,
      workspace:    { id: WS_ID,  departmentId: DEP_ID },
      department:   { id: DEP_ID, agencyId: AGC_ID },
      wsOrchAgent:  { id: WS_ORCH  },
      depOrchAgent: { id: DEP_ORCH },
      agcOrchAgent: { id: AGC_ORCH },
    })

    prisma.agentProfile.upsert
      .mockResolvedValueOnce(makeFlatProfile(WS_ORCH))
      .mockResolvedValueOnce(makeFlatProfile(DEP_ORCH))
      .mockResolvedValueOnce(makeFlatProfile(AGC_ORCH))

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(3)
    expect(result.updated[0]!.agentId).toBe(WS_ORCH)
    expect(result.updated[1]!.agentId).toBe(DEP_ORCH)
    expect(result.updated[2]!.agentId).toBe(AGC_ORCH)
    expect(result.skipped).toHaveLength(0)
    // agent.findFirst debe haberse llamado 3 veces (ws + dep + agc)
    expect(prisma.agent.findFirst).toHaveBeenCalledTimes(3)
  })

  // ── Case 3: skipped cuando no hay orchestrador en workspace ───────────────
  it('añade a skipped cuando no hay Agent con isLevelOrchestrator=true en el workspace', async () => {
    const prisma = buildPrismaMock({
      sourceAgentWorkspaceId: WS_ID,
      workspace:   { id: WS_ID, departmentId: null },
      wsOrchAgent: null,  // ningún agente con isLevelOrchestrator en este workspace
    })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(0)
    expect(result.skipped).toContain(`workspace:${WS_ID}`)
  })

  // ── Case 4: anti-loop cuando el orchestrador ES el agentId fuente ────────
  it('añade a skipped cuando agent.findFirst devuelve el mismo agentId (anti-loop)', async () => {
    const prisma = buildPrismaMock({
      sourceAgentWorkspaceId: WS_ID,
      workspace:   { id: WS_ID, departmentId: null },
      wsOrchAgent: { id: AGENT_ID },  // orchestrador === agente fuente → loop
    })

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(0)
    expect(result.skipped).toContain(`workspace:${WS_ID}`)
    // NO debe llamar a agentProfile.upsert (no se propagó)
    expect(prisma.agentProfile.upsert).not.toHaveBeenCalled()
  })

  // ── Case 5: workspace sin departmentId — no llama a department ni agency ──
  it('no propaga a department ni agency cuando workspace.departmentId es null', async () => {
    const prisma = buildPrismaMock({
      sourceAgentWorkspaceId: WS_ID,
      workspace:   { id: WS_ID, departmentId: null },
      wsOrchAgent: { id: WS_ORCH },
    })
    prisma.agentProfile.upsert.mockResolvedValueOnce(makeFlatProfile(WS_ORCH))

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    expect(result.updated).toHaveLength(1)
    expect(prisma.department.findUnique).not.toHaveBeenCalled()
    expect(prisma.agency.findUnique).not.toHaveBeenCalled()
    // agent.findFirst solo se llamó 1 vez (solo nivel workspace)
    expect(prisma.agent.findFirst).toHaveBeenCalledTimes(1)
  })

  // ── Case 6: lanza Error si el agente no existe ────────────────────────
  it('lanza Error si el agente no existe en BD', async () => {
    const prisma = buildPrismaMock({ sourceAgentWorkspaceId: null })
    prisma.agent.findUnique.mockResolvedValueOnce(null)

    const svc = new ProfilePropagatorService(prisma as never)
    await expect(svc.propagateUp('non-existent', INPUT)).rejects.toThrow(
      'Agent "non-existent" not found',
    )
  })

  // ── Case 7: orden correcto workspace → department → agency ───────────────
  it('updated contiene ResolvedProfile en orden: workspace → department → agency', async () => {
    const prisma = buildPrismaMock({
      sourceAgentWorkspaceId: WS_ID,
      workspace:    { id: WS_ID,  departmentId: DEP_ID },
      department:   { id: DEP_ID, agencyId: AGC_ID },
      wsOrchAgent:  { id: WS_ORCH  },
      depOrchAgent: { id: DEP_ORCH },
      agcOrchAgent: { id: AGC_ORCH },
    })

    prisma.agentProfile.upsert
      .mockResolvedValueOnce(makeFlatProfile(WS_ORCH))
      .mockResolvedValueOnce(makeFlatProfile(DEP_ORCH))
      .mockResolvedValueOnce(makeFlatProfile(AGC_ORCH))

    const svc = new ProfilePropagatorService(prisma as never)
    const result = await svc.propagateUp(AGENT_ID, INPUT)

    const ids = result.updated.map((p) => p.agentId)
    expect(ids).toEqual([WS_ORCH, DEP_ORCH, AGC_ORCH])
  })

  // ── Case 8: workspace/department/agency NO tienen orchestratorId en el mock ──
  it('los modelos Workspace/Department/Agency en el mock no tienen orchestratorId (schema canónico)', async () => {
    const prisma = buildPrismaMock({
      sourceAgentWorkspaceId: WS_ID,
      workspace:    { id: WS_ID,  departmentId: DEP_ID },
      department:   { id: DEP_ID, agencyId: AGC_ID },
      wsOrchAgent:  { id: WS_ORCH },
    })
    prisma.agentProfile.upsert.mockResolvedValueOnce(makeFlatProfile(WS_ORCH))

    const svc = new ProfilePropagatorService(prisma as never)
    await svc.propagateUp(AGENT_ID, INPUT)

    // Verificar que workspace no expone orchestratorId
    const wsCall = (prisma.workspace.findUnique as jest.Mock).mock.results[0]?.value
    const wsResult = await wsCall
    expect(wsResult).not.toHaveProperty('orchestratorId')

    // Verificar que se llamó agent.findFirst con isLevelOrchestrator
    expect(prisma.agent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isLevelOrchestrator: true }),
      })
    )
  })
})
