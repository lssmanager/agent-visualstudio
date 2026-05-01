/**
 * gateway.service.ts — [F3a-01] Dispatcher central del Gateway
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

import { Injectable }       from '@nestjs/common';
import { createDecipheriv } from 'crypto';
import {
  registry,
  SessionManager,
  type IChannelAdapter,
  type IncomingMessage,
  type OutboundMessage,
} from '@agent-vs/gateway-sdk';
import { AgentRunner }          from '@agent-vs/flow-engine';
import type { RunInput }        from '@agent-vs/flow-engine';
import { PrismaService }        from './prisma/prisma.service';
import { AgentResolverService } from './agent-resolver.service';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface DecryptedChannelConfig {
  id:      string;
  type:    string;
  config:  Record<string, unknown>;
  secrets: Record<string, unknown>;
  /** workspaceId es necesario para AgentRunner.run() */
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// GatewayService
// ---------------------------------------------------------------------------

@Injectable()
export class GatewayService {
  /** Exposed for webchat reply route (needs findSession) */
  readonly sessions:  SessionManager;
  private readonly agentRunner: AgentRunner;
  private readonly configCache = new Map<string, DecryptedChannelConfig>();
  private readonly encKey:      Buffer;

  constructor(
    private readonly db:       PrismaService,
    private readonly resolver: AgentResolverService,
  ) {
    // SessionManager acepta PrismaClient; PrismaService extiende PrismaClient ✔️
    this.sessions    = new SessionManager(db);
    // AgentRunner constructor espera { prisma }, no { db }
    this.agentRunner = new AgentRunner({ prisma: db });

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
    // IChannelAdapter del SDK expone setup(config, secrets) directamente
    await adapter.setup(cfg.config, cfg.secrets);
    console.info(`[GatewayService] channel ${channelConfigId} (${cfg.type}) activated`);
  }

  async deactivateChannel(channelConfigId: string): Promise<void> {
    const cached = this.configCache.get(channelConfigId);
    if (!cached) return;
    const adapter = this.resolveAdapter(cached.type);
    await adapter.teardown(cached.config, cached.secrets).catch((err: unknown) => {
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
   *     → AgentResolverService      resolve agentId via ChannelBinding priority
   *     → SessionManager            upsert GatewaySession, append user turn
   *     → AgentRunner.run()         load Agent+FlowVersion, execute FlowExecutor
   *     → recordReply()             append assistant turn, adapter.send()
   */
  async dispatch(
    channelConfigId: string,
    rawPayload:      Record<string, unknown>,
  ): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId);
    const adapter = this.resolveAdapter(cfg.type);

    // 1. Parse inbound message — IChannelAdapter.receive() firma del SDK
    const incoming = await adapter.receive(rawPayload, cfg.secrets);
    if (!incoming) return;

    // 2. Cargar sesión existente para sticky-session
    const existingSession = await this.sessions.findSession(
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
    //    AgentRunner.run() espera RunInput: { workspaceId, agentId, sessionId, inputData }
    //    El texto del usuario va en inputData.userMessage para que el
    //    nodo LLM lo recoja como contexto de la conversación.
    const runInput: RunInput = {
      workspaceId: cfg.workspaceId,
      agentId:     session.agentId,
      sessionId:   session.sessionId,   // ActiveSession.sessionId (no .id)
      channelKind: cfg.type,
      inputData:   {
        userMessage: incoming.text ?? '',
      },
    };

    let replyText: string;
    try {
      const result = await this.agentRunner.run(runInput);
      replyText =
        (result.output?.['reply'] as string | undefined) ??
        (result.output?.['text']  as string | undefined) ??
        '(sin respuesta)';
      if (result.status === 'failed') {
        console.error('[GatewayService] AgentRunner run failed:', result.error);
        replyText = '(ocurrió un error al procesar tu mensaje)';
      }
    } catch (err) {
      console.error('[GatewayService] AgentRunner threw:', err);
      replyText = '(ocurrió un error al procesar tu mensaje)';
    }

    // 6. Build outbound message
    const outbound: OutboundMessage = {
      externalUserId: incoming.externalUserId,
      text:           replyText,
    };

    // 7. Persist assistant turn + send to channel
    //    session.sessionId es el campo correcto de ActiveSession
    await this.recordReply(channelConfigId, session.sessionId, outbound);
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
    // IChannelAdapter.send(message, config, secrets) — firma del SDK
    await adapter.send(outbound, cfg.config, cfg.secrets);
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
      where:  { id: channelConfigId },
      select: { id: true, type: true, config: true, secretsEncrypted: true, workspaceId: true },
    });

    const secrets = this.decrypt(row.secretsEncrypted as string | null);
    const cfg: DecryptedChannelConfig = {
      id:          row.id,
      type:        row.type,
      config:      (row.config as Record<string, unknown>) ?? {},
      workspaceId: row.workspaceId,
      secrets,
    };
    this.configCache.set(channelConfigId, cfg);
    return cfg;
  }

  private resolveAdapter(type: string): IChannelAdapter {
    // registry.get() lanza si no existe — no necesitamos has() + get()
    if (!registry.has(type)) {
      throw new Error(
        `GatewayService: no adapter registered for channel type '${type}'. ` +
        `Registered: ${registry.registeredTypes().join(', ') || '(none)'}`,
      );
    }
    return registry.get(type);
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
