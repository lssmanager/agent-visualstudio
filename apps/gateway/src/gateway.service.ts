/**
 * gateway.service.ts — Dispatcher central del Gateway
 *
 * Responsabilidades:
 *   1. Cargar y cachear ChannelConfig desde Prisma
 *   2. Delegar el ciclo de vida de canales al ChannelRouter [F3a-08]
 *   3. Coordinar receive() → SessionManager → AgentRunner → FlowExecutor
 *   4. Coordinar FlowEngine reply → SessionManager → adapter.send()
 *   5. Ciclo de vida: activateChannel() / deactivateChannel()
 *
 * Encriptación de secretos:
 *   ChannelConfig.secretsEncrypted: JSON encriptado con AES-256-GCM.
 *   Llave: GATEWAY_ENCRYPTION_KEY (hex 64 chars = 32 bytes).
 *   Formato del buffer encriptado:
 *     [12 bytes IV][16 bytes auth tag][N bytes ciphertext]
 */

import { Injectable }       from '@nestjs/common';
import { createDecipheriv } from 'crypto';
import type { PrismaClient }  from '@prisma/client';
import {
  SessionManager,
  type IncomingMessage,
  type OutboundMessage,
} from '@agent-vs/gateway-sdk';
import { AgentRunner }        from '@agent-vs/flow-engine';
import { PrismaService }       from './prisma/prisma.service';
import { ChannelRouter }       from './channel-router.service';

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

@Injectable()
export class GatewayService {
  /** Exposed for webchat reply route (needs findSession) */
  readonly sessions:    SessionManager;
  private readonly agentRunner:   AgentRunner;
  private readonly configCache  = new Map<string, DecryptedChannelConfig>();
  private readonly encKey:       Buffer;
  /** [F3a-08] Router de canales — gestiona el ciclo de vida de adapters */
  private readonly channelRouter: ChannelRouter;

  constructor(private readonly db: PrismaService) {
    this.sessions      = new SessionManager(db);
    this.agentRunner   = new AgentRunner({ db });
    this.channelRouter = new ChannelRouter();

    const keyHex = process.env.GATEWAY_ENCRYPTION_KEY ?? '';
    if (!keyHex) {
      console.warn(
        '[GatewayService] GATEWAY_ENCRYPTION_KEY not set — secrets decryption disabled',
      );
    }
    this.encKey = Buffer.from(keyHex || '0'.repeat(64), 'hex');
  }

  // -------------------------------------------------------------------------
  // Public: lifecycle — delegado al ChannelRouter [F3a-08]
  // -------------------------------------------------------------------------

  async activateChannel(channelConfigId: string): Promise<void> {
    const cfg = await this.loadChannelConfig(channelConfigId);

    await this.channelRouter.activate(
      {
        id:               cfg.id,
        channel:          cfg.type,
        active:           true,
        secretsEncrypted: null, // ya desencriptado en configCache
      },
      (msg: IncomingMessage) => this.handleIncoming(channelConfigId, msg),
    );

    console.info(`[GatewayService] channel ${channelConfigId} (${cfg.type}) activated`);
  }

  async deactivateChannel(channelConfigId: string): Promise<void> {
    await this.channelRouter.deactivate(channelConfigId, 'manual');
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
   *     → adapter.receive()       parse channel format → IncomingMessage
   *     → SessionManager           upsert GatewaySession, append user turn
   *     → AgentRunner.run()        load Agent+FlowVersion, execute FlowExecutor
   *     → recordReply()            append assistant turn, adapter.send()
   */
  async dispatch(
    channelConfigId: string,
    rawPayload:      Record<string, unknown>,
  ): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId);
    const adapter = this.channelRouter.getAdapter(channelConfigId);

    if (!adapter) {
      console.warn(
        `[GatewayService] dispatch called for inactive channel ${channelConfigId} — activating on demand`,
      );
      await this.activateChannel(channelConfigId);
    }

    const activeAdapter = this.channelRouter.getAdapter(channelConfigId);
    if (!activeAdapter) {
      throw new Error(`[GatewayService] could not activate adapter for channel ${channelConfigId}`);
    }

    // 1. Parse inbound message
    const incoming = await (activeAdapter as unknown as {
      receive: (p: Record<string, unknown>, s: Record<string, unknown>) => Promise<IncomingMessage | null>;
    }).receive(rawPayload, cfg.secrets);

    if (!incoming) return;

    // 2. Persist user turn + upsert session
    const session = await this.sessions.receiveUserMessage(
      channelConfigId,
      cfg.agentId,
      incoming,
    );

    // 3. Run agent via FlowExecutor
    let replyText: string;
    try {
      const result = await this.agentRunner.run(
        session.agentId,
        session.history,
      );
      replyText = result.reply || '(sin respuesta)';
    } catch (err) {
      console.error('[GatewayService] AgentRunner error:', err);
      replyText = '(ocurrió un error al procesar tu mensaje)';
    }

    // 4. Build outbound message
    const outbound: OutboundMessage = {
      externalUserId: incoming.externalUserId,
      text: replyText,
    };

    // 5. Persist assistant turn + send to channel
    await this.recordReply(channelConfigId, session.id, outbound);
  }

  /**
   * Called by the internal /api/webchat/:channelId/reply endpoint.
   */
  async recordReply(
    channelConfigId: string,
    sessionId:       string,
    outbound:        OutboundMessage,
  ): Promise<void> {
    const cfg = await this.loadChannelConfig(channelConfigId);

    // [F3a-08] Usar adapter del ChannelRouter en lugar de resolveAdapter()
    const adapter = this.channelRouter.getAdapter(channelConfigId);
    if (!adapter) {
      throw new Error(`[GatewayService] no active adapter for channel ${channelConfigId}`);
    }

    await this.sessions.recordAssistantReply(sessionId, outbound);
    await (adapter as unknown as {
      send: (m: OutboundMessage, c: Record<string, unknown>, s: Record<string, unknown>) => Promise<void>;
    }).send(outbound, cfg.config, cfg.secrets);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Handler interno conectado a cada adapter vía channelRouter.activate() */
  private async handleIncoming(
    channelConfigId: string,
    incoming:        IncomingMessage,
  ): Promise<void> {
    const cfg = await this.loadChannelConfig(channelConfigId);
    const session = await this.sessions.receiveUserMessage(
      channelConfigId,
      cfg.agentId,
      incoming,
    );

    let replyText: string;
    try {
      const result = await this.agentRunner.run(session.agentId, session.history);
      replyText = result.reply || '(sin respuesta)';
    } catch (err) {
      console.error('[GatewayService] AgentRunner error in handleIncoming:', err);
      replyText = '(ocurrió un error al procesar tu mensaje)';
    }

    const outbound: OutboundMessage = {
      externalUserId: incoming.externalUserId,
      text: replyText,
    };
    await this.recordReply(channelConfigId, session.id, outbound);
  }

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

  private decrypt(secretsEncrypted: string | null): Record<string, unknown> {
    if (!secretsEncrypted) return {};
    try {
      const buf     = Buffer.from(secretsEncrypted, 'hex');
      const iv      = buf.subarray(0, 12);
      const authTag = buf.subarray(12, 28);
      const cipher  = buf.subarray(28);

      const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(cipher), decipher.final()]);
      return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
    } catch (err) {
      console.error('[GatewayService] Failed to decrypt secrets:', err);
      return {};
    }
  }
}
