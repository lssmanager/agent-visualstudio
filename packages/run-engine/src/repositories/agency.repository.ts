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

// ── DTOs ───────────────────────────────────────────────────────────────────

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

// ── Repository ──────────────────────────────────────────────────────────────────

export class AgencyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write ───────────────────────────────────────────────────────────────

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

  // ── Read ─────────────────────────────────────────────────────────────────

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

  /**
   * [F2b-02] Retorna el Agent con isLevelOrchestrator = true
   * dentro de la Agency dada, navegando la cadena completa:
   *   Agency → Department orquestador → Workspace orquestador → Agent orquestador
   *
   * Devuelve null en cualquier nivel si la cadena está incompleta.
   * Nunca itera colecciones — navega solo por el nodo orquestador de cada nivel.
   */
  async findOrchestratorAgent(agencyId: string) {
    // 1. Department orquestador de la agency
    const department = await this.prisma.department.findFirst({
      where:  { agencyId, isLevelOrchestrator: true, deletedAt: null },
      select: { id: true },
    })
    if (!department) return null

    // 2. Workspace orquestador de ese department
    const workspace = await this.prisma.workspace.findFirst({
      where:  { departmentId: department.id, isLevelOrchestrator: true, deletedAt: null },
      select: { id: true },
    })
    if (!workspace) return null

    // 3. Agent orquestador dentro de ese workspace
    return this.prisma.agent.findFirst({
      where: { workspaceId: workspace.id, isLevelOrchestrator: true, deletedAt: null },
    })
  }

  async count() {
    return this.prisma.agency.count({ where: { deletedAt: null } })
  }
}
