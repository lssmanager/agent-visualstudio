/**
 * ProfilePropagatorService
 *
 * Responsable de sincronizar el AgentProfile en Prisma con los datos
 * que el AgentBuilder produce (system prompt, persona, knowledge base, etc.).
 *
 * FIX (structural): Agent model does NOT have departmentId or agencyId fields.
 * Those fields live on Workspace (departmentId) and Department (agencyId).
 * Queries for orchestrators at department/agency level must join through workspace.
 */

import type { PrismaClient } from '@prisma/client'

// ── DTOs ──────────────────────────────────────────────────────────────────────────────────

export interface AgentPersona {
  name?:     string
  tone?:     string
  language?: string
  traits?:   string[]
}

export interface KnowledgeBaseEntry {
  type:   'url' | 'text' | 'file'
  label:  string
  value:  string
}

export interface PropagateProfileInput {
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

export interface PropagateUpResult {
  updated: ResolvedProfile[]
  skipped: string[]
}

// ── Service ───────────────────────────────────────────────────────────────────────────

export class ProfilePropagatorService {
  constructor(private readonly prisma: PrismaClient) {}

  async propagate(agentId: string, input: PropagateProfileInput): Promise<ResolvedProfile> {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) throw new Error(`Agent "${agentId}" not found`)

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
   * [F2b-01] Propaga hacia arriba por la jerarquía.
   *
   * FIX: Agent does NOT have departmentId or agencyId fields.
   * The path is: Agent.workspaceId → Workspace.departmentId → Department.agencyId.
   * Orchestrators at each level are identified via isLevelOrchestrator=true
   * filtered by workspace/department/agency through the correct join path.
   */
  async propagateUp(
    agentId: string,
    input: PropagateProfileInput,
  ): Promise<PropagateUpResult> {
    const updated: ResolvedProfile[] = []
    const skipped: string[] = []

    // 1. Read agent's workspaceId
    const agent = await this.prisma.agent.findUnique({
      where:  { id: agentId },
      select: { workspaceId: true },
    })
    if (!agent) throw new Error(`Agent "${agentId}" not found`)

    // 2. Read workspace to get departmentId
    const workspace = await this.prisma.workspace.findUnique({
      where:  { id: agent.workspaceId },
      select: { id: true, departmentId: true },
    })
    if (!workspace) throw new Error(`Workspace not found for agent "${agentId}"`)

    // 3. Workspace-level orchestrator: agent with isLevelOrchestrator=true in same workspace
    const wsOrchestrator = await this.prisma.agent.findFirst({
      where:  { workspaceId: agent.workspaceId, isLevelOrchestrator: true },
      select: { id: true },
    })

    if (!wsOrchestrator || wsOrchestrator.id === agentId) {
      skipped.push(`workspace:${workspace.id}`)
    } else {
      updated.push(await this.propagate(wsOrchestrator.id, input))
    }

    // 4. Department-level orchestrator
    if (workspace.departmentId) {
      const department = await this.prisma.department.findUnique({
        where:  { id: workspace.departmentId },
        select: { id: true, agencyId: true },
      })

      // FIX: Agent has no departmentId field — find orchestrator via workspace join
      const depOrchestrator = await this.prisma.agent.findFirst({
        where: {
          workspace: { departmentId: workspace.departmentId },
          isLevelOrchestrator: true,
        },
        select: { id: true },
      })

      if (!depOrchestrator || depOrchestrator.id === agentId) {
        skipped.push(`department:${workspace.departmentId}`)
      } else {
        updated.push(await this.propagate(depOrchestrator.id, input))
      }

      // 5. Agency-level orchestrator
      if (department?.agencyId) {
        // FIX: Agent has no agencyId field — join through workspace → department → agency
        const agcOrchestrator = await this.prisma.agent.findFirst({
          where: {
            workspace: {
              department: { agencyId: department.agencyId },
            },
            isLevelOrchestrator: true,
          },
          select: { id: true },
        })

        if (!agcOrchestrator || agcOrchestrator.id === agentId) {
          skipped.push(`agency:${department.agencyId}`)
        } else {
          updated.push(await this.propagate(agcOrchestrator.id, input))
        }
      }
    }

    return { updated, skipped }
  }

  async getProfile(agentId: string): Promise<ResolvedProfile | null> {
    const profile = await this.prisma.agentProfile.findUnique({ where: { agentId } })
    if (!profile) return null
    return this.toResolved(agentId, profile)
  }

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

  async listByWorkspace(workspaceId: string): Promise<ResolvedProfile[]> {
    const profiles = await this.prisma.agentProfile.findMany({
      where:   { agent: { workspaceId } },
      include: { agent: { select: { id: true } } },
      orderBy: { propagatedAt: 'desc' },
    })
    return profiles.map((p) => this.toResolved(p.agentId, p))
  }

  async deleteProfile(agentId: string): Promise<boolean> {
    const existing = await this.prisma.agentProfile.findUnique({ where: { agentId } })
    if (!existing) return false
    await this.prisma.agentProfile.delete({ where: { agentId } })
    return true
  }

  buildSystemPrompt(
    profile: ResolvedProfile,
    agent:   { name: string; role?: string | null; goal?: string | null; backstory?: string | null },
  ): string {
    if (profile.systemPrompt && profile.systemPrompt.trim().length > 0) {
      return profile.systemPrompt.trim()
    }

    const persona = profile.persona
    const lines: string[] = []

    lines.push(`You are ${persona.name ?? agent.name}.`)
    if (agent.role)     lines.push(`Your role: ${agent.role}.`)
    if (agent.goal)     lines.push(`Your goal: ${agent.goal}.`)
    if (agent.backstory) lines.push(`Background: ${agent.backstory}`)
    if (persona.tone)    lines.push(`Tone: ${persona.tone}.`)
    if (persona.language) lines.push(`Always respond in language: ${persona.language}.`)
    if (persona.traits?.length) lines.push(`Traits: ${persona.traits.join(', ')}.`)

    if (profile.responseFormat === 'json') {
      lines.push('Always respond with valid JSON only. No prose.')
    } else if (profile.responseFormat === 'markdown') {
      lines.push('Format responses in Markdown.')
    }

    if (profile.knowledgeBase.length > 0) {
      lines.push('\nKnowledge base references:')
      for (const kb of profile.knowledgeBase) {
        if (kb.type === 'url')  lines.push(`- ${kb.label}: ${kb.value}`)
        if (kb.type === 'text') lines.push(`- ${kb.label}: ${kb.value.slice(0, 200)}`)
      }
    }

    return lines.join('\n')
  }

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

function buildFallbackPrompt(agent: {
  name:       string
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
