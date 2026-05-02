/**
 * whatsapp-session.store.ts — F3a-30 (actualizado con JSDoc completo)
 *
 * Store en memoria para sesiones WhatsApp Baileys.
 * Exporta la clase (para typing en DI) y el singleton whatsappSessionStore.
 *
 * FIX #177: getOrCreate() usa Map<string, Promise<SessionEntry>> como lock
 * para prevenir la race condition TOCTOU donde dos requests simultáneos para
 * el mismo configId crean entradas duplicadas o inicializan el adapter dos veces.
 *
 * @example
 * // En WhatsAppBaileysAdapter:
 * const entry = await whatsappSessionStore.getOrCreate(channelConfigId);
 * entry.adapter = baileysAdapter;
 */

import type { Response } from 'express';

export type WhatsAppSessionStatus =
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface IWhatsAppAdapter {
  readonly channel: string;
  state?:         string;
  onQr?:          (handler: (qr: string) => void) => void;
  onConnected?:   (handler: () => void) => void;
  onDisconnected?:(handler: () => void) => void;
  logout?:        () => Promise<void>;
  dispose():      Promise<void>;
}

export interface SessionEntry {
  adapter:    IWhatsAppAdapter;
  qrBuffer:   string | null;
  status:     WhatsAppSessionStatus;
  sseClients: Set<Response>;
}

/**
 * Store en memoria para sesiones WhatsApp Baileys.
 * Thread-safe para creaciones concurrentes vía Map de Promises (_creationLocks).
 *
 * Ciclo de vida de una sesión:
 *   1. getOrCreate()     → crea entrada con status 'disconnected'
 *   2. setAdapter()      → asigna el adapter Baileys
 *   3. setStatus()       → transición: 'connecting' → 'qr_ready' → 'connected'
 *   4. destroy()/remove()→ limpieza y cierre de SSE clients
 */
export class WhatsAppSessionStore {
  private readonly sessions       = new Map<string, SessionEntry>();
  /** FIX #177: lock de creaciones en curso para prevenir race conditions */
  private readonly _creationLocks = new Map<string, Promise<SessionEntry>>();

  /**
   * Devuelve la sesión existente o crea una nueva de forma thread-safe.
   *
   * Si dos llamadas concurrentes llegan con el mismo configId mientras la
   * entrada aún no existe, ambas reciben la misma Promise — la creación
   * solo ocurre una vez (fix #177).
   *
   * @param configId  ID del ChannelConfig (clave de la sesión)
   * @returns         La SessionEntry creada o existente
   */
  async getOrCreate(configId: string): Promise<SessionEntry> {
    // Fast path: ya existe
    const existing = this.sessions.get(configId);
    if (existing) return existing;

    // Lock path: si hay una creación en curso, devolver la misma Promise
    const inFlight = this._creationLocks.get(configId);
    if (inFlight) return inFlight;

    // Crear la entrada y registrar el lock
    const creation = Promise.resolve().then(() => {
      // Double-check tras await (otro contexto pudo haber completado)
      if (!this.sessions.has(configId)) {
        this.sessions.set(configId, {
          adapter:    null as unknown as IWhatsAppAdapter,
          qrBuffer:   null,
          status:     'disconnected',
          sseClients: new Set(),
        });
      }
      this._creationLocks.delete(configId);
      return this.sessions.get(configId)!;
    });

    this._creationLocks.set(configId, creation);
    return creation;
  }

  /**
   * Devuelve la sesión si existe, sin crearla.
   *
   * @param configId  ID del ChannelConfig
   */
  get(configId: string): SessionEntry | undefined {
    return this.sessions.get(configId);
  }

  /**
   * Devuelve true si la sesión existe en el store.
   *
   * @param configId  ID del ChannelConfig
   */
  has(configId: string): boolean {
    return this.sessions.has(configId);
  }

