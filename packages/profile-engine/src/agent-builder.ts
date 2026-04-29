/**
 * AgentBuilder — creación/eliminación de agentes con auto-propagación de orchestrator prompts
 *
 * Responsabilidades:
 *   1. Crear o actualizar un Agent + su AgentProfile en una sola operación atómica.
 *   2. Al crear/eliminar un agente, subir por la jerarquía
 *      (Workspace → Department → Agency) y regenerar el systemPrompt de cada
 *      orchestrador con LLM, reflejando las nuevas capacidades disponibles.
 *
 * Patrón de referencia:
 *   - AutoGen AgentBuilder: registro dinámico de agentes con actualización del GroupChat manager.
 *   - CrewAI Crew.add_agent(): inserción en caliente con re-planificación del supervisor.
 *
 * Integración con HierarchyOrchestrator:
 *   - HierarchyOrchestrator recibe `SupervisorFn` inyectada desde fuera.
 *   - AgentBuilder NO instancia HierarchyOrchestrator; sólo actualiza los systemPrompts
 *     en Prisma que el orchestrator leerá la próxima vez que construya su HierarchyNode.
 *
 * Flujo completo:
 *   const builder = new AgentBuilder(prisma, openai)
 *   const agent   = await builder.create({ workspaceId, name, role, goal, profile })
 *   // → crea Agent en DB
 *   // → propaga AgentProfile
 *   // → regenera systemPrompt de Workspace, Department, Agency
 */

import type { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { ProfilePropagatorService, type PropagateProfileInput } from './profile-propagator.service.js'

// ── DTOs públicos ────────────────────────────────────────────────────────────

export interface CreateAgentInput {
  workspaceId:  string
  name:         string
  role?:        string
  goal?:        string
  backstory?:   string
  /** Si se provee, se usa como modelo LLM del agente */
  model?:       string
  /** Perfil inicial del agente (system prompt, persona, KB, etc.) */
  profile?:     PropagateProfileInput
  /** Si true, el OrchestratorPromptPropagator NO se ejecuta (útil para bulk imports) */
  skipPropagation?: boolean
}

export interface UpdateAgentInput {
  name?:      string
  role?:      string
  goal?:      string
  backstory?: string
  model?:     string
  profile?:   PropagateProfileInput
  skipPropagation?: boolean
}

export interface BuiltAgent {
  id:          string
  workspaceId: string
  name:        string
  role:        string | null
  goal:        string | null
  backstory:   string | null
  model:       string | null
  createdAt:   Date
  updatedAt:   Date
}

// ── AgentBuilder ─────────────────────────────────────────────────────────────

export class AgentBuilder {
  private readonly propagator:            ProfilePropagatorService
  private readonly orchestratorPropagator: OrchestratorPromptPropagator

  constructor(
    private readonly prisma: PrismaClient,
    openai: OpenAI,
    /** Modelo a usar para regenerar orchestrator prompts (default: gpt-4o-mini) */
    orchestratorModel = 'gpt-4o-mini',
  ) {
    this.propagator             = new ProfilePropagatorService(prisma)
    this.orchestratorPropagator = new OrchestratorPromptPropagator(prisma, openai, orchestratorModel)
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  /**
   * Crea un agente nuevo con su perfil y dispara la propagación hacia arriba.
   */
  async create(input: CreateAgentInput): Promise<BuiltAgent> {
    const workspace = await this.prisma.workspace.findUnique({
      where:  { id: input.workspaceId },
      select: { id: true },
    })
    if (!workspace) throw new Error(`Workspace "${input.workspaceId}" not found`)

    // 1. Crear el Agent
    const agent = await this.prisma.agent.create({
      data: {
        workspaceId: input.workspaceId,
        name:        input.name,
        role:        input.role        ?? null,
        goal:        input.goal        ?? null,
        backstory:   input.backstory   ?? null,
        model:       input.model       ?? null,
      },
    })

    // 2. Propagar perfil si se provee
    if (input.profile) {
      await this.propagator.propagate(agent.id, input.profile)
    }

    // 3. Actualizar orchestrator prompts hacia arriba
    if (!input.skipPropagation) {
      await this.orchestratorPropagator.propagate(agent.id, 'added')
    }

    return agent as BuiltAgent
  }

  /**
   * Actualiza un agente existente y re-propaga si cambia el perfil.
   */
  async update(agentId: string, input: UpdateAgentInput): Promise<BuiltAgent> {
    const existing = await this.prisma.agent.findUnique({ where: { id: agentId } })
    if (!existing) throw new Error(`Agent "${agentId}" not found`)

    // 1. Actualizar campos del agente
    const agent = await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        name:      input.name      ?? existing.name,
        role:      input.role      !== undefined ? input.role      : existing.role,
        goal:      input.goal      !== undefined ? input.goal      : existing.goal,
        backstory: input.backstory !== undefined ? input.backstory : existing.backstory,
        model:     input.model     !== undefined ? input.model     : existing.model,
        updatedAt: new Date(),
      },
    })

    // 2. Re-propagar perfil
    if (input.profile) {
      await this.propagator.propagate(agentId, input.profile)
    }

    // 3. Re-propagar orchestrator prompts si cambió el perfil o el rol
    if (!input.skipPropagation && (input.profile || input.role || input.goal)) {
      await this.orchestratorPropagator.propagate(agentId, 'updated')
    }

    return agent as BuiltAgent
  }

  /**
   * Elimina un agente, limpia su perfil y actualiza orchestrator prompts hacia arriba.
   */
  async remove(agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where:   { id: agentId },
      select:  { id: true, workspaceId: true },
    })
    if (!agent) throw new Error(`Agent "${agentId}" not found`)

    // Propagar ANTES de eliminar (necesitamos el agentId para resolver la jerarquía)
    await this.orchestratorPropagator.propagate(agentId, 'removed')

    // Eliminar perfil si existe
    await this.propagator.deleteProfile(agentId).catch(() => null)

    // Eliminar agente
    await this.prisma.agent.delete({ where: { id: agentId } })
  }

  /**
   * Dispara manualmente la propagación de orchestrator prompts.
   * Útil cuando se cambia el goal/role de un agente sin pasar por update().
   */
  async triggerPropagation(agentId: string): Promise<void> {
    await this.orchestratorPropagator.propagate(agentId, 'updated')
  }
}

