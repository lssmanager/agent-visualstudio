/**
 * whatsapp-session.store.ts — Store en memoria para sesiones WhatsApp Baileys
 * [F3a-22]
 */

import { WhatsAppBaileysAdapter, type WhatsAppAdapterState } from './channels/whatsapp-baileys.adapter.js'

export type SseEvent =
  | { type: 'qr'; data: string }
  | { type: 'state'; data: WhatsAppAdapterState }
  | { type: 'heartbeat'; data: string }

export type SseSubscriber = (event: SseEvent) => void

interface SessionEntry {
  adapter: WhatsAppBaileysAdapter
  latestQr: string | null
  subscribers: Set<SseSubscriber>
}

export interface SessionStatus {
  configId: string
  state: WhatsAppAdapterState
  hasQr: boolean
  subscribers: number
}

export class WhatsAppSessionStore {
  private readonly sessions = new Map<string, SessionEntry>()

  async getOrCreate(
    configId: string,
    config: Record<string, unknown> = {},
    secrets: Record<string, unknown> = {},
  ): Promise<WhatsAppBaileysAdapter> {
    const existing = this.sessions.get(configId)
    if (existing) return existing.adapter

    const adapter = new WhatsAppBaileysAdapter()
    ;(adapter as unknown as Record<string, unknown>)['channelConfigId'] = configId

    await adapter.setup(config, secrets)

    const entry: SessionEntry = {
      adapter,
      latestQr: null,
      subscribers: new Set(),
    }

    this.sessions.set(configId, entry)

    adapter.onQr((qr) => {
      entry.latestQr = qr
      this.fanOut(configId, { type: 'qr', data: qr })
    })

    adapter.onStateChange((state) => {
      if (state === 'open' || state === 'closed') {
        entry.latestQr = null
      }
      this.fanOut(configId, { type: 'state', data: state })
    })

    adapter.onError((err) => {
      console.error(`[whatsapp-store] Error en adapter configId=${configId}:`, err.message)
    })

    console.info(`[whatsapp-store] Sesión creada (lazy) para configId=${configId}`)
    return adapter
  }

  subscribe(configId: string, subscriber: SseSubscriber): () => void {
    const entry = this.sessions.get(configId)
    if (!entry) {
      console.warn(`[whatsapp-store] subscribe() llamado para configId=${configId} inexistente`)
      return () => {}
    }

    entry.subscribers.add(subscriber)

    if (entry.latestQr) {
      try {
        subscriber({ type: 'qr', data: entry.latestQr })
      } catch (err) {
        console.warn('[whatsapp-store] Error enviando QR buffered:', err)
      }
    }

    try {
      subscriber({ type: 'state', data: entry.adapter.getState() })
    } catch {
      /* cliente ya desconectado */
    }

    return () => {
      entry.subscribers.delete(subscriber)
    }
  }

  async remove(configId: string): Promise<void> {
    const entry = this.sessions.get(configId)
    if (!entry) return

    try {
      await entry.adapter.dispose()
    } catch (err) {
      console.error(`[whatsapp-store] Error en dispose para configId=${configId}:`, err)
    }

    this.fanOut(configId, { type: 'state', data: 'closed' })
    this.sessions.delete(configId)
    console.info(`[whatsapp-store] Sesión eliminada para configId=${configId}`)
  }

  getStatus(configId?: string): SessionStatus[] {
    if (configId) {
      const entry = this.sessions.get(configId)
      if (!entry) return []
      return [this.toStatus(configId, entry)]
    }
    return Array.from(this.sessions.entries()).map(([id, entry]) => this.toStatus(id, entry))
  }

  has(configId: string): boolean {
    return this.sessions.has(configId)
  }

  get(configId: string): WhatsAppBaileysAdapter | null {
    return this.sessions.get(configId)?.adapter ?? null
  }

  private fanOut(configId: string, event: SseEvent): void {
    const entry = this.sessions.get(configId)
    if (!entry || entry.subscribers.size === 0) return

    for (const subscriber of entry.subscribers) {
      try {
        subscriber(event)
      } catch (err) {
        console.warn('[whatsapp-store] Suscriptor roto, eliminando:', err)
        entry.subscribers.delete(subscriber)
      }
    }
  }

  private toStatus(configId: string, entry: SessionEntry): SessionStatus {
    return {
      configId,
      state: entry.adapter.getState(),
      hasQr: entry.latestQr !== null,
      subscribers: entry.subscribers.size,
    }
  }
}

export const whatsappSessionStore = new WhatsAppSessionStore()
