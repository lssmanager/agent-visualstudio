/**
 * channel-adapter.interface.ts — [F3a-02]
 *
 * Contrato base de todos los adaptadores de canal del Gateway.
 * Todo canal (WebChat, Telegram, WhatsApp, Discord, Slack, n8n webhook)
 * implementa IChannelAdapter + extiende BaseChannelAdapter.
 *
 * REGLA: Este archivo NO importa nada de apps/api ni de Prisma.
 *        Es puro TypeScript de contrato. Cualquier acceso a BD
 *        debe ir en el adapter concreto, inyectado por constructor.
 *
 * @module channel-adapter.interface
 */

// ── Tipos de canal ───────────────────────────────────────────────────────────

/**
 * Nombres canónicos de canal — deben coincidir exactamente con los valores
 * del enum `ChannelType` en `prisma/schema.prisma`.
 *
 * @remarks
 * Si se añade un canal nuevo al schema de Prisma, también debe añadirse aquí.
 * Los adapters concretos declaran `readonly channel: ChannelType` para que
 * TypeScript verifique en tiempo de compilación.
 */
export type ChannelType =
  | 'webchat'
  | 'telegram'
  | 'whatsapp'
  | 'discord'
  | 'slack'
  | 'webhook'
  | 'teams'

// ── AdapterMode ──────────────────────────────────────────────────────────────

/**
 * Modo de operación de un adaptador de canal.
 *
 * - `'gateway'` — el adaptador abre una conexión activa (WebSocket, polling,
 *   bot login via Baileys, etc.) y escucha mensajes de forma continua.
 * - `'http'`    — el adaptador solo procesa webhooks HTTP entrantes; no
 *   mantiene ninguna conexión persistente.
 *
 * @remarks
 * El modo se pasa al método `setup()` del {@link ChannelAdapter} legacy y
 * determina si el adaptador registra rutas en Express.
 */
export type AdapterMode = 'gateway' | 'http'

// ── IncomingMessage ──────────────────────────────────────────────────────────

/**
 * Mensaje normalizado que llega de cualquier canal externo.
 *
 * Todos los adapters deben mapear el payload nativo del canal a esta interfaz
 * antes de llamar a `BaseChannelAdapter.emit()`. `SessionManager` y
 * `AgentResolver` consumen este tipo directamente — ninguno de los dos conoce
 * el canal de origen.
 *
 * @remarks
 * Los campos `attachmentUrl` / `attachmentName` son legacy; los nuevos adapters
 * deben usar el array `attachments`.
 */
export interface IncomingMessage {
  /**
   * ID del `ChannelConfig` en base de datos.
   *
   * Necesario para que `SessionManager` cree o recupere la `GatewaySession`
   * correcta. **Obligatorio** — `emit()` descarta mensajes sin este campo.
   */
  channelConfigId: string

  /**
   * Tipo de canal que originó el mensaje.
   *
   * Necesario para que `AgentResolver` filtre los `ChannelBinding` por canal
   * y elija el agente correcto.
   */
  channelType: ChannelType | string

  /**
   * Identificador externo de la conversación/thread en el canal.
   *
   * Para Telegram: `chat_id`. Para WhatsApp: número E.164. Para Discord:
   * `channel_id`. Para Slack: `channel`. Para WebChat: `sessionId` del cliente.
   *
   * @remarks
   * Este campo actúa como clave de sesión junto con `channelConfigId`.
   * No puede ser vacío ni `'unknown'`; si no está disponible el adapter
   * debe lanzar un error antes de llamar a `emit()`.
   */
  externalId: string

  /**
   * ID del thread cuando el canal lo soporta.
   *
   * Útil para Slack threads, Discord threads o WhatsApp reply threads.
   * Si no existe, se usa `externalId` como fallback.
   */
  threadId?: string

  /**
   * Identificador del usuario que envía el mensaje en el canal externo.
   *
   * Para Telegram: `from.id`. Para WhatsApp: número E.164 del remitente.
   * Para Discord: `author.id`. Para Slack: `user` del evento.
   */
  senderId: string

  /** Texto plano del mensaje. Vacío (`''`) si el mensaje es solo multimedia. */
  text: string

