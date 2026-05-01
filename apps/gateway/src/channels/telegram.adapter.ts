/**
 * telegram.adapter.ts — Adaptador Telegram Bot (grammY SDK)
 *
 * Modos de operación (seleccionados automáticamente en initialize()):
 *
 *   WEBHOOK (producción):
 *     Si credentials.webhookUrl está definido → registra el webhook
 *     en Telegram y expone un Express Router en getRouter() para
 *     que server.ts monte:
 *       POST /gateway/telegram/webhook
 *
 *   LONG POLLING (desarrollo / sin dominio público):
 *     Si credentials.webhookUrl está vacío o undefined → llama
 *     bot.start() con long polling. No requiere router.
 *
 * Tipos de update soportados:
 *   - message (texto, comandos, foto, documento, voz)
 *   - callback_query (inline keyboard buttons)
 *   - edited_message (re-emite como 'text' con metadata.edited = true)
 *
 * Tipos de envío soportados (OutgoingMessage.type):
 *   - 'text'          → sendMessage con parse_mode: MarkdownV2
 *   - 'markdown'      → alias de 'text'
 *   - 'quick_replies' → sendMessage + InlineKeyboardMarkup
 *   - 'card'          → sendMessage con richContent como caption
 *
 * grammY versión mínima: 1.31.0
 */

import {
  Bot,
  webhookCallback,
  GrammyError,
  HttpError,
  InlineKeyboard,
  type Context,
} from 'grammy'
import { Router, type Request, type Response } from 'express'
import { prisma } from '../../../api/src/modules/core/db/prisma.service.js'
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface.js'

const db = prisma as any

// ── Tipos de credenciales ─────────────────────────────────────────────

interface TelegramCredentials {
  /** Token del bot: '123456789:AAF...' */
  botToken:       string
  /**
   * Secret para validar que los webhooks vienen de Telegram.
   * Máx 256 chars, solo [A-Za-z0-9_-].
   * Si está vacío, no se valida el secret.
   */
  webhookSecret?: string
  /**
   * URL pública del gateway. Si está presente → modo webhook.
   * Si no está → modo long polling.
   * Ej: 'https://agents.socialstudies.cloud'
   */
  webhookUrl?:    string
  /**
   * Lista de update_types a suscribir.
   * Default: ['message', 'callback_query', 'edited_message']
   */
  allowedUpdates?: string[]
}

// ── QuickReply button shape ─────────────────────────────────────────────

interface QuickReplyButton {
  text:          string
  callbackData?: string
  url?:          string
}

// ── TelegramAdapter ────────────────────────────────────────────────────

export class TelegramAdapter extends BaseChannelAdapter {
  readonly channel = 'telegram'

  private bot:          Bot | null = null
  private botToken      = ''
  private webhookSecret = ''
  private webhookUrl    = ''
  private usePolling    = false

  // ── Lifecycle ───────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId

