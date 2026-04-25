/**
 * flows.repository.ts — Prisma (reemplaza workspaceStore JSON)
 *
 * Interfaz pública compatible con la versión anterior:
 *   list()       → FlowSpec[]
 *   findById(id) → FlowSpec | null
 *   saveAll()    → FlowSpec[]
 *   save(flow)   → FlowSpec
 *   remove(id)   → void
 */

import type { FlowSpec } from '../../../../../packages/core-types/src';
import { prisma } from '../core/db/prisma.service';
// import type { Prisma } from '../../../../../../../../packages/db/generated/client';
// Commented out: Path does not exist. Using type-only import from @prisma/client instead.
import type { Prisma } from '@prisma/client';

// ── Helpers ───────────────────────────────────────────────────────────────

function prismaToSpec(row: Prisma.FlowGetPayload<object>): FlowSpec {
  return {
    id:          row.id,
    workspaceId: row.workspaceId,
    name:        row.name,
    description: row.description ?? '',
    version:     row.version ?? '1.0.0',
    trigger:     row.trigger,
    nodes:       (row.nodes as any) ?? [],
    edges:       (row.edges as any) ?? [],
    tags:        row.tags,
    isEnabled:   row.isEnabled,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
  };
}

function specToCreateInput(
  flow: FlowSpec,
): Prisma.FlowUncheckedCreateInput {
  return {
    id:          flow.id,
    workspaceId: flow.workspaceId ?? '',
    name:        flow.name,
    description: flow.description ?? '',
    version:     flow.version ?? '1.0.0',
    trigger:     flow.trigger,
    nodes:       (flow.nodes as any) ?? [],
    edges:       (flow.edges as any) ?? [],
    tags:        flow.tags ?? [],
    isEnabled:   flow.isEnabled,
  };
}

// ── Repository ────────────────────────────────────────────────────────────

export class FlowsRepository {
  async list(): Promise<FlowSpec[]> {
    const rows = await prisma.flow.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(prismaToSpec);
  }

  async listByWorkspace(workspaceId: string): Promise<FlowSpec[]> {
    const rows = await prisma.flow.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(prismaToSpec);
  }

  async findById(id: string): Promise<FlowSpec | null> {
    const row = await prisma.flow.findUnique({ where: { id } });
    return row ? prismaToSpec(row) : null;
  }

  async save(flow: FlowSpec): Promise<FlowSpec> {
    const data = specToCreateInput(flow);
    const row = await prisma.flow.upsert({
      where:  { id: flow.id },
      create: data,
      update: {
        name:        data.name,
        description: data.description,
        version:     data.version,
        trigger:     data.trigger,
        nodes:       data.nodes,
        edges:       data.edges,
        tags:        data.tags,
        isEnabled:   data.isEnabled,
      },
    });
    return prismaToSpec(row);
  }

  async saveAll(flows: FlowSpec[]): Promise<FlowSpec[]> {
    return Promise.all(flows.map((f) => this.save(f)));
  }

  async remove(id: string): Promise<void> {
    await prisma.flow.delete({ where: { id } });
  }
}
