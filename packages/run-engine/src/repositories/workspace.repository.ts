/**
 * workspace.repository.ts — Prisma-backed workspace persistence
 * FIX: Removed agencyId (not in schema — Workspace has departmentId only).
 *      Exported CreateWorkspaceInput, UpdateWorkspaceInput, FindWorkspacesOptions.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export interface CreateWorkspaceInput {
  id?:          string;
  name:         string;
  slug?:        string;
  departmentId?: string | null;
  metadata?:    Record<string, unknown>;
}

export interface UpdateWorkspaceInput {
  name?:         string;
  slug?:         string;
  departmentId?: string | null;
  metadata?:     Record<string, unknown>;
}

export interface FindWorkspacesOptions {
  departmentId?: string;
  limit?:        number;
  offset?:       number;
}

export class WorkspaceRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateWorkspaceInput) {
    return this.db.workspace.create({
      data: {
        name:         input.name,
        slug:         input.slug ?? input.name.toLowerCase().replace(/\s+/g, '-'),
        departmentId: input.departmentId ?? null,
        metadata:     (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findById(id: string) {
    return this.db.workspace.findUnique({ where: { id } });
  }

  async findBySlug(slug: string) {
    return this.db.workspace.findFirst({ where: { slug } });
  }

  async listByDepartment(departmentId: string) {
    return this.db.workspace.findMany({ where: { departmentId } });
  }

  /** @deprecated use listByDepartment — agency-level listing must go through department */
  async listByAgency(_agencyId: string) {
    return [];
  }

  async find(opts: FindWorkspacesOptions = {}) {
    return this.db.workspace.findMany({
      where: {
        ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
      },
      skip: opts.offset,
      take: opts.limit,
    });
  }

  async update(id: string, data: UpdateWorkspaceInput) {
    return this.db.workspace.update({
      where: { id },
      data: {
        ...(data.name         !== undefined && { name:         data.name }),
        ...(data.slug         !== undefined && { slug:         data.slug }),
        ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
        ...(data.metadata     !== undefined && { metadata:     data.metadata as Prisma.InputJsonValue }),
      },
    });
  }

  async delete(id: string) {
    return this.db.workspace.delete({ where: { id } });
  }
}
