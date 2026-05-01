/**
 * whatsapp-baileys.adapter.ts — WhatsApp via Baileys (WA Web protocol)
 * [F3a-21]
 *
 * A diferencia de WhatsAppAdapter (Cloud API), este adapter usa el
 * protocolo WhatsApp Web via Baileys. No requiere cuenta Business ni
 * aprobación de Meta — funciona con cualquier número de WhatsApp.
 *
 * QR pairing lazy-load:
 *   El socket se crea SOLO cuando se necesita (primer send() o
 *   llamada explícita a connect()). Esto evita abrir N sockets
 *   al iniciar el gateway si hay N canales WA configurados.
 *
 * Estados del adapter:
 *   idle        → instanciado, sin socket
 *   connecting  → makeWASocket() llamado, esperando eventos
 *   qr          → QR generado, esperando escaneo del usuario
 *   open        → autenticado y conectado
 *   closed      → socket cerrado
 *   reconnecting→ intento de reconexión en curso
 *
 * Transiciones válidas:
 *   idle → connecting        (primer send() o connect() explícito)
 *   connecting → qr          (Baileys emite QR, primera vez sin creds)
 *   connecting → open        (tiene creds guardadas, reconecta directo)
 *   qr → open                (usuario escanea QR)
 *   qr → closed              (timeout 2 min sin escaneo)
 *   open → reconnecting      (desconexión inesperada)
 *   reconnecting → open      (reconexión exitosa)
 *   reconnecting → closed    (max retries alcanzados)
 *   closed → connecting      (reconnect manual o nueva connect())
 *   * → closed               (dispose())
 *
 * Auth state:
 *   Se persiste en filesystem via useMultiFileAuthState().
 *   Directorio: ${WA_SESSIONS_DIR}/${channelConfigId}/
 *   Variable de entorno: WA_SESSIONS_DIR (default: ./data/wa-sessions)
 *   IMPORTANTE: añadir data/wa-sessions/ a .gitignore
 *
 * Uso en GatewayService:
 *   const adapter = new WhatsAppBaileysAdapter()
 *   await adapter.setup(config, secrets)   // setup sin conectar (lazy)
 *   adapter.onMessage(handler)
 *   adapter.onQr(qr => exposeToAdmin(qr))  // exponer QR al admin
 *   adapter.onStateChange(state => log(state))
 *   // La conexión ocurre al primer dispatch() → send()
 */

import path         from 'node:path'
import fs           from 'node:fs'
import EventEmitter from 'node:events'
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
  type ReplyFn,
  type ReplyOptions,
} from './channel-adapter.interface.js'

// ── Tipos de Baileys (importados dinámicamente para evitar cargar el módulo
//    en tests que no usen WhatsApp — Baileys es pesado) ─────────────────────

