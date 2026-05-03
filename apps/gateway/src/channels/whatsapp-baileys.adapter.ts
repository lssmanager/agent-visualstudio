/**
 * whatsapp-baileys.adapter.ts — WhatsApp via Baileys (WA Web protocol)
 * [F3a-21 / F3a-23 / F3a-24 / F5-02]
 *
 * A diferencia de WhatsAppAdapter (Cloud API), este adapter usa el
 * protocolo WhatsApp Web via Baileys. No requiere cuenta Business ni
 * aprobación de Meta — funciona con cualquier número de WhatsApp.
 *
 * F3a-24: Inline mapping reemplazado por llamadas a:
 *   - baileysToIncoming() de whatsapp-message.mapper.ts
 *   - outgoingToBaileys() de whatsapp-send.mapper.ts
 * Se eliminan métodos privados: toJid(), handleIncomingMessage(),
 * normalizeMessage(), extractText(), extractType(), extractAttachment().
 *
 * F3a-23: ExponentialBackoff integrado para reconexiones.
 *
 * F5-02: Session persistence en Prisma (D-22b).
 *   - useMultiFileAuthState (filesystem) → usePrismaAuthState (Prisma)
 *   - clearSessionFiles() → clearSessionInDb()
 *   - Eliminados imports node:path y node:fs
 *   - setup() ya no llama fs.mkdirSync()
 *   - PrismaClient inyectado via constructor
 */

import EventEmitter from 'node:events'
import {
  BaseChannelAdapter,
  type OutgoingMessage,
} from './channel-adapter.interface.js'
import { baileysToIncoming }              from './whatsapp-message.mapper.js'
import { outgoingToBaileys }              from './whatsapp-send.mapper.js'
import { ExponentialBackoff }             from './whatsapp-backoff.js'
import { usePrismaAuthState, clearSessionInDb } from './whatsapp-prisma-auth.js'
import type { PrismaClient }              from '@prisma/client'

// ── Tipos de Baileys (importados dinámicamente) ─────────────────────────

