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

// ── Tipos de canal ─────────────────────────────────────────────────────────────────────────────

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

// ── IncomingMessage ──────────────────────────────────────────────────────────────────────────

/**
 * Mensaje normalizado que llega de cualquier canal externo.
 * SessionManager y AgentResolver consumen este tipo directamente.
 */
export interface IncomingMessage {
  /**
   * ID del ChannelConfig en BD — necesario para que SessionManager
   * cree/recupere la GatewaySession correcta.
   * El adapter lo rellena al recibir cualquier mensaje.
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
  type: 'text' | 'image' | 'audio' | 'file' | 'command' | 'button_click' | 'quick_reply'

  /** Adjuntos opcionales */
  attachments?: Array<{ type: string; url?: string; data?: unknown }>

  /**
   * Payload raw del canal externo.
   * Telegram: Update object. WebChat: req.body. Slack: payload completo.
   * Preservarlo aquí evita perder información específica del canal.
   */
  metadata?: Record<string, unknown>

  /** Timestamp ISO 8601 de recepción */
  receivedAt: string
}

// ── RichContent — tipos de contenido enriquecido ────────────────────────────────────────

export interface QuickReply {
  label: string
  payload: string
}

export interface CardContent {
  title:    string
  subtitle?: string
  imageUrl?: string
  buttons?: QuickReply[]
}

export type RichContent =
  | { type: 'quick_replies'; replies: QuickReply[] }
  | { type: 'card';          card:    CardContent   }
  | { type: 'image';         url:     string; altText?: string }
  | { type: 'file';          url:     string; filename: string }

// ── OutgoingMessage ────────────────────────────────────────────────────────────────────────

export interface OutgoingMessage {
  /** ID de la conversación de destino en el canal externo */
  externalId: string

  /** Texto de la respuesta (requerido) */
  text: string

  /** Tipo de contenido del mensaje */
  type?: 'text' | 'markdown' | 'card' | 'quick_replies'

  /**
   * Contenido enriquecido tipado — cada adapter adapta esto
   * al formato nativo del canal (inline keyboard en Telegram,
   * Block Kit en Slack, etc.)
   */
  richContent?: RichContent

  /** Metadatos adicionales específicos del canal */
  metadata?: Record<string, unknown>
}

// ── IChannelAdapter ───────────────────────────────────────────────────────────────────────────

export interface IChannelAdapter {
  /**
   * Tipo de canal — debe coincidir con ChannelType.
   * Usado por ChannelRouter para lookup y por IncomingMessage.channelType.
   */
  readonly channel: ChannelType

  /**
   * Inicializa el adapter: carga credentials del ChannelConfig,
   * registra webhooks o abre conexiones persistentes.
   * @param channelConfigId ID del ChannelConfig en BD
   */
  initialize(channelConfigId: string): Promise<void>

  /**
   * Registra el handler que el gateway llama al recibir un mensaje.
   * ChannelRouter llama a este método una vez durante el bootstrap.
   */
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void

  /**
   * Envía una respuesta al canal externo.
   * Implementación específica por canal.
   */
  send(message: OutgoingMessage): Promise<void>

  /**
   * Libera recursos: cierra conexiones, cancela webhooks, purga timers.
   * Llamado por ChannelRouter en el shutdown del gateway.
   */
  dispose(): Promise<void>
}

// ── IHttpChannelAdapter ──────────────────────────────────────────────────────────────────────

/**
 * Extensión de IChannelAdapter para canales que exponen rutas HTTP.
 * WebChatAdapter y WebhookAdapter implementan esta interfaz.
 * ChannelRouter usa duck-typing para detectar si el adapter la cumple:
 *
 *   if ('getRouter' in adapter) app.use(`/gateway/${adapter.channel}`, adapter.getRouter())
 */
export interface IHttpChannelAdapter extends IChannelAdapter {
  /**
   * Retorna un Express Router con las rutas específicas del canal.
   * Se monta bajo /gateway/:channel/ por el servidor del gateway.
   */
  getRouter(): import('express').Router
}

// ── BaseChannelAdapter ───────────────────────────────────────────────────────────────────────────

/**
 * Clase abstracta con comportamiento compartido.
 * Todos los adapters deben extenderla.
 *
 * INYECCIÓN DE DEPENDENCIAS:
 * El constructor acepta un objeto `deps` opcional para que los adapters
 * puedan recibir servicios (PrismaClient, logger) sin importarlos
 * directamente. Ver ejemplo en WebChatAdapter.
 */
export abstract class BaseChannelAdapter implements IChannelAdapter {
  abstract readonly channel: ChannelType

  protected channelConfigId = ''
  protected credentials: Record<string, unknown> = {}
  private _messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null

  abstract initialize(channelConfigId: string): Promise<void>
  abstract send(message: OutgoingMessage): Promise<void>
  abstract dispose(): Promise<void>

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this._messageHandler = handler
  }

  /**
   * Emite un IncomingMessage al handler registrado.
   * Los adapters deben llamar a this.emit(msg) al recibir mensajes.
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
