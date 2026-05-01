import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import {
  registry,
  SessionManager,
  type IncomingMessage as SessionIncomingMessage,
  type OutboundMessage as SessionOutboundMessage,
} from '@agent-vs/gateway-sdk'
import type {
  IncomingMessage,
  OutgoingMessage,
} from './channels/channel-adapter.interface.js'

/**
 * GatewayService — orquesta recepción, procesamiento y envío de mensajes.
 * [F3a-17] dispatch() usa replyFn fast path cuando está disponible.
 */
@Injectable()
export class GatewayService {
  public readonly sessions: SessionManager
  private readonly agentRunner: { run(agentId: string, history: unknown[]): Promise<{ reply?: string }> }

  constructor(
    dbOrSessions: PrismaClient | SessionManager,
    agentRunner?: { run(agentId: string, history: unknown[]): Promise<{ reply?: string }> },
  ) {
    this.sessions = dbOrSessions instanceof SessionManager
      ? dbOrSessions
      : new SessionManager(dbOrSessions)
    this.agentRunner = agentRunner ?? {
      async run() {
        return { reply: '(sin respuesta)' }
      },
    }
  }

  // ── Helpers privados ────────────────────────────────────────────────────

  private async loadChannelConfig(channelConfigId: string) {
    const cfg = await registry.getChannelConfig(channelConfigId)
    if (!cfg) throw new Error(`ChannelConfig not found: ${channelConfigId}`)
    return cfg
  }

  private resolveAdapter(channelType: string) {
    const adapter = registry.get(channelType)
    if (!adapter) throw new Error(`No adapter registered for channel type: ${channelType}`)
    return adapter
  }

  async activateChannel(channelConfigId: string): Promise<void> {
    const cfg = await this.loadChannelConfig(channelConfigId)
    const adapter = this.resolveAdapter(cfg.type) as unknown as {
      setup?: (config: Record<string, unknown>, secrets: Record<string, unknown>) => Promise<void>
      initialize?: (channelConfigId: string) => Promise<void>
    }

    if (typeof adapter.setup === 'function') {
      await adapter.setup(cfg.config, cfg.secrets)
      return
    }

    if (typeof adapter.initialize === 'function') {
      await adapter.initialize(channelConfigId)
      return
    }

    throw new Error(`Adapter for channel type "${cfg.type}" does not support activation`)
  }

  async deactivateChannel(channelConfigId: string): Promise<void> {
    const cfg = await this.loadChannelConfig(channelConfigId)
    const adapter = this.resolveAdapter(cfg.type) as unknown as {
      teardown?: () => Promise<void>
      dispose?: () => Promise<void>
    }

    if (typeof adapter.teardown === 'function') {
      await adapter.teardown()
      return
    }

    if (typeof adapter.dispose === 'function') {
      await adapter.dispose()
      return
    }

    throw new Error(`Adapter for channel type "${cfg.type}" does not support deactivation`)
  }

  // ── dispatch() ──────────────────────────────────────────────────────────

  /**
   * Procesa un mensaje entrante de un canal.
   *
   * [F3a-17] Fast path: si incoming.replyFn está definida, la usamos
   * directamente para responder in-band (crítico para canales con timeout
   * de webhook como Telegram/WhatsApp, que requieren reply en ≤30s).
   *
   * Legacy path: si replyFn es undefined, usa la ruta antigua a través
   * de recordReply() → adapter.send().
   */
  async dispatch(
    channelConfigId: string,
    rawPayload:      Record<string, unknown>,
  ): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId)
    const adapter = this.resolveAdapter(cfg.type)

    // 1. Parse inbound — receive() devuelve IncomingMessage con
    //    replyFn, threadId y rawPayload ya populados por el adaptador
    const incoming = await (adapter as unknown as {
      receive: (p: Record<string, unknown>, s: Record<string, unknown>) => Promise<IncomingMessage | null>
    }).receive(rawPayload, cfg.secrets)

    if (!incoming) return

    // 2. Persist user turn + upsert session
    if (!cfg.agentId) {
      throw new Error(`ChannelConfig missing agentId in registry cache: ${channelConfigId}`)
    }

    const sessionAttachments = (incoming.attachments ?? [])
      .flatMap((attachment) => {
        const url = attachment.url ?? (typeof attachment.data === 'string' ? attachment.data : '')
        if (!url) return []
        return [{
          mimeType: attachment.type,
          url,
          name:    undefined,
          size:    undefined,
        }]
      })

    const sessionIncoming: SessionIncomingMessage = {
      externalUserId: incoming.externalId,
      text:           incoming.text,
      attachments:    sessionAttachments,
      metadata:       incoming.metadata ?? {},
      ts:             incoming.receivedAt,
    }

    const session = await this.sessions.receiveUserMessage(
      channelConfigId,
      cfg.agentId,
      sessionIncoming,
    )

    // 3. Run agent via FlowExecutor
    let replyText: string
    try {
      const result = await this.agentRunner.run(
        session.agentId,
        session.history,
      )
      replyText = result.reply || '(sin respuesta)'
    } catch (err) {
      console.error('[GatewayService] AgentRunner error:', err)
      replyText = '(ocurrió un error al procesar tu mensaje)'
    }

    // 4. Build outbound message
    const outgoing: OutgoingMessage = {
      externalId: incoming.externalId,
      threadId:   incoming.threadId !== incoming.externalId
                    ? incoming.threadId   // preserva el thread si es distinto del chat
                    : undefined,
      text:       replyText,
    }

    // 5a. PATH RÁPIDO: replyFn disponible → reply in-band directo
    //     El adaptador ya tiene las credenciales capturadas en el closure.
    //     NO llamamos adapter.send() → evitamos double-send.
    if (incoming.replyFn) {
      await incoming.replyFn(replyText, {
        format:        'text',
        quoteOriginal: false,
      })
      // Persistir solo el texto (el envío ya ocurrió)
      await this.sessions.recordAssistantReply(session.sessionId, {
        externalUserId: outgoing.externalId,
        text:           outgoing.text,
        attachments:    [],
        options:        outgoing.richContent ? { richContent: outgoing.richContent } : undefined,
        buttons:        undefined,
      } satisfies SessionOutboundMessage)
      return
    }

    // 5b. PATH LEGACY: sin replyFn → ruta antigua (adapter.send() en recordReply)
    await this.recordReply(channelConfigId, session.sessionId, outgoing)
  }

  // ── recordReply() ───────────────────────────────────────────────────────

  /**
   * [F3a-17] Actualizado para usar OutgoingMessage (era OutboundMessage).
   *
   * Sigue existiendo para:
   *   1. El path legacy (canales sin replyFn)
   *   2. El endpoint POST /webchat/:channelId/reply
   */
  async recordReply(
    channelConfigId: string,
    sessionId:       string,
    outgoing:        OutgoingMessage,
  ): Promise<void> {
    const cfg     = await this.loadChannelConfig(channelConfigId)
    const adapter = this.resolveAdapter(cfg.type)

    await this.sessions.recordAssistantReply(sessionId, {
      externalUserId: outgoing.externalId,
      text:           outgoing.text,
      attachments:    [],
      options:        outgoing.richContent ? { richContent: outgoing.richContent } : undefined,
      buttons:        undefined,
    } satisfies SessionOutboundMessage)
    await (adapter as unknown as {
      send: (m: OutgoingMessage, c: Record<string, unknown>, s: Record<string, unknown>) => Promise<void>
    }).send(outgoing, cfg.config, cfg.secrets)
  }
}
