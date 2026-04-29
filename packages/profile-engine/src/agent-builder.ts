/**
 * AgentBuilder — creación/eliminación de agentes con auto-propagación de orchestrator prompts
 *
 * Responsabilidades:
 *   1. Crear o actualizar un Agent + su AgentProfile en una sola operación atómica.
 *   2. Al crear/eliminar un agente, subir por la jerarquía
 *      (Workspace → Department → Agency) y regenerar el systemPrompt de cada
 *      orchestrador con LLM, usando el modelo configurado en ModelPolicy para
 *      ese scope — sin hardcodear ningún modelo.
 *
 * Resolución de modelo (OrchestratorModelResolver):
 *   Para cada nivel (workspace / department / agency) busca ModelPolicy en Prisma:
 *     1. ModelPolicy del scope actual  → usa primaryModel
 *     2. ModelPolicy del department    → usa primaryModel
 *     3. ModelPolicy de la agency      → usa primaryModel
 *     4. Agent.model de cualquier agente activo en el scope (último recurso de DB)
 *     5. Fallback a template estático  → no llama al LLM
 *
 *   Si el primaryModel falla y existe fallbackModel en la misma policy, reintenta
 *   con el fallback antes de caer al template estático.
 *
 * Patrón de referencia:
 *   - AutoGen AgentBuilder: registro dinámico de agentes con actualización del GroupChat manager.
 *   - CrewAI Crew.add_agent(): inserción en caliente con re-planificación del supervisor.
 *
 * Integración con HierarchyOrchestrator:
 *   - HierarchyOrchestrator recibe `SupervisorFn` inyectada desde fuera.
 *   - AgentBuilder NO instancia HierarchyOrchestrator; sólo actualiza los systemPrompts
 *     en Prisma que el orchestrator leerá la próxima vez que construya su HierarchyNode.
 */

import type { PrismaClient } from '@prisma/client'
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
  private readonly propagator:             ProfilePropagatorService
  private readonly orchestratorPropagator: OrchestratorPromptPropagator

  /**
   * @param prisma - PrismaClient
   * No recibe modelo fijo ni cliente OpenAI —
   * OrchestratorPromptPropagator resuelve el modelo desde ModelPolicy en Prisma.
   */
  constructor(private readonly prisma: PrismaClient) {
    this.propagator             = new ProfilePropagatorService(prisma)
    this.orchestratorPropagator = new OrchestratorPromptPropagator(prisma)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Crea un agente nuevo con su perfil y dispara la propagación hacia arriba.
   */
  async create(input: CreateAgentInput): Promise<BuiltAgent> {
    const workspace = await this.prisma.workspace.findUnique({
      where:  { id: input.workspaceId },
      select: { id: true },
    })
    if (!workspace) throw new Error(`Workspace "${input.workspaceId}" not found`)

    const agent = await this.prisma.agent.create({
      data: {
        workspaceId: input.workspaceId,
        name:        input.name,
        role:        input.role      ?? null,
        goal:        input.goal      ?? null,
        backstory:   input.backstory ?? null,
        model:       input.model     ?? null,
      },
    })

    if (input.profile) {
      await this.propagator.propagate(agent.id, input.profile)
    }

    if (!input.skipPropagation) {
      await this.orchestratorPropagator.propagate(agent.id, 'added')
    }

    return agent as BuiltAgent
  }

  /**
   * Actualiza un agente existente y re-propaga si cambia el perfil o el rol.
   */
  async update(agentId: string, input: UpdateAgentInput): Promise<BuiltAgent> {
    const existing = await this.prisma.agent.findUnique({ where: { id: agentId } })
    if (!existing) throw new Error(`Agent "${agentId}" not found`)

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

    if (input.profile) {
      await this.propagator.propagate(agentId, input.profile)
    }

    if (!input.skipPropagation && (input.profile || input.role || input.goal)) {
      await this.orchestratorPropagator.propagate(agentId, 'updated')
    }

    return agent as BuiltAgent
  }

  /**
   * Elimina un agente, limpia su perfil y actualiza orchestrator prompts hacia arriba.
   * La propagación ocurre ANTES de eliminar para poder resolver la jerarquía.
   */
  async remove(agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where:  { id: agentId },
      select: { id: true, workspaceId: true },
    })
    if (!agent) throw new Error(`Agent "${agentId}" not found`)

    await this.orchestratorPropagator.propagate(agentId, 'removed')
    await this.propagator.deleteProfile(agentId).catch(() => null)
    await this.prisma.agent.delete({ where: { id: agentId } })
  }

  /**
   * Dispara manualmente la propagación de orchestrator prompts.
   * Útil cuando se cambia goal/role sin pasar por update().
   */
  async triggerPropagation(agentId: string): Promise<void> {
    await this.orchestratorPropagator.propagate(agentId, 'updated')
  }
}

