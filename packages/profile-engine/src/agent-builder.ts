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
 *
 *   Para cada nivel (workspace / department / agency) construye una cadena completa
 *   de candidatos, consultando ModelPolicy en Prisma:
 *
 *     1. ModelPolicy.primaryModel del scope actual
 *     2. ModelPolicy.fallbackModel del scope actual (si configurado)
 *     3. ModelPolicy.primaryModel del department padre  (si aplica)
 *     4. ModelPolicy.fallbackModel del department padre (si aplica)
 *     5. ModelPolicy de la agency
 *     6. Agent.model de cualquier agente activo en el scope
 *     7. Modelos similares en capacidades via ModelCapabilityRegistry
 *        (ordenados por intersección de families — mismo proveedor tiene bonus)
 *     8. Fallback a template estático — NUNCA falla
 *
 *   Importante: modelos de proveedores distintos son válidos en niveles distintos.
 *   Un workspace puede usar 'qwen/qwen-max' mientras su agency usa
 *   'anthropic/claude-3-7-sonnet'. El resolver no impone restricciones de proveedor.
 */

import type { PrismaClient } from '@prisma/client'
import { ModelCapabilityRegistry, resolveModelFallbackChain } from './model-capability-registry.js'
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
   * @param prisma            - PrismaClient
   * @param capabilityRegistry - Opcional: registry custom para tests o modelos fine-tuned
   */
  constructor(
    private readonly prisma: PrismaClient,
    capabilityRegistry?: ModelCapabilityRegistry,
  ) {
    this.propagator             = new ProfilePropagatorService(prisma)
    this.orchestratorPropagator = new OrchestratorPromptPropagator(prisma, capabilityRegistry)
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

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

  async triggerPropagation(agentId: string): Promise<void> {
    await this.orchestratorPropagator.propagate(agentId, 'updated')
  }
}

// ── ModelResolution — resultado del resolver ─────────────────────────────────

/**
 * Cadena completa de modelos a intentar para un scope dado.
 * El primer elemento es el preferido; los siguientes son fallbacks en orden.
 * Todos son de cualquier proveedor configurado en ese scope.
 */
export interface ModelResolution {
  /** Modelo primario configurado (primer intento) */
  primaryModel: string
  /**
   * Cadena de fallback ordenada por preferencia:
   *   [fallbackModel configurado, ...similares por capacidad]
   * Puede incluir modelos de proveedores distintos al primaryModel.
   */
  fallbackChain: string[]
}

// ── OrchestratorModelResolver ─────────────────────────────────────────────────

/**
 * Resuelve la cadena completa de modelos LLM a intentar para regenerar
 * el orchestrator prompt de un scope dado.
 *
 * Consulta ModelPolicy en Prisma sin requerir agentId (opera por scope).
 * Usa ModelCapabilityRegistry para ordenar fallbacks por similitud de capacidades.
 *
 * Un workspace puede usar 'qwen/qwen-max', su department 'anthropic/claude-3-5-haiku'
 * y su agency 'openai/gpt-4o' — cada nivel resuelve independientemente.
 */
export class OrchestratorModelResolver {
  private readonly capRegistry: ModelCapabilityRegistry

  constructor(
    private readonly prisma: PrismaClient,
    capabilityRegistry?: ModelCapabilityRegistry,
  ) {
    this.capRegistry = capabilityRegistry ?? new ModelCapabilityRegistry()
  }

