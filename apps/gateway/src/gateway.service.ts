/**
 * gateway.service.ts — Dispatcher central del Gateway
 *
 * Responsabilidades:
 *   1. Cargar y cachear ChannelConfig desde Prisma
 *   2. Resolver el IChannelAdapter correcto para cada canal
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

import { Injectable }      from '@nestjs/common';
import { createDecipheriv } from 'crypto';
import type { PrismaClient }  from '@prisma/client';
import {
  registry,
  SessionManager,
  type IncomingMessage,
  type OutboundMessage,
} from '@agent-vs/gateway-sdk';
import { AgentRunner }           from '@agent-vs/flow-engine';
import type { IChannelAdapter }  from './channels/channel-adapter.interface';
import { PrismaService }         from './prisma/prisma.service';
import { AgentResolverService }  from './agent-resolver.service';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface DecryptedChannelConfig {
  id:      string;
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

  constructor(
    private readonly db:       PrismaService,
    private readonly resolver: AgentResolverService,
  ) {
    this.sessions    = new SessionManager(db);
    this.agentRunner = new AgentRunner({ db });

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

  async activateChannel(channelConfigId: string): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId);
    const adapter = this.resolveAdapter(cfg.type);
    await (adapter as unknown as {
      setup: (c: Record<string, unknown>, s: Record<string, unknown>) => Promise<void>;
    }).setup(cfg.config, cfg.secrets);
    console.info(`[GatewayService] channel ${channelConfigId} (${cfg.type}) activated`);
  }

  async deactivateChannel(channelConfigId: string): Promise<void> {
    const cached = this.configCache.get(channelConfigId);
    if (!cached) return;
    const adapter = this.resolveAdapter(cached.type);
    await (adapter as unknown as {
      teardown: (c: Record<string, unknown>, s: Record<string, unknown>) => Promise<void>;
    }).teardown(cached.config, cached.secrets).catch((err: unknown) => {
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
   *     → adapter.receive()       parse channel format → IncomingMessage
   *     → AgentResolverService     resolve agentId via ChannelBinding priority
   *     → SessionManager           upsert GatewaySession, append user turn
   *     → AgentRunner.run()        load Agent+FlowVersion, execute FlowExecutor
   *     → recordReply()            append assistant turn, adapter.send()
   */
  async dispatch(
    channelConfigId: string,
    rawPayload:      Record<string, unknown>,
  ): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId);
    const adapter = this.resolveAdapter(cfg.type);

    // 1. Parse inbound message
    const incoming = await (adapter as unknown as {
      receive: (p: Record<string, unknown>, s: Record<string, unknown>) => Promise<IncomingMessage | null>;
    }).receive(rawPayload, cfg.secrets);

    if (!incoming) return;

    // 2. Cargar sesión existente para sticky-session
    const existingSession = await this.findActiveSession(
      channelConfigId,
      incoming.externalUserId,
    );

    // 3. Resolver agente con prioridad de scope
    const resolved = await this.resolver.resolve(
      channelConfigId,
      incoming.externalUserId,
      existingSession?.agentId ?? null,
    );

    // 4. Persist user turn + upsert session
    const session = await this.sessions.receiveUserMessage(
      channelConfigId,
      resolved.agentId,
      incoming,
    );

    // 5. Run agent via FlowExecutor
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

    // 6. Build outbound message
    const outbound: OutboundMessage = {
      externalUserId: incoming.externalUserId,
      text: replyText,
    };

    // 7. Persist assistant turn + send to channel
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
    const cfg     = await this.loadChannelConfig(channelConfigId);
    const adapter = this.resolveAdapter(cfg.type);

    await this.sessions.recordAssistantReply(sessionId, outbound);
    await (adapter as unknown as {
      send: (m: OutboundMessage, c: Record<string, unknown>, s: Record<string, unknown>) => Promise<void>;
    }).send(outbound, cfg.config, cfg.secrets);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Obtiene la sesión activa para un usuario en un canal.
   * Usado para sticky-session: conservar el agentId de sesiones en curso.
   */
  private async findActiveSession(
    channelConfigId: string,
    externalUserId:  string,
  ): Promise<{ id: string; agentId: string } | null> {
    return this.db.gatewaySession.findFirst({
      where: { channelConfigId, externalUserId, state: 'active' },
      select: { id: true, agentId: true },
    })
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
      id:     row.id,
      type:   row.type,
      config: (row.config as Record<string, unknown>) ?? {},
      secrets,
    };
    this.configCache.set(channelConfigId, cfg);
    return cfg;
  }

  private resolveAdapter(type: string): IChannelAdapter {
    if (registry.has(type)) {
      return registry.get(type) as unknown as IChannelAdapter;
    }
    throw new Error(
      `GatewayService: no adapter registered for channel type '${type}'. ` +
      `Registered: ${registry.registeredTypes().join(', ') || '(none)'}`,
    );
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
