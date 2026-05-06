/**
 * department.repository.ts — Prisma-backed Department persistence
 * FIX: Removed isLevelOrchestrator (field does not exist on Department model in schema).
 */
import type { PrismaClient } from '@prisma/client';

export interface CreateDepartmentInput {
  id?:       string;
  name:      string;
  slug?:     string;
  agencyId:  string;
  metadata?: Record<string, unknown>;
}

export class DepartmentRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateDepartmentInput) {
    return this.db.department.create({
      data: {
        name:     input.name,
        slug:     input.slug ?? input.name.toLowerCase().replace(/\s+/g, '-'),
        agencyId: input.agencyId,
        metadata: (input.metadata ?? {}) as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
  }

  async findById(id: string) {
    return this.db.department.findUnique({
      where:   { id },
      include: { workspaces: true },
    });
  }

  async findByAgency(agencyId: string) {
    return this.db.department.findMany({
      where:   { agencyId },
      include: { workspaces: true },
    });
  }

  async findBySlug(slug: string) {
    return this.db.department.findFirst({ where: { slug } });
  }

  async update(
    id: string,
    data: Partial<CreateDepartmentInput>,
  ) {
    return this.db.department.update({
      where: { id },
      data: {
        ...(data.name     !== undefined && { name:     data.name }),
        ...(data.slug     !== undefined && { slug:     data.slug }),
        ...(data.metadata !== undefined && {
          metadata: data.metadata as import('@prisma/client').Prisma.InputJsonValue,
        }),
      },
    });
  }

  async delete(id: string) {
    return this.db.department.delete({ where: { id } });
  }
}
