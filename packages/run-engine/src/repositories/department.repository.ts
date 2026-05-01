/**
 * DepartmentRepository — Prisma implementation
 *
 * Department es el nivel 2 de la jerarquía: Agency → Department.
 * Nota C-20: solo UN Department por Agency puede tener isLevelOrchestrator = true
 * (garantizado por partial unique index en la migración init).
 *
 * Convenciones:
 *   - Clase stateless; PrismaClient inyectado en constructor.
 *   - softDelete: marca deletedAt.
 *   - Finders activos filtran `deletedAt: null`.
 */

import type { PrismaClient } from '@prisma/client'

// ── DTOs ───────────────────────────────────────────────────────────────────

export interface CreateDepartmentInput {
  agencyId:             string
  name:                 string
  slug:                 string
  isLevelOrchestrator?: boolean
  metadata?:            Record<string, unknown>
}

export interface UpdateDepartmentInput {
  name?:                string
  slug?:                string
  isLevelOrchestrator?: boolean
  metadata?:            Record<string, unknown>
}

export interface FindDepartmentsOptions {
  limit?:  number
  offset?: number
}

// ── Repository ──────────────────────────────────────────────────────────────────

export class DepartmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write ───────────────────────────────────────────────────────────────

  async create(input: CreateDepartmentInput) {
    return this.prisma.department.create({
      data: {
        agencyId:            input.agencyId,
        name:                input.name,
        slug:                input.slug,
        isLevelOrchestrator: input.isLevelOrchestrator ?? false,
        metadata:            (input.metadata ?? {}) as never,
      },
    })
  }

  async update(id: string, data: UpdateDepartmentInput) {
    return this.prisma.department.update({
      where: { id },
      data:  {
        ...(data.name                !== undefined && { name:                data.name }),
        ...(data.slug                !== undefined && { slug:                data.slug }),
        ...(data.isLevelOrchestrator !== undefined && { isLevelOrchestrator: data.isLevelOrchestrator }),
        ...(data.metadata            !== undefined && { metadata:            data.metadata as never }),
      },
    })
  }

  async softDelete(id: string) {
    return this.prisma.department.update({
      where: { id },
      data:  { deletedAt: new Date() },
    })
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  async findById(id: string) {
    return this.prisma.department.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async findBySlug(agencyId: string, slug: string) {
    return this.prisma.department.findFirst({
      where: { agencyId, slug, deletedAt: null },
    })
  }

  async findByAgency(agencyId: string, opts: FindDepartmentsOptions = {}) {
    return this.prisma.department.findMany({
      where:   { agencyId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
    })
  }

  /**
   * Retorna el Department orquestador de nivel 2 de una Agency.
   * Solo puede existir uno (C-20: partial unique index).
   */
  async findOrchestrator(agencyId: string) {
    return this.prisma.department.findFirst({
      where: { agencyId, isLevelOrchestrator: true, deletedAt: null },
    })
  }

  /**
   * [F2b-02] Retorna el Agent con isLevelOrchestrator = true
   * dentro del Department dado, navegando la cadena:
   *   Department → Workspace orquestador → Agent orquestador
   *
   * Devuelve null en cualquier nivel si la cadena está incompleta.
   * Nunca itera colecciones — navega solo por el nodo orquestador de cada nivel.
   */
  async findOrchestratorAgent(departmentId: string) {
    const department = await this.prisma.department.findFirst({
      where:  { id: departmentId, deletedAt: null },
      select: { id: true },
    })
    if (!department) return null

    // 1. Workspace orquestador del department
    const workspace = await this.prisma.workspace.findFirst({
      where:  { departmentId, isLevelOrchestrator: true, deletedAt: null },
      select: { id: true },
    })
    if (!workspace) return null

    // 2. Agent orquestador dentro de ese workspace
    return this.prisma.agent.findFirst({
      where: { workspaceId: workspace.id, isLevelOrchestrator: true, deletedAt: null },
    })
  }

  async count(agencyId: string) {
    return this.prisma.department.count({ where: { agencyId, deletedAt: null } })
  }
}