// ── OrchestratorPromptPropagator ─────────────────────────────────────────────

/**
 * Sube por la jerarquía Agent → Workspace → Department → Agency
 * y regenera el systemPrompt de cada orchestrador con LLM.
 *
 * El systemPrompt generado describe las capacidades de los children actuales,
 * de modo que el orchestrator sabe a quién delegar cada tipo de tarea.
 */
export class OrchestratorPromptPropagator {
  constructor(
    private readonly prisma:  PrismaClient,
    private readonly openai:  OpenAI,
    private readonly model:   string = 'gpt-4o-mini',
  ) {}

  /**
   * Punto de entrada — sube desde el agente hasta la agencia.
   *
   * @param agentId   ID del agente que fue creado/actualizado/eliminado
   * @param operation Tipo de operación (solo informativo, no cambia la lógica)
   */
  async propagate(agentId: string, operation: 'added' | 'updated' | 'removed'): Promise<void> {
    // Resolver la cadena jerárquica completa del agente
    const agent = await this.prisma.agent.findUnique({
      where:   { id: agentId },
      include: {
        workspace: {
          include: {
            department: {
              include: { agency: true },
            },
          },
        },
      },
    })

    // Si el agente ya fue eliminado (operation === 'removed'), el include puede fallar.
    // En ese caso resolvemos la jerarquía antes de eliminar (ver AgentBuilder.remove).
    if (!agent) {
      // Agente eliminado antes de llegar aquí — nada que propagar
      return
    }

    const { workspace } = agent
    const { department } = workspace
    const agency = department.agency

    // Propagar en orden bottom-up: Workspace → Department → Agency
    // Usamos Promise.allSettled para no detener la cadena si un nivel falla
    const updates = await Promise.allSettled([
      this.updateWorkspacePrompt(workspace.id, workspace.name),
      this.updateDepartmentPrompt(department.id, department.name),
      agency ? this.updateAgencyPrompt(agency.id, agency.name) : Promise.resolve(),
    ])

    // Log de errores sin lanzar
    updates.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const levels = ['workspace', 'department', 'agency']
        console.error(
          `[OrchestratorPromptPropagator] Failed to update ${levels[idx]} prompt:`,
          result.reason,
        )
      }
    })
  }

  // ── Actualizadores por nivel ────────────────────────────────────────────────

  private async updateWorkspacePrompt(workspaceId: string, workspaceName: string): Promise<void> {
    const children = await this.resolveChildren('workspace', workspaceId)
    const newPrompt = await this.buildOrchestratorPrompt(workspaceName, 'workspace', children)
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data:  { systemPrompt: newPrompt, updatedAt: new Date() },
    })
  }

  private async updateDepartmentPrompt(departmentId: string, departmentName: string): Promise<void> {
    const children = await this.resolveChildren('department', departmentId)
    const newPrompt = await this.buildOrchestratorPrompt(departmentName, 'department', children)
    await this.prisma.department.update({
      where: { id: departmentId },
      data:  { systemPrompt: newPrompt, updatedAt: new Date() },
    })
  }

  private async updateAgencyPrompt(agencyId: string, agencyName: string): Promise<void> {
    const children = await this.resolveChildren('agency', agencyId)
    const newPrompt = await this.buildOrchestratorPrompt(agencyName, 'agency', children)
    await this.prisma.agency.update({
      where: { id: agencyId },
      data:  { systemPrompt: newPrompt, updatedAt: new Date() },
    })
  }

  // ── Resolución de children ──────────────────────────────────────────────────

  /**
   * Resuelve los children directos del nivel dado.
   *
   * Agency     → sus Departments
   * Department → sus Workspaces
   * Workspace  → sus Agents (con systemPrompt del AgentProfile si existe)
   */
  async resolveChildren(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<Array<{ id: string; name: string; systemPrompt: string | null }>> {
    if (level === 'agency') {
      return this.prisma.department.findMany({
        where:  { agencyId: scopeId },
        select: { id: true, name: true, systemPrompt: true },
        orderBy: { name: 'asc' },
      })
    }

    if (level === 'department') {
      return this.prisma.workspace.findMany({
        where:  { departmentId: scopeId },
        select: { id: true, name: true, systemPrompt: true },
        orderBy: { name: 'asc' },
      })
    }

    // Workspace → Agents (preferimos el systemPrompt del AgentProfile si existe)
    const agents = await this.prisma.agent.findMany({
      where:   { workspaceId: scopeId },
      select:  {
        id:   true,
        name: true,
        role: true,
        goal: true,
        agentProfile: { select: { systemPrompt: true } },
      },
      orderBy: { name: 'asc' },
    })

    return agents.map((a) => ({
      id:   a.id,
      name: a.name,
      // Prioridad: AgentProfile.systemPrompt > generado desde role+goal > null
      systemPrompt:
        (a.agentProfile as { systemPrompt: string | null } | null)?.systemPrompt
        ?? (a.role || a.goal ? `${a.role ?? ''}. ${a.goal ?? ''}`.trim() : null),
    }))
  }

  // ── Generación del prompt de orchestrador ────────────────────────────────────

  /**
   * Genera el systemPrompt del orchestrador describiendo las capacidades de sus children.
   *
   * Si hay children: usa LLM para generar un prompt rico y coherente.
   * Si no hay children: devuelve un prompt genérico de orchestrador vacío.
   */
  async buildOrchestratorPrompt(
    name:     string,
    level:    'agency' | 'department' | 'workspace',
    children: Array<{ id: string; name: string; systemPrompt: string | null }>,
  ): Promise<string> {
    if (children.length === 0) {
      return [
        `You are the orchestrator of ${name} (level: ${level}).`,
        `Currently you have no subordinates assigned.`,
        `When subordinates are added, your role will be to decompose tasks and delegate to them.`,
      ].join('\n')
    }

    const childList = children
      .map((c) => `- **${c.name}** (id: ${c.id}): ${c.systemPrompt?.slice(0, 200) ?? 'General purpose assistant'}`)
      .join('\n')

    const systemInstruction = [
      `You are generating an orchestrator system prompt for an AI agent named "${name}" at hierarchy level "${level}".`,
      `This orchestrator delegates tasks to its subordinates — it does NOT execute tasks directly.`,
      `Write the system prompt in 2nd person ("You are...").`,
      `Be concise but complete. Include: role, delegation process, list of subordinates with their specialties.`,
      `Output ONLY the system prompt text, no preamble, no code fences.`,
    ].join(' ')

    const userPrompt = [
      `Orchestrator name: ${name}`,
      `Hierarchy level: ${level}`,
      ``,
      `Subordinates and their capabilities:`,
      childList,
    ].join('\n')

    try {
      const response = await this.openai.chat.completions.create({
        model:    this.model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user',   content: userPrompt },
        ],
        max_tokens:  600,
        temperature: 0.3,
      })

      const content = response.choices[0]?.message?.content?.trim()
      if (!content) throw new Error('LLM returned empty orchestrator prompt')
      return content
    } catch (err) {
      // Fallback a plantilla estática si el LLM falla
      console.error('[OrchestratorPromptPropagator] LLM failed, using static template:', err)
      return this.buildStaticOrchestratorPrompt(name, level, children)
    }
  }

  /**
   * Fallback estático — se usa cuando el LLM no está disponible.
   * Mismo formato que el plan original de HierarchyOrchestrator.
   */
  private buildStaticOrchestratorPrompt(
    name:     string,
    level:    string,
    children: Array<{ name: string; systemPrompt: string | null }>,
  ): string {
    const childCapabilities = children
      .map((c) => `- **${c.name}**: ${c.systemPrompt?.slice(0, 150) ?? 'Especialista en tareas del área'}`)
      .join('\n')

    return [
      `You are the orchestrator of ${name} (level: ${level}).`,
      ``,
      `Your role is to receive tasks, decompose them, and delegate to your subordinates according to their specialties.`,
      `Do NOT execute tasks directly — coordinate, delegate, and consolidate results.`,
      ``,
      `**Your subordinates and their capabilities:**`,
      childCapabilities,
      ``,
      `**Workflow:**`,
      `1. Analyze the incoming task`,
      `2. Identify which subordinates are relevant`,
      `3. Decompose the task into specific subtasks for each one`,
      `4. Wait for results`,
      `5. Consolidate and return a coherent final response`,
    ].join('\n')
  }
}
