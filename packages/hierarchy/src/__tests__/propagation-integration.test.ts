/**
 * [F2b-05] propagation-integration.test.ts
 *
 * Test de integración: agregar un Agent specialist dispara la
 * propagación completa de perfiles por la jerarquía.
 *
 * Ensambla las piezas reales de F2b-01..04:
 *   - AgentRepository (con PropagateHook — F2b-04)
 *   - ProfilePropagatorService.propagateUp() (F2b-01)
 *   - WorkspaceRepository.findOrchestratorAgent() (F2b-02)
 *   - DepartmentRepository.findOrchestratorAgent() (F2b-02)
 *   - AgencyRepository.findOrchestratorAgent() (F2b-02)
 *   - generateOrchestratorPrompt() (F2b-03)
 *
 * Solo se mockea: PrismaClient.
 * No se conecta a ninguna BD real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'

import { AgentRepository }          from '../../run-engine/src/repositories/agent.repository'
import { WorkspaceRepository }      from '../../run-engine/src/repositories/workspace.repository'
import { DepartmentRepository }     from '../../run-engine/src/repositories/department.repository'
import { AgencyRepository }         from '../../run-engine/src/repositories/agency.repository'
import { ProfilePropagatorService } from '../profile-propagator.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AGENCY_ID       = 'agency-abc'
const DEPARTMENT_ID   = 'dept-xyz'
const WORKSPACE_ID    = 'ws-001'

// Orchestrators (isLevelOrchestrator: true)
const AGENCY_ORCH_DEPT_ID = 'dept-orch-001'   // dept orquestador de la agency
const DEPT_ORCH_WS_ID     = 'ws-orch-001'     // workspace orquestador del dept
const WS_ORCH_AGENT_ID    = 'agent-orch-001'  // agent orquestador del workspace

// Specialist nuevo que se crea (trigger del test)
const NEW_SPECIALIST_ID   = 'agent-specialist-new'
const NEW_SPECIALIST_NAME = 'Tax Specialist'

// Perfil del specialist (ya existe antes de la propagación)
const SPECIALIST_PROFILE = {
  agentId:       NEW_SPECIALIST_ID,
  systemPrompt:  'Expert in corporate tax law, VAT compliance, and international taxation.',
  persona:       'Precise, detail-oriented tax advisor',
  knowledgeBase: 'OECD guidelines, IFRS, local tax codes',
  skills: [
    { skill: { name: 'tax-analysis' } },
    { skill: { name: 'compliance-review' } },
  ],
}

// Perfiles de hermanos que ya existen en el workspace
const SIBLING_PROFILE = {
  agentId:       'agent-sibling-001',
  systemPrompt:  'Expert in corporate legal contracts and M&A advisory.',
  persona:       'Senior legal counsel',
  knowledgeBase: 'Contract law, due diligence procedures',
  skills: [
    { skill: { name: 'legal-drafting' } },
  ],
}

// ── Helper: buildIntegrationPrisma() ─────────────────────────────────────────
//
// Construye un mock completo de PrismaClient que simula todas las queries
// que la cadena de propagación ejecuta internamente.
// Patrón: vi.fn().mockResolvedValueOnce(...) para llamadas ordenadas.
//
function buildIntegrationPrisma() {
  const agentProfileUpsert = vi.fn().mockResolvedValue({})

  return {
    prisma: {
      agent: {
        create: vi.fn().mockResolvedValue({
          id:          NEW_SPECIALIST_ID,
          name:        NEW_SPECIALIST_NAME,
          workspaceId: WORKSPACE_ID,
        }),
        findFirst: vi.fn()
          // call 1: WS orchestrator agent
          .mockResolvedValueOnce({ id: WS_ORCH_AGENT_ID, name: 'WS Orchestrator', workspaceId: WORKSPACE_ID })
          // call 2: dept orchestrator agent (workspace orquestador del dept)
          .mockResolvedValueOnce({ id: 'agent-dept-orch', name: 'Dept Orchestrator', workspaceId: DEPT_ORCH_WS_ID })
          // call 3: agency orchestrator agent
          .mockResolvedValueOnce({ id: 'agent-agency-orch', name: 'Agency Orchestrator', workspaceId: 'ws-agency-orch' })
          // fallback
          .mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          { id: NEW_SPECIALIST_ID, name: NEW_SPECIALIST_NAME },
          { id: 'agent-sibling-001', name: 'Contract Lawyer' },
        ]),
        update: vi.fn().mockResolvedValue({
          id:        NEW_SPECIALIST_ID,
          deletedAt: new Date(),
        }),
      },
      workspace: {
        findFirst: vi.fn()
          // call 1: workspace propio (validación de existencia)
          .mockResolvedValueOnce({ id: WORKSPACE_ID })
          // call 2: workspace orch del dept
          .mockResolvedValueOnce({ id: DEPT_ORCH_WS_ID })
          // call 3: workspace orch de la agency
          .mockResolvedValueOnce({ id: 'ws-agency-orch' })
          .mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          { id: WORKSPACE_ID },
          { id: DEPT_ORCH_WS_ID },
        ]),
      },
      department: {
        findFirst: vi.fn()
          // dept orquestador de la agency
          .mockResolvedValueOnce({ id: AGENCY_ORCH_DEPT_ID })
          .mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          { id: DEPARTMENT_ID },
          { id: AGENCY_ORCH_DEPT_ID },
        ]),
      },
      agentProfile: {
        findMany: vi.fn()
          // call 1: profiles de agents del workspace (specialist + sibling)
          .mockResolvedValueOnce([SPECIALIST_PROFILE, SIBLING_PROFILE])
          // call 2: profiles de orchestrators de workspaces del dept
          .mockResolvedValueOnce([
            { agentId: WS_ORCH_AGENT_ID, systemPrompt: 'ws-orch-prompt',   persona: null, knowledgeBase: null, skills: [] },
            { agentId: 'ws-orch-002',    systemPrompt: 'another ws orch',   persona: null, knowledgeBase: null, skills: [] },
          ])
          // call 3: profiles de orchestrators de departments de la agency
          .mockResolvedValueOnce([
            { agentId: 'agent-dept-orch', systemPrompt: 'dept-orch-prompt', persona: null, knowledgeBase: null, skills: [] },
          ])
          .mockResolvedValue([]),
        upsert: agentProfileUpsert,
      },
      run:      { create: vi.fn(), update: vi.fn() },
      runStep:  { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
      approval: { create: vi.fn(), findUnique: vi.fn() },
    } as unknown as PrismaClient,
    agentProfileUpsert,
  }
}

// ── Helper: buildSystem() ─────────────────────────────────────────────────────
//
// Ensambla el sistema completo con el hook conectado:
//   AgentRepository + PropagateHook → ProfilePropagatorService
//
function buildSystem() {
  const { prisma, agentProfileUpsert } = buildIntegrationPrisma()

  const wsRepo     = new WorkspaceRepository(prisma)
  const deptRepo   = new DepartmentRepository(prisma)
  const agencyRepo = new AgencyRepository(prisma)
  const propagator = new ProfilePropagatorService(prisma, wsRepo, deptRepo, agencyRepo)

  const agentRepo = new AgentRepository(
    prisma,
    (agentId: string) => propagator.propagateUp(agentId),
  )

  return { agentRepo, propagator, agentProfileUpsert, prisma }
}

// ── Input fixture ─────────────────────────────────────────────────────────────

const NEW_SPECIALIST_INPUT = {
  workspaceId: WORKSPACE_ID,
  name:        NEW_SPECIALIST_NAME,
  slug:        'tax-specialist',
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('F2b — Integración: agregar Agent specialist → propagación de perfiles', () => {

  describe('agentRepo.create() dispara propagación completa', () => {

    it('create() devuelve el agent creado sin importar si la propagación tarda', async () => {
      const { agentRepo } = buildSystem()

      const result = await agentRepo.create(NEW_SPECIALIST_INPUT)

      expect(result.id).toBe(NEW_SPECIALIST_ID)
    })

    it('agentProfile.upsert es llamado exactamente 3 veces (ws + dept + agency orchestrators)', async () => {
      const { agentRepo, agentProfileUpsert } = buildSystem()

      await agentRepo.create(NEW_SPECIALIST_INPUT)

      await vi.waitFor(() => {
        expect(agentProfileUpsert).toHaveBeenCalledTimes(3)
      }, { timeout: 500 })
    })

    it('el systemPrompt del workspace orchestrator contiene capacidades del specialist', async () => {
      const { agentRepo, agentProfileUpsert } = buildSystem()

      await agentRepo.create(NEW_SPECIALIST_INPUT)

      await vi.waitFor(() => {
        expect(agentProfileUpsert).toHaveBeenCalledTimes(3)
      }, { timeout: 500 })

      const wsCall  = agentProfileUpsert.mock.calls[0][0]
      const prompt: string = wsCall.update?.systemPrompt ?? wsCall.create?.systemPrompt ?? ''

      expect(prompt).toMatch(/tax|compliance|taxation/i)
    })

    it('el systemPrompt del ws orchestrator no contiene literales null/undefined/[object Object]', async () => {
      const { agentRepo, agentProfileUpsert } = buildSystem()

      await agentRepo.create(NEW_SPECIALIST_INPUT)

      await vi.waitFor(() => {
        expect(agentProfileUpsert).toHaveBeenCalledTimes(3)
      }, { timeout: 500 })

      const wsCall  = agentProfileUpsert.mock.calls[0][0]
      const prompt: string = wsCall.update?.systemPrompt ?? wsCall.create?.systemPrompt ?? ''

      expect(prompt.length).toBeGreaterThan(0)
      expect(prompt).not.toContain('null')
      expect(prompt).not.toContain('undefined')
      expect(prompt).not.toContain('[object Object]')
    })

    it('el systemPrompt del department orchestrator es un string non-empty', async () => {
      const { agentRepo, agentProfileUpsert } = buildSystem()

      await agentRepo.create(NEW_SPECIALIST_INPUT)

      await vi.waitFor(() => {
        expect(agentProfileUpsert).toHaveBeenCalledTimes(3)
      }, { timeout: 500 })

      const deptCall = agentProfileUpsert.mock.calls[1][0]
      const prompt: string = deptCall.update?.systemPrompt ?? deptCall.create?.systemPrompt ?? ''

      expect(prompt.length).toBeGreaterThan(0)
    })

    it('el systemPrompt de la agency orchestrator es un string non-empty', async () => {
      const { agentRepo, agentProfileUpsert } = buildSystem()

      await agentRepo.create(NEW_SPECIALIST_INPUT)

      await vi.waitFor(() => {
        expect(agentProfileUpsert).toHaveBeenCalledTimes(3)
      }, { timeout: 500 })

      const agencyCall = agentProfileUpsert.mock.calls[2][0]
      const prompt: string     = agencyCall.update?.systemPrompt ?? agencyCall.create?.systemPrompt ?? ''

      expect(prompt.length).toBeGreaterThan(0)
    })

    it('los 3 upserts usan los IDs correctos de orchestrators', async () => {
      const { agentRepo, agentProfileUpsert } = buildSystem()

      await agentRepo.create(NEW_SPECIALIST_INPUT)

      await vi.waitFor(() => {
        expect(agentProfileUpsert).toHaveBeenCalledTimes(3)
      }, { timeout: 500 })

      expect(agentProfileUpsert.mock.calls[0][0].where.agentId).toBe(WS_ORCH_AGENT_ID)
      expect(agentProfileUpsert.mock.calls[1][0].where.agentId).toBe('agent-dept-orch')
      expect(agentProfileUpsert.mock.calls[2][0].where.agentId).toBe('agent-agency-orch')
    })

  })

  describe('agentRepo.softDelete() dispara propagación', () => {

    it('softDelete() devuelve el agent soft-deleted con deletedAt seteado', async () => {
      const { agentRepo } = buildSystem()

      const result = await agentRepo.softDelete(NEW_SPECIALIST_ID)

      expect(result.id).toBe(NEW_SPECIALIST_ID)
      expect(result.deletedAt).toBeInstanceOf(Date)
    })

    it('agentProfile.upsert es llamado después del soft-delete (workspace orchestrator actualizado)', async () => {
      const { agentRepo, agentProfileUpsert } = buildSystem()

      await agentRepo.softDelete(NEW_SPECIALIST_ID)

      await vi.waitFor(() => {
        expect(agentProfileUpsert).toHaveBeenCalled()
      }, { timeout: 500 })

      const wsCall  = agentProfileUpsert.mock.calls[0][0]
      const prompt: string = wsCall.update?.systemPrompt ?? wsCall.create?.systemPrompt ?? ''

      expect(typeof prompt).toBe('string')
    })

  })

  describe('comportamiento ante fallo del hook', () => {

    it('si propagateUp() lanza internamente, create() ya retornó con éxito y NO lanza', async () => {
      const { prisma } = buildIntegrationPrisma()

      // Forzar que agentProfile.upsert rechace internamente
      ;(prisma.agentProfile as { upsert: ReturnType<typeof vi.fn> }).upsert =
        vi.fn().mockRejectedValue(new Error('DB connection failed'))

      const wsRepo     = new WorkspaceRepository(prisma)
      const deptRepo   = new DepartmentRepository(prisma)
      const agencyRepo = new AgencyRepository(prisma)
      const propagator = new ProfilePropagatorService(prisma, wsRepo, deptRepo, agencyRepo)

      const agentRepo = new AgentRepository(
        prisma,
        (agentId: string) => propagator.propagateUp(agentId),
      )

      // create() debe resolver sin lanzar aunque el hook falle internamente
      await expect(agentRepo.create(NEW_SPECIALIST_INPUT)).resolves.toBeDefined()
    })

  })

  describe('sin hook — backward compatibility', () => {

    it('new AgentRepository(prisma) sin hook: create() resuelve y upsert NUNCA es llamado', async () => {
      const { prisma, agentProfileUpsert } = buildIntegrationPrisma()

      // AgentRepository construido SIN hook (backward compat)
      const agentRepo = new AgentRepository(prisma)

      const result = await agentRepo.create(NEW_SPECIALIST_INPUT)

      // Dar tiempo para asegurarse de que no hay side effects asíncronos
      await new Promise<void>((r) => setTimeout(r, 50))

      expect(result.id).toBe(NEW_SPECIALIST_ID)
      expect(agentProfileUpsert).not.toHaveBeenCalled()
    })

  })

})
