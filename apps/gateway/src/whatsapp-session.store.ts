/**
 * whatsapp-session.store.ts — [F3a-22]
 *
 * Store en memoria para sesiones WhatsApp Baileys.
 * Exporta la clase (para typing en DI) y el singleton whatsappSessionStore.
 *
 * FIX #177: getOrCreate() es ahora async y usa un Map de Promises como lock
 * para prevenir la race condition TOCTOU donde dos requests simultáneos para
 * el mismo configId crean entradas duplicadas o inicializan el adapter dos veces.
 */

import type { Response } from 'express'

export type WhatsAppSessionStatus =
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'disconnected'
  | 'error'

export interface IWhatsAppAdapter {
  readonly channel: string
  state?: string
  onQr?: (handler: (qr: string) => void) => void
  onConnected?: (handler: () => void) => void
  onDisconnected?: (handler: () => void) => void
  logout?: () => Promise<void>
  dispose(): Promise<void>
}

export interface SessionEntry {
  adapter: IWhatsAppAdapter
  qrBuffer: string | null
  status: WhatsAppSessionStatus
  sseClients: Set<Response>
}

export class WhatsAppSessionStore {
  private readonly sessions       = new Map<string, SessionEntry>()
  /** FIX #177: lock de creaciones en curso para prevenir race conditions */
  private readonly _creationLocks = new Map<string, Promise<SessionEntry>>()

  /**
   * Retorna la sesión existente o crea una nueva de forma thread-safe.
   * Si dos llamadas concurrentes llegan con el mismo configId mientras la
   * entrada aún no existe, ambas reciben la misma Promise — la creación
   * solo ocurre una vez.
   */
  async getOrCreate(configId: string): Promise<SessionEntry> {
    // Fast path: ya existe
    const existing = this.sessions.get(configId)
    if (existing) return existing

    // Lock path: si hay una creación en curso, devolver la misma Promise
    const inFlight = this._creationLocks.get(configId)
    if (inFlight) return inFlight

    // Crear la entrada y registrar el lock
    const creation = Promise.resolve().then(() => {
      // Double-check tras await (otro contexto pudo haber completado)
      if (!this.sessions.has(configId)) {
        this.sessions.set(configId, {
          adapter:    null as unknown as IWhatsAppAdapter,
          qrBuffer:   null,
          status:     'disconnected',
          sseClients: new Set(),
        })
      }
      this._creationLocks.delete(configId)
      return this.sessions.get(configId)!
    })

    this._creationLocks.set(configId, creation)
    return creation
  }

  get(configId: string): SessionEntry | undefined {
    return this.sessions.get(configId)
  }

  has(configId: string): boolean {
    return this.sessions.has(configId)
  }

  async setAdapter(configId: string, adapter: IWhatsAppAdapter): Promise<void> {
    const entry = await this.getOrCreate(configId)
    entry.adapter = adapter
  }

  setQr(configId: string, qr: string): void {
    const entry = this.sessions.get(configId)
    if (!entry) return
    entry.qrBuffer = qr
    entry.status = 'qr_ready'
    this.broadcastSse(entry, { event: 'qr', data: qr })
  }

  setStatus(configId: string, status: WhatsAppSessionStatus): void {
    const entry = this.sessions.get(configId)
    if (!entry) return
    entry.status = status
    if (status === 'connected') entry.qrBuffer = null
    this.broadcastSse(entry, { event: 'status', data: status })
  }

  remove(configId: string): void {
    const entry = this.sessions.get(configId)
    if (!entry) return
    for (const client of entry.sseClients) {
      try {
        client.end()
      } catch {}
    }
    entry.sseClients.clear()
    this.sessions.delete(configId)
    this._creationLocks.delete(configId)
  }

  /**
   * Alias semántico de remove() para el flujo de deprovision.
   * destroy() = remove() + logging explícito.
   */
  destroy(configId: string): void {
    console.info(`[wa-session-store] Destroying session: ${configId}`)
    this.remove(configId)
  }

  async addSseClient(configId: string, res: Response): Promise<void> {
    const entry = await this.getOrCreate(configId)
    entry.sseClients.add(res)
    this.sendSseEvent(res, { event: 'status', data: entry.status })
    if (entry.qrBuffer) {
      this.sendSseEvent(res, { event: 'qr', data: entry.qrBuffer })
    }
    res.on('close', () => {
      entry.sseClients.delete(res)
    })
  }

  private broadcastSse(entry: SessionEntry, payload: { event: string; data: string }): void {
    for (const client of entry.sseClients) {
      this.sendSseEvent(client, payload)
    }
  }

  private sendSseEvent(res: Response, payload: { event: string; data: string }): void {
    try {
      res.write(`event: ${payload.event}\ndata: ${payload.data}\n\n`)
    } catch {}
  }

  activeSessions(): string[] {
    return [...this.sessions.keys()]
  }

  /** Retorna el número de creaciones en curso (para diagnóstico/tests) */
  get pendingCreations(): number {
    return this._creationLocks.size
  }
}

/** Tipo exportado para inyección en WhatsAppDeprovisionService y tests */
export type WhatsAppSessionStore_t = WhatsAppSessionStore

export const whatsappSessionStore = new WhatsAppSessionStore()