  /**
   * Asigna el adapter Baileys a la sesión, creándola si no existe.
   *
   * @param configId  ID del ChannelConfig
   * @param adapter   Instancia del adapter Baileys
   */
  async setAdapter(configId: string, adapter: IWhatsAppAdapter): Promise<void> {
    const entry  = await this.getOrCreate(configId);
    entry.adapter = adapter;
  }

  /**
   * Actualiza el QR buffer y notifica a los clientes SSE.
   *
   * @param configId  ID del ChannelConfig
   * @param qr        Código QR en formato base64 o string
   */
  setQr(configId: string, qr: string): void {
    const entry = this.sessions.get(configId);
    if (!entry) return;
    entry.qrBuffer = qr;
    entry.status   = 'qr_ready';
    this.broadcastSse(entry, { event: 'qr', data: qr });
  }

  /**
   * Actualiza el status de la sesión y notifica a los clientes SSE.
   * Si el status es 'connected', limpia el qrBuffer.
   *
   * @param configId  ID del ChannelConfig
   * @param status    Nuevo estado de la sesión
   */
  setStatus(configId: string, status: WhatsAppSessionStatus): void {
    const entry = this.sessions.get(configId);
    if (!entry) return;
    entry.status = status;
    if (status === 'connected') entry.qrBuffer = null;
    this.broadcastSse(entry, { event: 'status', data: status });
  }

  /**
   * Elimina la sesión del store y cierra todos los clientes SSE.
   *
   * @param configId  ID del ChannelConfig
   */
  remove(configId: string): void {
    const entry = this.sessions.get(configId);
    if (!entry) return;
    for (const client of entry.sseClients) {
      try { client.end(); } catch { /* ignore */ }
    }
    entry.sseClients.clear();
    this.sessions.delete(configId);
    this._creationLocks.delete(configId);
  }

  /**
   * Alias semántico de remove() para el flujo de deprovision.
   * Emite un log explícito antes de eliminar.
   *
   * @param configId  ID del ChannelConfig
   */
  destroy(configId: string): void {
    console.info(`[wa-session-store] Destroying session: ${configId}`);
    this.remove(configId);
  }

  /**
   * Registra un cliente SSE para recibir eventos de QR y status.
   * Envía el estado actual inmediatamente al conectar.
   *
   * @param configId  ID del ChannelConfig
   * @param res       Objeto Response de Express configurado para SSE
   */
  async addSseClient(configId: string, res: Response): Promise<void> {
    const entry = await this.getOrCreate(configId);
    entry.sseClients.add(res);
    this.sendSseEvent(res, { event: 'status', data: entry.status });
    if (entry.qrBuffer) {
      this.sendSseEvent(res, { event: 'qr', data: entry.qrBuffer });
    }
    res.on('close', () => { entry.sseClients.delete(res); });
  }

  /**
   * Devuelve los IDs de todas las sesiones activas en el store.
   */
  activeSessions(): string[] {
    return [...this.sessions.keys()];
  }

  /**
   * Número de creaciones en curso (para diagnóstico y tests).
   */
  get pendingCreations(): number {
    return this._creationLocks.size;
  }

  // ---------------------------------------------------------------------------
  // Privados
  // ---------------------------------------------------------------------------

  private broadcastSse(
    entry:   SessionEntry,
    payload: { event: string; data: string },
  ): void {
    for (const client of entry.sseClients) {
      this.sendSseEvent(client, payload);
    }
  }

  private sendSseEvent(
    res:     Response,
    payload: { event: string; data: string },
  ): void {
    try {
      res.write(`event: ${payload.event}\ndata: ${payload.data}\n\n`);
    } catch { /* ignore — client desconectado */ }
  }
}

/** Tipo exportado para inyección en WhatsAppDeprovisionService y tests */
export type WhatsAppSessionStore_t = WhatsAppSessionStore;

/** Singleton global del store de sesiones WhatsApp */
export const whatsappSessionStore = new WhatsAppSessionStore();