  /**
   * Resuelve la cadena de modelos para un scope.
   * Devuelve null si no hay absolutamente ningún modelo configurado.
   */
  async resolveForScope(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<ModelResolution | null> {
    // 1. Recopilar TODOS los modelos configurados en el scope y su jerarquía
    const allConfigured = await this.collectAllModelsForScope(level, scopeId)
    if (allConfigured.length === 0) return null

    // 2. El primario es el ModelPolicy.primaryModel más directo al scope
    const primary = await this.findClosestPrimary(level, scopeId)
    if (!primary) {
      // Sin ModelPolicy pero hay modelos de agentes → usar el primero como primary
      return {
        primaryModel:  allConfigured[0]!,
        fallbackChain: allConfigured.slice(1),
      }
    }

    // 3. Construir fallback chain:
    //    a) fallbackModel explícito del mismo registro
    //    b) Modelos similares del scope ordenados por capacidad
    const explicitFallback = await this.findExplicitFallback(level, scopeId, primary)
    const remainingModels  = allConfigured.filter(
      m => m !== primary && m !== explicitFallback,
    )
    const similarByCapability = this.capRegistry.resolveFallbackChain(primary, remainingModels)

    const fallbackChain = [
      ...(explicitFallback ? [explicitFallback] : []),
      ...similarByCapability,
    ]

    return { primaryModel: primary, fallbackChain }
  }

  /**
   * Recopila todos los modelos únicos configurados en el scope y su jerarquía:
   *   - ModelPolicy.primaryModel y fallbackModel de cada nivel
   *   - Agent.model de agentes activos en el scope
   */
  private async collectAllModelsForScope(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<string[]> {
    const models = new Set<string>()

    const addPolicy = (p: { primaryModel: string; fallbackModel: string | null } | null) => {
      if (!p) return
      models.add(p.primaryModel)
      if (p.fallbackModel) models.add(p.fallbackModel)
    }

    // Políticas del scope actual
    const direct = await this.queryModelPolicy(level, scopeId)
    addPolicy(direct)

    // Políticas de niveles superiores
    if (level === 'workspace') {
      const ws = await this.prisma.workspace.findUnique({
        where:  { id: scopeId },
        select: { departmentId: true, department: { select: { agencyId: true } } },
      })
      if (ws) {
        addPolicy(await this.queryModelPolicy('department', ws.departmentId))
        if (ws.department.agencyId) {
          addPolicy(await this.queryModelPolicy('agency', ws.department.agencyId))
        }
      }
    } else if (level === 'department') {
      const dept = await this.prisma.department.findUnique({
        where:  { id: scopeId },
        select: { agencyId: true },
      })
      if (dept?.agencyId) {
        addPolicy(await this.queryModelPolicy('agency', dept.agencyId))
      }
    }

    // Modelos de agentes activos en el scope (último recurso)
    const agentModels = await this.collectAgentModels(level, scopeId)
    agentModels.forEach(m => models.add(m))

    return [...models]
  }

  /**
   * Encuentra el primaryModel más directo al scope:
   * scope → department → agency (en orden de cercanía)
   */
  private async findClosestPrimary(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<string | null> {
    const direct = await this.queryModelPolicy(level, scopeId)
    if (direct) return direct.primaryModel

    if (level === 'workspace') {
      const ws = await this.prisma.workspace.findUnique({
        where:  { id: scopeId },
        select: { departmentId: true, department: { select: { agencyId: true } } },
      })
      if (ws) {
        const deptPolicy = await this.queryModelPolicy('department', ws.departmentId)
        if (deptPolicy) return deptPolicy.primaryModel
        if (ws.department.agencyId) {
          const agencyPolicy = await this.queryModelPolicy('agency', ws.department.agencyId)
          if (agencyPolicy) return agencyPolicy.primaryModel
        }
      }
    }

    if (level === 'department') {
      const dept = await this.prisma.department.findUnique({
        where:  { id: scopeId },
        select: { agencyId: true },
      })
      if (dept?.agencyId) {
        const agencyPolicy = await this.queryModelPolicy('agency', dept.agencyId)
        if (agencyPolicy) return agencyPolicy.primaryModel
      }
    }

    return null
  }

  /**
   * Devuelve el fallbackModel explícito del registro más directo al scope
   * (ignorando el primaryModel que ya fue seleccionado).
   */
  private async findExplicitFallback(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
    primaryModel: string,
  ): Promise<string | null> {
    const direct = await this.queryModelPolicy(level, scopeId)
    if (direct?.fallbackModel && direct.fallbackModel !== primaryModel) {
      return direct.fallbackModel
    }
    return null
  }

  private async queryModelPolicy(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<{ primaryModel: string; fallbackModel: string | null } | null> {
    const where =
      level === 'agency'     ? { agencyId:     scopeId } :
      level === 'department' ? { departmentId: scopeId } :
                               { workspaceId:  scopeId }

    return this.prisma.modelPolicy.findFirst({
      where,
      select:  { primaryModel: true, fallbackModel: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  private async collectAgentModels(
    level:   'agency' | 'department' | 'workspace',
    scopeId: string,
  ): Promise<string[]> {
    const where =
      level === 'workspace'  ? { workspaceId: scopeId, model: { not: null } } :
      level === 'department' ? { workspace: { departmentId: scopeId }, model: { not: null } } :
                               { workspace: { department: { agencyId: scopeId } }, model: { not: null } }

    const agents = await this.prisma.agent.findMany({
      where:  where as Parameters<typeof this.prisma.agent.findMany>[0]['where'],
      select: { model: true },
      distinct: ['model'],
    })

    return agents
      .map(a => a.model as string | null)
      .filter((m): m is string => !!m)
  }
}

// ── OrchestratorPromptPropagator ──────────────────────────────────────────────

/**
 * Sube por la jerarquía Agent → Workspace → Department → Agency
 * y regenera el systemPrompt de cada orchestrador con LLM.
 *
 * El modelo a usar se resuelve en Prisma (ModelPolicy) para cada scope
 * y puede ser de cualquier proveedor configurado.
 * Los fallbacks se ordenan por similitud de capacidades via ModelCapabilityRegistry.
 */
export class OrchestratorPromptPropagator {
  private readonly modelResolver: OrchestratorModelResolver

  constructor(
    private readonly prisma: PrismaClient,
    capabilityRegistry?: ModelCapabilityRegistry,
  ) {
    this.modelResolver = new OrchestratorModelResolver(prisma, capabilityRegistry)
  }

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
      this.updateWorkspacePrompt(workspace.id,   workspace.name),
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

  // ── Actualizadores por nivel ───────────────────────────────────────────────

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

  // ── Resolución de children ─────────────────────────────────────────────────

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
   * Genera el systemPrompt del orchestrador usando LLM con el modelo resuelto
   * para este scope. Si todos los modelos fallan → template estático.
   *
   * Cadena de intento:
   *   [primaryModel, ...fallbackChain] — todos los modelos configurados en el scope,
   *   ordenados: primary → fallback explícito → similares por capacidad (cualquier proveedor)
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

    const resolution = await this.modelResolver.resolveForScope(level, scopeId)

    if (!resolution) {
      console.warn(
        `[OrchestratorPromptPropagator] No models configured for ${level} "${scopeId}". Using static template.`,
      )
      return this.buildStaticOrchestratorPrompt(name, level, children)
    }

    // Iterar la cadena completa: primary + todos los fallbacks por similitud
    const modelsToTry = [resolution.primaryModel, ...resolution.fallbackChain]

    for (const modelId of modelsToTry) {
      try {
        const content = await this.callLLM(modelId, systemInstruction, userPrompt)
        if (content) {
          if (modelId !== resolution.primaryModel) {
            console.info(
              `[OrchestratorPromptPropagator] Used fallback model "${modelId}" for ${level} "${scopeId}".`,
            )
          }
          return content
        }
      } catch (err) {
        console.warn(
          `[OrchestratorPromptPropagator] Model "${modelId}" failed for ${level} "${scopeId}":`,
          err instanceof Error ? err.message : String(err),
        )
      }
    }

    console.error(
      `[OrchestratorPromptPropagator] All ${modelsToTry.length} models failed for ${level} "${scopeId}". Using static template.`,
    )
    return this.buildStaticOrchestratorPrompt(name, level, children)
  }

  // ── LLM call (provider-agnostic via fetch) ────────────────────────────────

  /**
   * Routing de proveedor idéntico al de LlmStepExecutor:
   *   'openai/*'    → OpenAI API          (OPENAI_API_KEY)
   *   'anthropic/*' → Anthropic Messages  (ANTHROPIC_API_KEY)
   *   resto         → OpenRouter-compat   (OPENROUTER_API_KEY o OPENAI_COMPAT_*)
   *
   * El modelId sigue la convención 'provider/model-name' de ModelPolicy.
   */
  private async callLLM(
    modelId:           string,
    systemInstruction: string,
    userPrompt:        string,
  ): Promise<string> {
    const providerPrefix = modelId.split('/')[0]
    const modelName      = modelId.includes('/') ? modelId.split('/').slice(1).join('/') : modelId

    if (providerPrefix === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY not set')
      return this.callOpenAICompat('https://api.openai.com/v1', apiKey, modelName, systemInstruction, userPrompt)
    }

    if (providerPrefix === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')
      return this.callAnthropic(apiKey, modelName, systemInstruction, userPrompt)
    }

    // OpenRouter / cualquier OpenAI-compat (qwen, deepseek, google, mistral, meta-llama, etc.)
    const apiKey  = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_COMPAT_API_KEY
    const baseURL = process.env.OPENAI_COMPAT_BASE_URL ?? 'https://openrouter.ai/api/v1'
    if (!apiKey) throw new Error(`No API key for provider "${providerPrefix}". Set OPENROUTER_API_KEY or OPENAI_COMPAT_API_KEY.`)
    const extraHeaders: Record<string, string> = {}
    if (process.env.OPENROUTER_SITE_URL)  extraHeaders['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL
    if (process.env.OPENROUTER_SITE_NAME) extraHeaders['X-Title']      = process.env.OPENROUTER_SITE_NAME
    return this.callOpenAICompat(baseURL, apiKey, modelId, systemInstruction, userPrompt, extraHeaders)
  }

  private async callOpenAICompat(
    baseURL:      string,
    apiKey:       string,
    model:        string,
    system:       string,
    user:         string,
    extraHeaders: Record<string, string> = {},
  ): Promise<string> {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${apiKey}`,
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

  // ── Template estático (fallback final garantizado) ─────────────────────────

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
