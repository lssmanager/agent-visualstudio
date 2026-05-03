/**
 * whatsapp-session.store.ts — F3a-30 (F5-01: migrado a PrismaService)
 *
 * Store de sesiones WhatsApp Baileys con persistencia en Prisma.
 * Las credenciales Baileys se guardan en GatewaySession.metadata (JSON)
 * en lugar de makeInMemoryStore o archivos en disco (regla D-22b).
 *
 * FIX #177: getOrCreate() usa Map<string, Promise<SessionEntry>> como lock
 * para prevenir la race condition TOCTOU donde dos requests simultáneos para
 * el mismo configId crean entradas duplicadas o inicializan el adapter dos veces.
 */

import type { Response }  from 'express';
import type { PrismaService } from './prisma/prisma.service.js';

export type WhatsAppSessionStatus =
  | 'connecting'
  | 'qr_ready'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface IWhatsAppAdapter {
  readonly channel: string;
  state?:          string;
  onQr?:           (handler: (qr: string) => void) => void;
  onConnected?:    (handler: () => void) => void;
  onDisconnected?: (handler: () => void) => void;
  logout?:         () => Promise<void>;
  dispose():       Promise<void>;
}

export interface SessionEntry {
  adapter:    IWhatsAppAdapter;
  qrBuffer:   string | null;
  status:     WhatsAppSessionStatus;
  sseClients: Set<Response>;
}

/**
 * Store de sesiones WhatsApp Baileys con persistencia en GatewaySession (Prisma).
 *
 * Las credenciales Baileys se serializan como JSON y se guardan en
 * GatewaySession.metadata para sobrevivir reinicios del proceso (D-22b).
 *
 * El estado en memoria (qrBuffer, sseClients) sigue siendo efímero por diseño —
 * el QR se regenera en cada reconexión.
 */
export class WhatsAppSessionStore {
  private readonly sessions       = new Map<string, SessionEntry>();
  private readonly _creationLocks = new Map<string, Promise<SessionEntry>>();

  constructor(private readonly prisma?: PrismaService) {}

  // ── Persistencia Prisma (D-22b) ────────────────────────────────────────────

  /**
   * Persiste las credenciales Baileys en GatewaySession.metadata.
   * Llamado por saveCreds() de Baileys cada vez que las credenciales cambian.
   */
  async saveCredentials(
    channelConfigId: string,
    creds: Record<string, unknown>,
  ): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.gatewaySession.upsert({
      where:  { channelConfigId },
      create: {
        channelConfigId,
        metadata: JSON.stringify(creds),
        status:   'connecting',
      },
      update: {
        metadata:  JSON.stringify(creds),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Carga las credenciales Baileys desde GatewaySession.metadata.
   * Devuelve null si no existe sesión previa (primer login → generará QR).
   */
  async loadCredentials(
    channelConfigId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.prisma) return null;
    const session = await this.prisma.gatewaySession.findUnique({
      where: { channelConfigId },
    });
    if (!session?.metadata) return null;
    try {
      return JSON.parse(session.metadata as string) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Marca la sesión como closed en BD (disconnect limpio).
   */
  async markClosed(channelConfigId: string): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.gatewaySession.update({
      where:  { channelConfigId },
      data:   { status: 'closed', updatedAt: new Date() },
    }).catch(() => { /* no existe → ignorar */ });
  }

  // ── Store en memoria (estado efímero) ──────────────────────────────────────

  async getOrCreate(configId: string): Promise<SessionEntry> {
    const existing = this.sessions.get(configId);
    if (existing) return existing;

    const inFlight = this._creationLocks.get(configId);
    if (inFlight) return inFlight;

    const creation = Promise.resolve().then(() => {
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

  get(configId: string): SessionEntry | undefined {
    return this.sessions.get(configId);
  }

  has(configId: string): boolean {
    return this.sessions.has(configId);
  }

  async setAdapter(configId: string, adapter: IWhatsAppAdapter): Promise<void> {
    const entry  = await this.getOrCreate(configId);
    entry.adapter = adapter;
  }

  setQr(configId: string, qr: string): void {
    const entry = this.sessions.get(configId);
    if (!entry) return;
    entry.qrBuffer = qr;
    entry.status   = 'qr_ready';
    this.broadcastSse(entry, { event: 'qr', data: qr });
  }

  setStatus(configId: string, status: WhatsAppSessionStatus): void {
    const entry = this.sessions.get(configId);
    if (!entry) return;
    entry.status = status;
    if (status === 'connected') entry.qrBuffer = null;
    this.broadcastSse(entry, { event: 'status', data: status });
  }

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

  destroy(configId: string): void {
    console.info(`[wa-session-store] Destroying session: ${configId}`);
    this.remove(configId);
  }

  async addSseClient(configId: string, res: Response): Promise<void> {
    const entry = await this.getOrCreate(configId);
    entry.sseClients.add(res);
    this.sendSseEvent(res, { event: 'status', data: entry.status });
    if (entry.qrBuffer) {
      this.sendSseEvent(res, { event: 'qr', data: entry.qrBuffer });
    }
    res.on('close', () => { entry.sseClients.delete(res); });
  }

  activeSessions(): string[] {
    return [...this.sessions.keys()];
  }

  get pendingCreations(): number {
    return this._creationLocks.size;
  }

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

export type WhatsAppSessionStore_t = WhatsAppSessionStore;

/** Singleton global — prisma se inyecta en GatewayModule via setGlobalPrisma() */
export const whatsappSessionStore = new WhatsAppSessionStore();

/**
 * Inyecta PrismaService en el singleton global.
 * Llamado desde GatewayModule.onModuleInit().
 */
export function setGlobalWhatsAppSessionStorePrisma(prisma: PrismaService): void {
  (whatsappSessionStore as unknown as { prisma: PrismaService }).prisma = prisma;
}
