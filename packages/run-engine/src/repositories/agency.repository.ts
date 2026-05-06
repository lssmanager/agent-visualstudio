/**
 * agency.repository.ts — Prisma-backed Agency persistence
 * FIX: Removed logtoTenantId (not in schema).
 *      Removed isLevelOrchestrator from DepartmentWhereInput (field is on Workspace, not Department).
 */
import type { PrismaClient } from '@prisma/client';

export interface CreateAgencyInput {
  id?:         string;
  name:        string;
  slug?:       string;
  tags?:       string[];
  description?: string;
}

export class AgencyRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateAgencyInput) {
    return this.db.agency.create({
      data: {
        name:        input.name,
        slug:        input.slug ?? input.name.toLowerCase().replace(/\s+/g, '-'),
        tags:        input.tags        ?? [],
        description: input.description ?? null,
      },
    });
  }

  async findById(id: string) {
    return this.db.agency.findUnique({
      where:   { id },
      include: { departments: true },
    });
  }

  async findBySlug(slug: string) {
    return this.db.agency.findFirst({ where: { slug } });
  }

  async findAll() {
    return this.db.agency.findMany({
      include: { departments: true },
    });
  }

  async update(
    id: string,
    data: Partial<CreateAgencyInput>,
  ) {
    return this.db.agency.update({
      where: { id },
      data: {
        ...(data.name        !== undefined && { name:        data.name }),
        ...(data.slug        !== undefined && { slug:        data.slug }),
        ...(data.tags        !== undefined && { tags:        data.tags }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  }

  async delete(id: string) {
    return this.db.agency.delete({ where: { id } });
  }

  /** Find the root-level orchestrator department for an agency */
  async findOrchestratorDepartment(agencyId: string) {
    return this.db.department.findFirst({
      where: { agencyId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