  /**
   * Tipo de contenido del mensaje.
   *
   * - `'text'`         — mensaje de texto plano
   * - `'image'`        — imagen adjunta
   * - `'audio'`        — nota de voz o archivo de audio
   * - `'file'`         — documento o archivo genérico
   * - `'command'`      — comando de bot (e.g., `/start`)
   * - `'button_click'` — interacción con botón inline
   * - `'quick_reply'`  — respuesta rápida predefinida
   */
  type: 'text' | 'image' | 'audio' | 'file' | 'command' | 'button_click' | 'quick_reply'

  /**
   * Adjuntos tipados del mensaje.
   *
   * Reemplaza a los campos legacy `attachmentUrl` / `attachmentName`.
   * Cada elemento especifica `type` y opcionalmente `url` o `data`.
   */
  attachments?: Array<{ type: string; url?: string; data?: unknown }>

  /** @deprecated Usa `attachments[0].url` en su lugar. */
  attachmentUrl?: string

  /** @deprecated Usa `attachments[0].type` + `attachments[0].url` en su lugar. */
  attachmentName?: string

  /** ID del mensaje en el canal externo (para threading y deduplicación). */
  msgId?: string

  /**
   * Payload raw del canal externo, sin normalizar.
   *
   * - Telegram: objeto `Update` de la Bot API
   * - WebChat: `req.body` del endpoint HTTP
   * - Slack: payload completo del evento
   *
   * Útil para lógica específica del canal que no cabe en el modelo normalizado.
   */
  metadata?: Record<string, unknown>

  /**
   * Payload original sin ningún procesamiento.
   *
   * Se conserva para debugging, auditoría y casos de fallback donde
   * `metadata` ya fue parcialmente transformado.
   */
  rawPayload?: unknown

  /**
   * Timestamp ISO 8601 del momento en que el gateway recibió el mensaje.
   *
   * Rellenado automáticamente por el adapter antes de llamar a `emit()`.
   * Formato: `new Date().toISOString()` → `'2025-01-15T12:34:56.789Z'`
   */
  receivedAt?: string
}

// ── RichContent ──────────────────────────────────────────────────────────────

/**
 * Botón de respuesta rápida mostrado como chip interactivo en el canal.
 *
 * @remarks
 * En Telegram se envía como `InlineKeyboardButton`. En WhatsApp como
 * `reply_button`. En WebChat como botón clickeable en el widget.
 */
export interface QuickReply {
  /** Texto visible en el botón. Máximo 20 caracteres en WhatsApp. */
  label: string
  /** Valor enviado como texto cuando el usuario hace clic. */
  payload: string
}

/**
 * Tarjeta visual con imagen, título y botones de acción.
 *
 * @remarks
 * Se mapea a `Telegram InlineKeyboard + photo`, `Discord Embed`,
 * `WhatsApp interactive message` o una tarjeta HTML en WebChat.
 */
export interface CardContent {
  /** Título principal de la tarjeta. */
  title:     string
  /** Subtítulo o descripción breve (opcional). */
  subtitle?: string
  /** URL de la imagen de portada (opcional). */
  imageUrl?: string
  /** Botones de acción de la tarjeta (opcional). */
  buttons?:  QuickReply[]
}

/**
 * Contenido enriquecido de un mensaje de salida.
 *
 * Unión discriminada con `type` como discriminante (excepto la variante
 * legacy flat que no tiene `type`).
 *
 * ### Variantes tipadas
 * - `quick_replies` — muestra chips de respuesta rápida
 * - `card`          — tarjeta con imagen, título y botones
 * - `image`         — imagen con texto alternativo
 * - `file`          — archivo descargable con nombre
 *
 * ### Variante legacy (flat shape)
 * Para adapters anteriores al PR#161 que no usan `type`.
 * Solo usar en adapters legacy; los adapters nuevos deben usar las
 * variantes tipadas.
 */
export type RichContent =
  | { type: 'quick_replies'; replies: QuickReply[] }
  | { type: 'card';          card:    CardContent   }
  | { type: 'image';         url:     string; altText?: string }
  | { type: 'file';          url:     string; filename: string }
  // Legacy flat shape (discord, older adapters)
  | { title?: string; description?: string; imageUrl?: string; buttons?: Array<{ label: string; value: string }>; footer?: string }

// ── OutgoingMessage ──────────────────────────────────────────────────────────

/**
 * Mensaje normalizado que el gateway envía hacia un canal externo.
 *
 * `MessageDispatcherService` construye instancias de este tipo con la
 * respuesta del agente y las pasa a `IChannelAdapter.send()`.
 *
 * @remarks
 * Cada adapter convierte este tipo al formato nativo del canal (Telegram
 * `sendMessage`, WhatsApp Cloud API message object, Discord REST, etc.).
 */