    const config = await db.channelConfig.findUnique({
      where: { id: channelConfigId },
    })
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`)

    const creds = config.credentials as TelegramCredentials
    this.botToken      = creds.botToken
    this.webhookSecret = creds.webhookSecret ?? ''
    this.webhookUrl    = creds.webhookUrl    ?? ''
    this.credentials   = config.credentials as Record<string, unknown>

    if (!this.botToken) {
      throw new Error('[telegram] botToken is required in ChannelConfig.credentials')
    }

    // Crear instancia del bot
    this.bot = new Bot(this.botToken)

    // Registrar handlers de grammY
    this.registerHandlers(this.bot)

    // Seleccionar modo de operación
    if (this.webhookUrl) {
      // Modo WEBHOOK: registrar en Telegram
      const fullWebhookUrl = `${this.webhookUrl.replace(/\/$/, '')}/gateway/telegram/webhook`
      await this.bot.api.setWebhook(fullWebhookUrl, {
        secret_token:    this.webhookSecret || undefined,
        allowed_updates: (creds.allowedUpdates ?? [
          'message',
          'callback_query',
          'edited_message',
        ]) as any,
        drop_pending_updates: false,
      })
      console.info(`[telegram] Webhook registered at ${fullWebhookUrl}`)
      this.usePolling = false
    } else {
      // Modo LONG POLLING
      this.usePolling = true
      // bot.start() es no-bloqueante internamente (loop en background)
      this.bot.start({
        onStart: (botInfo) => {
          console.info(`[telegram] Long polling started — @${botInfo.username}`)
        },
      }).catch((err: Error) => {
        console.error('[telegram] polling error:', err.message)
      })
    }
  }

  async dispose(): Promise<void> {
    if (!this.bot) return

    if (this.usePolling) {
      await this.bot.stop()
      console.info('[telegram] Long polling stopped')
    } else {
      // En modo webhook no hay loop activo, solo limpiar el webhook de Telegram
      try {
        await this.bot.api.deleteWebhook()
        console.info('[telegram] Webhook deleted from Telegram')
      } catch (err) {
        console.warn('[telegram] deleteWebhook failed:', (err as Error).message)
      }
    }
    this.bot = null
  }

  // ── send() ──────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    if (!this.bot) {
      console.warn('[telegram] send() called before initialize()')
      return
    }

    const chatId = message.externalId
    const type   = message.type ?? 'text'

    try {
      switch (type) {
        case 'quick_replies': {
          // richContent puede ser un InlineKeyboardMarkup raw o un array de botones
          const keyboard = this.buildInlineKeyboard(message.richContent)
          await this.bot.api.sendMessage(chatId, message.text, {
            parse_mode:   'MarkdownV2',
            reply_markup: keyboard,
          })
          break
        }

        case 'card': {
          // Enviar como mensaje con el texto como caption (rich HTML disabled — usar MarkdownV2)
          const extra = message.richContent
            ? `\n\n${JSON.stringify(message.richContent)}` // saneado para depuración
            : ''
          await this.bot.api.sendMessage(chatId, escapeMarkdownV2(message.text + extra), {
            parse_mode: 'MarkdownV2',
          })
          break
        }

        case 'text':
        case 'markdown':
        default: {
          await this.bot.api.sendMessage(chatId, escapeMarkdownV2(message.text), {
            parse_mode: 'MarkdownV2',
          })
          break
        }
      }
    } catch (err) {
      if (err instanceof GrammyError) {
        console.error(
          `[telegram] GrammyError sending to ${chatId}: ${err.message} ` +
          `(error_code=${err.error_code})`,
        )
      } else if (err instanceof HttpError) {
        console.error(
          `[telegram] HttpError sending to ${chatId}: ${err.message}`,
        )
      } else {
        console.error(`[telegram] Unknown error sending to ${chatId}:`, err)
      }
      // No re-throw: errores de envío son silenciosos para el caller
    }
  }

  // ── sendTyping() ─────────────────────────────────────────────────────

  async sendTyping(chatId: string): Promise<void> {
    if (!this.bot) return
    try {
      await this.bot.api.sendChatAction(chatId, 'typing')
    } catch {
      // no-op: typing indicators son best-effort
    }
  }

  // ── getRouter() (modo webhook) ────────────────────────────────────────

  /**
   * Devuelve un Express Router con el endpoint del webhook.
   * Solo llamar en modo webhook (credentials.webhookUrl definido).
   * En modo polling este router no recibe tráfico relevante.
   *
   * Montar en server.ts:
   *   app.use('/gateway/telegram', telegramAdapter.getRouter())
   */
  getRouter(): Router {
    const router = Router()

    if (!this.bot) {
      console.warn('[telegram] getRouter() called before initialize()')
      return router
    }

    // webhookCallback genera un handler Express compatible
    const handler = webhookCallback(this.bot, 'express', {
      secretToken: this.webhookSecret || undefined,
    })

    router.post('/webhook', handler as unknown as (req: Request, res: Response) => void)

    return router
  }

  // ── registerHandlers() ────────────────────────────────────────────────

  private registerHandlers(bot: Bot): void {
    // ── message: texto y comandos ──
    bot.on('message:text', async (ctx: Context) => {
      const msg = ctx.message!
      const isCommand = msg.text?.startsWith('/')

      const incoming: IncomingMessage = {
        externalId:  String(msg.chat.id),
        senderId:    String(msg.from?.id ?? msg.chat.id),
        text:        msg.text ?? '',
        type:        isCommand ? 'command' : 'text',
        metadata: {
          messageId:  msg.message_id,
          chatType:   msg.chat.type,
          username:   msg.from?.username,
          firstName:  msg.from?.first_name,
          lastName:   msg.from?.last_name,
          channel:    'telegram',
        },
        receivedAt: this.makeTimestamp(),
      }
      await this.emit(incoming)
    })

    // ── message: foto ──
    bot.on('message:photo', async (ctx: Context) => {
      const msg    = ctx.message!
      const photos = msg.photo ?? []
      // tomar la de mayor resolución
      const best   = photos[photos.length - 1]

      const incoming: IncomingMessage = {
        externalId: String(msg.chat.id),
        senderId:   String(msg.from?.id ?? msg.chat.id),
        text:       msg.caption ?? '',
        type:       'image',
        attachments: [{
          type:    'image',
          data:    { fileId: best?.file_id, fileUniqueId: best?.file_unique_id },
        }],
        metadata: {
          messageId: msg.message_id,
          channel:   'telegram',
        },
        receivedAt: this.makeTimestamp(),
      }
      await this.emit(incoming)
    })

    // ── message: documento ──
    bot.on('message:document', async (ctx: Context) => {
      const msg = ctx.message!
      const doc = msg.document!

      const incoming: IncomingMessage = {
        externalId: String(msg.chat.id),
        senderId:   String(msg.from?.id ?? msg.chat.id),
        text:       msg.caption ?? '',
        type:       'file',
        attachments: [{
          type:    'file',
          data:    {
            fileId:       doc.file_id,
            fileName:     doc.file_name,
            mimeType:     doc.mime_type,
            fileSize:     doc.file_size,
          },
        }],
        metadata: {
          messageId: msg.message_id,
          channel:   'telegram',
        },
        receivedAt: this.makeTimestamp(),
      }
      await this.emit(incoming)
    })

    // ── message: voz ──
    bot.on('message:voice', async (ctx: Context) => {
      const msg   = ctx.message!
      const voice = msg.voice!

      const incoming: IncomingMessage = {
        externalId: String(msg.chat.id),
        senderId:   String(msg.from?.id ?? msg.chat.id),
        text:       '',
        type:       'audio',
        attachments: [{
          type:    'audio',
          data:    {
            fileId:   voice.file_id,
            duration: voice.duration,
            mimeType: voice.mime_type,
          },
        }],
        metadata: {
          messageId: msg.message_id,
          channel:   'telegram',
        },
        receivedAt: this.makeTimestamp(),
      }
      await this.emit(incoming)
    })

    // ── callback_query (inline keyboard buttons) ──
    bot.on('callback_query:data', async (ctx: Context) => {
      const query = ctx.callbackQuery!
      const msg   = query.message

      // Responder el callback para quitar el spinner en el cliente
      await ctx.answerCallbackQuery().catch(() => {})

      const incoming: IncomingMessage = {
        externalId: String(msg?.chat.id ?? query.from.id),
        senderId:   String(query.from.id),
        text:       query.data ?? '',
        type:       'command',
        metadata: {
          callbackQueryId: query.id,
          messageId:       msg?.message_id,
          channel:         'telegram',
          isCallbackQuery: true,
        },
        receivedAt: this.makeTimestamp(),
      }
      await this.emit(incoming)
    })

    // ── edited_message ──
    bot.on('edited_message:text', async (ctx: Context) => {
      const msg = ctx.editedMessage!

      const incoming: IncomingMessage = {
        externalId: String(msg.chat.id),
        senderId:   String(msg.from?.id ?? msg.chat.id),
        text:       msg.text ?? '',
        type:       'text',
        metadata: {
          messageId: msg.message_id,
          channel:   'telegram',
          edited:    true,
        },
        receivedAt: this.makeTimestamp(),
      }
      await this.emit(incoming)
    })

    // ── error handler global ──
    bot.catch((err) => {
      const ctx = err.ctx
      console.error(`[telegram] Error in update ${ctx.update.update_id}:`, err.error)
      if (err.error instanceof GrammyError) {
        console.error('[telegram] GrammyError:', err.error.description)
      } else if (err.error instanceof HttpError) {
        console.error('[telegram] HttpError:', err.error.message)
      }
    })
  }

  // ── buildInlineKeyboard() ───────────────────────────────────────────────

  private buildInlineKeyboard(richContent: unknown): InlineKeyboard {
    const keyboard = new InlineKeyboard()

    if (!richContent || !Array.isArray(richContent)) {
      return keyboard
    }

    for (const btn of richContent as QuickReplyButton[]) {
      if (!btn?.text) continue
      if (btn.url) {
        keyboard.url(btn.text, btn.url).row()
      } else {
        keyboard.text(btn.text, btn.callbackData ?? btn.text).row()
      }
    }

    return keyboard
  }
}

// ── escapeMarkdownV2() ────────────────────────────────────────────────────

/**
 * Escapa los caracteres especiales de MarkdownV2 de Telegram.
 * Ver: https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}
