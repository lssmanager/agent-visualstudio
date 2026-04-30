/**
 * ProfilePropagatorService
 *
 * Responsable de sincronizar el AgentProfile en Prisma con los datos
 * que el AgentBuilder produce (system prompt, persona, knowledge base, etc.).
 *
 * Flujo:
 *   1. propagate(agentId, data) — upsert del AgentProfile en Prisma, incrementa versión
 *   2. getProfile(agentId)      — lee el perfil activo desde Prisma
 *   3. buildSystemPrompt(profile) — compila el system prompt final para LLMStepExecutor
 *   4. resolveForAgent(agentId) — shortcut: getProfile + buildSystemPrompt
 *   5. propagateUp(agentId, input) — [F2b-01] propaga al orchestrator de cada nivel jerárquico
 *
 * Diseño:
 *   - Un solo registro por agente (1-to-1 con Agent).
 *   - Cada propagate() incrementa el campo `version` y actualiza `propagatedAt`.
 *   - buildSystemPrompt() prioriza: systemPrompt explícito > plantilla generada desde persona.
 *   - Si no hay perfil, devuelve un system prompt genérico basado en Agent.role + Agent.goal.
 *
 * Integración con LLMStepExecutor:
 *   const { systemPrompt } = await propagator.resolveForAgent(agentId)
 *   // inyectar como primer mensaje { role: 'system', content: systemPrompt }
 */

import type { PrismaClient } from '@prisma/client'

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface AgentPersona {
  name?:     string
  tone?:     string    // e.g. 'formal' | 'friendly' | 'technical'
  language?: string   // ISO 639-1 e.g. 'es' | 'en'
  traits?:   string[] // e.g. ['concise', 'empathetic', 'creative']
}

export interface KnowledgeBaseEntry {
  type:   'url' | 'text' | 'file'
  label:  string
  value:  string  // URL, texto plano, o path de archivo
}

export interface PropagateProfileInput {
  /** System prompt explícito — si se provee, se usa directamente sin generar plantilla */
  systemPrompt?:   string
  persona?:        AgentPersona
  knowledgeBase?:  KnowledgeBaseEntry[]
  responseFormat?: 'json' | 'markdown' | 'plain'
  contextWindow?:  number
  memoryEnabled?:  boolean
  memoryConfig?:   Record<string, unknown>
}

export interface ResolvedProfile {
  agentId:        string
  version:        number
  systemPrompt:   string
  persona:        AgentPersona
  knowledgeBase:  KnowledgeBaseEntry[]
  responseFormat: string | null
  contextWindow:  number
  memoryEnabled:  boolean
  propagatedAt:   Date
}

/**
 * [F2b-01] Resultado de propagateUp().
 * - updated: perfiles actualizados en orden workspace → department → agency
 * - skipped: IDs de niveles sin orchestratorId o que son el propio agentId (anti-loop)
 */
export interface PropagateUpResult {
  updated: ResolvedProfile[]
  skipped: string[]   // IDs de niveles sin orchestratorId o que son el propio agentId
}

// ── Service ────────────────────────────────────────────────────────────────

