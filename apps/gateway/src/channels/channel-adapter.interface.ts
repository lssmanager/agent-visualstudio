/**
 * channel-adapter.interface.ts — Interfaz base de adaptadores de canal
 * [F3a-17] Añade replyFn, threadId, rawPayload a IncomingMessage
 */

// ── Función de reply in-band ────────────────────────────────────────────────

/**
 * ReplyFn: closure que cada adaptador construye durante receive().
 * Permite al dispatcher responder AL CANAL EXTERNO directamente, sin
 * necesitar acceso al adapter o a las credenciales.
 *
 * - Es async: puede hacer HTTP, WebSocket o encolado.
 * - Debe ser idempotente: llamarla 2 veces no debe crear 2 respuestas.
 *   (el adaptador puede usar un flag 'replied' internamente)
 * - Si el canal no admite reply in-band (ej: webhook genérico sin callback),
 *   la función debe ser un no-op que loggea una advertencia.
 */
export type ReplyFn = (text: string, options?: ReplyOptions) => Promise<void>

export interface ReplyOptions {
  /** Si true, enviar como respuesta al mensaje original (quote/reply) */
  quoteOriginal?: boolean
  /** Tipo de formato del texto */
  format?:        'text' | 'markdown' | 'html'
  /** Adjuntos opcionales */
  attachments?:   Array<{ type: string; url?: string; data?: unknown }>
  /** Metadatos extra para el canal (ej: Telegram parse_mode) */
  channelMeta?:   Record<string, unknown>
}

// ── IncomingMessage (REEMPLAZA el anterior) ────────────────────────────────

export interface IncomingMessage {
  // ── Identidad ──────────────────────────────────────────────────────────

  /** ID de la conversación/chat en el canal externo (chat_id, channel_id…) */
  externalId: string

  /**
   * [F3a-17] ID del hilo dentro de la conversación.
   * En canales planos (WhatsApp DM, Telegram DM) === externalId.
   * En canales con threads (Slack threads, Discord threads):
   *   - Slack:   event.thread_ts ?? event.ts
   *   - Discord: message.thread?.id ?? message.channelId
   * El dispatcher usa threadId para agrupar mensajes de un mismo hilo.
   */
  threadId: string

  /** ID del usuario que envía el mensaje */
  senderId: string

  // ── Contenido ──────────────────────────────────────────────────────────

  /** Texto plano del mensaje (normalizado, sin markup del canal) */
  text: string

  /** Tipo de mensaje */
  type: 'text' | 'image' | 'audio' | 'file' | 'command'

  /** Adjuntos opcionales */
  attachments?: Array<{ type: string; url?: string; data?: unknown }>

  // ── Reply in-band ──────────────────────────────────────────────────────

  /**
   * [F3a-17] Closure que envía la respuesta al canal externo.
   *
   * REGLA: el dispatcher SIEMPRE usa replyFn si está definida.
   * Solo si replyFn es undefined (canal no lo soporta) debe usar
   * la ruta antigua: adapter.send() + recordReply().
   *
   * Los adaptadores construyen replyFn en receive() capturando
   * las credenciales y el chat/thread ID en el closure.
   *
   * Los adaptadores que no soportan reply in-band asignan:
   *   replyFn: undefined
   *
   * NO usar null — undefined significa "no soportado".
   */
  replyFn?: ReplyFn

  // ── Payload original ───────────────────────────────────────────────────

  /**
   * [F3a-17] Payload crudo del canal, tal como llegó al webhook.
   * Garantizado non-null (los adaptadores deben pasarlo siempre).
   *
   * Uso:
   *   - Logging y tracing de mensajes entrantes
   *   - Auditoría (persistir en GatewaySession.rawPayloads)
   *   - FlowExecutor puede acceder a campos específicos del canal
   *     sin que IncomingMessage los tenga que exponer explícitamente
   *
   * NUNCA debe contener secretos (tokens, keys) — los adaptadores
   * deben filtrar credentials del rawPayload antes de asignarlo.
   */
  rawPayload: Record<string, unknown>

  // ── Metadatos adicionales ──────────────────────────────────────────────

