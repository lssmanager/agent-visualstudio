/**
 * AgencyRepository — Prisma implementation
 *
 * Agency es la raíz de la jerarquía multi-tenant.
 * Cada Agency tiene un logtoTenantId único que referencia al tenant en Logto.
 *
 * Convenciones:
 *   - Clase stateless; el PrismaClient se inyecta en el constructor.
 *   - softDelete: marca deletedAt en lugar de borrar físicamente.
 *   - Todos los finders filtran `deletedAt: null` por defecto (registros activos).
 */

import type { PrismaClient } from '@prisma/client'

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateAgencyInput {
  name:            string
  slug:            string
  logtoTenantId:   string
  plan?:           string
  metadata?:       Record<string, unknown>
}

export interface UpdateAgencyInput {
  name?:     string
  slug?:     string
  plan?:     string
  metadata?: Record<string, unknown>
}

export interface FindAgenciesOptions {
  limit?:  number
  offset?: number
}

// ── Repository ────────────────────────────────────────────────────────────────

export class AgencyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write ─────────────────────────────────────────────────────────────

  async create(input: CreateAgencyInput) {
    return this.prisma.agency.create({
      data: {
        name:          input.name,
        slug:          input.slug,
        logtoTenantId: input.logtoTenantId,
        plan:          input.plan,
        metadata:      (input.metadata ?? {}) as never,
      },
    })
  }

  async update(id: string, data: UpdateAgencyInput) {
    return this.prisma.agency.update({
      where: { id },
      data:  {
        ...(data.name     !== undefined && { name:     data.name }),
        ...(data.slug     !== undefined && { slug:     data.slug }),
        ...(data.plan     !== undefined && { plan:     data.plan }),
        ...(data.metadata !== undefined && { metadata: data.metadata as never }),
      },
    })
  }

  /** Soft-delete: marca deletedAt, no borra físicamente. */
  async softDelete(id: string) {
    return this.prisma.agency.update({
      where: { id },
      data:  { deletedAt: new Date() },
    })
  }

  // ── Read ──────────────────────────────────────────────────────────────

  async findById(id: string) {
    return this.prisma.agency.findFirst({
      where: { id, deletedAt: null },
    })
  }

  async findBySlug(slug: string) {
    return this.prisma.agency.findFirst({
      where: { slug, deletedAt: null },
    })
  }

  /**
   * Lookup por logtoTenantId — clave de integración multi-tenant.
   * Usado por el middleware de autenticación para resolver la Agency
   * a partir del JWT claim `tenantId` de Logto.
   */
  async findByLogtoTenantId(logtoTenantId: string) {
    return this.prisma.agency.findFirst({
      where: { logtoTenantId, deletedAt: null },
    })
  }

  async findAll(opts: FindAgenciesOptions = {}) {
    return this.prisma.agency.findMany({
      where:   { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
    })
  }

  async count() {
    return this.prisma.agency.count({ where: { deletedAt: null } })
  }
}