type BaileysSocket = {
  sendMessage: (
    jid: string,
    content: Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => Promise<unknown>
  logout: () => Promise<void>
  end:    (err?: Error) => void
  ev: {
    on:              (event: string, handler: (...args: unknown[]) => void) => void
    off:             (event: string, handler: (...args: unknown[]) => void) => void
    removeAllListeners: () => void
  }
  user?: { id: string; name?: string }
}

type DisconnectReason = {
  loggedOut:         number
  connectionLost:    number
  restartRequired:   number
  timedOut:          number
  badSession:        number
  connectionReplaced: number
}

// ── Estado del adapter ──────────────────────────────────────────────────

export type WhatsAppAdapterState =
  | 'idle'
  | 'connecting'
  | 'qr'
  | 'open'
  | 'closed'
  | 'reconnecting'

// ── Config ─────────────────────────────────────────────────────────────────

interface WhatsAppBaileysConfig {
  maxReconnectAttempts?: number
  qrTimeoutMs?:         number
  printQrInTerminal?:   boolean
  browser?:             [string, string, string]
}

// ── WhatsAppBaileysAdapter ───────────────────────────────────────────────

export class WhatsAppBaileysAdapter extends BaseChannelAdapter {
  readonly channel = 'whatsapp-baileys'

  // Prisma (F5-02): inyectado en el constructor para persistir credenciales
  private readonly prisma: PrismaClient

  // Estado interno
  private _state:           WhatsAppAdapterState = 'idle'
  private sock:              BaileysSocket | null  = null
  private qrTimeoutHandle:  ReturnType<typeof setTimeout> | null = null
  private connectPromise:   Promise<void> | null = null

  // Backoff (F3a-23)
  private backoff = new ExponentialBackoff({
    baseMs:     3_000,
    capMs:      90_000,
    maxRetries: 8,
    factor:     2,
  })

  // Config
  private maxReconnectAttempts = parseInt(process.env['WA_MAX_RECONNECT_ATTEMPTS'] ?? '8')
  private qrTimeoutMs          = 120_000
  private printQrInTerminal    = false
  private browser: [string, string, string] = ['AgentVS Gateway', 'Chrome', '120.0']

  private readonly emitter = new EventEmitter()

  /**
   * @param prisma - PrismaClient para persistir credenciales Baileys (F5-02).
   *   Si el gateway usa NestJS DI, pasar PrismaService (extiende PrismaClient).
   *   Si se instancia manualmente: new WhatsAppBaileysAdapter(prismaClient)
   */
  constructor(prisma: PrismaClient) {
    super()
    this.prisma = prisma
  }

  // ── Estado público ───────────────────────────────────────────────────────────

  get state(): WhatsAppAdapterState { return this._state }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
    console.warn('[whatsapp-baileys] initialize() sin credenciales — usar setup(config, secrets)')
  }

  async setup(
    config:   Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<void> {
    const cfg = config as WhatsAppBaileysConfig
    this.maxReconnectAttempts = Number(
      process.env['WA_MAX_RECONNECT_ATTEMPTS'] ?? cfg.maxReconnectAttempts ?? 8,
    )
    this.qrTimeoutMs       = Number(cfg.qrTimeoutMs    ?? 120_000)
    this.printQrInTerminal = Boolean(cfg.printQrInTerminal ?? false)
    if (cfg.browser) this.browser = cfg.browser

    // F5-02: No se crea ningún directorio en disco.
    // Las credenciales se leen/escriben en Prisma vía usePrismaAuthState().

    console.info(
      `[whatsapp-baileys] Adapter configured (lazy) — channelId=${this.channelConfigId}`,
    )
  }

  async connect(): Promise<void> {
    if (this._state === 'open') return
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

    const baileys = await import('@whiskeysockets/baileys').catch((err: unknown) => {
      throw new Error(
        `[whatsapp-baileys] No se pudo cargar @whiskeysockets/baileys: ${String(err)}`,
      )
    })

    const { makeWASocket, DisconnectReason: DR, fetchLatestBaileysVersion } =
      baileys as unknown as {
        makeWASocket:              (opts: Record<string, unknown>) => BaileysSocket
        DisconnectReason:          DisconnectReason
        fetchLatestBaileysVersion: () => Promise<{ version: [number, number, number] }>
      }

    // F5-02: Usar Prisma en lugar de filesystem para las credenciales
    const { state, saveCreds } = await usePrismaAuthState(
      this.prisma,
      this.channelConfigId,
    )

    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      version,
      auth:              state,
      printQRInTerminal: this.printQrInTerminal,
      browser:           this.browser,
      logger:            this.makePinoLogger(),
      retryRequestDelayMs: 0,
    }) as BaileysSocket

    this.sock = sock

    // ── connection.update ─────────────────────────────────────────────────
    sock.ev.on('connection.update', ((update: {
      connection?: string
      lastDisconnect?: { error?: { output?: { statusCode?: number } } }
      qr?: string
    }) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) { this.handleQr(qr) }

      if (connection === 'close') {
        this.clearQrTimeout()
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const isPermanentClose =
          statusCode === (DR as unknown as DisconnectReason).loggedOut ||
          statusCode === (DR as unknown as DisconnectReason).connectionReplaced

        if (isPermanentClose) {
          console.warn(`[whatsapp-baileys:${this.channelConfigId}] Permanent close (${statusCode}) — clearing session in DB`)
          // F5-02: clearSessionInDb() en lugar de clearSessionFiles()
          void clearSessionInDb(this.prisma, this.channelConfigId)
          this.setState('closed')
          this.emitter.emit('closed', this.channelConfigId, 'permanent_close')
          return
        }

        // Reconexión con ExponentialBackoff (F3a-23)
        if (!this.backoff.exhausted && !this.backoff.isAborted) {
          this.setState('reconnecting')
          this.sock = null
          this.connectPromise = null

          console.warn(
            `[whatsapp-baileys:${this.channelConfigId}] Disconnected — ${this.backoff}`,
          )

          this.backoff.next()
            .then(() => this.connect())
            .catch((err: Error) => {
              if (err.message === 'backoff_exhausted') {
                this.setState('closed')
                this.emitter.emit('closed', this.channelConfigId, 'max_retries_exceeded')
                console.error(
                  `[whatsapp-baileys:${this.channelConfigId}] Max retries reached`,
                )
              } else if (err.message !== 'backoff_aborted') {
                console.error(
                  `[whatsapp-baileys:${this.channelConfigId}] Reconnect error:`, err,
                )
              }
              // 'backoff_aborted' = dispose() fue llamado — silencio intencional
            })
        } else {
          this.setState('closed')
          this.emitter.emit('closed', this.channelConfigId, 'max_retries_exceeded')
        }
      }

      if (connection === 'open') {
        this.clearQrTimeout()
        this.backoff.reset()   // F3a-23: resetear tras conexión exitosa
        this.setState('open')
        console.info(
          `[whatsapp-baileys:${this.channelConfigId}] Connected — jid=${sock.user?.id ?? 'unknown'}`,
        )
      }
    }) as (...args: unknown[]) => void)

    sock.ev.on('creds.update', saveCreds as unknown as (...args: unknown[]) => void)

    // ── messages.upsert: usa baileysToIncoming() (F3a-24) ──────────────────
    sock.ev.on('messages.upsert', ((event: { messages: unknown[]; type: string }) => {
      if (event.type !== 'notify') return

      for (const rawMsg of event.messages) {
        // Castear a proto.IWebMessageInfo (estructura compatible)
        const waMsg = rawMsg as Parameters<typeof baileysToIncoming>[0]
        const normalized = baileysToIncoming(waMsg)
        if (!normalized) continue   // null = mensaje propio / sistema / no soportado

        this.emit(normalized).catch((err: unknown) =>
          console.error(
            `[whatsapp-baileys:${this.channelConfigId}] emit error (${(waMsg as Record<string, unknown> & { key?: { id?: string } })?.key?.id}):`,
            err,
          ),
        )
      }
    }) as (...args: unknown[]) => void)
  }

  // ── dispose (F3a-23: abortar backoff) ───────────────────────────────────

  async dispose(): Promise<void> {
    this.backoff.abort()   // F3a-23: cancelar timer de reconexion pendiente
    this.clearQrTimeout()
    this.setState('closed')

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners()
        this.sock.end()
      } catch { /* ignorar */ }
      this.sock = null
    }

    this.emitter.removeAllListeners()
    console.info(`[whatsapp-baileys:${this.channelConfigId}] Adapter disposed`)
  }

  // ── logout (F3a-23) ──────────────────────────────────────────────────────

  /**
   * Cierra la sesión de WhatsApp Web notificando al servidor WA.
   * Después de logout(), el estado queda 'closed'.
   * Se puede volver a conectar con connect() → generará nuevo QR.
   */
  async logout(): Promise<void> {
    this.backoff.abort()
    this.clearQrTimeout()

    if (this.sock) {
      try {
        await this.sock.logout()
      } catch (err) {
        console.warn(`[whatsapp-baileys:${this.channelConfigId}] logout error:`, err)
      } finally {
        this.sock.ev.removeAllListeners()
        this.sock.end()
        this.sock = null
      }
    }

    // F5-02: limpiar sesión en BD en lugar de filesystem
    await clearSessionInDb(this.prisma, this.channelConfigId)

    this.connectPromise = null
    this.setState('closed')
    this.emitter.emit('closed', this.channelConfigId, 'logged_out')
    console.info(`[whatsapp-baileys:${this.channelConfigId}] Logged out`)
  }

  // ── send() — usa outgoingToBaileys() (F3a-24) ─────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    if (this._state === 'idle' || this._state === 'closed') {
      await this.connect()
    }
    if (this._state !== 'open') {
      await this.waitForOpen(30_000)
    }
    if (!this.sock) {
      throw new Error(`[whatsapp-baileys:${this.channelConfigId}] Socket not available`)
    }

    const { jid, content } = outgoingToBaileys(message)
    await this.sock.sendMessage(jid, content)

    console.info(
      `[whatsapp-baileys:${this.channelConfigId}] Message sent to ${message.externalId}`,
    )
  }

  // ── receive() ────────────────────────────────────────────────────────────

  async receive(
    rawPayload: Record<string, unknown>,
    _secrets:   Record<string, unknown>,
  ): Promise<ReturnType<typeof baileysToIncoming>> {
    return baileysToIncoming(rawPayload as Parameters<typeof baileysToIncoming>[0])
  }

  // ── Callbacks públicos ──────────────────────────────────────────────────────

  onQr(handler: (qr: string) => void): void {
    this.emitter.on('qr', handler)
  }

  onConnected(handler: () => void): void {
    this.emitter.on('open', handler)
  }

  onDisconnected(handler: () => void): void {
    this.emitter.on('closed', handler)
  }

  onStateChange(handler: (state: WhatsAppAdapterState) => void): void {
    this.emitter.on('state', handler)
  }

  onError(handler: (err: Error) => void): void {
    this.emitter.on('error', handler)
  }

  getState(): WhatsAppAdapterState { return this._state }

  // ── Helpers privados ───────────────────────────────────────────────────────────

  private setState(newState: WhatsAppAdapterState): void {
    if (this._state === newState) return
    const prev = this._state
    this._state = newState
    console.info(`[whatsapp-baileys:${this.channelConfigId}] State: ${prev} → ${newState}`)
    this.emitter.emit('state', newState)
    if (newState === 'open')   this.emitter.emit('open')
    if (newState === 'closed') this.emitter.emit('closed', this.channelConfigId)
  }

  private clearQrTimeout(): void {
    if (this.qrTimeoutHandle !== null) {
      clearTimeout(this.qrTimeoutHandle)
      this.qrTimeoutHandle = null
    }
  }

  private handleQr(qr: string): void {
    this.setState('qr')
    this.emitter.emit('qr', qr)
    this.clearQrTimeout()
    this.qrTimeoutHandle = setTimeout(() => {
      console.warn(`[whatsapp-baileys:${this.channelConfigId}] QR timeout — closing socket`)
      this.setState('closed')
      this.sock?.end(new Error('QR timeout'))
      this.sock = null
    }, this.qrTimeoutMs)
  }

  /**
   * Espera hasta que el estado sea 'open' o se alcance el timeout.
   * Usado en send() para lazy connect.
   */
  private waitForOpen(timeoutMs: number): Promise<void> {
    if (this._state === 'open') return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitter.off('open', onOpen)
        reject(new Error(`[whatsapp-baileys:${this.channelConfigId}] waitForOpen timeout`))
      }, timeoutMs)
      const onOpen = () => {
        clearTimeout(timer)
        resolve()
      }
      this.emitter.once('open', onOpen)
    })
  }

  private makePinoLogger() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pino = require('pino') as (opts: Record<string, unknown>) => unknown
      return pino({ level: 'silent' })
    } catch {
      return undefined
    }
  }
}
