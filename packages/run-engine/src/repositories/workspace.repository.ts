/**
 * WorkspaceRepository — Prisma implementation
 *
 * Workspace es el nivel 3 de la jerarquía: Agency → Department → Workspace.
 * Nota C-20: solo UN Workspace por Department puede tener isLevelOrchestrator = true
 * (garantizado por partial unique index en la migración init).
 *
 * Convenciones:
 *   - Clase stateless; PrismaClient inyectado en constructor.
 *   - softDelete: marca deletedAt.
 *   - Finders activos filtran `deletedAt: null`.
 */

import type { PrismaClient } from '@prisma/client'

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface CreateWorkspaceInput {
  departmentId:         string
  name:                 string
  slug:                 string
  isLevelOrchestrator?: boolean
  timezone?:            string
  metadata?:            Record<string, unknown>
}

export interface UpdateWorkspaceInput {
  name?:                string
  slug?:                string
  isLevelOrchestrator?: boolean
  timezone?:            string
  metadata?:            Record<string, unknown>
}

export interface FindWorkspacesOptions {
  limit?:  number
  offset?: number
}

// ── Repository ──────────────────────────────────────────────────────────────────

export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write ───────────────────────────────────────────────────────────────

  async create(input: CreateWorkspaceInput) {
    return this.prisma.workspace.create({
      data: {
        departmentId:        input.departmentId,
        name:                input.name,
        slug:                input.slug,
        isLevelOrchestrator: input.isLevelOrchestrator ?? false,
        timezone:            input.timezone,
        metadata:            (input.metadata ?? {}) as never,
      },
    })
  }

  async update(id: string, data: UpdateWorkspaceInput) {
    return this.prisma.workspace.update({
      where: { id },
      data:  {
        ...(data.name                !== undefined && { name:                data.name }),
        ...(data.slug                !== undefined && { slug:                data.slug }),
        ...(data.isLevelOrchestrator !== undefined && { isLevelOrchestrator: data.isLevelOrchestrator }),
        ...(data.timezone            !== undefined && { timezone:            data.timezone }),
        ...(data.metadata            !== undefined && { metadata:            data.metadata as never }),
      },
    })
  }

  async softDelete(id: string) {
    return this.prisma.workspace.update({
      where: { id },
      data:  { deletedAt: new Date() },
    })
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async findById(id: string) {
    return this.prisma.workspace.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async findBySlug(departmentId: string, slug: string) {
    return this.prisma.workspace.findFirst({
      where: { departmentId, slug, deletedAt: null },
    })
  }

  async findByDepartment(departmentId: string, opts: FindWorkspacesOptions = {}) {
    return this.prisma.workspace.findMany({
      where:   { departmentId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
    })
  }

  /**
   * Retorna el Workspace orquestador de nivel 3 de un Department.
   * Solo puede existir uno (C-20: partial unique index).
   */
  async findOrchestrator(departmentId: string) {
    return this.prisma.workspace.findFirst({
      where: { departmentId, isLevelOrchestrator: true, deletedAt: null },
    })
  }

  /**
   * [F2b-02] Retorna el Agent con isLevelOrchestrator = true
   * dentro del Workspace dado.
   *
   * Es la hoja final de la cadena de navegación jerárquica:
   *   Agency → Department → Workspace → Agent (este método)
   *
   * Devuelve null si el workspace no tiene ningún agente orquestador activo.
   * Nunca usa findMany — el partial unique index C-20 garantiza unicidad.
   */
  async findOrchestratorAgent(workspaceId: string) {
    return this.prisma.agent.findFirst({
      where: { workspaceId, isLevelOrchestrator: true, deletedAt: null },
    })
  }

  async count(departmentId: string) {
    return this.prisma.workspace.count({ where: { departmentId, deletedAt: null } })
  }
}
