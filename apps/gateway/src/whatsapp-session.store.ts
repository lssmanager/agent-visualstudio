/**
 * whatsapp-session.store.ts — Store en memoria para sesiones WhatsApp Baileys
 * [F3a-22]
 *
 * Responsabilidades:
 *   - Mantener un Map<configId, SessionEntry> con el ciclo de vida de
 *     cada adapter de WhatsApp Baileys.
 *   - Bufferizar el último QR recibido para enviarlo inmediatamente a
 *     nuevos clientes SSE que se conecten.
 *   - Fan-out de eventos QR y state-change a todos los suscriptores SSE
 *     activos de un configId.
 *
 * Por qué en memoria y no en DB:
 *   El QR es un dato efímero (válido ~60s) y los suscriptores SSE son
 *   conexiones HTTP activas. Ambos son volátiles por naturaleza.
 *   La sesión de auth (creds) sí se persiste en filesystem via Baileys.
 *
 * Singleton:
 *   Se exporta una instancia única (whatsappSessionStore) para ser
 *   compartida entre el router y cualquier otro servicio del gateway.
 */

import { WhatsAppBaileysAdapter, type WhatsAppAdapterState } from './channels/whatsapp-baileys.adapter.js'

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Evento SSE tipado que el store envía a los suscriptores. */
export type SseEvent =
  | { type: 'qr';    data: string }               // QR en formato base64 / texto Baileys
  | { type: 'state'; data: WhatsAppAdapterState }  // cambio de estado del adapter
  | { type: 'heartbeat'; data: string }            // keepalive

/** Suscriptor SSE: función que escribe en la Response de Express. */
export type SseSubscriber = (event: SseEvent) => void

/** Entrada del store para un configId. */
interface SessionEntry {
  adapter:      WhatsAppBaileysAdapter
  /** Último QR recibido (null si aún no hay QR o ya fue consumido). */
  latestQr:     string | null
  /** Conjunto de suscriptores SSE activos para este configId. */
  subscribers:  Set<SseSubscriber>
}

// ── WhatsAppSessionStore ──────────────────────────────────────────────────────

export class WhatsAppSessionStore {
  private readonly sessions = new Map<string, SessionEntry>()

  // ── API pública ──────────────────────────────────────────────────────────

  /**
   * Obtiene la sesión existente o crea una nueva instancia del adapter.
   * El adapter se crea en modo lazy (no conecta hasta que se llame connect()).
   *
   * @param configId  ID del ChannelConfig en DB
   * @param config    Configuración del canal (pasada a adapter.setup())
   * @param secrets   Secrets descifrados (pasados a adapter.setup())
   */
  async getOrCreate(
    configId: string,
    config:   Record<string, unknown> = {},
    secrets:  Record<string, unknown> = {},
  ): Promise<WhatsAppBaileysAdapter> {
    const existing = this.sessions.get(configId)
    if (existing) return existing.adapter

    const adapter = new WhatsAppBaileysAdapter()
    // Inyectar channelConfigId (normalmente lo hace initialize() o setup())
    ;(adapter as unknown as Record<string, unknown>)['channelConfigId'] = configId

    await adapter.setup(config, secrets)

    const entry: SessionEntry = {
      adapter,
      latestQr:    null,
      subscribers: new Set(),
    }

    this.sessions.set(configId, entry)

    // Registrar callbacks del adapter → fan-out a suscriptores SSE
    adapter.onQr((qr) => {
      entry.latestQr = qr
      this.fanOut(configId, { type: 'qr', data: qr })
    })

    adapter.onStateChange((state) => {
      // Limpiar QR buffer cuando la sesión se abre o cierra
      if (state === 'open' || state === 'closed') {
        entry.latestQr = null
      }
      this.fanOut(configId, { type: 'state', data: state })
    })

    adapter.onError((err) => {
      console.error(`[whatsapp-store] Error en adapter configId=${configId}:`, err.message)
      // No hacemos fan-out de errores como evento SSE — el state change
      // a 'closed' ya se envía vía onStateChange.
    })

    console.info(`[whatsapp-store] Sesión creada (lazy) para configId=${configId}`)
    return adapter
  }