export interface OutgoingMessage {
  /**
   * Identificador de la conversación de destino en el canal externo.
   *
   * Debe coincidir con `IncomingMessage.externalId` de la sesión activa.
   * Para Telegram: `chat_id`. Para Discord: `channel_id`. Para Slack: `channel`.
   */
  externalId: string

  /**
   * Texto principal de la respuesta.
   *
   * Obligatorio. Puede estar vacío (`''`) solo si `richContent` lleva todo
   * el contenido (e.g., imagen sin caption).
   */
  text: string

  /**
   * Tipo de formato del campo `text`.
   *
   * - `'text'`         — texto plano sin formato
   * - `'markdown'`     — Markdown estándar; el adapter convierte al dialecto del canal
   * - `'card'`         — indica que `richContent` contiene una `CardContent`
   * - `'quick_replies'`— indica que `richContent` contiene botones de respuesta rápida
   *
   * @defaultValue `'text'`
   */
  type?: 'text' | 'markdown' | 'card' | 'quick_replies'

  /**
   * Contenido enriquecido tipado para el mensaje.
   *
   * El adapter es responsable de adaptar este objeto al formato nativo
   * del canal (e.g., Telegram `InlineKeyboardMarkup`, Discord `embeds`,
   * WhatsApp `interactive`).
   *
   * @see {@link RichContent}
   */
  richContent?: RichContent

  /**
   * Metadatos adicionales específicos del canal o del agente.
   *
   * Ejemplos: `{ parseMode: 'HTML' }` para Telegram, `{ ephemeral: true }`
   * para Slack. El adapter los aplica si los reconoce; los desconoce los ignora.
   */
  metadata?: Record<string, unknown>
}

// ── IChannelAdapter ──────────────────────────────────────────────────────────

/**
 * Contrato principal que debe implementar todo adaptador de canal.
 *
 * `ChannelAdapterRegistry` almacena instancias de `IChannelAdapter` indexadas
 * por `channelConfigId`. `GatewayService.dispatch()` recupera el adapter
 * correcto y llama a `send()` con la respuesta del agente.
 *
 * @remarks
 * Los adapters concretos deben extender {@link BaseChannelAdapter} en lugar de
 * implementar esta interfaz directamente, para heredar la gestión del handler
 * y la lógica de `emit()`.
 *
 * @example
 * ```ts
 * class MyAdapter extends BaseChannelAdapter {
 *   readonly channel = 'webchat' as const
 *   async initialize(id: string) { ... }
 *   async send(msg: OutgoingMessage) { ... }
 *   async dispose() { ... }
 * }
 * ```
 */
export interface IChannelAdapter {
  /** Identificador de canal — debe coincidir con {@link ChannelType}. */
  readonly channel: ChannelType

  /**
   * Inicializa el adaptador para el `ChannelConfig` dado.
   *
   * Carga las credenciales desde BD, establece la conexión activa (si aplica)
   * y registra el webhook en el canal externo si el modo es `'http'`.
   *
   * @param channelConfigId — UUID del `ChannelConfig` en Prisma.
   * @throws {Error} Si las credenciales son inválidas o la conexión falla.
   *
   * @example
   * ```ts
   * await adapter.initialize('uuid-del-channel-config')
   * ```
   */
  initialize(channelConfigId: string): Promise<void>

  /**
   * Registra el handler que procesará cada {@link IncomingMessage}.
   *
   * Debe llamarse antes de `initialize()` para garantizar que ningún
   * mensaje llegue sin handler. El adapter guarda internamente la referencia;
   * llamadas sucesivas reemplazan el handler anterior.
   *
   * @param handler — función asíncrona que recibe el mensaje normalizado.
   */
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void

  /**
   * Envía un {@link OutgoingMessage} al canal externo.
   *
   * Convierte el mensaje normalizado al formato nativo del canal y realiza
   * la llamada de red correspondiente (Bot API, REST, WebSocket, etc.).
   *
   * @param message — mensaje saliente ya construido por `MessageDispatcherService`.
   * @throws {Error} Si la entrega falla (red, autenticación, rate-limit).
   *
   * @example
   * ```ts
   * await adapter.send({ externalId: chatId, text: 'Hola mundo' })
   * ```
   */
  send(message: OutgoingMessage): Promise<void>

