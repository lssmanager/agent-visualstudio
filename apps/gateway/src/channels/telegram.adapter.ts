/**
 * telegram.adapter.ts — Adaptador Telegram Bot API
 *
 * Recibe updates via webhook (POST /gateway/telegram/webhook).
 * AUDIT-24: botToken y webhookSecret se leen de ChannelConfig.secretsEncrypted.
 *
 * AUDIT-17: deepSanitize() limpia metadata.raw antes de persistir:
 *   - Elimina undefined, funciones
 *   - Redacta keys sensibles (token, secret, password, ...)
 *   - Trunca profundidad > 6 niveles
 *
 * AUDIT-18: todos los fetch() tienen verificación de res.ok.
 *
 * AUDIT-21: mensajes sin chat.id o externalId son descartados silenciosamente.
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

// ── deepSanitize ───────────────────────────────────────────────────────────────────

/**
 * AUDIT-17: Sanitiza recursivamente un objeto para almacenamiento en metadata.
 * - Elimina valores undefined/funciones
 * - Redacta keys sensibles conocidas
 * - Trunca objetos a partir de maxDepth niveles
 *
 * @example
 *   deepSanitize({ token: 'abc', nested: { password: 'x' } })
 *   // → { token: '[redacted]', nested: { password: '[redacted]' } }
 */
function deepSanitize(
  value: unknown,
  depth = 0,
  maxDepth = 6,
): unknown {
  if (depth > maxDepth) return '[truncated]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'function') return '[function]';
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((v) => deepSanitize(v, depth + 1, maxDepth));
  }

  const SENSITIVE_KEYS = new Set([
    'token', 'secret', 'password', 'key', 'auth',
    'authorization', 'credential', 'apikey', 'api_key',
  ]);

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      result[k] = '[redacted]';
    } else {
      result[k] = deepSanitize(v, depth + 1, maxDepth);
    }
  }
  return result;
}

// ── Adapter ────────────────────────────────────────────────────────────────────────────

export class TelegramAdapter extends BaseChannelAdapter {
  readonly channel      = 'telegram' as const satisfies ChannelType;
  private botToken      = '';
  private webhookSecret = '';

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    // AUDIT-24: leer secretsEncrypted (NO credentials)
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

  // ── Send ──────────────────────────────────────────────────────────────────────────────

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

    // AUDIT-18: verificar res.ok en send()
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`[telegram] sendMessage failed: HTTP ${res.status} — ${err.slice(0, 200)}`);
    }
  }

  // ── autoSetupWebhook ──────────────────────────────────────────────────────────────────

  async autoSetupWebhook(): Promise<void> {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    if (!webhookUrl) return;

    // AUDIT-18: verificar res.ok en setWebhook — lanzar si falla
    const whRes = await fetch(`${TELEGRAM_API}/bot${this.botToken}/setWebhook`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({
        url:          `${webhookUrl}/gateway/telegram/webhook`,
        secret_token: this.webhookSecret || undefined,
      }),
    });

    if (!whRes.ok) {
      const err = await whRes.text().catch(() => '');
      throw new Error(
        `[telegram] setWebhook failed: HTTP ${whRes.status} — ${err.slice(0, 200)}`,
      );
    }

    console.info(`[telegram] Webhook registered at ${webhookUrl}/gateway/telegram/webhook`);
  }

  // ── Router ────────────────────────────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    // ── POST /webhook ────────────────────────────────────────────────────────────

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

      // ── message handler ───────────────────────────────────────────────

      if (message?.text) {
        // AUDIT-21: validar chat.id antes de construir IncomingMessage
        const rawChatId = message.chat.id;
        if (!rawChatId) {
          console.warn(
            `[telegram] message without chat.id — dropped`,
            { updateId: update.update_id },
          );
          res.json({ ok: true }); // ACK a Telegram igualmente
          return;
        }

        const externalId = String(rawChatId);
        const senderId   = message.from?.id != null
          ? String(message.from.id)
          : externalId;

        const msg: IncomingMessage = {
          channelConfigId: this.channelConfigId,
          channelType:     'telegram',
          externalId,
          senderId,
          text:        message.text,
          type:        message.text.startsWith('/') ? 'command' : 'text',
          // AUDIT-17: deepSanitize elimina undefined, funciones y keys sensibles
          metadata:    { updateId: update.update_id, raw: deepSanitize(message) },
          receivedAt:  this.makeTimestamp(),
        };
        await this.emit(msg);

      // ── callbackQuery handler ───────────────────────────────────────────

      } else if (callbackQuery?.data) {
        // AUDIT-21: validar chat.id antes de construir IncomingMessage
        const rawChatId = callbackQuery.message?.chat.id;
        if (rawChatId == null) {
          console.warn(
            `[telegram] callbackQuery without chat.id — dropped`,
            { callbackQueryId: callbackQuery.id },
          );
          res.json({ ok: true }); // ACK a Telegram igualmente
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
          // AUDIT-17: deepSanitize elimina undefined, funciones y keys sensibles
          metadata:    { callbackQueryId: callbackQuery.id, raw: deepSanitize(callbackQuery) },
          receivedAt:  this.makeTimestamp(),
        };
        await this.emit(msg);

        // AUDIT-18: answerCallbackQuery — no lanza, solo loguea si falla
        // Es operación best-effort: el mensaje ya fue procesado
        const ackRes = await fetch(
          `${TELEGRAM_API}/bot${this.botToken}/answerCallbackQuery`,
          {
            method:  'POST',
            headers: { 'content-type': 'application/json' },
            body:    JSON.stringify({ callback_query_id: callbackQuery.id }),
          },
        );
        if (!ackRes.ok) {
          const errBody = await ackRes.text().catch(() => '');
          console.warn(
            `[telegram] answerCallbackQuery failed: HTTP ${ackRes.status} ${errBody.slice(0, 100)}`,
          );
          // No lanzar — el mensaje ya fue procesado, este ACK es best-effort
        }
      }

      res.json({ ok: true });
    });

    // ── POST /setup ────────────────────────────────────────────────────────────

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

      // AUDIT-18: verificar res.ok && data.ok en /setup — devolver 502 si falla
      const data = await apiRes.json() as { ok: boolean; description?: string };
      if (!apiRes.ok || data.ok === false) {
        res.status(502).json({
          ok:       false,
          error:    `Telegram setWebhook failed: ${data.description ?? apiRes.status}`,
          telegram: data,
        });
        return;
      }

      res.json({ ok: true, telegram: data });
    });

    return router;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────

  private decryptSecrets(_enc: string): string {
    // F3b-05: decrypt AES-256-GCM — placeholder hasta implementación completa
    return '{}';
  }
}
