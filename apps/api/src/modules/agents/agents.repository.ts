/**
 * agents.repository.ts — Prisma (reemplaza workspaceStore JSON)
 *
 * Mantiene la misma interfaz pública que la versión anterior:
 *   list()        → AgentSpec[]
 *   findById(id)  → AgentSpec | null
 *   saveAll()     → AgentSpec[]   (upsert masivo)
 *   save(agent)   → AgentSpec     (upsert individual)
 *   remove(id)    → void
 *
 * La conversión Prisma ↔ AgentSpec se hace con prismaToSpec / specToPrisma
 * para no romper contratos con services y controllers existentes.
 */

import type { AgentSpec } from '../../../../../packages/core-types/src';
import { prisma } from '../core/db/prisma.service';
// import type { Prisma } from '../../../../../../../../packages/db/generated/client';
// Commented out: Path does not exist. Using type-only import from @prisma/client instead.
import type { Prisma } from '@prisma/client';

const db = prisma as any;

// ── Helpers de conversión ─────────────────────────────────────────────────

function prismaToSpec(row: any): AgentSpec {
  return {
    id:              row.id,
    workspaceId:     row.workspaceId,
    name:            row.name,
    role:            row.role,
    description:     row.description,
    instructions:    row.instructions,
    model:           row.model,
    skillRefs:       (row as any).skillLinks
                       ? (row as any).skillLinks.map((l: any) => l.skillId)
                       : [],
    tags:            row.tags,
    visibility:      row.visibility as AgentSpec['visibility'],
    executionMode:   row.executionMode as AgentSpec['executionMode'],
    kind:            row.kind as AgentSpec['kind'],
    parentAgentId:   row.parentAgentId ?? undefined,
    context:         row.context,
    triggers:        (row.triggers as any) ?? [],
    permissions:     (row.permissions as any) ?? undefined,
    handoffRules:    (row.handoffRules as any) ?? [],
    channelBindings: (row.channelBindings as any) ?? [],
    policyBindings:  (row.policyBindings as any) ?? undefined,
    isEnabled:       row.isEnabled,
    createdAt:       row.createdAt.toISOString(),
    updatedAt:       row.updatedAt.toISOString(),
  };
}

function specToCreateInput(
  agent: AgentSpec,
): any {
  return {
    id:              agent.id,
    workspaceId:     agent.workspaceId,
    name:            agent.name,
    role:            agent.role,
    description:     agent.description,
    instructions:    agent.instructions,
    model:           agent.model,
    tags:            agent.tags,
    visibility:      agent.visibility,
    executionMode:   agent.executionMode,
    kind:            agent.kind ?? 'agent',
    parentAgentId:   agent.parentAgentId ?? null,
    context:         agent.context ?? [],
    triggers:        (agent.triggers as any) ?? [],
    permissions:     (agent.permissions as any) ?? {},
    handoffRules:    (agent.handoffRules as any) ?? [],
    channelBindings: (agent.channelBindings as any) ?? [],
    policyBindings:  (agent.policyBindings as any) ?? [],
    isEnabled:       agent.isEnabled,
  };
}

// ── Repository ────────────────────────────────────────────────────────────

export class AgentsRepository {
  async list(): Promise<AgentSpec[]> {
    const rows = await db.agent.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(prismaToSpec);
  }

  async listByWorkspace(workspaceId: string): Promise<AgentSpec[]> {
    const rows = await db.agent.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(prismaToSpec);
  }

  async findById(id: string): Promise<AgentSpec | null> {
    const row = await db.agent.findUnique({ where: { id } });
    return row ? prismaToSpec(row) : null;
  }

  /**
   * Upsert individual — crea o actualiza un agente.
   * Equivale al saveAll([agent]) anterior pero más eficiente.
   */
  async save(agent: AgentSpec): Promise<AgentSpec> {
    const data = specToCreateInput(agent);
    const row = await db.agent.upsert({
      where:  { id: agent.id },
      create: data,
      update: {
        name:            data.name,
        role:            data.role,
        description:     data.description,
        instructions:    data.instructions,
        model:           data.model,
        tags:            data.tags,
        visibility:      data.visibility,
        executionMode:   data.executionMode,
        kind:            data.kind,
        parentAgentId:   data.parentAgentId,
        context:         data.context,
        triggers:        data.triggers,
        permissions:     data.permissions,
        handoffRules:    data.handoffRules,
        channelBindings: data.channelBindings,
        policyBindings:  data.policyBindings,
        isEnabled:       data.isEnabled,
      },
    });
    return prismaToSpec(row);
  }

  /**
   * saveAll — mantiene compatibilidad con el contrato anterior.
   * Ejecuta upserts en paralelo (sin transacción para evitar deadlocks
   * en lotes pequeños; usa $transaction para lotes grandes si se requiere).
   */
  async saveAll(agents: AgentSpec[]): Promise<AgentSpec[]> {
    return Promise.all(agents.map((a) => this.save(a)));
  }

  async remove(id: string): Promise<void> {
    await db.agent.delete({ where: { id } });
  }
}
