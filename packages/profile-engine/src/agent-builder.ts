/**
 * agent-builder.ts — Agent profile builder
 * FIX:
 *  - include.subagent → include.subagents (relation name in schema)
 *  - Access workspace via proper include (not .workspace without include)
 *  - Export all types consumed by profile-engine/index.ts
 */
import type { PrismaClient } from '@prisma/client';

export interface CreateAgentInput {
  name:         string;
  description?: string;
  workspaceId:  string;
  model:        string;
  systemPrompt?: string | null;
  isEnabled?:   boolean;
  config?:      Record<string, unknown>;
  permissions?: Record<string, unknown>;
  metadata?:    Record<string, unknown>;
  tags?:        string[];
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

export interface ModelResolution {
  model:      string;
  provider?:  string;
  maxTokens?: number;
  temperature?: number;
}

export interface BuiltAgent {
  id:           string;
  name:         string;
  description:  string;
  workspaceId:  string;
  model:        string;
  systemPrompt: string | null;
  isEnabled:    boolean;
  config:       Record<string, unknown>;
  permissions:  Record<string, unknown>;
  metadata:     Record<string, unknown>;
  tags:         string[];
  workspace?:   unknown;
  subagents?:   unknown[];
  skillLinks?:  unknown[];
}

export interface OrchestratorModelResolver {
  resolveModel(agentId: string): Promise<ModelResolution | null>;
}

export interface OrchestratorPromptPropagator {
  propagate(agentId: string, prompt: string): Promise<void>;
}

export class AgentBuilder {
  constructor(private readonly db: PrismaClient) {}

  async build(agentId: string): Promise<BuiltAgent | null> {
    const agent = await this.db.agent.findUnique({
      where:   { id: agentId },
      include: {
        subagents:  true,   // FIX: was 'subagent' (typo)
        skillLinks: true,
        workspace:  true,   // include workspace relation explicitly
      },
    });

    if (!agent) return null;

    return {
      id:           agent.id,
      name:         agent.name,
      description:  agent.description,
      workspaceId:  agent.workspaceId,
      model:        agent.model,
      systemPrompt: agent.systemPrompt,
      isEnabled:    agent.isEnabled,
      config:       (agent.config      ?? {}) as Record<string, unknown>,
      permissions:  (agent.permissions ?? {}) as Record<string, unknown>,
      metadata:     (agent.metadata    ?? {}) as Record<string, unknown>,
      tags:         (agent as any).tags ?? [],
      workspace:    (agent as any).workspace ?? null,
      subagents:    (agent as any).subagents ?? [],
      skillLinks:   (agent as any).skillLinks ?? [],
    };
  }

  async create(input: CreateAgentInput): Promise<BuiltAgent> {
    const agent = await this.db.agent.create({
      data: {
        name:         input.name,
        description:  input.description  ?? '',
        workspaceId:  input.workspaceId,
        model:        input.model,
        systemPrompt: input.systemPrompt  ?? null,
        isEnabled:    input.isEnabled     ?? true,
        config:       (input.config       ?? {}) as import('@prisma/client').Prisma.InputJsonValue,
        permissions:  (input.permissions  ?? {}) as import('@prisma/client').Prisma.InputJsonValue,
        metadata:     (input.metadata     ?? {}) as import('@prisma/client').Prisma.InputJsonValue,
        tags:         input.tags ?? [],
      },
      include: { subagents: true, skillLinks: true, workspace: true },
    });

    return {
      id:           agent.id,
      name:         agent.name,
      description:  agent.description,
      workspaceId:  agent.workspaceId,
      model:        agent.model,
      systemPrompt: agent.systemPrompt,
      isEnabled:    agent.isEnabled,
      config:       (agent.config      ?? {}) as Record<string, unknown>,
      permissions:  (agent.permissions ?? {}) as Record<string, unknown>,
      metadata:     (agent.metadata    ?? {}) as Record<string, unknown>,
      tags:         (agent as any).tags ?? [],
      workspace:    (agent as any).workspace ?? null,
      subagents:    (agent as any).subagents ?? [],
      skillLinks:   (agent as any).skillLinks ?? [],
    };
  }

  async update(agentId: string, input: UpdateAgentInput): Promise<BuiltAgent | null> {
    const agent = await this.db.agent.update({
      where: { id: agentId },
      data: {
        ...(input.name         !== undefined && { name:         input.name }),
        ...(input.description  !== undefined && { description:  input.description }),
        ...(input.model        !== undefined && { model:        input.model }),
        ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
        ...(input.isEnabled    !== undefined && { isEnabled:    input.isEnabled }),
        ...(input.config       !== undefined && { config:       input.config as import('@prisma/client').Prisma.InputJsonValue }),
        ...(input.permissions  !== undefined && { permissions:  input.permissions as import('@prisma/client').Prisma.InputJsonValue }),
        ...(input.metadata     !== undefined && { metadata:     input.metadata as import('@prisma/client').Prisma.InputJsonValue }),
        ...(input.tags         !== undefined && { tags:         input.tags }),
      },
      include: { subagents: true, skillLinks: true, workspace: true },
    });

    return {
      id:           agent.id,
      name:         agent.name,
      description:  agent.description,
      workspaceId:  agent.workspaceId,
      model:        agent.model,
      systemPrompt: agent.systemPrompt,
      isEnabled:    agent.isEnabled,
      config:       (agent.config      ?? {}) as Record<string, unknown>,
      permissions:  (agent.permissions ?? {}) as Record<string, unknown>,
      metadata:     (agent.metadata    ?? {}) as Record<string, unknown>,
      tags:         (agent as any).tags ?? [],
      workspace:    (agent as any).workspace ?? null,
      subagents:    (agent as any).subagents ?? [],
      skillLinks:   (agent as any).skillLinks ?? [],
    };
  }
}
