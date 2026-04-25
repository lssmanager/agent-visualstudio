/**
 * telegram.adapter.ts — Adaptador Telegram Bot API
 *
 * Recibe updates via webhook (POST /gateway/telegram/webhook).
 * El token del bot y el webhook secret se leen de ChannelConfig.credentials
 * (cifrado AES-256-GCM en DB).
 *
 * Endpoints:
 *   POST /gateway/telegram/webhook  — updates de Telegram
 *   POST /gateway/telegram/setup    — registra el webhook en Telegram
 *
 * Inspirado en n8n TelegramTriggerNode y Flowise TelegramChatModel.
 */

import { Router, type Request, type Response } from 'express';
import { prisma } from '../../../api/src/modules/core/db/prisma.service';
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

const TELEGRAM_API = 'https://api.telegram.org';

interface TelegramCredentials {
  botToken: string;
  webhookSecret?: string;
}

export class TelegramAdapter extends BaseChannelAdapter {
  readonly channel = 'telegram';
  private botToken = '';
  private webhookSecret = '';

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const config = await prisma.channelConfig.findUnique({
      where: { id: channelConfigId },
    });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const creds = config.credentials as TelegramCredentials;
    this.botToken = creds.botToken;
    this.webhookSecret = creds.webhookSecret ?? '';
    this.credentials = config.credentials as Record<string, unknown>;

    console.info(`[telegram] Initialized bot for config ${channelConfigId}`);
  }

  async dispose(): Promise<void> {
    console.info('[telegram] Adapter disposed');
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const chatId = message.externalId;
    const url = `${TELEGRAM_API}/bot${this.botToken}/sendMessage`;

    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: message.text,
      parse_mode: 'Markdown',
    };

    // Botones / quick replies
    if (message.richContent) {
      body.reply_markup = message.richContent;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[telegram] sendMessage failed: ${err}`);
      throw new Error(`Telegram sendMessage failed: ${err}`);
    }
  }

  // ── Router ───────────────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    // POST /telegram/webhook — updates de Telegram
    router.post('/webhook', async (req: Request, res: Response) => {
      // Validar webhook secret si está configurado
      if (this.webhookSecret) {
        const secret = req.headers['x-telegram-bot-api-secret-token'];
        if (secret !== this.webhookSecret) {
          res.status(403).json({ ok: false, error: 'Invalid secret' });
          return;
        }
      }

      const update = req.body as {
        update_id: number;
        message?: {
          message_id: number;
          chat: { id: number };
          from?: { id: number; username?: string };
          text?: string;
        };
        callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
      };

      const message = update.message;
      const callbackQuery = update.callback_query;

      if (message?.text) {
        const msg: IncomingMessage = {
          externalId: String(message.chat.id),
          senderId: String(message.from?.id ?? message.chat.id),
          text: message.text,
          type: message.text.startsWith('/') ? 'command' : 'text',
          metadata: { updateId: update.update_id, raw: message },
          receivedAt: this.makeTimestamp(),
        };
        await this.emit(msg);
      } else if (callbackQuery?.data) {
        const chatId = callbackQuery.message?.chat.id;
        const msg: IncomingMessage = {
          externalId: String(chatId),
          senderId: String(chatId),
          text: callbackQuery.data,
          type: 'command',
          metadata: { callbackQueryId: callbackQuery.id, raw: callbackQuery },
          receivedAt: this.makeTimestamp(),
        };
        await this.emit(msg);

        // Responder al callback_query para quitar el spinner de Telegram
        await fetch(
          `${TELEGRAM_API}/bot${this.botToken}/answerCallbackQuery`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQuery.id }),
          },
        );
      }

      res.json({ ok: true });
    });

    // POST /telegram/setup — registra webhook en Telegram
    router.post('/setup', async (req: Request, res: Response) => {
      const { webhookUrl } = req.body as { webhookUrl: string };
      if (!webhookUrl) {
        res.status(400).json({ ok: false, error: 'webhookUrl required' });
        return;
      }

      const body: Record<string, unknown> = { url: webhookUrl };
      if (this.webhookSecret) {
        body.secret_token = this.webhookSecret;
      }

      const apiRes = await fetch(
        `${TELEGRAM_API}/bot${this.botToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await apiRes.json();
      res.json({ ok: true, telegram: data });
    });

    return router;
  }

  // ── Setup helper (puede llamarse en initialize si TELEGRAM_WEBHOOK_URL está en env) ──

  async autoSetupWebhook(): Promise<void> {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    if (!webhookUrl) return;

    await fetch(`${TELEGRAM_API}/bot${this.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${webhookUrl}/gateway/telegram/webhook`,
        secret_token: this.webhookSecret || undefined,
      }),
    });
    console.info(`[telegram] Webhook registered at ${webhookUrl}/gateway/telegram/webhook`);
  }
}
