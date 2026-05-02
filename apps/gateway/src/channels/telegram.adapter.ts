/**
 * telegram.adapter.ts — Adaptador Telegram Bot API
 *
 * Recibe updates via webhook (POST /gateway/telegram/webhook).
 * AUDIT-24: botToken y webhookSecret se leen de ChannelConfig.secretsEncrypted
 *   (AES-256-GCM, implementación completa en F3b-05).
 *
 * Endpoints:
 *   POST /gateway/telegram/webhook  — updates de Telegram
 *   POST /gateway/telegram/setup    — registra el webhook en Telegram
 *
 * AUDIT-21: mensajes sin chat.id son descartados con logger.warn + return.
 *   Nunca se construye un IncomingMessage con externalId falsy/undefined.
 */

import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../../lib/prisma.js';
import {
  BaseChannelAdapter,
  type ChannelType,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

const TELEGRAM_API = 'https://api.telegram.org';

interface TelegramSecrets {
  botToken:       string;
  webhookSecret?: string;
}

export class TelegramAdapter extends BaseChannelAdapter {
  readonly channel      = 'telegram' as const satisfies ChannelType;
  private botToken      = '';
  private webhookSecret = '';

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    // AUDIT-24: leer secretsEncrypted (NO credentials)
    // F3b-05 implementará decrypt AES-256-GCM completo
    const secrets: TelegramSecrets = config.secretsEncrypted
      ? JSON.parse(this.decryptSecrets(config.secretsEncrypted))
      : { botToken: '' };

    this.botToken      = secrets.botToken      ?? '';
    this.webhookSecret = secrets.webhookSecret ?? '';

    console.info(`[telegram] Initialized bot for config ${channelConfigId}`);
  }

  async dispose(): Promise<void> {
    this.botToken      = '';
    this.webhookSecret = '';
    console.info('[telegram] Adapter disposed');
  }

  // ── Send ────────────────────────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const url  = `${TELEGRAM_API}/bot${this.botToken}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id:    message.externalId,
      text:       message.text,
      parse_mode: 'Markdown',
    };
    if (message.richContent) body.reply_markup = message.richContent;

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[telegram] sendMessage failed: ${err}`);
      throw new Error(`Telegram sendMessage failed: ${err}`);
    }
  }

  // ── Router ─────────────────────────────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    router.post('/webhook', async (req: Request, res: Response) => {
      if (this.webhookSecret) {
        const secret = req.headers['x-telegram-bot-api-secret-token'];
        if (secret !== this.webhookSecret) {
          res.status(403).json({ ok: false, error: 'Invalid secret' });
          return;
        }
      }

      const update = req.body as {
        update_id:       number;
        message?:        {
          message_id: number;
          chat:       { id?: number };
          from?:      { id?: number; username?: string };
          text?:      string;
        };
        callback_query?: {
          id:       string;
          data?:    string;
          message?: { chat: { id?: number } };
        };
      };

      const message       = update.message;
      const callbackQuery = update.callback_query;

      if (message?.text) {
        // AUDIT-21: validar chat.id antes de construir IncomingMessage
        const rawChatId = message.chat.id;
        if (!rawChatId) {
          console.warn(
            `[telegram] message without chat.id — dropped`,
            { updateId: update.update_id },
          );
          res.json({ ok: true });
          return;
        }

        const externalId = String(rawChatId);
        const senderId   = message.from?.id != null
          ? String(message.from.id)
          : externalId;  // fallback al chat (grupos sin from)

        const msg: IncomingMessage = {
          channelConfigId: this.channelConfigId,
          channelType:     'telegram',
          externalId,
          senderId,
          text:        message.text,
          type:        message.text.startsWith('/') ? 'command' : 'text',
          metadata:    { updateId: update.update_id, raw: message },
          receivedAt:  this.makeTimestamp(),
        };
        await this.emit(msg);

      } else if (callbackQuery?.data) {
        // AUDIT-21: validar chatId antes de construir IncomingMessage
        const rawChatId = callbackQuery.message?.chat.id;
        if (!rawChatId) {
          console.warn(
            `[telegram] callbackQuery without chat.id — dropped`,
            { callbackQueryId: callbackQuery.id },
          );
          res.json({ ok: true });
          return;
        }

        const externalId = String(rawChatId);

        const msg: IncomingMessage = {
          channelConfigId: this.channelConfigId,
          channelType:     'telegram',
          externalId,
          senderId:    externalId,
          text:        callbackQuery.data,
          type:        'button_click',
          metadata:    { callbackQueryId: callbackQuery.id, raw: callbackQuery },
          receivedAt:  this.makeTimestamp(),
        };
        await this.emit(msg);

        await fetch(`${TELEGRAM_API}/bot${this.botToken}/answerCallbackQuery`, {
          method:  'POST',
          headers: { 'content-type': 'application/json' },
          body:    JSON.stringify({ callback_query_id: callbackQuery.id }),
        });
      }

      res.json({ ok: true });
    });

    router.post('/setup', async (req: Request, res: Response) => {
      const { webhookUrl } = req.body as { webhookUrl: string };
      if (!webhookUrl) {
        res.status(400).json({ ok: false, error: 'webhookUrl required' });
        return;
      }
      const body: Record<string, unknown> = { url: webhookUrl };
      if (this.webhookSecret) body.secret_token = this.webhookSecret;

      const apiRes = await fetch(`${TELEGRAM_API}/bot${this.botToken}/setWebhook`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await apiRes.json();
      res.json({ ok: true, telegram: data });
    });

    return router;
  }

  async autoSetupWebhook(): Promise<void> {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    if (!webhookUrl) return;
    await fetch(`${TELEGRAM_API}/bot${this.botToken}/setWebhook`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        url:          `${webhookUrl}/gateway/telegram/webhook`,
        secret_token: this.webhookSecret || undefined,
      }),
    });
    console.info(`[telegram] Webhook registered at ${webhookUrl}/gateway/telegram/webhook`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────

  private decryptSecrets(_enc: string): string {
    // F3b-05: decrypt AES-256-GCM — placeholder hasta implementación completa
    return '{}'
  }
}
