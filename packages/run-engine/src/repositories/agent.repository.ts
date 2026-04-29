/**
 * AgentRepository — Prisma implementation
 *
 * Agent es el nivel 4 de la jerarquía: Agency → Department → Workspace → Agent.
 * Nota C-20: solo UN Agent por Workspace puede tener isLevelOrchestrator = true
 * (garantizado por partial unique index en la migración init).
 *
 * findById incluye opcionalmente skills y subagentes para evitar N+1 en el
 * orquestador de jerarquía.
 *
 * Convenciones:
 *   - Clase stateless; PrismaClient inyectado en constructor.
 *   - softDelete: marca deletedAt.
 *   - Finders activos filtran `deletedAt: null`.
 */

import type { PrismaClient } from '@prisma/client'

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateAgentInput {
  workspaceId:          string
  name:                 string
  slug:                 string
  kind?:                string
  systemPrompt?:        string
  isLevelOrchestrator?: boolean
  modelId?:             string
  providerId?:          string
  maxTokens?:           number
  temperature?:         number
  metadata?:            Record<string, unknown>
}

export interface UpdateAgentInput {
  name?:                string
  slug?:                string
  kind?:                string
  systemPrompt?:        string
  isLevelOrchestrator?: boolean
  modelId?:             string
  providerId?:          string
  maxTokens?:           number
  temperature?:         number
  metadata?:            Record<string, unknown>
}

export interface FindAgentsOptions {
  limit?:       number
  offset?:      number
  kind?:        string
  /** Incluir relaciones (skills, subagentes) en el resultado. */
  withSkills?:    boolean
  withSubagents?: boolean
}

// ── Repository ────────────────────────────────────────────────────────────────

export class AgentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write ─────────────────────────────────────────────────────────────

  async create(input: CreateAgentInput) {
    return this.prisma.agent.create({
      data: {
        workspaceId:         input.workspaceId,
        name:                input.name,
        slug:                input.slug,
        kind:                input.kind,
        systemPrompt:        input.systemPrompt,
        isLevelOrchestrator: input.isLevelOrchestrator ?? false,
        modelId:             input.modelId,
        providerId:          input.providerId,
        maxTokens:           input.maxTokens,
        temperature:         input.temperature,
        metadata:            (input.metadata ?? {}) as never,
      },
    })
  }

  async update(id: string, data: UpdateAgentInput) {
    return this.prisma.agent.update({
      where: { id },
      data: {
        ...(data.name                !== undefined && { name:                data.name }),
        ...(data.slug                !== undefined && { slug:                data.slug }),
        ...(data.kind                !== undefined && { kind:                data.kind }),
        ...(data.systemPrompt        !== undefined && { systemPrompt:        data.systemPrompt }),
        ...(data.isLevelOrchestrator !== undefined && { isLevelOrchestrator: data.isLevelOrchestrator }),
        ...(data.modelId             !== undefined && { modelId:             data.modelId }),
        ...(data.providerId          !== undefined && { providerId:          data.providerId }),
        ...(data.maxTokens           !== undefined && { maxTokens:           data.maxTokens }),
        ...(data.temperature         !== undefined && { temperature:         data.temperature }),
        ...(data.metadata            !== undefined && { metadata:            data.metadata as never }),
      },
    })
  }

  async softDelete(id: string) {
    return this.prisma.agent.update({
      where: { id },
      data:  { deletedAt: new Date() },
    })
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /**
   * Busca un Agent activo por ID.
   * Opcionalmente incluye skills y subagentes para el orquestador.
   */
  async findById(
    id: string,
    opts: Pick<FindAgentsOptions, 'withSkills' | 'withSubagents'> = {},
  ) {
    return this.prisma.agent.findFirst({
      where:   { id, deletedAt: null },
      include: {
        ...(opts.withSkills    && { skills:    { include: { skill: true } } }),
        ...(opts.withSubagents && { subagents: true }),
      },
    })
  }

  async findBySlug(workspaceId: string, slug: string) {
    return this.prisma.agent.findFirst({
      where: { workspaceId, slug, deletedAt: null },
    })
  }

  async findByWorkspace(workspaceId: string, opts: FindAgentsOptions = {}) {
    return this.prisma.agent.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(opts.kind ? { kind: opts.kind } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
      include: {
        ...(opts.withSkills    && { skills:    { include: { skill: true } } }),
        ...(opts.withSubagents && { subagents: true }),
      },
    })
  }

  /**
   * Retorna el Agent orquestador de nivel 4 de un Workspace.
   * Solo puede existir uno (C-20: partial unique index).
   */
  async findOrchestrator(
    workspaceId: string,
    opts: Pick<FindAgentsOptions, 'withSkills' | 'withSubagents'> = {},
  ) {
    return this.prisma.agent.findFirst({
      where:   { workspaceId, isLevelOrchestrator: true, deletedAt: null },
      include: {
        ...(opts.withSkills    && { skills:    { include: { skill: true } } }),
        ...(opts.withSubagents && { subagents: true }),
      },
    })
  }

  async count(workspaceId: string) {
    return this.prisma.agent.count({ where: { workspaceId, deletedAt: null } })
  }
}