  /**
   * Registra un suscriptor SSE para un configId.
   * Si hay un QR en buffer, lo envía inmediatamente al nuevo suscriptor.
   * Retorna una función de limpieza (llamar al desconectar el cliente SSE).
   */
  subscribe(configId: string, subscriber: SseSubscriber): () => void {
    const entry = this.sessions.get(configId)
    if (!entry) {
      console.warn(`[whatsapp-store] subscribe() llamado para configId=${configId} inexistente`)
      return () => { /* noop */ }
    }

    entry.subscribers.add(subscriber)

    // Enviar QR en buffer inmediatamente (el cliente no tiene que esperar)
    if (entry.latestQr) {
      try {
        subscriber({ type: 'qr', data: entry.latestQr })
      } catch (err) {
        console.warn('[whatsapp-store] Error enviando QR buffered:', err)
      }
    }

    // Enviar estado actual también
    try {
      subscriber({ type: 'state', data: entry.adapter.getState() })
    } catch { /* cliente ya desconectado */ }

    return () => {
      entry.subscribers.delete(subscriber)
    }
  }

  /**
   * Desconecta y elimina el adapter de un configId.
   * Envía evento state='closed' a los suscriptores antes de limpiar.
   */
  async remove(configId: string): Promise<void> {
    const entry = this.sessions.get(configId)
    if (!entry) return

    try {
      await entry.adapter.dispose()
    } catch (err) {
      console.error(`[whatsapp-store] Error en dispose para configId=${configId}:`, err)
    }

    // Notificar suscriptores que la sesión cerró
    this.fanOut(configId, { type: 'state', data: 'closed' })

    this.sessions.delete(configId)
    console.info(`[whatsapp-store] Sesión eliminada para configId=${configId}`)
  }

  /**
   * Retorna el estado actual de todas las sesiones activas.
   * Útil para el endpoint GET /status del router.
   */
  getStatus(configId?: string): SessionStatus[] {
    if (configId) {
      const entry = this.sessions.get(configId)
      if (!entry) return []
      return [this.toStatus(configId, entry)]
    }
    return Array.from(this.sessions.entries()).map(([id, e]) => this.toStatus(id, e))
  }

  /**
   * Retorna true si hay una sesión activa para el configId.
   */
  has(configId: string): boolean {
    return this.sessions.has(configId)
  }

  /**
   * Retorna el adapter para un configId, o null si no existe.
   */
  get(configId: string): WhatsAppBaileysAdapter | null {
    return this.sessions.get(configId)?.adapter ?? null
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private fanOut(configId: string, event: SseEvent): void {
    const entry = this.sessions.get(configId)
    if (!entry || entry.subscribers.size === 0) return

    for (const subscriber of entry.subscribers) {
      try {
        subscriber(event)
      } catch (err) {
        // Suscriptor ya desconectado — limpiar
        console.warn('[whatsapp-store] Suscriptor roto, eliminando:', err)
        entry.subscribers.delete(subscriber)
      }
    }
  }

  private toStatus(configId: string, entry: SessionEntry): SessionStatus {
    return {
      configId,
      state:       entry.adapter.getState(),
      hasQr:       entry.latestQr !== null,
      subscribers: entry.subscribers.size,
    }
  }
}

/** Shape del objeto de status por sesión. */
export interface SessionStatus {
  configId:    string
  state:       WhatsAppAdapterState
  hasQr:       boolean
  subscribers: number
}

// ── Singleton ────────────────────────────────────────────────────────────────

/** Instancia única compartida por toda la aplicación gateway. */
export const whatsappSessionStore = new WhatsAppSessionStore()
