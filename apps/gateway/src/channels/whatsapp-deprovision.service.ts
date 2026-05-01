/**
 * whatsapp-deprovision.service.ts — [F3a-23]
 *
 * Servicio que coordina el ciclo completo de logout y deprovision
 * para sesiones WhatsApp Baileys.
 *
 * logout(configId):
 *   1. Cierra el socket Baileys limpiamente (sock.logout())
 *   2. Borra los archivos de sesión del filesystem
 *   3. El ChannelConfig en Prisma NO se modifica (canal sigue activo)
 *   4. El adapter en el store queda en estado 'closed'
 *   → Admin puede re-conectar con nuevo QR
 *
 * deprovision(configId):
 *   1. logout() completo
 *   2. Desactiva el ChannelConfig en Prisma: active = false
 *   3. Destruye la sesión en WhatsAppSessionStore (remove)
 *   → Canal queda inoperativo hasta reactivación manual
 *
 * IMPORTANTE:
 *   - Recibe PrismaClient inyectado — no crea instancia propia
 *   - Recibe WhatsAppSessionStore inyectado — no usa singleton directamente
 *     (facilita testing con mocks)
 */

import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import type { WhatsAppSessionStore } from '../whatsapp-session.store.js'

const WA_SESSIONS_DIR = process.env.WA_SESSIONS_DIR ?? './data/wa-sessions'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface LogoutResult {
  configId:       string
  sessionDeleted: boolean
  adapterState:   string
}

export interface DeprovisionResult extends LogoutResult {
  channelDeactivated: boolean
  storeDestroyed:     boolean
}

// ── Servicio ─────────────────────────────────────────────────────────────────

export class WhatsAppDeprovisionService {
  constructor(
    private readonly db:    PrismaClient,
    private readonly store: WhatsAppSessionStore,
  ) {}

  // ── logout ─────────────────────────────────────────────────────────────────

  /**
   * Cierra la sesión WA Web y borra archivos de credenciales.
   * El canal sigue activo en DB — solo se limpia la sesión.
   */
  async logout(configId: string): Promise<LogoutResult> {
    const entry   = this.store.get(configId)
    const adapter = entry?.adapter

    if (adapter) {
      // 'open' | 'reconnecting' → usar logout() que notifica al servidor WA
      // cualquier otro estado   → dispose() es suficiente para limpiar recursos
      if (adapter.state === 'open' || adapter.state === 'reconnecting') {
        await adapter.logout?.().catch((err: unknown) =>
          console.warn(`[wa-deprovision] logout error (${configId}):`, err),
        )
      } else {
        await adapter.dispose().catch((err: unknown) =>
          console.warn(`[wa-deprovision] dispose error (${configId}):`, err),
        )
      }
    }

    // Borrar archivos de sesión del filesystem
    const sessionDir    = path.join(WA_SESSIONS_DIR, configId)
    const sessionDeleted = this.deleteSessionDir(sessionDir)

    console.info(
      `[wa-deprovision] logout complete — configId=${configId}, sessionDeleted=${sessionDeleted}`,
    )

    return {
      configId,
      sessionDeleted,
      adapterState: adapter?.state ?? 'not_in_store',
    }
  }

  // ── deprovision ────────────────────────────────────────────────────────────

  /**
   * Deprovision completo:
   *   logout() → deactivate ChannelConfig in Prisma → destroy store entry
   *
   * Tolerante a fallos: cada paso se intenta independientemente.
   * Si falla la actualización de DB, los demás pasos siguen ejecutándose.
   * Se retorna un resultado parcial indicando qué operaciones tuvieron éxito.
   */
  async deprovision(configId: string): Promise<DeprovisionResult> {
    // 1. Logout (cierra socket + borra FS)
    const logoutResult = await this.logout(configId)

    // 2. Desactivar ChannelConfig en Prisma
    let channelDeactivated = false
    try {
      await this.db.channelConfig.update({
        where: { id: configId },
        data:  { active: false },
      })
      channelDeactivated = true
      console.info(`[wa-deprovision] ChannelConfig deactivated: ${configId}`)
    } catch (err: any) {
      // P2025 = registro no encontrado en Prisma — no es error crítico
      if (err?.code === 'P2025') {
        console.warn(`[wa-deprovision] ChannelConfig not found in DB: ${configId}`)
      } else {
        console.error('[wa-deprovision] DB update error:', err)
      }
    }

    // 3. Destruir entrada en el store (cierra SSE clients)
    let storeDestroyed = false
    try {
      this.store.remove(configId)
      storeDestroyed = true
    } catch (err) {
      console.error('[wa-deprovision] store.remove error:', err)
    }

    const result: DeprovisionResult = {
      ...logoutResult,
      channelDeactivated,
      storeDestroyed,
    }

    console.info(
      `[wa-deprovision] deprovision complete — configId=${configId}`,
      result,
    )

    return result
  }

  // ── Helper ─────────────────────────────────────────────────────────────────

  private deleteSessionDir(sessionDir: string): boolean {
    try {
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true })
        console.info(`[wa-deprovision] Session dir deleted: ${sessionDir}`)
        return true
      }
      return false
    } catch (err) {
      console.error('[wa-deprovision] Failed to delete session dir:', err)
      return false
    }
  }
}