export class ProfilePropagatorService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Propagación ──────────────────────────────────────────────────────────

  /**
   * Upsert del AgentProfile para un agente.
   * Si ya existe, incrementa `version` y actualiza `propagatedAt`.
   * Si no existe, crea con version = 1.
   *
   * @returns El perfil actualizado con la versión nueva
   */
  async propagate(agentId: string, input: PropagateProfileInput): Promise<ResolvedProfile> {
    // Verificar que el agente existe
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) throw new Error(`Agent "${agentId}" not found`)

    // Leer versión actual para incrementar
    const existing = await this.prisma.agentProfile.findUnique({ where: { agentId } })
    const nextVersion = (existing?.version ?? 0) + 1

    const profile = await this.prisma.agentProfile.upsert({
      where:  { agentId },
      create: {
        agentId,
        systemPrompt:   input.systemPrompt ?? null,
        persona:        (input.persona ?? {}) as never,
        knowledgeBase:  (input.knowledgeBase ?? []) as never,
        responseFormat: input.responseFormat ?? null,
        contextWindow:  input.contextWindow ?? 8192,
        memoryEnabled:  input.memoryEnabled ?? false,
        memoryConfig:   (input.memoryConfig ?? {}) as never,
        version:        1,
        propagatedAt:   new Date(),
      },
      update: {
        systemPrompt:   input.systemPrompt ?? existing?.systemPrompt ?? null,
        persona:        (input.persona ?? existing?.persona ?? {}) as never,
        knowledgeBase:  (input.knowledgeBase ?? existing?.knowledgeBase ?? []) as never,
        responseFormat: input.responseFormat ?? existing?.responseFormat ?? null,
        contextWindow:  input.contextWindow ?? existing?.contextWindow ?? 8192,
        memoryEnabled:  input.memoryEnabled ?? existing?.memoryEnabled ?? false,
        memoryConfig:   (input.memoryConfig ?? existing?.memoryConfig ?? {}) as never,
        version:        nextVersion,
        propagatedAt:   new Date(),
        updatedAt:      new Date(),
      },
    })

    return this.toResolved(agentId, profile)
  }

  /**
   * [F2b-01] Propaga el perfil hacia arriba por la jerarquía:
   *   Agent → Workspace orchestrator → Department orchestrator → Agency orchestrator
   *
   * Regla irrevocable (D-24f): solo se llama a this.propagate() con el
   * orchestratorId de cada entidad padre — nunca con todos los agentes del scope.
   * Si un nivel no tiene orchestratorId, se añade al array `skipped`.
   * Si el orchestratorId es igual al agentId fuente, se añade a `skipped` (anti-loop).
   *
   * @param agentId  ID del agente cuyo perfil se propaga hacia arriba
   * @param input    Datos del perfil a propagar (misma shape que propagate())
   */
  async propagateUp(
    agentId: string,
    input: PropagateProfileInput,
  ): Promise<PropagateUpResult> {
    const updated: ResolvedProfile[] = []
    const skipped: string[] = []

    // 1. Leer el agente y su workspaceId
    const agent = await this.prisma.agent.findUnique({
      where:   { id: agentId },
      select:  { workspaceId: true },
    })
    if (!agent) throw new Error(`Agent "${agentId}" not found`)

    // 2. Leer el workspace (con departmentId para navegar hacia arriba)
    const workspace = await this.prisma.workspace.findUnique({
      where:   { id: agent.workspaceId },
      select:  { id: true, orchestratorId: true, departmentId: true },
    })
    if (!workspace) throw new Error(`Workspace not found for agent "${agentId}"`)

    // 3. Nivel Workspace — propagar al orchestrator si existe y no es el fuente
    if (!workspace.orchestratorId || workspace.orchestratorId === agentId) {
      skipped.push(`workspace:${workspace.id}`)
    } else {
      const profile = await this.propagate(workspace.orchestratorId, input)
      updated.push(profile)
    }

    // 4. Nivel Department (si el workspace pertenece a uno)
    if (workspace.departmentId) {
      const department = await this.prisma.department.findUnique({
        where:  { id: workspace.departmentId },
        select: { id: true, orchestratorId: true, agencyId: true },
      })
      if (!department?.orchestratorId || department.orchestratorId === agentId) {
        skipped.push(`department:${workspace.departmentId}`)
      } else {
        const profile = await this.propagate(department.orchestratorId, input)
        updated.push(profile)
      }

      // 5. Nivel Agency (si el department pertenece a una)
      if (department?.agencyId) {
        const agency = await this.prisma.agency.findUnique({
          where:  { id: department.agencyId },
          select: { id: true, orchestratorId: true },
        })
        if (!agency?.orchestratorId || agency.orchestratorId === agentId) {
          skipped.push(`agency:${department.agencyId}`)
        } else {
          const profile = await this.propagate(agency.orchestratorId, input)
          updated.push(profile)
        }
      }
    }

    return { updated, skipped }
  }

  // ── Lectura ────────────────────────────────────────────────────────────────────

  /**
   * Lee el AgentProfile activo desde Prisma.
   * Devuelve null si el agente no tiene perfil propagado.
   */
  async getProfile(agentId: string): Promise<ResolvedProfile | null> {
    const profile = await this.prisma.agentProfile.findUnique({ where: { agentId } })
    if (!profile) return null
    return this.toResolved(agentId, profile)
  }

  /**
   * Shortcut: lee el perfil y compila el system prompt.
   * Si no hay perfil, usa Agent.role + Agent.goal como fallback.
   *
   * @returns { systemPrompt, profile | null }
   */
  async resolveForAgent(agentId: string): Promise<{
    systemPrompt: string
    profile:      ResolvedProfile | null
  }> {
    const [profile, agent] = await Promise.all([
      this.getProfile(agentId),
      this.prisma.agent.findUnique({
        where:  { id: agentId },
        select: { name: true, role: true, goal: true, backstory: true },
      }),
    ])

    if (!agent) throw new Error(`Agent "${agentId}" not found`)

    const systemPrompt = profile
      ? this.buildSystemPrompt(profile, agent)
      : buildFallbackPrompt(agent)

    return { systemPrompt, profile }
  }

  /**
   * Lista los perfiles de todos los agentes de un workspace.
   */
  async listByWorkspace(workspaceId: string): Promise<ResolvedProfile[]> {
    const profiles = await this.prisma.agentProfile.findMany({
      where:   { agent: { workspaceId } },
      include: { agent: { select: { id: true } } },
      orderBy: { propagatedAt: 'desc' },
    })
    return profiles.map((p) => this.toResolved(p.agentId, p))
  }

  /**
   * Elimina el perfil de un agente (reset).
   */
  async deleteProfile(agentId: string): Promise<boolean> {
    const existing = await this.prisma.agentProfile.findUnique({ where: { agentId } })
    if (!existing) return false
    await this.prisma.agentProfile.delete({ where: { agentId } })
    return true
  }

  // ── Compilación del system prompt ──────────────────────────────────────────

  /**
   * Compila el system prompt final desde el perfil.
   *
   * Prioridad:
   *   1. profile.systemPrompt explícito (escrito por el builder)
   *   2. Plantilla generada desde persona + rol + goal + knowledge base
   *
   * El agent es el contexto base (name, role, goal, backstory).
   */
  buildSystemPrompt(
    profile: ResolvedProfile,
    agent:   { name: string; role?: string | null; goal?: string | null; backstory?: string | null },
  ): string {
    // Si hay system prompt explícito, usarlo directamente
    if (profile.systemPrompt && profile.systemPrompt.trim().length > 0) {
      return profile.systemPrompt.trim()
    }

    // Generar desde persona + rol
    const persona = profile.persona
    const lines: string[] = []

    // Identidad
    const name = persona.name ?? agent.name
    lines.push(`You are ${name}.`)

    if (agent.role) lines.push(`Your role: ${agent.role}.`)
    if (agent.goal) lines.push(`Your goal: ${agent.goal}.`)
    if (agent.backstory) lines.push(`Background: ${agent.backstory}`)

    // Persona
    if (persona.tone)    lines.push(`Tone: ${persona.tone}.`)
    if (persona.language) lines.push(`Always respond in language: ${persona.language}.`)
    if (persona.traits && persona.traits.length > 0) {
      lines.push(`Traits: ${persona.traits.join(', ')}.`)
    }

    // Formato de respuesta
    if (profile.responseFormat === 'json') {
      lines.push('Always respond with valid JSON only. No prose.')
    } else if (profile.responseFormat === 'markdown') {
      lines.push('Format responses in Markdown.')
    }

    // Knowledge base (referencias)
    if (profile.knowledgeBase.length > 0) {
      lines.push('\nKnowledge base references:')
      for (const kb of profile.knowledgeBase) {
        if (kb.type === 'url')  lines.push(`- ${kb.label}: ${kb.value}`)
        if (kb.type === 'text') lines.push(`- ${kb.label}: ${kb.value.slice(0, 200)}`)
      }
    }

    return lines.join('\n')
  }

  // ── Privado ──────────────────────────────────────────────────────────────────

  private toResolved(
    agentId: string,
    profile: {
      systemPrompt?:   string | null
      persona:         unknown
      knowledgeBase:   unknown
      responseFormat?: string | null
      contextWindow:   number
      memoryEnabled:   boolean
      version:         number
      propagatedAt:    Date
    },
  ): ResolvedProfile {
    return {
      agentId,
      version:        profile.version,
      systemPrompt:   profile.systemPrompt ?? '',
      persona:        (profile.persona as AgentPersona) ?? {},
      knowledgeBase:  (profile.knowledgeBase as KnowledgeBaseEntry[]) ?? [],
      responseFormat: profile.responseFormat ?? null,
      contextWindow:  profile.contextWindow,
      memoryEnabled:  profile.memoryEnabled,
      propagatedAt:   profile.propagatedAt,
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildFallbackPrompt(agent: {
  name: string
  role?:      string | null
  goal?:      string | null
  backstory?: string | null
}): string {
  const lines = [`You are ${agent.name}, an AI assistant.`]
  if (agent.role) lines.push(`Role: ${agent.role}.`)
  if (agent.goal) lines.push(`Goal: ${agent.goal}.`)
  lines.push('Be helpful, concise, and accurate.')
  return lines.join('\n')
}