  /**
   * Metadatos adicionales específicos del canal (campos que no caben
   * en la interfaz normalizada).
   * rawPayload es el payload completo; metadata son campos derivados
   * que el adaptador quiere exponer de forma tipada.
   */
  metadata?: Record<string, unknown>

  /** Timestamp ISO 8601 de recepción */
  receivedAt: string
}

// ── OutgoingMessage (unificado — sustituye a OutboundMessage) ─────────────

/**
 * [F3a-17] OutgoingMessage reemplaza y consolida:
 *   - OutgoingMessage (interfaz local anterior)
 *   - OutboundMessage (gateway-sdk)
 *
 * A partir de F3a-17, TODO el código del gateway usa OutgoingMessage.
 * OutboundMessage en gateway-sdk queda deprecado — ver nota al pie.
 */
export interface OutgoingMessage {
  /** ID de la conversación de destino (debe coincidir con IncomingMessage.externalId) */
  externalId: string

  /**
   * ID del hilo de destino.
   * Si es undefined, la respuesta va al chat raíz (sin thread).
   * Los adaptadores usan este campo para hacer sendMessage en el
   * thread correcto en Slack/Discord.
   */
  threadId?: string

  /** Texto de la respuesta */
  text: string

  /** Tipo de contenido */
  type?: 'text' | 'markdown' | 'card' | 'quick_replies'

  /** Tarjetas, botones, quick replies (specific to channel) */
  richContent?: unknown

  /** Metadatos adicionales para el canal */
  metadata?: Record<string, unknown>
}

// ── IChannelAdapter (actualizado) ─────────────────────────────────────────

export interface IChannelAdapter {
  readonly channel: string

  initialize(channelConfigId: string): Promise<void>

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void

  /**
   * [F3a-17] send() recibe OutgoingMessage (no OutboundMessage).
   * Debe usar outgoing.threadId si está definido para responder
   * al thread correcto.
   */
  send(message: OutgoingMessage): Promise<void>

  dispose(): Promise<void>
}

// ── BaseChannelAdapter (actualizado) ──────────────────────────────────────

export abstract class BaseChannelAdapter implements IChannelAdapter {
  abstract readonly channel: string

  protected channelConfigId = ''
  protected credentials: Record<string, unknown> = {}
  protected messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null

  abstract initialize(channelConfigId: string): Promise<void>
  abstract send(message: OutgoingMessage): Promise<void>
  abstract dispose(): Promise<void>

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler
  }

  protected async emit(msg: IncomingMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg)
    } else {
      console.warn(`[${this.channel}] No message handler registered — message dropped`)
    }
  }

  protected makeTimestamp(): string {
    return new Date().toISOString()
  }

  /**
   * [F3a-17] Helper que construye un rawPayload filtrado (sin secretos).
   * Los adaptadores llaman esto antes de asignar incoming.rawPayload.
   *
   * Elimina automáticamente claves comunes de credentials del payload.
   */
  protected sanitizeRawPayload(
    raw:        Record<string, unknown>,
    secretKeys: string[] = [],
  ): Record<string, unknown> {
    const DEFAULT_SECRET_KEYS = [
      'token', 'bot_token', 'access_token', 'secret',
      'api_key', 'apiKey', 'password', 'credential',
    ]
    const keysToRemove = new Set([...DEFAULT_SECRET_KEYS, ...secretKeys])

    return Object.fromEntries(
      Object.entries(raw).filter(([k]) => !keysToRemove.has(k.toLowerCase())),
    )
  }
}

// ── Nota sobre OutboundMessage deprecado ─────────────────────────────────
// packages/gateway-sdk exporta OutboundMessage con campos
// externalUserId / externalChatId (nomenclatura antigua).
// A partir de F3a-17, el gateway usa OutgoingMessage (este archivo).
// gateway-sdk se actualizará en F3b-01 para re-exportar OutgoingMessage
// y deprecar OutboundMessage. Por ahora, gateway.service.ts hace:
//   import type { OutgoingMessage } from './channels/channel-adapter.interface.js'
// y NO importa OutboundMessage de gateway-sdk.
