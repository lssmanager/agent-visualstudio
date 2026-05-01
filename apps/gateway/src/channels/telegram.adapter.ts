/**
 * telegram.adapter.ts — Adaptador Telegram Bot API
 * [F3a-18] Hardening: long-polling + webhook, retry/backoff,
 *          circuit breaker, replyFn/threadId/rawPayload (F3a-17).
 *
 * MODOS:
 *   webhook  — Telegram envía updates al POST /gateway/telegram/webhook
 *   polling  — El adaptador llama getUpdates en loop (dev/staging)
 *
 * Selección de modo:
 *   config.mode === 'polling'               → polling
 *   config.mode === 'webhook' (o undefined) → webhook
 *   Env override: TELEGRAM_MODE=polling|webhook
 *
 * Retry policy (aplica a send() y a cada ciclo de polling):
 *   - 3 intentos máximo
 *   - Backoff exponencial: 500ms → 1000ms → 2000ms
 *   - En 429 (rate limit): usa Retry-After del header si presente
 *
 * Circuit breaker del polling loop:
 *   - maxConsecutiveErrors: 5 (configurable vía config.maxConsecutiveErrors)
 *   - Si se alcanzan 5 errores consecutivos → loop se detiene, emite
 *     alerta via onError() y espera 60s antes de reintentar
 */

import { Router, type Request, type Response as ExpressResponse } from 'express'
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
  type ReplyFn,
  type ReplyOptions,
} from './channel-adapter.interface.js'

const TELEGRAM_API = 'https://api.telegram.org'

// ── Tipos del Bot API ─────────────────────────────────────────────────────────

interface TelegramMessage {
  message_id:         number
  chat:               { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' }
  from?:              { id: number; username?: string; first_name?: string }
  text?:              string
  caption?:           string
  photo?:             unknown[]
  document?:          unknown
  voice?:             unknown
  message_thread_id?: number    // presente en supergrupos con topics
  reply_to_message?:  { message_id: number }
}

interface TelegramCallbackQuery {
  id:       string
  from:     { id: number }
  data?:    string
  message?: TelegramMessage
}

interface TelegramUpdate {
  update_id:       number
  message?:        TelegramMessage
  edited_message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

interface TelegramCredentials {
  botToken:       string
  webhookSecret?: string
}

interface TelegramChannelConfig {
  mode?:                 'webhook' | 'polling'
  pollingTimeout?:       number   // long-poll timeout in seconds (default: 25)
  pollingInterval?:      number   // ms between polls on error (default: 1000)
  maxConsecutiveErrors?: number   // circuit breaker threshold (default: 5)
  allowedUpdates?:       string[] // Telegram allowed_updates filter
}

// ── Helpers de retry ────────────────────────────────────────────────────────────

export async function fetchWithRetry(
  url:      string,
  init:     RequestInit,
  maxTries: number = 3,
): Promise<globalThis.Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
      })

      // 429 rate limit: respetar Retry-After
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 5)
        await sleep(retryAfter * 1000)
        continue
      }

      // 5xx transitorios: backoff
      if (res.status >= 500 && attempt < maxTries - 1) {
        await sleep(500 * 2 ** attempt)
        continue
      }

      return res
    } catch (err) {
      lastError = err
      if (attempt < maxTries - 1) {
        await sleep(500 * 2 ** attempt)
      }
    }
  }
  throw lastError ?? new Error('fetchWithRetry: max attempts reached')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── TelegramAdapter ────────────────────────────────────────────────────────────

export class TelegramAdapter extends BaseChannelAdapter {
  readonly channel = 'telegram'

  // Estado del adaptador
  private botToken      = ''
  private webhookSecret = ''
  private mode: 'webhook' | 'polling' = 'webhook'
  private channelConfig: TelegramChannelConfig = {}

  // Estado del polling loop
  private pollingActive     = false
  private pollingOffset     = 0
  private consecutiveErrors = 0
  private pollingAbortCtrl: AbortController | null = null

