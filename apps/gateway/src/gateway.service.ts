/**
 * gateway.service.ts — Dispatcher central del Gateway
 *
 * Responsabilidades:
 *   1. Cargar y cachear ChannelConfig desde Prisma
 *   2. Resolver el IChannelAdapter correcto para cada canal
 *   3. Coordinar receive() → SessionManager → FlowEngine
 *   4. Coordinar FlowEngine reply → SessionManager → adapter.send()
 *   5. Ciclo de vida: activateChannel() / deactivateChannel()
 *
 * Encriptación de secretos:
 *   ChannelConfig.secretsEncrypted: JSON encriptado con AES-256-GCM.
 *   Llave: GATEWAY_ENCRYPTION_KEY (hex 64 chars = 32 bytes).
 *   Formato del buffer encriptado:
 *     [12 bytes IV][16 bytes auth tag][N bytes ciphertext]
 *
 * Integración con FlowEngine:
 *   Por ahora el dispatch() llama a _runAgent() que es un stub.
 *   La integración real con packages/flow-engine se hace en la siguiente fase.
 */

import { createDecipheriv } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  registry,
  SessionManager,
  type IncomingMessage,
  type OutboundMessage,
} from '@agent-vs/gateway-sdk';
import type { IChannelAdapter } from './channels/channel-adapter.interface';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface DecryptedChannelConfig {
  id:      string;
  agentId: string;
  type:    string;
  config:  Record<string, unknown>;
  secrets: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// GatewayService
// ---------------------------------------------------------------------------

export class GatewayService {
  private readonly sessions:    SessionManager;
  private readonly configCache  = new Map<string, DecryptedChannelConfig>();
  private readonly encKey:      Buffer;

  constructor(private readonly db: PrismaClient) {
    this.sessions = new SessionManager(db);

    const keyHex = process.env.GATEWAY_ENCRYPTION_KEY ?? '';
    if (!keyHex) {
      console.warn(
        '[GatewayService] GATEWAY_ENCRYPTION_KEY not set — secrets decryption disabled',
      );
    }
    this.encKey = Buffer.from(keyHex || '0'.repeat(64), 'hex');
  }

  // -------------------------------------------------------------------------
  // Public: lifecycle
  // -------------------------------------------------------------------------

  /**
   * Load a ChannelConfig from DB, decrypt secrets, call adapter.setup().
   * Idempotent — safe to call on every gateway restart.
   */
  async activateChannel(channelConfigId: string): Promise<void> {
    const cfg = await this.loadChannelConfig(channelConfigId);
    const adapter = this.resolveAdapter(cfg.type);
    await (adapter as unknown as { setup: (c: Record<string, unknown>, s: Record<string, unknown>) => Promise<void> })
      .setup(cfg.config, cfg.secrets)
      .catch((err: unknown) => {
        console.error(`[GatewayService] setup failed for channel ${channelConfigId}:`, err);
        throw err;
      });
    console.info(`[GatewayService] channel ${channelConfigId} (${cfg.type}) activated`);
  }

  /**
   * Call adapter.teardown() and remove from cache.
   */
  async deactivateChannel(channelConfigId: string): Promise<void> {
    const cached = this.configCache.get(channelConfigId);
    if (!cached) return;
    const adapter = this.resolveAdapter(cached.type);
    await (adapter as unknown as { teardown: (c: Record<string, unknown>, s: Record<string, unknown>) => Promise<void> })
      .teardown(cached.config, cached.secrets)
      .catch((err: unknown) => {
        console.warn(`[GatewayService] teardown error for channel ${channelConfigId}:`, err);
      });
    this.configCache.delete(channelConfigId);
    console.info(`[GatewayService] channel ${channelConfigId} deactivated`);
  }

  // -------------------------------------------------------------------------
  // Public: message flow
  // -------------------------------------------------------------------------

  /**
   * Entry point for every inbound webhook.
   *
   * Flow:
   *   rawPayload
   *     → adapter.receive()        parse channel format → IncomingMessage
   *     → SessionManager           upsert GatewaySession, append to history
   *     → _runAgent()              stub → real FlowEngine in next phase
   *     → recordReply()            append assistant reply, adapter.send()
   */
  async dispatch(
    channelConfigId: string,
    rawPayload:      Record<string, unknown>,
  ): Promise<void> {
    const cfg = await this.loadChannelConfig(channelConfigId);
    const adapter = this.resolveAdapter(cfg.type);

    // 1. Parse
    const incoming = await (adapter as unknown as {
      receive: (p: Record<string, unknown>, s: Record<string, unknown>) => Promise<IncomingMessage | null>;
    }).receive(rawPayload, cfg.secrets);

    if (!incoming) return; // ignored update type (e.g. Telegram bot status)

    // 2. Persist user turn
    const session = await this.sessions.receiveUserMessage(
      channelConfigId,
      cfg.agentId,
      incoming,
    );

    // 3. Run agent (stub — will be replaced by FlowEngine.run())
    const replyText = await this._runAgent(session.agentId, session.history);

    // 4. Build outbound message
    const outbound: OutboundMessage = {
      externalUserId: incoming.externalUserId,
      text: replyText,
    };

    // 5. Record assistant reply + send
    await this.recordReply(channelConfigId, session.id, outbound);
  }

  /**
   * Called by the internal /api/webchat/:channelId/reply endpoint
   * (agent → browser push).
   */
  async recordReply(
    channelConfigId: string,
    sessionId:       string,
    outbound:        OutboundMessage,
  ): Promise<void> {
    const cfg = await this.loadChannelConfig(channelConfigId);
    const adapter = this.resolveAdapter(cfg.type);

    await this.sessions.recordAssistantReply(sessionId, outbound);
    await (adapter as unknown as {
      send: (m: OutboundMessage, c: Record<string, unknown>, s: Record<string, unknown>) => Promise<void>;
    }).send(outbound, cfg.config, cfg.secrets);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async loadChannelConfig(
    channelConfigId: string,
  ): Promise<DecryptedChannelConfig> {
    const cached = this.configCache.get(channelConfigId);
    if (cached) return cached;

    const row = await this.db.channelConfig.findUniqueOrThrow({
      where: { id: channelConfigId },
    });

    const secrets = this.decrypt(row.secretsEncrypted as string | null);
    const cfg: DecryptedChannelConfig = {
      id:      row.id,
      agentId: row.agentId,
      type:    row.type,
      config:  (row.config as Record<string, unknown>) ?? {},
      secrets,
    };
    this.configCache.set(channelConfigId, cfg);
    return cfg;
  }

  private resolveAdapter(type: string): IChannelAdapter {
    // First look in the gateway-sdk registry (TelegramAdapter, WebChatAdapter)
    if (registry.has(type)) {
      return registry.get(type) as unknown as IChannelAdapter;
    }
    throw new Error(
      `GatewayService: no adapter registered for channel type '${type}'. ` +
      `Registered: ${registry.registeredTypes().join(', ') || '(none)'}`,
    );
  }

  /**
   * Decrypt AES-256-GCM secrets.
   * Format: hex-encoded [12B IV][16B auth tag][N B ciphertext]
   * Returns empty object if secretsEncrypted is null/empty or key is zeroed.
   */
  private decrypt(secretsEncrypted: string | null): Record<string, unknown> {
    if (!secretsEncrypted) return {};
    try {
      const buf      = Buffer.from(secretsEncrypted, 'hex');
      const iv       = buf.subarray(0, 12);
      const authTag  = buf.subarray(12, 28);
      const cipher   = buf.subarray(28);

      const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(cipher), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
    } catch (err) {
      console.error('[GatewayService] Failed to decrypt secrets:', err);
      return {};
    }
  }

  /**
   * Stub: run the bound agent and return its reply.
   * TODO: replace with FlowEngine.run(agentId, history) in Phase 3.
   */
  private async _runAgent(
    agentId: string,
    history: Array<{ role: string; content: string; ts: string }>,
  ): Promise<string> {
    void agentId;
    void history;
    // Placeholder response until FlowEngine is wired
    return '(agent response — FlowEngine not yet connected)';
  }
}
