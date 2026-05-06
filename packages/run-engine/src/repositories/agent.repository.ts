/**
 * agent.repository.ts — Prisma-backed Agent persistence
 * FIX: modelId → model (field name in schema is 'model: String').
 *      Removed departmentId/agencyId from AgentWhereInput (not direct fields on Agent).
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export interface CreateAgentInput {
  id?:           string;
  name:          string;
  description?:  string;
  workspaceId:   string;
  model:         string;
  systemPrompt?: string | null;
  isEnabled?:    boolean;
  config?:       Record<string, unknown>;
  permissions?:  Record<string, unknown>;
  metadata?:     Record<string, unknown>;
  tags?:         string[];
}

export interface UpdateAgentInput {
  name?:         string;
  description?:  string;
  model?:        string;
  systemPrompt?: string | null;
  isEnabled?:    boolean;
  config?:       Record<string, unknown>;
  permissions?:  Record<string, unknown>;
  metadata?:     Record<string, unknown>;
  tags?:         string[];
}

export class AgentRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateAgentInput) {
    return this.db.agent.create({
      data: {
        name:         input.name,
        description:  input.description  ?? '',
        workspaceId:  input.workspaceId,
        model:        input.model,
        systemPrompt: input.systemPrompt  ?? null,
        isEnabled:    input.isEnabled     ?? true,
        config:       (input.config       ?? {}) as Prisma.InputJsonValue,
        permissions:  (input.permissions  ?? {}) as Prisma.InputJsonValue,
        metadata:     (input.metadata     ?? {}) as Prisma.InputJsonValue,
        tags:         input.tags          ?? [],
      },
    });
  }

  async findById(id: string) {
    return this.db.agent.findUnique({
      where:   { id },
      include: {
        workspace:  true,
        skills:     true,
        skillLinks: true,
        subagents:  true,
      },
    });
  }

  async findByWorkspace(workspaceId: string) {
    return this.db.agent.findMany({
      where:   { workspaceId, deletedAt: null },
      include: { skillLinks: true },
    });
  }

  async update(id: string, data: UpdateAgentInput) {
    return this.db.agent.update({
      where: { id },
      data: {
        ...(data.name         !== undefined && { name:         data.name }),
        ...(data.description  !== undefined && { description:  data.description }),
        ...(data.model        !== undefined && { model:        data.model }),
        ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
        ...(data.isEnabled    !== undefined && { isEnabled:    data.isEnabled }),
        ...(data.config       !== undefined && { config:       data.config as Prisma.InputJsonValue }),
        ...(data.permissions  !== undefined && { permissions:  data.permissions as Prisma.InputJsonValue }),
        ...(data.metadata     !== undefined && { metadata:     data.metadata as Prisma.InputJsonValue }),
        ...(data.tags         !== undefined && { tags:         data.tags }),
      },
    });
  }

  async softDelete(id: string) {
    return this.db.agent.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });
  }

  async findEnabled(workspaceId: string) {
    return this.db.agent.findMany({
      where:   { workspaceId, isEnabled: true, deletedAt: null },
      include: { skillLinks: true, workspace: true },
    });
  }
}
