/**
 * scripts/migrate-run-hierarchy.ts — AUDIT-39
 *
 * Backfill migration: promueve parentRunId, parentStepId y hierarchyRoot
 * desde Run.metadata (JSON) a las nuevas columnas explícitas.
 *
 * Ejecutar UNA VEZ después de aplicar la migración de schema AUDIT-39:
 *   pnpm prisma migrate deploy  # aplica la migración de schema
 *   pnpm tsx scripts/migrate-run-hierarchy.ts
 *
 * Flags:
 *   --dry-run   Imprime qué se actualizaría sin escribir en BD
 *
 * Idempotencia:
 *   El script solo procesa Runs donde alguna columna explícita está null
 *   y metadata tiene el valor correspondiente. Seguro relanzar.
 *
 * @module migrate-run-hierarchy
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  console.log(
    `[migrate-run-hierarchy] Starting backfill${DRY_RUN ? ' (DRY RUN — no writes)' : ''}...`,
  )

  // Encuentra Runs que tienen datos en metadata pero columnas explícitas null.
  // Carga en batches de 500 para no saturar memoria en tablas grandes.
  const BATCH_SIZE = 500
  let offset = 0
  let totalProcessed = 0
  let totalUpdated = 0

  while (true) {
    const batch = await prisma.run.findMany({
      where: {
        metadata: { not: null },
        // Solo Runs que aún no tienen las columnas rellenadas
        AND: [
          {
            OR: [
              { parentRunId: null },
              { parentStepId: null },
              { hierarchyRoot: null },
            ],
          },
        ],
      },
      select: {
        id:            true,
        metadata:      true,
        parentRunId:   true,
        parentStepId:  true,
        hierarchyRoot: true,
      },
      skip:  offset,
      take:  BATCH_SIZE,
    })

    if (batch.length === 0) break
    offset += batch.length
    totalProcessed += batch.length

    for (const run of batch) {
      const meta = (run.metadata ?? {}) as Record<string, unknown>

      const newParentRunId   = (meta['parentRunId']   as string | undefined) ?? null
      const newParentStepId  = (meta['parentStepId']  as string | undefined) ?? null
      const newHierarchyRoot = (meta['hierarchyRoot'] as string | undefined) ?? null

      // Solo actualiza si hay algo que cambiar
      const hasChanges =
        (newParentRunId   !== null && run.parentRunId   === null) ||
        (newParentStepId  !== null && run.parentStepId  === null) ||
        (newHierarchyRoot !== null && run.hierarchyRoot === null)

      if (!hasChanges) continue

      if (DRY_RUN) {
        console.log(
          `[dry-run] Run ${run.id}:`,
          {
            parentRunId:   newParentRunId,
            parentStepId:  newParentStepId,
            hierarchyRoot: newHierarchyRoot,
          },
        )
      } else {
        await prisma.run.update({
          where: { id: run.id },
          data: {
            ...(newParentRunId   !== null ? { parentRunId:   newParentRunId   } : {}),
            ...(newParentStepId  !== null ? { parentStepId:  newParentStepId  } : {}),
            ...(newHierarchyRoot !== null ? { hierarchyRoot: newHierarchyRoot } : {}),
          },
        })
      }

      totalUpdated++
    }

    if (totalProcessed % 100 === 0 || batch.length < BATCH_SIZE) {
      console.log(
        `[migrate-run-hierarchy] Processed ${totalProcessed} rows, updated ${totalUpdated}...`,
      )
    }
  }

  console.log(
    `[migrate-run-hierarchy] Done. Processed: ${totalProcessed}, Updated: ${totalUpdated}${
      DRY_RUN ? ' (DRY RUN — nothing written)' : ''
    }`,
  )
}

main()
  .catch((err: unknown) => {
    console.error('[migrate-run-hierarchy] Fatal error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
