/**
 * whatsapp-session.store.ts — [F3a-22]
 *
 * Persiste en memoria la sesión WhatsApp por configId.
 * Cada entrada guarda:
 *   - adapter   : instancia activa del WhatsAppBaileysAdapter
 *   - qrBuffer  : último QR recibido (PNG base64 data-url o cadena qr raw)
 *   - status    : 'connecting' | 'qr_ready' | 'connected' | 'disconnected' | 'error'
 *   - sseClients: lista de Response (SSE) suscritos al QR de este configId
 *
 * El store es un singleton exportado — todos los routers comparten la
 * misma instancia sin necesidad de inyección de dependencias.
 */

import type { Response } from 'express'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type WhatsAppSessionStatus =
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'disconnected'
  | 'error'

/**
 * Contrato mínimo que debe cumplir el adapter para ser almacenado.
 * Evita importar WhatsAppBaileysAdapter directamente y crear
 * dependencias circulares — el adapter real se pasa en tiempo de ejecución.
 */
export interface IWhatsAppAdapter {
  readonly channel: string
  onQr?: (handler: (qr: string) => void) => void
  onConnected?: (handler: () => void) => void
  onDisconnected?: (handler: () => void) => void
  dispose(): Promise<void>
}

interface SessionEntry {
  adapter?:   IWhatsAppAdapter
  qrBuffer:   string | null        // data-url PNG o cadena QR raw
  status:     WhatsAppSessionStatus
  sseClients: Set<Response>        // clientes SSE activos suscritos al QR
}

// ── Store ────────────────────────────────────────────────────────────────────

class WhatsAppSessionStore {
  private readonly sessions = new Map<string, SessionEntry>()

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * Recupera la sesión existente o crea una nueva entrada vacía.
   * El adapter se registra después con setAdapter().
   */
  getOrCreate(configId: string): SessionEntry {
    if (!this.sessions.has(configId)) {
      this.sessions.set(configId, {
        qrBuffer:   null,
        status:     'disconnected',
        sseClients: new Set(),
      })
    }
    return this.sessions.get(configId)!
  }

  get(configId: string): SessionEntry | undefined {
    return this.sessions.get(configId)
  }

  has(configId: string): boolean {
    return this.sessions.has(configId)
  }

  /**
   * Registra el adapter activo para un configId.
   * Crea la entrada si no existe y marca la sesión como reservada.
   */
  setAdapter(configId: string, adapter: IWhatsAppAdapter): void {
    const entry = this.getOrCreate(configId)
    entry.adapter = adapter
    entry.status = 'connecting'
  }

  /**
   * Guarda el QR más reciente y notifica a todos los clientes SSE suscritos.
   */
  setQr(configId: string, qr: string): void {
    const entry = this.sessions.get(configId)
    if (!entry) return
    entry.qrBuffer = qr
    entry.status   = 'qr_ready'
    this.broadcastSse(entry, { event: 'qr', data: qr })
  }

  /**
   * Actualiza el estado de la sesión y notifica a los clientes SSE.
   */
  setStatus(configId: string, status: WhatsAppSessionStatus): void {
    const entry = this.sessions.get(configId)
    if (!entry) return
    entry.status = status
    if (status === 'connected') {
      entry.qrBuffer = null   // QR ya no es relevante
    }
    this.broadcastSse(entry, { event: 'status', data: status })
  }

  /**
   * Elimina la sesión del store.
   * Cierra todos los streams SSE pendientes antes de borrar.
   */
  remove(configId: string): void {
    const entry = this.sessions.get(configId)
    if (!entry) return
    for (const client of entry.sseClients) {
      try { client.end() } catch { /* ya cerrado */ }
    }
    entry.sseClients.clear()
    this.sessions.delete(configId)
  }

  // ── SSE client management ─────────────────────────────────────────────────

  /**
   * Registra un cliente SSE (Response de Express) para recibir
   * eventos QR y de estado de este configId.
   *
   * Si ya hay un QR en buffer, lo envía inmediatamente para que
   * el cliente no tenga que esperar al siguiente ciclo.
   */
  addSseClient(configId: string, res: Response): void {
    const entry = this.getOrCreate(configId)
    entry.sseClients.add(res)

    // Enviar estado e QR actuales de inmediato
    this.sendSseEvent(res, { event: 'status', data: entry.status })
    if (entry.qrBuffer) {
      this.sendSseEvent(res, { event: 'qr', data: entry.qrBuffer })
    }

    // Limpiar al cerrar la conexión
    res.on('close', () => {
      entry.sseClients.delete(res)
    })
  }

  // ── Helpers SSE ───────────────────────────────────────────────────────────

  private broadcastSse(
    entry: SessionEntry,
    payload: { event: string; data: string },
  ): void {
    for (const client of entry.sseClients) {
      this.sendSseEvent(client, payload)
    }
  }

  private sendSseEvent(
    res:     Response,
    payload: { event: string; data: string },
  ): void {
    try {
      res.write(`event: ${payload.event}\ndata: ${payload.data}\n\n`)
    } catch {
      /* cliente ya desconectado — se limpiará en el handler 'close' */
    }
  }

  // ── Debug ─────────────────────────────────────────────────────────────────

  /** Lista de configIds activos en el store (útil para health/debug). */
  activeSessions(): string[] {
    return [...this.sessions.entries()]
      .filter(([, entry]) => !!entry.adapter)
      .map(([configId]) => configId)
  }
}

// Singleton exportado
export const whatsappSessionStore = new WhatsAppSessionStore()