  /**
   * Libera todos los recursos del adaptador.
   *
   * Cierra conexiones WebSocket/polling, cancela timers, elimina webhooks
   * registrados en el canal externo y deja el adaptador en estado inactivo.
   * Debe ser idempotente: llamadas sucesivas no deben lanzar error.
   *
   * @throws {Error} Solo si la limpieza falla de forma irrecuperable.
   */
  dispose(): Promise<void>
}

// ── IHttpChannelAdapter ──────────────────────────────────────────────────────

/**
 * Extensión de {@link IChannelAdapter} para canales que reciben mensajes
 * via webhooks HTTP (Telegram webhook mode, Slack Events API, etc.).
 *
 * @remarks
 * `ChannelRouter` usa duck-typing para detectar esta interfaz:
 * ```ts
 * if ('getRouter' in adapter) {
 *   app.use(`/gateway/${adapter.channel}`, adapter.getRouter())
 * }
 * ```
 * Esto permite registrar automáticamente las rutas sin acoplar el router
 * a los adapters concretos.
 */
export interface IHttpChannelAdapter extends IChannelAdapter {
  /**
   * Devuelve un Router de Express con las rutas HTTP del canal.
   *
   * Normalmente registra:
   * - `POST /` — endpoint de webhook (recibe eventos del canal externo)
   * - `GET  /` — endpoint de verificación (challenge de Slack, Telegram polling check, etc.)
   *
   * @returns Router de Express listo para montar en la aplicación.
   *
   * @example
   * ```ts
   * // En ChannelRouter:
   * app.use(`/gateway/slack`, slackAdapter.getRouter())
   * // → registra POST /gateway/slack  y  GET /gateway/slack
   * ```
   */
  getRouter(): import('express').Router
}

// ── ChannelAdapter (legacy alias) ────────────────────────────────────────────

/**
 * Alias legacy de adaptador de canal — para compatibilidad con adaptadores
 * del PR#161 que usan la firma `initialize()` síncrono + `setup()` separado.
 *
 * @deprecated
 * Usar {@link IChannelAdapter} + {@link BaseChannelAdapter} en todos los
 * adapters nuevos. Este tipo se eliminará cuando todos los adapters legacy
 * hayan migrado.
 *
 * @remarks
 * La diferencia clave con `IChannelAdapter`:
 * - `initialize()` es **síncrono** (no async)
 * - La configuración real se pasa en `setup()` de forma asíncrona
 * - `onError()` es obligatorio (en `IChannelAdapter` los errores se propagan via throw)
 */
export interface ChannelAdapter {
  /**
   * Almacena el `channelConfigId` para uso posterior en `setup()`.
   * No realiza ninguna llamada de red — esa lógica va en `setup()`.
   *
   * @param channelConfigId — UUID del `ChannelConfig` en Prisma.
   */
  initialize(channelConfigId: string): void

  /**
   * Aplica la configuración descifrada y establece la conexión activa.
   *
   * @param config  — configuración no sensible del canal (e.g., `webhookPath`)
   * @param secrets — secretos descifrados (tokens, API keys)
   * @param mode    — modo de operación del adaptador
   */
  setup(
    config:  Record<string, unknown>,
    secrets: Record<string, unknown>,
    mode?:   AdapterMode,
  ): Promise<void>

  /**
   * Envía un {@link OutgoingMessage} al canal externo.
   * @see {@link IChannelAdapter.send}
   */
  send(message: OutgoingMessage): Promise<void>

  /**
   * Libera recursos del adaptador.
   * @see {@link IChannelAdapter.dispose}
   */
  dispose(): Promise<void>

  /**
   * Registra el handler de mensajes entrantes.
   * @see {@link IChannelAdapter.onMessage}
   */
  onMessage(handler: (msg: IncomingMessage) => void): void

  /**
   * Registra un handler para errores no recuperables del adaptador.
   *
   * Llamado cuando ocurre un error que no está asociado a un mensaje
   * específico (e.g., pérdida de conexión WebSocket, error de autenticación
   * del bot).
   *
   * @param handler — función que recibe el error producido.
   */
  onError(handler: (err: Error) => void): void
}

// ── BaseChannelAdapter ────────────────────────────────────────────────────────

