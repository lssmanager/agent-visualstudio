/**
 * workspace.repository.ts — Prisma-backed workspace persistence
 * NOTE: 'timezone' field was removed — it does not exist in the Prisma schema.
 */
import type { PrismaClient } from '@prisma/client';

export interface WorkspaceCreateInput {
  id?: string;
  name: string;
  slug?: string;
  agencyId?: string | null;
  departmentId?: string | null;
  metadata?: Record<string, unknown>;
}

export class WorkspaceRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: WorkspaceCreateInput) {
    return this.db.workspace.create({
      data: {
        name:         input.name,
        slug:         input.slug ?? input.name.toLowerCase().replace(/\s+/g, '-'),
        agencyId:     input.agencyId     ?? null,
        departmentId: input.departmentId ?? null,
        metadata:     (input.metadata ?? {}) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
  }

  async findById(id: string) {
    return this.db.workspace.findUnique({ where: { id } });
  }

  async findBySlug(slug: string) {
    return this.db.workspace.findFirst({ where: { slug } });
  }

  async listByAgency(agencyId: string) {
    return this.db.workspace.findMany({ where: { agencyId } });
  }

  async update(id: string, data: Partial<WorkspaceCreateInput>) {
    return this.db.workspace.update({
      where: { id },
      data: {
        ...(data.name         && { name:         data.name }),
        ...(data.slug         && { slug:         data.slug }),
        ...(data.agencyId     !== undefined && { agencyId:     data.agencyId }),
        ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
        ...(data.metadata     && { metadata:     data.metadata as unknown as import('@prisma/client').Prisma.InputJsonValue }),
      },
    });
  }

  async delete(id: string) {
    return this.db.workspace.delete({ where: { id } });
  }
}
