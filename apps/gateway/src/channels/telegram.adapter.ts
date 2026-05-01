/**
 * telegram.adapter.ts — Adaptador Telegram Bot (grammÝY SDK)
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
 * grammÝY versión mínima: 1.9.2
 */

import {
  Bot,
  webhookCallback,
  GrammyError,
  HttpError,
  InlineKeyboard,
  type Context,
} from 'grammy';
import { Router, type Request, type Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface.js';

const db = new PrismaService();

// ── Tipos de credenciales ─────────────────────────────────────────────

interface TelegramCredentials {
  /** Token del bot: '123456789:AAF...' */
  botToken: string;
  /**
   * Secret para validar que los webhooks vienen de Telegram.
   * Máx 256 chars, solo [A-Za-z0-9_-].
   * Si está vacío, no se valida el secret.
   */
  webhookSecret?: string;
  /**
   * URL pública del gateway. Si está presente → modo webhook.
   * Si no está → modo long polling.
   * Ej: 'https://agents.socialstudies.cloud'
   */
  webhookUrl?: string;
  /**
   * Lista de update_types a suscribir.
   * Default: ['message', 'callback_query', 'edited_message']
   */
  allowedUpdates?: string[];
}

// ── escapeMarkdownV2 (exportada para tests y uso externo) ──────────────

/**
 * Escapa caracteres especiales para MarkdownV2 de Telegram.
 * Exportada como top-level para permitir tests directos.
 * Ref: https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

// ── TelegramAdapter ─────────────────────────────────────────────────

export class TelegramAdapter extends BaseChannelAdapter {
  readonly channel = 'telegram';

  private bot: Bot | null = null;
  private botToken = '';
  private webhookSecret = '';
  private webhookUrl = '';
  private usePolling = false;
  private allowedUpdates: string[] = ['message', 'callback_query', 'edited_message'];

  // ── Lifecycle ────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;

    const config = await db.channelConfig.findUnique({
      where: { id: channelConfigId },
    });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const creds = config.credentials as TelegramCredentials;
    this.botToken      = creds.botToken;
    this.webhookSecret = creds.webhookSecret ?? '';
    this.webhookUrl    = creds.webhookUrl    ?? '';
    this.credentials   = config.credentials as Record<string, unknown>;
    if (creds.allowedUpdates?.length) {
      this.allowedUpdates = creds.allowedUpdates;
    }

    if (!this.botToken) {
      throw new Error('[telegram] botToken is required in ChannelConfig.credentials');
    }

    // Crear instancia del bot con grammÝY
    this.bot = new Bot(this.botToken);

    // Registrar handlers de grammÝY
    this.registerHandlers(this.bot);

    // Seleccionar modo de operación
    if (this.webhookUrl) {
      // MODO WEBHOOK — registrar en Telegram
      await this.bot.api.setWebhook(
        `${this.webhookUrl}/gateway/telegram/webhook`,
        {
          secret_token:    this.webhookSecret || undefined,
          allowed_updates: this.allowedUpdates as any,
        },
      );
      console.info(
        `[telegram] Webhook registered → ${this.webhookUrl}/gateway/telegram/webhook`,
      );
    } else {
      // MODO LONG POLLING — usado en desarrollo
      this.usePolling = true;
      // Eliminar webhook anterior si hubiera
      await this.bot.api.deleteWebhook();

      // start() es no-bloqueante: lanza internamente y resolve inmediatamente
      this.bot.start({
        allowed_updates: this.allowedUpdates as any,
        onStart: (info: { username?: string }) =>
          console.info(`[telegram] Long polling started as @${info.username}`),
      }).catch((err: unknown) =>
        console.error('[telegram] Polling error:', err),
      );
    }

    console.info(
      `[telegram] Initialized (mode: ${
        this.usePolling ? 'long-polling' : 'webhook'
      }) for config ${channelConfigId}`,
    );
  }

  async dispose(): Promise<void> {
    if (this.bot) {
      if (this.usePolling) {
        await this.bot.stop();
      } else {
        await this.bot.api.deleteWebhook();
      }
      this.bot = null;
    }
    console.info('[telegram] Adapter disposed');
  }

  // ── Handlers grammÝY ─────────────────────────────────────────────────

  private registerHandlers(bot: Bot): void {
    // Indicador de escritura mientras el agente procesa
    bot.use(async (ctx: Context, next: () => Promise<void>) => {
      if (ctx.chat) {
        await ctx.replyWithChatAction('typing').catch(() => {/* ignorar si falla */});
      }
      return next();
    });

    // Mensajes de texto y comandos
    bot.on('message', async (ctx: Context) => {
      const msg = ctx.message;
      const text = msg.text ?? msg.caption ?? '';
      const attachments = this.extractAttachments(ctx) ?? [];
      if (!text && attachments.length === 0) return;

      const incoming: IncomingMessage = {
        externalId:  String(msg.chat.id),
        senderId:    String(msg.from?.id ?? msg.chat.id),
        text,
        type:        text.startsWith('/')
          ? 'command'
          : (text ? 'text' : 'attachment'),
        attachments,
        metadata:    { updateId: ctx.update.update_id, raw: msg },
        receivedAt:  this.makeTimestamp(),
      };
      await this.emit(incoming);
    });

    // Mensajes editados — re-emitir con metadata.edited = true
    bot.on('edited_message', async (ctx: Context) => {
      const msg = ctx.editedMessage;
      const text = msg?.text ?? msg?.caption ?? '';
      if (!text) return;

      const incoming: IncomingMessage = {
        externalId:  String(msg!.chat.id),
        senderId:    String(msg!.from?.id ?? msg!.chat.id),
        text,
        type:        'text',
        metadata:    { updateId: ctx.update.update_id, edited: true, raw: msg },
        receivedAt:  this.makeTimestamp(),
      };
      await this.emit(incoming);
    });

    // Callback queries (botones inline)
    bot.on('callback_query:data', async (ctx: Context) => {
      const cq = ctx.callbackQuery;
      const chatId = cq.message?.chat.id ?? cq.from.id;

      const incoming: IncomingMessage = {
        externalId:  String(chatId),
        senderId:    String(cq.from.id),
        text:        cq.data,
        type:        'command',
        metadata:    { callbackQueryId: cq.id, updateId: ctx.update.update_id, raw: cq },
        receivedAt:  this.makeTimestamp(),
      };
      try {
        await this.emit(incoming);
      } finally {
        // Quitar el spinner de Telegram siempre, incluso si emit() falla
        await ctx.answerCallbackQuery().catch(() => {});
      }
    });

    // Error handler global de grammÝY
    bot.catch((err: { error: unknown; ctx: Context }) => {
      const { error, ctx: errCtx } = err as { error: unknown; ctx: Context };
      if (error instanceof GrammyError) {
        console.error(
          `[telegram] GrammyError (update ${errCtx.update.update_id}):`,
          (error as GrammyError).description,
        );
      } else if (error instanceof HttpError) {
        console.error(
          `[telegram] HttpError (update ${errCtx.update.update_id}):`,
          (error as HttpError).message,
        );
      } else {
        console.error(
          `[telegram] Unknown error (update ${errCtx.update.update_id}):`,
          error,
        );
      }
    });
  }

  // ── Send ───────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    // Guard: si bot no inicializado, warn y retornar (no lanzar)
    if (!this.bot) {
      console.warn('[telegram] send() called before initialize() — message dropped');
      return;
    }

    const chatId  = message.externalId;

    // Construir reply_markup si richContent o quick_replies
    const replyMarkup = this.buildReplyMarkup(message);

    // Escapar texto para MarkdownV2 — siempre, ya que parse_mode: MarkdownV2 es invariante
    const text = escapeMarkdownV2(message.text);

    await this.bot.api.sendMessage(chatId, text, {
      parse_mode:   'MarkdownV2',
      reply_markup: replyMarkup,
    });
  }

  // ── sendTyping() ─────────────────────────────────────────────────────

  /**
   * Envía indicador de escritura ("typing") al chat especificado.
   * Llamado explícitamente cuando el agente inicia su procesamiento.
   */
  async sendTyping(chatId: string): Promise<void> {
    if (!this.bot) return;
    await this.bot.api.sendChatAction(chatId, 'typing');
  }

  // ── Router (solo modo webhook) ─────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    if (!this.bot) {
      throw new Error('[telegram] getRouter() called before initialize()');
    }

    // Webhook handler de grammÝY con validación de secret
    const handleUpdate = webhookCallback(this.bot, 'express', {
      secretToken: this.webhookSecret || undefined,
    });

    router.post('/webhook', async (req: Request, res: Response) => {
      try {
        await handleUpdate(req, res);
      } catch (err) {
        console.error('[telegram] Webhook handler error:', err);
        res.status(500).json({ ok: false });
      }
    });

    // POST /telegram/setup — re-registrar webhook manualmente
    router.post('/setup', async (req: Request, res: Response) => {
      const { webhookUrl } = req.body as { webhookUrl?: string };
      const url = webhookUrl ?? this.webhookUrl;
      if (!url) {
        res.status(400).json({ ok: false, error: 'webhookUrl required' });
        return;
      }
      try {
        await this.bot!.api.setWebhook(
          `${url}/gateway/telegram/webhook`,
          {
            secret_token:    this.webhookSecret || undefined,
            allowed_updates: this.allowedUpdates as any,
          },
        );
        this.webhookUrl = url;
        if (this.usePolling && this.bot) {
          await this.bot.stop().catch(() => {});
        }
        this.usePolling = false;
        res.json({ ok: true, webhookRegistered: `${url}/gateway/telegram/webhook` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ ok: false, error: msg });
      }
    });

    return router;
  }

  // ── Helpers privados ───────────────────────────────────────────────

  /**
   * Construye el reply_markup para quick_replies o richContent genérico.
   * Si message.richContent ya es un InlineKeyboardMarkup válido, lo pasa directamente.
   * Si message.type === 'quick_replies' y richContent es un array de strings,
   * construye un InlineKeyboard con grammÝY builder.
   */
  private buildReplyMarkup(message: OutgoingMessage): unknown {
    if (!message.richContent) return undefined;

    // Si ya es un objeto con inline_keyboard → pasar directo
    if (
      typeof message.richContent === 'object' &&
      message.richContent !== null &&
      'inline_keyboard' in (message.richContent as Record<string, unknown>)
    ) {
      return message.richContent;
    }

    // Si es array → construir InlineKeyboard
    if (Array.isArray(message.richContent)) {
      const kb = new InlineKeyboard();
      for (const item of message.richContent as Array<{ text: string; callbackData?: string }>) {
        const label = item.text;
        const data  = item.callbackData ?? label;
        kb.text(label, data).row();
      }
      return kb;
    }

    return message.richContent;
  }

  /**
   * Extrae adjuntos del contexto (foto, documento, voz, audio).
   * Devuelve array vacío si no hay adjuntos.
   */
  private extractAttachments(ctx: Context): NonNullable<IncomingMessage['attachments']> {
    const msg = ctx.message;
    if (!msg) return [];

    const attachments: NonNullable<IncomingMessage['attachments']> = [];

    if (msg.photo?.length) {
      const largest = msg.photo[msg.photo.length - 1];
      attachments.push({ type: 'image', data: largest });
    }
    if (msg.document) {
      attachments.push({ type: 'file', data: msg.document });
    }
    if (msg.voice) {
      attachments.push({ type: 'audio', data: msg.voice });
    }
    if (msg.audio) {
      attachments.push({ type: 'audio', data: msg.audio });
    }

    return attachments;
  }
}
