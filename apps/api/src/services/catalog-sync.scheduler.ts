/**
 * catalog-sync.scheduler.ts
 *
 * Cron job que sincroniza el catálogo de modelos LLM de todos los proveedores
 * activos en cada workspace, cada 6 horas.
 *
 * Comportamiento:
 *   - Carga todos los workspaces con al menos un ProviderCredential activo.
 *   - Llama ProviderCatalogService.syncAll(workspaceId) por cada workspace.
 *   - Después del sync, llama ModelCatalogService.enrichAllFromSeed(workspaceId)
 *     para enriquecer entries sin families desde el CAPABILITY_REGISTRY seed.
 *   - Errores por proveedor se loguean sin interrumpir el job.
 *   - El primer sync se ejecuta 30 segundos después del arranque (warm-up).
 *
 * Schedule: '0 * /6 * * *'  →  a las 00:00, 06:00, 12:00, 18:00 UTC
 *           (nota: espacio en * /6 solo en este comentario para evitar cerrar el bloque JSDoc)
 *
 * Dependencia: node-cron
 *   npm install node-cron
 *   npm install -D @types/node-cron
 */

import cron from 'node-cron'
import { getPrisma } from '../lib/prisma'
import { ProviderCatalogService, ModelCatalogService } from '@agent-vs/profile-engine'

const SCHEDULE = '0 */6 * * *'   // cada 6 horas en punto
const WARMUP_MS = 30_000          // 30 segundos tras el arranque

async function runSync(): Promise<void> {
  const prisma = getPrisma()

  // Obtener workspaces con al menos un proveedor activo
  const workspaces = await prisma.workspace.findMany({
    where: {
      providerCredentials: {
        some: { isActive: true },
      },
    },
    select: { id: true, name: true },
  })

  if (workspaces.length === 0) {
    console.log('[catalog-sync] No workspaces with active providers — skipping')
    return
  }

  console.log(`[catalog-sync] Starting sync for ${workspaces.length} workspace(s)`)

  for (const ws of workspaces) {
    try {
      const providerSvc = new ProviderCatalogService(prisma)
      const catalogSvc  = new ModelCatalogService(prisma)

      const results = await providerSvc.syncAll(ws.id)

      const upserted    = results.reduce((acc, r) => acc + (r.result?.upserted    ?? 0), 0)
      const deactivated = results.reduce((acc, r) => acc + (r.result?.deactivated ?? 0), 0)
      const errors      = results.filter(r => r.error)

      if (errors.length > 0) {
        for (const e of errors) {
          console.warn(
            `[catalog-sync] workspace=${ws.name} provider=${e.name} ERROR: ${e.error}`,
          )
        }
      }

      // Enriquecer entries sin families desde el CAPABILITY_REGISTRY seed
      const enriched = await catalogSvc.enrichAllFromSeed(ws.id)

      console.log(
        `[catalog-sync] workspace=${ws.name} ` +
        `upserted=${upserted} deactivated=${deactivated} enriched=${enriched} ` +
        `providers=${results.length} errors=${errors.length}`,
      )
    } catch (err) {
      console.error(
        `[catalog-sync] workspace=${ws.name} FATAL: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  console.log('[catalog-sync] Sync complete')
}

/**
 * Inicia el scheduler de sync del catálogo.
 * Llamar una vez desde main.ts después de createServer().
 */
export function startCatalogSyncScheduler(): void {
  // Warm-up: primer sync 30s después del arranque para no bloquear el boot
  setTimeout(() => {
    runSync().catch(err =>
      console.error('[catalog-sync] Warm-up sync failed:', err),
    )
  }, WARMUP_MS)

  // Cron recurrente cada 6 horas
  cron.schedule(SCHEDULE, () => {
    runSync().catch(err =>
      console.error('[catalog-sync] Scheduled sync failed:', err),
    )
  })

  console.log(`[catalog-sync] Scheduler started — schedule: ${SCHEDULE}, warm-up: ${WARMUP_MS}ms`)
}