/**
 * Clase base abstracta para todos los adaptadores de canal.
 *
 * Provee:
 * - Gestión del handler de mensajes ({@link onMessage} + campo privado)
 * - Método {@link emit} para despachar mensajes normalizados al gateway
 * - Método {@link makeTimestamp} para timestamps ISO 8601 consistentes
 * - Almacenamiento de `channelConfigId` y `credentials`
 *
 * @remarks
 * Los adapters concretos **deben** extender esta clase e implementar:
 * - `readonly channel: ChannelType` — identificador de canal
 * - `initialize(channelConfigId: string): Promise<void>` — setup de conexión
 * - `send(message: OutgoingMessage): Promise<void>` — envío al canal
 * - `dispose(): Promise<void>` — limpieza de recursos
 *
 * @example
 * ```ts
 * export class TelegramAdapter extends BaseChannelAdapter {
 *   readonly channel = 'telegram' as const
 *
 *   async initialize(id: string) {
 *     this.channelConfigId = id
 *     // cargar credenciales, registrar webhook...
 *   }
 *
 *   async send(msg: OutgoingMessage) {
 *     await this.telegramBot.sendMessage(msg.externalId, msg.text)
 *   }
 *
 *   async dispose() {
 *     await this.telegramBot.close()
 *   }
 * }
 * ```
 */
export abstract class BaseChannelAdapter implements IChannelAdapter {
  /** Identificador de canal — declarado como `const` en cada subclase. */
  abstract readonly channel: ChannelType

  /**
   * UUID del `ChannelConfig` activo en Prisma.
   *
   * Relleno en `initialize()`. Necesario para construir `IncomingMessage`
   * con el campo `channelConfigId` correcto antes de llamar a `emit()`.
   */
  protected channelConfigId = ''

  /**
   * Credenciales descifradas del canal.
   *
   * Cargadas en `initialize()` via `ChannelCredentialsLoader`.
   * Contiene tokens, API keys y cualquier secreto necesario para operar el canal.
   */
  protected credentials: Record<string, unknown> = {}

  /**
   * Acceso protegido al handler de mensajes registrado.
   *
   * Las subclases pueden leerlo para verificar si hay handler antes de
   * llamar a `emit()`, aunque lo habitual es llamar `emit()` directamente.
   */
  protected get messageHandler() { return this._messageHandler }

  /** Handler interno — privado para forzar el uso de `onMessage()` y `emit()`. */
  private _messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null

  abstract initialize(channelConfigId: string): Promise<void>
  abstract send(message: OutgoingMessage): Promise<void>
  abstract dispose(): Promise<void>

  /**
   * Registra el handler que procesará cada mensaje entrante.
   *
   * Llamado por `ChannelAdapterRegistry` justo después de instanciar el adapter.
   * Las llamadas sucesivas reemplazan el handler anterior (útil en tests).
   *
   * @param handler — función asíncrona que recibe el `IncomingMessage` normalizado.
   */
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this._messageHandler = handler
  }

  /**
   * Despacha un {@link IncomingMessage} normalizado al handler del gateway.
   *
   * Valida que `channelConfigId` esté presente antes de invocar el handler.
   * Si no hay handler registrado, emite un warning y descarta el mensaje
   * (en lugar de lanzar un error que podría crashear el proceso del adapter).
   *
   * @param msg — mensaje ya normalizado con todos los campos requeridos.
   *
   * @remarks
   * Las subclases **siempre** deben rellenar `channelConfigId` y `channelType`
   * antes de llamar a `emit()`. Un mensaje sin `channelConfigId` no puede
   * ser rutado por `SessionManager`.
   *
   * @example
   * ```ts
   * // En el handler de webhook del adapter:
   * await this.emit({
   *   channelConfigId: this.channelConfigId,
   *   channelType:     this.channel,
   *   externalId:      update.message.chat.id.toString(),
   *   senderId:        update.message.from.id.toString(),
   *   text:            update.message.text ?? '',
   *   type:            'text',
   *   receivedAt:      this.makeTimestamp(),
   * })
   * ```
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

  /**
   * Genera un timestamp ISO 8601 del momento actual.
   *
   * Centraliza la generación de timestamps para que todas las subclases
   * usen el mismo formato sin importar `Date` directamente.
   *
   * @returns String en formato `'YYYY-MM-DDTHH:mm:ss.sssZ'`.
   *
   * @example
   * ```ts
   * receivedAt: this.makeTimestamp() // → '2025-01-15T12:34:56.789Z'
   * ```
   */
  protected makeTimestamp(): string {
    return new Date().toISOString()
  }
}
