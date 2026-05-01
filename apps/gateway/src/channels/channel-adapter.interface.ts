/**
 * [F3a-02] channel-adapter.interface.ts
 *
 * Contrato base de todos los adaptadores de canal del Gateway.
 * Todo canal (WebChat, Telegram, WhatsApp, Discord, Slack, n8n webhook)
 * implementa IChannelAdapter + extiende BaseChannelAdapter.
 *
 * REGLA: Este archivo NO importa nada de apps/api ni de Prisma.
 *        Es puro TypeScript de contrato. Cualquier acceso a BD
 *        debe ir en el adapter concreto, inyectado por constructor.
 */

// ── Tipos de canal ─────────────────────────────────────────────────────────

/**
 * Nombres canónicos de canal — deben coincidir con
 * ChannelConfig.channelType en el schema Prisma.
 */
export type ChannelType =
  | 'webchat'
  | 'telegram'
  | 'whatsapp'
  | 'discord'
  | 'slack'
  | 'webhook'

// ── IncomingMessage ────────────────────────────────────────────────────────

/**
 * Mensaje normalizado que llega de cualquier canal externo.
 * SessionManager y AgentResolver consumen este tipo directamente.
 */
export interface IncomingMessage {
  /**
   * ID del ChannelConfig en BD — necesario para que SessionManager
   * cree/recupere la GatewaySession correcta.
   */
  channelConfigId: string

  /**
   * Tipo de canal — necesario para que AgentResolver filtre
   * ChannelBinding por canal.
   */
  channelType: ChannelType

  /** ID de la conversación/thread en el canal externo */
  externalId: string

  /** ID de quien envía (user ID del canal) */
  senderId: string

  /** Texto plano del mensaje */
  text: string

  /** Tipo de contenido del mensaje */
  type: 'text' | 'image' | 'audio' | 'file' | 'command' | 'attachment' | 'button_click' | 'quick_reply'

  /** Adjuntos opcionales */
  attachments?: Array<{ type: string; url?: string; data?: unknown }>

  /**
   * Payload raw del canal externo.
   * Telegram: Update object. WebChat: req.body. Slack: payload completo.
   */
  metadata?: Record<string, unknown>

  /** Timestamp ISO 8601 de recepción */
  receivedAt: string
}

// ── RichContent ────────────────────────────────────────────────────────────

export interface QuickReply {
  label: string
  payload: string
}

export interface CardContent {
  title:     string
  subtitle?: string
  imageUrl?: string
  buttons?:  QuickReply[]
}

export type RichContent =
  | { type: 'quick_replies'; replies: QuickReply[] }
  | { type: 'card';          card:    CardContent   }
  | { type: 'image';         url:     string; altText?: string }
  | { type: 'file';          url:     string; filename: string }

// ── OutgoingMessage ────────────────────────────────────────────────────────

export interface OutgoingMessage {
  /** ID de la conversación de destino en el canal externo */
  externalId: string

  /** Texto de la respuesta (requerido) */
  text: string

  /** Tipo de contenido del mensaje */
  type?: 'text' | 'markdown' | 'card' | 'quick_replies'

  /**
   * Contenido enriquecido tipado — cada adapter lo adapta
   * al formato nativo del canal.
   */
  richContent?: RichContent | unknown

  /** Metadatos adicionales específicos del canal */
  metadata?: Record<string, unknown>
}

// ── IChannelAdapter ────────────────────────────────────────────────────────

export interface IChannelAdapter {
  readonly channel: ChannelType

  initialize(channelConfigId: string): Promise<void>
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void
  send(message: OutgoingMessage): Promise<void>
  dispose(): Promise<void>
}

// ── IHttpChannelAdapter ────────────────────────────────────────────────────

/**
 * Extensión para canales que exponen rutas HTTP.
 * ChannelRouter usa duck-typing:
 *   if ('getRouter' in adapter) app.use(`/gateway/${adapter.channel}`, adapter.getRouter())
 */
export interface IHttpChannelAdapter extends IChannelAdapter {
  getRouter(): import('express').Router
}

// ── BaseChannelAdapter ─────────────────────────────────────────────────────

export abstract class BaseChannelAdapter implements IChannelAdapter {
  abstract readonly channel: ChannelType

  protected channelConfigId = ''
  protected credentials: Record<string, unknown> = {}
  protected get messageHandler() { return this._messageHandler }
  private _messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null

  abstract initialize(channelConfigId: string): Promise<void>
  abstract send(message: OutgoingMessage): Promise<void>
  abstract dispose(): Promise<void>

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this._messageHandler = handler
  }

  /**
   * Emite un IncomingMessage al handler registrado.
   * SIEMPRE rellena channelConfigId y channelType antes de llamar emit().
   */
  protected async emit(msg: IncomingMessage): Promise<void> {
    if (!msg.channelConfigId) {
      console.warn(`[${this.channel}] emit() called without channelConfigId — message dropped`)
      return
    }
    if (this._messageHandler) {
      await this._messageHandler(msg)
    } else {
      console.warn(`[${this.channel}] No message handler registered — message dropped`)
    }
  }

  protected makeTimestamp(): string {
    return new Date().toISOString()
  }
}
