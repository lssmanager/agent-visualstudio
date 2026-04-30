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

// ── DTOs ──────────────────────────────────────────────────────────────────────

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

// ── Repository ────────────────────────────────────────────────────────────────

export class DepartmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write ─────────────────────────────────────────────────────────────

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

  // ── Read ──────────────────────────────────────────────────────────────

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

  async count(agencyId: string) {
    return this.prisma.department.count({ where: { agencyId, deletedAt: null } })
  }
}
