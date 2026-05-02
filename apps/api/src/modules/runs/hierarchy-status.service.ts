/**
 * hierarchy-status.service.ts — [F2a] Árbol jerárquico de runs
 *
 * Construye y devuelve el estado del árbol de runs de una jerarquía.
 *
 * AUDIT-16: El query principal usa OR para incluir:
 *   - Runs nuevos (F2a+): metadata.runRoot
 *   - Runs históricos (pre-F2a): metadata.hierarchyRoot
 * Eliminar el fallback 'hierarchyRoot' cuando todos los runs usen 'runRoot'.
 */

import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../lib/prisma.service.js'

export interface HierarchyNode {
  runId:    string
  depth:    number
  status:   string
  parentId: string | null
  children: HierarchyNode[]
}

@Injectable()
export class HierarchyStatusService {
  constructor(private readonly db: PrismaService) {}

  async getTree(rootId: string): Promise<HierarchyNode[]> {
    const runs = await this.db.agentRun.findMany({
      where: {
        // AUDIT-16: OR incluye 'hierarchyRoot' para compatibilidad con runs
        // creados antes de F2a. Eliminar cuando todos los runs usen 'runRoot'.
        OR: [
          // Runs nuevos (F2a+) — campo runRoot en metadata
          {
            metadata: {
              path:   ['runRoot'],
              equals: rootId,
            },
          },
          // Fallback para runs históricos — campo hierarchyRoot
          {
            metadata: {
              path:   ['hierarchyRoot'],
              equals: rootId,
            },
          },
        ],
      },
      select: {
        id:       true,
        status:   true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    return runs.map((run) => {
      const metadata = (run.metadata ?? {}) as Record<string, unknown>

      // AUDIT-16: leer runDepth con fallback a hierarchyDepth
      const depth: number =
        (metadata['runDepth']       as number | undefined) ??
        (metadata['hierarchyDepth'] as number | undefined) ??
        0

      const parentId: string | null =
        (metadata['parentRunId'] as string | undefined) ??
        (metadata['parentId']    as string | undefined) ??
        null

      return {
        runId:    run.id,
        depth,
        status:   run.status,
        parentId,
        children: [], // se puebla en la capa de presentación si se necesita
      }
    })
  }
}