type BaileysSocket = {
  sendMessage: (
    jid: string,
    content: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => Promise<unknown>
  logout: () => Promise<void>
  end:    (err?: Error) => void
  ev: {
    on: (event: string, handler: (...args: unknown[]) => void) => void
    off: (event: string, handler: (...args: unknown[]) => void) => void
  }
  user?: { id: string; name?: string }
}

type DisconnectReason = {
  loggedOut:     number
  connectionLost: number
  restartRequired: number
  timedOut:      number
  badSession:    number
}

// ── Estado del adapter ─────────────────────────────────────────────────────

export type WhatsAppAdapterState =
  | 'idle'
  | 'connecting'
  | 'qr'
  | 'open'
  | 'closed'
  | 'reconnecting'

// ── Config ─────────────────────────────────────────────────────────────────

interface WhatsAppBaileysConfig {
  /** Directorio base para auth state. Default: ./data/wa-sessions */
  sessionsDir?:          string
  /** Máximo de reconexiones antes de closed. Default: 5 */
  maxReconnectAttempts?: number
  /** Timeout QR en ms. Default: 120_000 (2 min) */
  qrTimeoutMs?:         number
  /** Imprimir QR en consola (dev mode). Default: false */
  printQrInTerminal?:   boolean
  /** Browser label para Baileys. Default: ['AgentVS Gateway', 'Chrome', '120.0'] */
  browser?:             [string, string, string]
}

// ── WhatsAppBaileysAdapter ──────────────────────────────────────────────────

export class WhatsAppBaileysAdapter extends BaseChannelAdapter {
  readonly channel = 'whatsapp-baileys'

  // ── Estado interno ────────────────────────────────────────────────────
  private state:             WhatsAppAdapterState = 'idle'
  private sock:              BaileysSocket | null  = null
  private reconnectAttempts  = 0
  private qrTimeoutHandle:   ReturnType<typeof setTimeout> | null = null
  private connectPromise:    Promise<void> | null = null  // evita conexiones paralelas

  // ── Config ────────────────────────────────────────────────────────────
  private sessionsDir          = process.env['WA_SESSIONS_DIR'] ?? './data/wa-sessions'
  private maxReconnectAttempts = parseInt(process.env['WA_MAX_RECONNECT_ATTEMPTS'] ?? '5')
  private qrTimeoutMs          = 120_000
  private printQrInTerminal    = false
  private browser: [string, string, string] = ['AgentVS Gateway', 'Chrome', '120.0']

  // ── EventEmitter para QR y cambios de estado ──────────────────────────
  private readonly emitter = new EventEmitter()

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * initialize() — stub de compatibilidad con IChannelAdapter.
   * El flujo canónico es setup(config, secrets).
   */
  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
    console.warn(
      '[whatsapp-baileys] initialize() sin credenciales — usar setup(config, secrets) en su lugar',
    )
  }

  /**
   * setup() — configura el adapter con config + secrets descifrados.
   * Llamado por GatewayService.activateChannel() (patrón F3a-14).
   * NO conecta el socket — lazy-load al primer send().
   */
  async setup(
    config:  Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<void> {
    const cfg = config as WhatsAppBaileysConfig

    this.sessionsDir = String(
      process.env['WA_SESSIONS_DIR']
      ?? cfg.sessionsDir
      ?? './data/wa-sessions',
    )
    this.maxReconnectAttempts = Number(
      process.env['WA_MAX_RECONNECT_ATTEMPTS']
      ?? cfg.maxReconnectAttempts
      ?? 5,
    )
    this.qrTimeoutMs       = Number(cfg.qrTimeoutMs    ?? 120_000)
    this.printQrInTerminal = Boolean(cfg.printQrInTerminal ?? false)
    if (cfg.browser) this.browser = cfg.browser

    // Asegurar que el directorio de sesiones existe
    const sessionPath = this.getSessionPath()
    fs.mkdirSync(sessionPath, { recursive: true })

    console.info(
      `[whatsapp-baileys] Adapter configured (lazy) — channelId=${this.channelConfigId}, ` +
      `sessionsDir=${sessionPath}`,
    )
  }

  /**
   * connect() — inicia la conexión Baileys explícitamente.
   * Si ya hay una conexión en curso (connectPromise), retorna la misma.
   * Idempotente si state === 'open'.
   */
  async connect(): Promise<void> {
    if (this.state === 'open') return
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = this.doConnect()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async doConnect(): Promise<void> {
    this.setState('connecting')

    // Importación dinámica de Baileys (ESM puro) — evita cargar en tests
    const baileys = await import('@whiskeysockets/baileys').catch((err: unknown) => {
      throw new Error(
        `[whatsapp-baileys] No se pudo cargar @whiskeysockets/baileys: ${String(err)}\n` +
        `Ejecutar: pnpm add @whiskeysockets/baileys pino --filter gateway`,
      )
    })

    const { makeWASocket, useMultiFileAuthState, DisconnectReason: DR, fetchLatestBaileysVersion } =
      baileys as unknown as {
        makeWASocket:          (opts: Record<string, unknown>) => BaileysSocket
        useMultiFileAuthState: (dir: string) => Promise<{
          state:     unknown
          saveCreds: () => Promise<void>
        }>
        DisconnectReason:      DisconnectReason
        fetchLatestBaileysVersion: () => Promise<{ version: [number, number, number] }>
      }

    // Auth state desde filesystem
    const sessionPath = this.getSessionPath()
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath)

    // Versión de Baileys
    const { version } = await fetchLatestBaileysVersion()

    // Crear socket
    const sock = makeWASocket({
      version,
      auth:             state,
      printQRInTerminal: this.printQrInTerminal,
      browser:          this.browser,
      logger:           this.makePinoLogger(),
      // Reconexión gestionada manualmente
      retryRequestDelayMs: 0,
    }) as BaileysSocket

    this.sock = sock

    // ── Eventos de Baileys ─────────────────────────────────────────────

    // QR code
    sock.ev.on('connection.update', ((update: {
      connection?: string
      lastDisconnect?: { error?: { output?: { statusCode?: number } } }
      qr?: string
    }) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        this.handleQr(qr)
      }

      if (connection === 'close') {
        this.clearQrTimeout()
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const isLoggedOut = statusCode === (DR as unknown as { loggedOut: number }).loggedOut

        if (isLoggedOut) {
          console.warn('[whatsapp-baileys] Sesión cerrada (logout) — eliminando creds')
          this.clearSessionFiles()
          this.setState('closed')
          this.emitter.emit('error', new Error('WhatsApp session logged out'))
          return
        }

        // Reconectar con backoff
        this.handleDisconnect()
      }

      if (connection === 'open') {
        this.clearQrTimeout()
        this.reconnectAttempts = 0
        this.setState('open')
        console.info(
          `[whatsapp-baileys] Conexión abierta — jid=${sock.user?.id ?? 'unknown'}`,
        )
      }
    }) as (...args: unknown[]) => void)

    // Guardar creds cuando Baileys las actualiza
    sock.ev.on('creds.update', saveCreds as unknown as (...args: unknown[]) => void)

    // Mensajes entrantes
    sock.ev.on('messages.upsert', ((event: {
      messages: unknown[]
      type:     string
    }) => {
      if (event.type !== 'notify') return
      for (const rawMsg of event.messages) {
        this.handleIncomingMessage(rawMsg as Record<string, unknown>, sock).catch((err: unknown) => {
          console.error('[whatsapp-baileys] Error procesando mensaje:', err)
        })
      }
    }) as (...args: unknown[]) => void)
  }

  async dispose(): Promise<void> {
    this.clearQrTimeout()
    this.setState('closed')

    if (this.sock) {
      try {
        this.sock.end()
      } catch { /* ignorar errores al cerrar */ }
      this.sock = null
    }

    this.emitter.removeAllListeners()
    console.info('[whatsapp-baileys] Adapter disposed')
  }

  // ── send() ─────────────────────────────────────────────────────────────

  /**
   * Envía un mensaje de texto al JID de WhatsApp.
   * Si el adapter no está conectado → conecta lazy antes de enviar.
   */
  async send(message: OutgoingMessage): Promise<void> {
    // Lazy connect al primer send()
    if (this.state !== 'open') {
      await this.connect()
    }

    if (!this.sock) {
      throw new Error('[whatsapp-baileys] Socket no disponible para send()')
    }

    const jid = this.toJid(message.externalId)

    const content: Record<string, unknown> = {
      text: message.text,
    }

    // richContent (botones, listas — requiere WA Business API, aquí best-effort)
    if (message.richContent) {
      Object.assign(content, message.richContent)
    }

    await this.sock.sendMessage(jid, content)
  }

  // ── receive() — construye IncomingMessage (patrón F3a-17) ─────────────

  /**
   * Convierte un mensaje crudo de Baileys en IncomingMessage normalizado.
   * Construye replyFn como closure capturando jid + sock.
   * Retorna null si el mensaje debe ignorarse (propio bot, status, vacío).
   */
  async receive(
    rawPayload: Record<string, unknown>,
    _secrets:   Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    // receive() en Baileys es llamado desde handleIncomingMessage()
    // con el message ya crudo — normalizamos aquí
    return this.normalizeMessage(rawPayload, this.sock)
  }

  // ── Callbacks públicos ─────────────────────────────────────────────────

  /** Registrar handler para QR codes (admin UI). */
  onQr(handler: (qr: string) => void): void {
    this.emitter.on('qr', handler)
  }

  /** Registrar handler para cambios de estado. */
  onStateChange(handler: (state: WhatsAppAdapterState) => void): void {
    this.emitter.on('state', handler)
  }

  /** Registrar handler para errores del adapter. */
  onError(handler: (err: Error) => void): void {
    this.emitter.on('error', handler)
  }

  /** Estado actual del adapter. */
  getState(): WhatsAppAdapterState {
    return this.state
  }

  // ── Manejo de mensajes entrantes (interno) ─────────────────────────────

  private async handleIncomingMessage(
    rawMsg: Record<string, unknown>,
    sock:   BaileysSocket,
  ): Promise<void> {
    // Ignorar mensajes propios del bot
    const key = rawMsg['key'] as Record<string, unknown> | undefined
    if (key?.['fromMe']) return

    // Ignorar status broadcasts
    const remoteJid = String(key?.['remoteJid'] ?? '')
    if (remoteJid === 'status@broadcast') return

    const incoming = this.normalizeMessage(rawMsg, sock)
    if (!incoming) return

    await this.emit(incoming)
  }

  private normalizeMessage(
    rawMsg: Record<string, unknown>,
    sock:   BaileysSocket | null,
  ): IncomingMessage | null {
    const key        = rawMsg['key'] as Record<string, unknown> | undefined
    const message    = rawMsg['message'] as Record<string, unknown> | undefined
    const pushName   = String(rawMsg['pushName'] ?? '')

    if (!key || !message) return null

    const remoteJid   = String(key['remoteJid'] ?? '')
    const participant = String(key['participant'] ?? key['remoteJid'] ?? '')
    const isGroup     = remoteJid.endsWith('@g.us')

    // Extraer texto del mensaje
    const text       = this.extractText(message)
    const type       = this.extractType(message)
    const attachment = this.extractAttachment(message)

    // Para grupos, externalId = groupJid, threadId = groupJid, senderId = participant
    // Para DMs,    externalId = userJid,  threadId = userJid,  senderId = userJid
    const chatJid    = remoteJid
    const senderJid  = isGroup ? participant : remoteJid
    const threadId   = chatJid   // WA no tiene threads como Telegram topics

    // Construir replyFn capturando chatJid y sock
    const replyFn: ReplyFn | undefined = sock
      ? async (replyText: string, opts?: ReplyOptions) => {
          if (!sock) throw new Error('[whatsapp-baileys] Socket cerrado al intentar responder')

          const content: Record<string, unknown> = {
            text: replyText,
          }

          if (opts?.quoteOriginal && key['id']) {
            // Citar el mensaje original
            content['quoted'] = rawMsg
          }

          if (opts?.channelMeta?.['richContent']) {
            Object.assign(content, opts.channelMeta['richContent'])
          }

          await sock.sendMessage(chatJid, content)
        }
      : undefined

    return {
      externalId:  chatJid,
      threadId,
      senderId:    senderJid,
      text:        text ?? '',
      type,
      attachments: attachment ? [attachment] : undefined,
      replyFn,
      rawPayload:  this.sanitizeRawPayload(
        rawMsg,
        ['botToken', 'accessToken', 'apiKey', 'sessionKey'],
      ),
      metadata: {
        pushName,
        remoteJid,
        isGroup,
        messageId: String(key['id'] ?? ''),
      },
      receivedAt: this.makeTimestamp(),
    }
  }

  // ── Extracción de contenido de mensaje ────────────────────────────────

  private extractText(message: Record<string, unknown>): string | null {
    if (message['conversation'])         return String(message['conversation'])
    if (message['extendedTextMessage']) {
      const ext = message['extendedTextMessage'] as Record<string, unknown>
      return String(ext['text'] ?? '')
    }
    if (message['imageMessage']) {
      const img = message['imageMessage'] as Record<string, unknown>
      return String(img['caption'] ?? '')
    }
    if (message['videoMessage']) {
      const vid = message['videoMessage'] as Record<string, unknown>
      return String(vid['caption'] ?? '')
    }
    if (message['documentMessage']) {
      const doc = message['documentMessage'] as Record<string, unknown>
      return String(doc['fileName'] ?? doc['caption'] ?? '')
    }
    if (message['audioMessage'])    return '[Audio]'
    if (message['stickerMessage'])  return '[Sticker]'
    if (message['locationMessage']) {
      const loc = message['locationMessage'] as Record<string, unknown>
      return `[Location: ${String(loc['degreesLatitude'])}, ${String(loc['degreesLongitude'])}]`
    }
    return null
  }

  private extractType(message: Record<string, unknown>): IncomingMessage['type'] {
    if (message['imageMessage'])    return 'image'
    if (message['audioMessage'])    return 'audio'
    if (message['documentMessage']) return 'file'
    if (message['videoMessage'])    return 'file'
    const text =
      (message['conversation'] as string | undefined) ??
      ((message['extendedTextMessage'] as Record<string, unknown> | undefined)?.['text'] as string | undefined) ??
      ''
    if (text.startsWith('/'))       return 'command'
    return 'text'
  }

  private extractAttachment(
    message: Record<string, unknown>,
  ): { type: string; url?: string; data?: unknown } | null {
    if (message['imageMessage']) {
      const img = message['imageMessage'] as Record<string, unknown>
      return { type: 'image', url: String(img['url'] ?? '') }
    }
    if (message['audioMessage']) {
      const aud = message['audioMessage'] as Record<string, unknown>
      return { type: 'audio', url: String(aud['url'] ?? '') }
    }
    if (message['documentMessage']) {
      const doc = message['documentMessage'] as Record<string, unknown>
      return {
        type: 'file',
        url:  String(doc['url'] ?? ''),
        data: { fileName: doc['fileName'], mimetype: doc['mimetype'] },
      }
    }
    return null
  }

  // ── QR y reconexión ────────────────────────────────────────────────────

  private handleQr(qr: string): void {
    this.setState('qr')
    this.emitter.emit('qr', qr)

    if (this.printQrInTerminal) {
      // En modo dev, imprimir QR en consola (lo hace Baileys si printQRInTerminal=true)
      console.info('[whatsapp-baileys] QR generado — escanear con WhatsApp')
    }

    // Timeout de QR: 2 minutos sin escaneo → cerrar
    this.clearQrTimeout()
    this.qrTimeoutHandle = setTimeout(() => {
      console.warn('[whatsapp-baileys] QR timeout — cerrando socket')
      this.setState('closed')
      this.sock?.end(new Error('QR timeout'))
      this.sock = null
      this.emitter.emit('error', new Error('WhatsApp QR pairing timeout (2 min)'))
    }, this.qrTimeoutMs)
  }

  private handleDisconnect(): void {
    this.sock = null

    if (this.state === 'closed') return  // dispose() ya llamado

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `[whatsapp-baileys] Max reconexiones alcanzadas (${this.maxReconnectAttempts}) — ` +
        `deteniendo adapter`,
      )
      this.setState('closed')
      this.emitter.emit(
        'error',
        new Error(`WhatsApp adapter: max reconnect attempts (${this.maxReconnectAttempts}) reached`),
      )
      return
    }

    this.reconnectAttempts++
    this.setState('reconnecting')

    // Backoff exponencial: 1s, 2s, 4s, 8s, …
    const delay = 1_000 * 2 ** (this.reconnectAttempts - 1)
    console.warn(
      `[whatsapp-baileys] Reconectando en ${delay}ms ` +
      `(intento ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    )

    setTimeout(() => {
      if (this.state === 'closed') return  // dispose() llamado durante la espera
      this.doConnect().catch((err: unknown) => {
        console.error('[whatsapp-baileys] Error en reconexión:', err)
        this.handleDisconnect()
      })
    }, delay)
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private setState(newState: WhatsAppAdapterState): void {
    if (this.state === newState) return
    const prev = this.state
    this.state  = newState
    console.info(`[whatsapp-baileys] Estado: ${prev} → ${newState}`)
    this.emitter.emit('state', newState)
  }

  private clearQrTimeout(): void {
    if (this.qrTimeoutHandle !== null) {
      clearTimeout(this.qrTimeoutHandle)
      this.qrTimeoutHandle = null
    }
  }

  private getSessionPath(): string {
    return path.join(this.sessionsDir, this.channelConfigId || 'default')
  }

  private clearSessionFiles(): void {
    const sessionPath = this.getSessionPath()
    try {
      fs.rmSync(sessionPath, { recursive: true, force: true })
      console.info(`[whatsapp-baileys] Auth state eliminado: ${sessionPath}`)
    } catch (err) {
      console.error('[whatsapp-baileys] Error eliminando auth state:', err)
    }
  }

  /**
   * Normaliza un número de teléfono o JID a formato Baileys.
   * Baileys usa JIDs: '5491112345678@s.whatsapp.net' para DMs
   *                   'groupid@g.us' para grupos
   */
  private toJid(externalId: string): string {
    if (externalId.includes('@')) return externalId  // ya es JID
    // Número de teléfono → JID
    const cleaned = externalId.replace(/[^0-9]/g, '')
    return `${cleaned}@s.whatsapp.net`
  }

  /**
   * Crea un logger pino silencioso para Baileys.
   * En producción, cambiar el nivel a 'info' o usar pino real.
   */
  private makePinoLogger() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pino = require('pino') as (opts: Record<string, unknown>) => unknown
      return pino({ level: 'silent' })
    } catch {
      // Pino no instalado — Baileys usará console
      return undefined
    }
  }
}