  // Callback de error del caller
  private errorHandler: ((err: Error) => void) | null = null

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * [F3a-18] initialize() stub de compatibilidad.
   * El flujo canónico es: GatewayService → adapter.setup(config, secrets).
   * NO accede a Prisma — botToken llega por setup(), no por DB.
   */
  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
    console.warn(
      '[telegram] initialize() called without credentials — use setup(config, secrets) instead',
    )
  }

  /**
   * Configura el adaptador con config + secrets descifrados.
   * Llamado por GatewayService.activateChannel() (F3a-14 pattern).
   */
  async setup(
    config:  Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<void> {
    this.botToken      = String(secrets['botToken']      ?? '')
    this.webhookSecret = String(secrets['webhookSecret'] ?? '')
    this.channelConfig = config as TelegramChannelConfig

    // Determinar modo: env override > config > default (webhook)
    const envMode = process.env['TELEGRAM_MODE'] as 'webhook' | 'polling' | undefined
    this.mode     = envMode ?? this.channelConfig.mode ?? 'webhook'

    if (!this.botToken) {
      throw new Error('[TelegramAdapter] botToken is required in secrets')
    }

    if (this.mode === 'polling') {
      // Asegurar que no hay webhook activo (conflicto con polling)
      await this.deleteWebhook()
      this.startPollingLoop()
    }

    console.info(
      `[telegram] Adapter ready — mode=${this.mode}, channelConfigId=${this.channelConfigId}`,
    )
  }

  async dispose(): Promise<void> {
    this.pollingActive = false
    this.pollingAbortCtrl?.abort()
    this.pollingAbortCtrl = null
    console.info('[telegram] Adapter disposed')
  }

  /** Registrar callback para errores del polling loop. */
  onError(handler: (err: Error) => void): void {
    this.errorHandler = handler
  }

  // ── send() ────────────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const body: Record<string, unknown> = {
      chat_id:    message.externalId,
      text:       message.text,
      parse_mode: message.type === 'markdown' ? 'Markdown' : undefined,
    }

    // [F3a-17] Si hay threadId y es distinto del chat, responder en el topic
    if (message.threadId && message.threadId !== message.externalId) {
      body['message_thread_id'] = Number(message.threadId)
    }

    if (message.richContent) {
      body['reply_markup'] = message.richContent
    }

    const res = await fetchWithRetry(
      `${TELEGRAM_API}/bot${this.botToken}/sendMessage`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`)
      throw new Error(`[telegram] sendMessage failed: ${err}`)
    }
  }

  // ── receive() ─────────────────────────────────────────────────────────────

  /**
   * Convierte un TelegramUpdate crudo en IncomingMessage normalizado.
   * Construye replyFn, threadId y rawPayload.
   * Retorna null si el update debe ignorarse.
   */
  async receive(
    rawPayload: Record<string, unknown>,
    secrets:    Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const token   = String(secrets['botToken'] ?? this.botToken)
    const update  = rawPayload as unknown as TelegramUpdate
    const message = update.message ?? update.edited_message

    if (
      message?.text ||
      message?.caption ||
      message?.photo ||
      message?.voice ||
      message?.document
    ) {
      return this.buildMessageIncoming(update, message, token)
    }

    if (update.callback_query?.data) {
      return this.buildCallbackQueryIncoming(update, update.callback_query, token)
    }

    return null
  }

  // ── Router (modo webhook) ─────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router()

    /**
     * POST /gateway/telegram/webhook
     * Recibe updates de Telegram en modo webhook.
     * Responde 200 inmediatamente — processing es async.
     * Telegram tiene timeout de 3s; si no recibe 200 reintenta.
     */
    router.post('/webhook', async (req: Request, res: ExpressResponse) => {
      // 1. Validar secret token
      if (this.webhookSecret) {
        const secret = req.headers['x-telegram-bot-api-secret-token']
        if (secret !== this.webhookSecret) {
          res.status(403).json({ ok: false, error: 'Invalid secret token' })
          return
        }
      }

      // 2. Responder 200 a Telegram ANTES de procesar (timeout de Telegram: 3s)
      res.json({ ok: true })

      // 3. Procesar de forma async (no await)
      const update = req.body as Record<string, unknown>
      this.processUpdate(update).catch((err) => {
        console.error('[telegram] webhook processUpdate error:', err)
      })
    })

    /** POST /gateway/telegram/setup — registra el webhook en Telegram */
    router.post('/setup', async (req: Request, res: ExpressResponse) => {
      const { webhookUrl } = req.body as { webhookUrl?: string }
      if (!webhookUrl) {
        res.status(400).json({ ok: false, error: 'webhookUrl is required' })
        return
      }
      try {
        const result = await this.registerWebhook(webhookUrl)
        res.json({ ok: true, telegram: result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: msg })
      }
    })

    /** DELETE /gateway/telegram/webhook — elimina el webhook */
    router.delete('/webhook', async (_req: Request, res: ExpressResponse) => {
      try {
        const result = await this.deleteWebhook()
        res.json({ ok: true, telegram: result })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: msg })
      }
    })

    /** GET /gateway/telegram/info — verifica que el bot está activo */
    router.get('/info', async (_req: Request, res: ExpressResponse) => {
      try {
        const apiRes = await fetchWithRetry(
          `${TELEGRAM_API}/bot${this.botToken}/getMe`,
          { method: 'GET' },
        )
        const data = await apiRes.json()
        res.json({ ok: true, mode: this.mode, bot: data })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        res.status(500).json({ ok: false, error: msg })
      }
    })

    return router
  }

  // ── Long-polling loop ────────────────────────────────────────────────────────────

  private startPollingLoop(): void {
    if (this.pollingActive) return
    this.pollingActive     = true
    this.consecutiveErrors = 0
    console.info('[telegram] Long-polling loop started')
    void this.runPollingLoop()
  }

  private async runPollingLoop(): Promise<void> {
    const pollingTimeout  = this.channelConfig.pollingTimeout       ?? 25
    const pollingInterval = this.channelConfig.pollingInterval      ?? 1_000
    const maxErrors       = this.channelConfig.maxConsecutiveErrors ?? 5
    const allowedUpdates  = this.channelConfig.allowedUpdates
      ?? ['message', 'edited_message', 'callback_query']

    while (this.pollingActive) {
      this.pollingAbortCtrl = new AbortController()

      try {
        const url = `${TELEGRAM_API}/bot${this.botToken}/getUpdates`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            offset:          this.pollingOffset,
            timeout:         pollingTimeout,
            allowed_updates: allowedUpdates,
          }),
          signal: this.pollingAbortCtrl.signal,
        })

        // 401 Unauthorized → bot token inválido → detener loop
        if (res.status === 401) {
          console.error('[telegram] Bot token invalid (401) — stopping polling loop')
          this.pollingActive = false
          this.errorHandler?.(new Error('TelegramAdapter: invalid bot token (401)'))
          return
        }

        if (!res.ok) {
          throw new Error(`getUpdates failed: HTTP ${res.status}`)
        }

        const data = await res.json() as { ok: boolean; result: TelegramUpdate[] }

        if (!data.ok) {
          throw new Error('getUpdates: ok=false')
        }

        // Resetear circuit breaker en éxito
        this.consecutiveErrors = 0

        for (const update of data.result) {
          // Avanzar offset ANTES de procesar (no reprocesar si falla)
          this.pollingOffset = update.update_id + 1

          await this.processUpdate(update as unknown as Record<string, unknown>)
            .catch((err) => {
              console.error(`[telegram] Error processing update ${update.update_id}:`, err)
            })
        }

      } catch (err) {
        // AbortError = dispose() llamado → salir del loop limpiamente
        if (err instanceof Error && err.name === 'AbortError') {
          break
        }

        this.consecutiveErrors++
        console.warn(
          `[telegram] Polling error #${this.consecutiveErrors}/${maxErrors}:`,
          err instanceof Error ? err.message : err,
        )

        // Circuit breaker
        if (this.consecutiveErrors >= maxErrors) {
          console.error(
            `[telegram] Circuit breaker open after ${maxErrors} consecutive errors. ` +
            `Pausing 60s before retry.`,
          )
          this.errorHandler?.(
            new Error(
              `TelegramAdapter: polling circuit breaker open after ${maxErrors} errors`,
            ),
          )
          // Pausa larga antes de resetear
          await sleep(60_000)
          this.consecutiveErrors = 0
        } else {
          // Backoff normal entre errores: pollingInterval * 2^(n-1)
          await sleep(pollingInterval * 2 ** (this.consecutiveErrors - 1))
        }
      }
    }

    console.info('[telegram] Long-polling loop stopped')
  }

  // ── Procesamiento de updates (compartido webhook + polling) ───────────────────────

  async processUpdate(rawUpdate: Record<string, unknown>): Promise<void> {
    const incoming = await this.receive(rawUpdate, { botToken: this.botToken })
    if (!incoming) return
    await this.emit(incoming)
  }

  // ── Builders de IncomingMessage ──────────────────────────────────────────────────────

  private buildMessageIncoming(
    update:  TelegramUpdate,
    message: TelegramMessage,
    token:   string,
  ): IncomingMessage {
    const chatId   = String(message.chat.id)
    const threadId = message.message_thread_id
      ? String(message.message_thread_id)
      : chatId   // DM / grupo sin topics → threadId = chatId

    const text = message.text ?? message.caption ?? ''
    const type: IncomingMessage['type'] =
      text.startsWith('/')  ? 'command'
      : message.photo       ? 'image'
      : message.voice       ? 'audio'
      : message.document    ? 'file'
      : 'text'

    // replyFn — closure con chatId, threadId y token capturados
    const replyFn: ReplyFn = async (replyText: string, opts?: ReplyOptions) => {
      const body: Record<string, unknown> = {
        chat_id:    chatId,
        text:       replyText,
        parse_mode: opts?.format === 'markdown' ? 'Markdown'
                  : opts?.format === 'html'     ? 'HTML'
                  : undefined,
      }

      // reply en el mismo topic si aplica
      if (message.message_thread_id) {
        body['message_thread_id'] = message.message_thread_id
      }

      // quote/reply al mensaje original
      if (opts?.quoteOriginal) {
        body['reply_parameters'] = { message_id: message.message_id }
      }

      // rich content
      if (opts?.channelMeta?.['reply_markup']) {
        body['reply_markup'] = opts.channelMeta['reply_markup']
      }

      const res = await fetchWithRetry(
        `${TELEGRAM_API}/bot${token}/sendMessage`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(body),
        },
      )

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`)
        throw new Error(`[telegram] replyFn sendMessage failed: ${errText}`)
      }
    }

    return {
      externalId:  chatId,
      threadId,
      senderId:    String(message.from?.id ?? message.chat.id),
      text,
      type,
      rawPayload:  this.sanitizeRawPayload(
        update as unknown as Record<string, unknown>,
        ['botToken', 'webhookSecret'],
      ),
      metadata: {
        updateId:        update.update_id,
        messageId:       message.message_id,
        chatType:        message.chat.type,
        username:        message.from?.username,
        hasThread:       !!message.message_thread_id,
        isEditedMessage: !!update.edited_message,
      },
      replyFn,
      receivedAt: this.makeTimestamp(),
    }
  }

  private buildCallbackQueryIncoming(
    update:        TelegramUpdate,
    callbackQuery: TelegramCallbackQuery,
    token:         string,
  ): IncomingMessage {
    const chatId   = String(callbackQuery.message?.chat.id ?? callbackQuery.from.id)
    const threadId = callbackQuery.message?.message_thread_id
      ? String(callbackQuery.message.message_thread_id)
      : chatId

    // replyFn: answerCallbackQuery PRIMERO + sendMessage SEGUNDO
    const replyFn: ReplyFn = async (replyText: string, opts?: ReplyOptions) => {
      // 1. Responder al callback query (elimina el "loading" del botón)
      const ackRes = await fetchWithRetry(
        `${TELEGRAM_API}/bot${token}/answerCallbackQuery`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ callback_query_id: callbackQuery.id }),
        },
      )
      if (!ackRes.ok) {
        const err = await ackRes.text().catch(() => `HTTP ${ackRes.status}`)
        console.warn(`[telegram] answerCallbackQuery failed: ${err}`)
        return
      }
      // 2. Enviar respuesta visible al usuario
      const body: Record<string, unknown> = {
        chat_id:    chatId,
        text:       replyText,
        parse_mode: opts?.format === 'markdown' ? 'Markdown' : undefined,
      }
      if (callbackQuery.message?.message_thread_id) {
        body['message_thread_id'] = callbackQuery.message.message_thread_id
      }
      await fetchWithRetry(
        `${TELEGRAM_API}/bot${token}/sendMessage`,
        {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify(body),
        },
      )
    }

    return {
      externalId:  chatId,
      threadId,
      senderId:    String(callbackQuery.from.id),
      text:        callbackQuery.data ?? '',
      type:        'command',
      rawPayload:  this.sanitizeRawPayload(
        update as unknown as Record<string, unknown>,
        ['botToken', 'webhookSecret'],
      ),
      metadata: {
        updateId:        update.update_id,
        callbackQueryId: callbackQuery.id,
        callbackData:    callbackQuery.data,
      },
      replyFn,
      receivedAt: this.makeTimestamp(),
    }
  }

  // ── Webhook management ─────────────────────────────────────────────────────────────

  async registerWebhook(webhookUrl: string): Promise<unknown> {
    const normalizedUrl = webhookUrl.endsWith('/webhook')
      ? webhookUrl
      : `${webhookUrl}/gateway/telegram/webhook`

    const body: Record<string, unknown> = {
      url:             normalizedUrl,
      allowed_updates: this.channelConfig.allowedUpdates
                         ?? ['message', 'edited_message', 'callback_query'],
      drop_pending_updates: false,
    }
    if (this.webhookSecret) {
      body['secret_token'] = this.webhookSecret
    }

    const res = await fetchWithRetry(
      `${TELEGRAM_API}/bot${this.botToken}/setWebhook`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      },
    )
    return res.json()
  }

  async deleteWebhook(): Promise<unknown> {
    const res = await fetchWithRetry(
      `${TELEGRAM_API}/bot${this.botToken}/deleteWebhook`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ drop_pending_updates: false }),
      },
    )
    return res.json()
  }

  async autoSetupWebhook(): Promise<void> {
    const webhookUrl = process.env['TELEGRAM_WEBHOOK_URL']
    if (!webhookUrl) return
    await this.registerWebhook(webhookUrl)
    console.info(`[telegram] Webhook auto-registered at ${webhookUrl}`)
  }
}
