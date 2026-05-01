/**
 * whatsapp-deprovision.service.ts — [F3a-23]
 */

import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import type { WhatsAppSessionStore } from '../whatsapp-session.store.js'

const WA_SESSIONS_DIR = process.env.WA_SESSIONS_DIR ?? './data/wa-sessions'

export interface LogoutResult {
  configId: string
  sessionDeleted: boolean
  adapterState: string
}

export interface DeprovisionResult extends LogoutResult {
  channelDeactivated: boolean
  storeDestroyed: boolean
}

export class WhatsAppDeprovisionService {
  constructor(
    private readonly db: PrismaClient,
    private readonly store: WhatsAppSessionStore,
  ) {}

  async logout(configId: string): Promise<LogoutResult> {
    const entry = this.store.get(configId)
    const adapter = entry?.adapter as {
      state?: string
      logout?: () => Promise<void>
      dispose: () => Promise<void>
    } | undefined

    if (adapter) {
      if (adapter.state === 'open' || adapter.state === 'reconnecting') {
        await adapter.logout?.().catch((err) => {
          console.warn(`[wa-deprovision] logout error (${configId}):`, err)
        })
      } else {
        await adapter.dispose().catch((err) => {
          console.warn(`[wa-deprovision] dispose error (${configId}):`, err)
        })
      }
    }

    const sessionDir = path.join(WA_SESSIONS_DIR, configId)
    const sessionDeleted = this.deleteSessionDir(sessionDir)

    return {
      configId,
      sessionDeleted,
      adapterState: adapter?.state ?? 'not_in_store',
    }
  }

  async deprovision(configId: string): Promise<DeprovisionResult> {
    const logoutResult = await this.logout(configId)

    let channelDeactivated = false
    try {
      await this.db.channelConfig.update({
        where: { id: configId },
        data: { active: false },
      })
      channelDeactivated = true
    } catch (err: any) {
      if (err?.code !== 'P2025') {
        console.error('[wa-deprovision] DB update error:', err)
      }
    }

    let storeDestroyed = false
    try {
      this.store.remove(configId)
      storeDestroyed = true
    } catch (err) {
      console.error('[wa-deprovision] store.remove error:', err)
    }

    return {
      ...logoutResult,
      channelDeactivated,
      storeDestroyed,
    }
  }

  private deleteSessionDir(sessionDir: string): boolean {
    try {
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true })
        return true
      }
      return false
    } catch (err) {
      console.error('[wa-deprovision] Failed to delete session dir:', err)
      return false
    }
  }
}