// ── OrchestratorModelResolver ────────────────────────────────────────────────

/**
 * Resuelve el modelo LLM a usar para regenerar el orchestrator prompt
 * de un scope dado, consultando ModelPolicy en Prisma sin requerir agentId.
 *
 * Cadena de resolución para un scope (workspace / department / agency):
 *   1. ModelPolicy del scope actual
 *   2. ModelPolicy del department padre
 *   3. ModelPolicy de la agency
 *   4. Agent.model de cualquier agente activo dentro del scope (último recurso)
 *   5. null → el caller usa template estático
 */
export class OrchestratorModelResolver {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Resuelve el modelo primario y el fallback para un scope.
   * Devuelve null si no hay ModelPolicy ni agentes con modelo configurado.
   */
  async resolveForScope(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<{ primaryModel: string; fallbackModel: string | null } | null> {
    // 1. ModelPolicy directa del scope
    const direct = await this.findModelPolicyForScope(level, scopeId)
    if (direct) {
      return { primaryModel: direct.primaryModel, fallbackModel: direct.fallbackModel }
    }

    // 2. Si es workspace → buscar en su department y agency
    if (level === 'workspace') {
      const ws = await this.prisma.workspace.findUnique({
        where:  { id: scopeId },
        select: { departmentId: true, department: { select: { agencyId: true } } },
      })
      if (ws) {
        const deptPolicy = await this.findModelPolicyForScope('department', ws.departmentId)
        if (deptPolicy) return { primaryModel: deptPolicy.primaryModel, fallbackModel: deptPolicy.fallbackModel }

        if (ws.department.agencyId) {
          const agencyPolicy = await this.findModelPolicyForScope('agency', ws.department.agencyId)
          if (agencyPolicy) return { primaryModel: agencyPolicy.primaryModel, fallbackModel: agencyPolicy.fallbackModel }
        }
      }
    }

    // 3. Si es department → buscar en su agency
    if (level === 'department') {
      const dept = await this.prisma.department.findUnique({
        where:  { id: scopeId },
        select: { agencyId: true },
      })
      if (dept?.agencyId) {
        const agencyPolicy = await this.findModelPolicyForScope('agency', dept.agencyId)
        if (agencyPolicy) return { primaryModel: agencyPolicy.primaryModel, fallbackModel: agencyPolicy.fallbackModel }
      }
    }

    // 4. Último recurso: Agent.model de cualquier agente activo en el scope
    const agentWithModel = await this.findAgentModelInScope(level, scopeId)
    if (agentWithModel) return { primaryModel: agentWithModel, fallbackModel: null }

    return null
  }

  private async findModelPolicyForScope(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<{ primaryModel: string; fallbackModel: string | null } | null> {
    const where =
      level === 'agency'     ? { agencyId:     scopeId } :
      level === 'department' ? { departmentId: scopeId } :
                               { workspaceId:  scopeId }

    const policy = await this.prisma.modelPolicy.findFirst({
      where,
      select: { primaryModel: true, fallbackModel: true },
      orderBy: { createdAt: 'desc' },
    })

    return policy ?? null
  }

  private async findAgentModelInScope(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<string | null> {
    // Para workspace: agentes directos. Para department/agency: agentes anidados.
    const where =
      level === 'workspace'  ? { workspaceId: scopeId, model: { not: null } } :
      level === 'department' ? { workspace: { departmentId: scopeId }, model: { not: null } } :
                               { workspace: { department: { agencyId: scopeId } }, model: { not: null } }

    const agent = await this.prisma.agent.findFirst({
      where:  where as Parameters<typeof this.prisma.agent.findFirst>[0]['where'],
      select: { model: true },
      orderBy: { updatedAt: 'desc' },
    })

    return (agent?.model as string | null) ?? null
  }
}

// ── OrchestratorPromptPropagator ─────────────────────────────────────────────

/**
 * Sube por la jerarquía Agent → Workspace → Department → Agency
 * y regenera el systemPrompt de cada orchestrador con LLM.
 *
 * El modelo a usar se resuelve en Prisma (ModelPolicy) para cada scope,
 * sin ningún modelo hardcodeado en el código.
 */
export class OrchestratorPromptPropagator {
  private readonly modelResolver: OrchestratorModelResolver

  constructor(private readonly prisma: PrismaClient) {
    this.modelResolver = new OrchestratorModelResolver(prisma)
  }

  /**
   * Punto de entrada — sube desde el agente hasta la agencia.
   *
   * @param agentId   ID del agente que fue creado/actualizado/eliminado
   * @param operation Tipo de operación (informativo)
   */
  async propagate(agentId: string, operation: 'added' | 'updated' | 'removed'): Promise<void> {
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

    if (!agent) return

    const { workspace } = agent
    const { department } = workspace
    const agency = department.agency

    const updates = await Promise.allSettled([
      this.updateWorkspacePrompt(workspace.id, workspace.name),
      this.updateDepartmentPrompt(department.id, department.name),
      agency ? this.updateAgencyPrompt(agency.id, agency.name) : Promise.resolve(),
    ])

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

  // ── Actualizadores por nivel ──────────────────────────────────────────────

  private async updateWorkspacePrompt(workspaceId: string, workspaceName: string): Promise<void> {
    const children  = await this.resolveChildren('workspace', workspaceId)
    const newPrompt = await this.buildOrchestratorPrompt(workspaceName, 'workspace', workspaceId, children)
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data:  { systemPrompt: newPrompt, updatedAt: new Date() },
    })
  }

  private async updateDepartmentPrompt(departmentId: string, departmentName: string): Promise<void> {
    const children  = await this.resolveChildren('department', departmentId)
    const newPrompt = await this.buildOrchestratorPrompt(departmentName, 'department', departmentId, children)
    await this.prisma.department.update({
      where: { id: departmentId },
      data:  { systemPrompt: newPrompt, updatedAt: new Date() },
    })
  }

  private async updateAgencyPrompt(agencyId: string, agencyName: string): Promise<void> {
    const children  = await this.resolveChildren('agency', agencyId)
    const newPrompt = await this.buildOrchestratorPrompt(agencyName, 'agency', agencyId, children)
    await this.prisma.agency.update({
      where: { id: agencyId },
      data:  { systemPrompt: newPrompt, updatedAt: new Date() },
    })
  }

  // ── Resolución de children ────────────────────────────────────────────────

  /**
   * Resuelve los children directos del nivel dado.
   *
   * Agency     → sus Departments
   * Department → sus Workspaces
   * Workspace  → sus Agents (prefiriendo AgentProfile.systemPrompt si existe)
   */
  async resolveChildren(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<Array<{ id: string; name: string; systemPrompt: string | null }>> {
    if (level === 'agency') {
      return this.prisma.department.findMany({
        where:   { agencyId: scopeId },
        select:  { id: true, name: true, systemPrompt: true },
        orderBy: { name: 'asc' },
      })
    }

    if (level === 'department') {
      return this.prisma.workspace.findMany({
        where:   { departmentId: scopeId },
        select:  { id: true, name: true, systemPrompt: true },
        orderBy: { name: 'asc' },
      })
    }

    // Workspace → Agents
    const agents = await this.prisma.agent.findMany({
      where:   { workspaceId: scopeId },
      select:  {
        id:           true,
        name:         true,
        role:         true,
        goal:         true,
        agentProfile: { select: { systemPrompt: true } },
      },
      orderBy: { name: 'asc' },
    })

    return agents.map((a) => ({
      id:   a.id,
      name: a.name,
      systemPrompt:
        (a.agentProfile as { systemPrompt: string | null } | null)?.systemPrompt
        ?? (a.role || a.goal ? `${a.role ?? ''}. ${a.goal ?? ''}`.trim() : null),
    }))
  }

  // ── Generación del prompt de orchestrador ─────────────────────────────────

  /**
   * Genera el systemPrompt del orchestrador describiendo las capacidades de sus children.
   *
   * Resolución del modelo (en orden):
   *   1. ModelPolicy.primaryModel del scope   → via OrchestratorModelResolver
   *   2. ModelPolicy.fallbackModel del scope  → si el primary falla
   *   3. Template estático                    → si no hay modelo disponible o LLM falla
   */
  async buildOrchestratorPrompt(
    name:     string,
    level:    'agency' | 'department' | 'workspace',
    scopeId:  string,
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

    // Resolver el modelo configurado para este scope
    const resolved = await this.modelResolver.resolveForScope(level, scopeId)

    if (!resolved) {
      // No hay modelo configurado → template estático directamente
      console.warn(
        `[OrchestratorPromptPropagator] No ModelPolicy found for ${level} "${scopeId}". Using static template.`,
      )
      return this.buildStaticOrchestratorPrompt(name, level, children)
    }

    // Intentar con primaryModel, luego fallbackModel si el primary falla
    const modelsToTry = [
      resolved.primaryModel,
      ...(resolved.fallbackModel ? [resolved.fallbackModel] : []),
    ]

    for (const modelId of modelsToTry) {
      try {
        const content = await this.callLLM(modelId, systemInstruction, userPrompt)
        if (content) return content
      } catch (err) {
        console.warn(
          `[OrchestratorPromptPropagator] Model "${modelId}" failed for ${level} "${scopeId}":`,
          err instanceof Error ? err.message : String(err),
        )
        // Continuar al siguiente modelo en la cadena
      }
    }

    // Todos los modelos fallaron → template estático
    console.error(
      `[OrchestratorPromptPropagator] All models failed for ${level} "${scopeId}". Using static template.`,
    )
    return this.buildStaticOrchestratorPrompt(name, level, children)
  }

  // ── LLM call (provider-agnostic) ──────────────────────────────────────────

  /**
   * Llama al LLM usando el routing de provider de llm-step-executor.
   *
   * Soporta los mismos providers que LlmStepExecutor sin duplicar lógica:
   *   'openai/*'    → OpenAI API  (OPENAI_API_KEY)
   *   'anthropic/*' → Anthropic   (ANTHROPIC_API_KEY)
   *   resto         → OpenRouter-compat (OPENROUTER_API_KEY o OPENAI_COMPAT_*)
   *
   * El modelId viene de ModelPolicy.primaryModel/fallbackModel, que sigue
   * la misma convención 'provider/model-name'.
   */
  private async callLLM(
    modelId:           string,
    systemInstruction: string,
    userPrompt:        string,
  ): Promise<string> {
    const [providerPrefix] = modelId.split('/')
    const modelName = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId

    // ── OpenAI / compatible ──────────────────────────────────────────────
    if (providerPrefix === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY not set')
      return this.callOpenAICompat('https://api.openai.com/v1', apiKey, modelName, systemInstruction, userPrompt)
    }

    // ── Anthropic ────────────────────────────────────────────────────────
    if (providerPrefix === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
      return this.callAnthropic(apiKey, modelName, systemInstruction, userPrompt)
    }

    // ── OpenRouter / cualquier OpenAI-compat ─────────────────────────────
    const apiKey  = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_COMPAT_API_KEY
    const baseURL = process.env.OPENAI_COMPAT_BASE_URL ?? 'https://openrouter.ai/api/v1'
    if (!apiKey) throw new Error(`No API key for provider "${providerPrefix}". Set OPENROUTER_API_KEY or OPENAI_COMPAT_API_KEY.`)
    const extraHeaders: Record<string, string> = {}
    if (process.env.OPENROUTER_SITE_URL)  extraHeaders['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL
    if (process.env.OPENROUTER_SITE_NAME) extraHeaders['X-Title']      = process.env.OPENROUTER_SITE_NAME
    return this.callOpenAICompat(baseURL, apiKey, modelId, systemInstruction, userPrompt, extraHeaders)
  }

  private async callOpenAICompat(
    baseURL:     string,
    apiKey:      string,
    model:       string,
    system:      string,
    user:        string,
    extraHeaders: Record<string, string> = {},
  ): Promise<string> {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
        max_tokens:  600,
        temperature: 0.3,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenAI-compat ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string | null } }>
    }
    const content = data.choices[0]?.message?.content?.trim()
    if (!content) throw new Error('LLM returned empty content')
    return content
  }

  private async callAnthropic(
    apiKey: string,
    model:  string,
    system: string,
    user:   string,
  ): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens:  600,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json() as {
      content: Array<{ type: string; text?: string }>
    }
    const content = data.content.find(c => c.type === 'text')?.text?.trim()
    if (!content) throw new Error('Anthropic returned empty content')
    return content
  }

  // ── Template estático (fallback final) ────────────────────────────────────

  private buildStaticOrchestratorPrompt(
    name:     string,
    level:    string,
    children: Array<{ name: string; systemPrompt: string | null }>,
  ): string {
    const childCapabilities = children
      .map((c) => `- **${c.name}**: ${c.systemPrompt?.slice(0, 150) ?? 'Specialist in area tasks'}`)
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
