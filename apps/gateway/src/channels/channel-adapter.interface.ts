/**
 * channel-adapter.interface.ts — Interfaz base de adaptadores de canal
 *
 * Todo canal (WebChat, Telegram, WhatsApp, Discord, Teams…) implementa
 * IChannelAdapter. El ChannelRouter del gateway instancia los adaptadores
 * registrados en ChannelConfig y los conecta al GatewayService.
 *
 * Inspirado en:
 * - n8n trigger nodes: initialize + dispose lifecycle
 * - Flowise ChatFlow: IncomingMessage normalizado
 * - CrewAI: task context passthrough en metadata
 */

// ---------------------------------------------------------------------------
// Tipos de mensajes
// ---------------------------------------------------------------------------

export interface IncomingMessage {
  /** ID de la conversación/thread en el canal externo */
  externalId: string;
  /** ID de quien envía (user ID del canal) */
  senderId: string;
  /** Texto plano del mensaje */
  text: string;
  /** Tipo de mensaje */
  type: 'text' | 'image' | 'audio' | 'file' | 'command';
  /** Adjuntos opcionales (URLs u objetos) */
  attachments?: Array<{ type: string; url?: string; data?: unknown }>;
  /** Metadatos específicos del canal (raw payload) */
  metadata?: Record<string, unknown>;
  /** Timestamp ISO 8601 */
  receivedAt: string;
}

export interface OutgoingMessage {
  /** ID de la conversación de destino en el canal externo */
  externalId: string;
  /** Texto de la respuesta */
  text: string;
  /** Tipo de contenido enriquecido opcional */
  type?: 'text' | 'markdown' | 'card' | 'quick_replies';
  /** Tarjetas, botones, opciones rápidas */
  richContent?: unknown;
  /** Metadatos adicionales para el canal */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Interfaz del adaptador
// ---------------------------------------------------------------------------

export interface IChannelAdapter {
  /** Nombre único del canal: 'webchat' | 'telegram' | 'whatsapp' | 'discord' */
  readonly channel: string;

  /**
   * Inicializa el adaptador: carga credentials de ChannelConfig.credentials,
   * registra webhooks o abre conexiones.
   * @param channelConfigId ID del ChannelConfig en DB
   */
  initialize(channelConfigId: string): Promise<void>;

  /**
   * Registra el handler que se llama al recibir un mensaje.
   * El gateway llama a este método para conectar el canal al dispatcher.
   */
  onMessage(
    handler: (msg: IncomingMessage) => Promise<void>,
  ): void;

  /**
   * Envía una respuesta al canal externo.
   */
  send(message: OutgoingMessage): Promise<void>;

  /**
   * Cierra conexiones, cancela webhooks, libera recursos.
   */
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Base class con hooks opcionales
// ---------------------------------------------------------------------------

export abstract class BaseChannelAdapter implements IChannelAdapter {
  abstract readonly channel: string;

  protected channelConfigId = '';
  protected credentials: Record<string, unknown> = {};
  protected messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;

  abstract initialize(channelConfigId: string): Promise<void>;
  abstract send(message: OutgoingMessage): Promise<void>;
  abstract dispose(): Promise<void>;

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  protected async emit(msg: IncomingMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    } else {
      console.warn(`[${this.channel}] No message handler registered — message dropped`);
    }
  }

  protected makeTimestamp(): string {
    return new Date().toISOString();
  }
}
