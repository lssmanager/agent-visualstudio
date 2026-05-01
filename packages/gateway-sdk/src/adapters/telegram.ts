/**
 * adapters/telegram.ts
 *
 * TelegramAdapter — implements IChannelAdapter for the Telegram Bot API.
 *
 * Transport: webhook (recommended for production).
 *   setup()    → calls setWebhook to register the bot's public URL
 *   receive()  → parses Telegram Update objects
 *   send()     → sendMessage / sendPhoto / sendDocument + InlineKeyboard
 *   teardown() → calls deleteWebhook
 *
 * Supported update types:
 *   - text messages (message.text)
 *   - photo (message.photo[]) — largest resolution selected
 *   - document (message.document)
 *   - voice (message.voice)
 *   - sticker (message.sticker) — treated as text '[sticker]'
 *   - callback_query (inline button press) — auto-answers the query
 *
 * Secrets expected in ChannelConfig.secretsEncrypted (decrypted before call):
 *   { botToken: string }
 *
 * Config expected in ChannelConfig.config:
 *   {
 *     webhookPath: string,  // e.g. '/webhooks/telegram/:channelId'
 *     webhookBaseUrl: string, // public base URL of the gateway
 *     parseMode?: 'HTML' | 'MarkdownV2',
 *     allowedUpdates?: string[],
 *   }
 */

import type {
  IChannelAdapter,
  IncomingMessage,
  OutboundMessage,
  MessageAttachment,
} from '../channel-adapter';

const TELEGRAM_API = 'https://api.telegram.org';

export class TelegramAdapter implements IChannelAdapter {
  readonly type = 'telegram';

  // ─── Setup ────────────────────────────────────────────────────────────

  async setup(
    config:  Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<void> {
    const token       = secrets.botToken   as string;
    const baseUrl     = config.webhookBaseUrl as string;
    const path        = config.webhookPath    as string;
    const allowedUpdates = (config.allowedUpdates as string[]) ?? [
      'message', 'callback_query',
    ];

    if (!token)   throw new Error('TelegramAdapter: secrets.botToken is required');
    if (!baseUrl) throw new Error('TelegramAdapter: config.webhookBaseUrl is required');
    if (!path)    throw new Error('TelegramAdapter: config.webhookPath is required');

    const webhookUrl = baseUrl.replace(/\/$/, '') + path;
    await this.api(token, 'setWebhook', {
      url:             webhookUrl,
      allowed_updates: allowedUpdates,
      drop_pending_updates: true,
    });
  }

  // ─── Receive ───────────────────────────────────────────────────────────

  async receive(
    rawPayload: Record<string, unknown>,
    secrets:    Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const update = rawPayload as unknown as TelegramUpdate;
    const token  = secrets.botToken as string;

    // ── callback_query (inline button press) ─────────────────────────
    if (update.callback_query) {
      const cq = update.callback_query;
      // Acknowledge immediately so Telegram stops showing the loading spinner
      await this.api(token, 'answerCallbackQuery', {
        callback_query_id: cq.id,
      }).catch(() => undefined);

      const chatId = String(cq.message?.chat?.id ?? cq.from.id);
      return {
        externalUserId: chatId,
        text:           cq.data ?? null,
        attachments:    [],
        metadata: {
          updateId:         update.update_id,
          callbackQueryId:  cq.id,
          messageId:        cq.message?.message_id,
        },
        ts: new Date().toISOString(),
      };
    }

    // ── Regular message ──────────────────────────────────────────────
    const msg = update.message ?? update.edited_message;
    if (!msg) return null;

    const chatId = String(msg.chat.id);
    const ts     = new Date((msg.date ?? Date.now() / 1000) * 1000).toISOString();
    const attachments: MessageAttachment[] = [];
    let text: string | null = msg.text ?? msg.caption ?? null;

    // Photo: pick the largest size
    if (msg.photo?.length) {
      const largest = msg.photo.reduce((a, b) =>
        (a.file_size ?? 0) > (b.file_size ?? 0) ? a : b,
      );
      const fileUrl = await this.getFileUrl(token, largest.file_id);
      attachments.push({
        mimeType: 'image/jpeg',
        url:      fileUrl,
        name:     `photo_${largest.file_id}.jpg`,
        size:     largest.file_size,
      });
    }

    // Document
    if (msg.document) {
      const fileUrl = await this.getFileUrl(token, msg.document.file_id);
      attachments.push({
        mimeType: msg.document.mime_type ?? 'application/octet-stream',
        url:      fileUrl,
        name:     msg.document.file_name ?? msg.document.file_id,
        size:     msg.document.file_size,
      });
    }

    // Voice
    if (msg.voice) {
      const fileUrl = await this.getFileUrl(token, msg.voice.file_id);
      attachments.push({
        mimeType: 'audio/ogg',
        url:      fileUrl,
        name:     `voice_${msg.voice.file_id}.ogg`,
        size:     msg.voice.file_size,
      });
    }

    // Sticker
    if (msg.sticker) {
      text = text ?? '[sticker]';
    }

    // Skip purely service messages with no content
    if (!text && attachments.length === 0) return null;

    return {
      externalUserId: chatId,
      text,
      attachments,
      metadata: {
        updateId:  update.update_id,
        messageId: msg.message_id,
        from:      msg.from,
      },
      ts,
    };
  }

  // ─── Send ────────────────────────────────────────────────────────────

  async send(
    message: OutboundMessage,
    config:  Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<void> {
    const token     = secrets.botToken as string;
    const parseMode = (message.options?.parseMode as string)
                   ?? (config.parseMode as string)
                   ?? 'HTML';
    const chatId    = message.externalUserId;
    const replyTo   = message.options?.replyToMessageId as number | undefined;

    // Build inline keyboard if buttons are provided
    const replyMarkup = message.buttons?.length
      ? {
          inline_keyboard: [message.buttons.map(b => ({
            text:          b.label,
            callback_data: b.value,
          }))],
        }
      : undefined;

    // If there's an image attachment, use sendPhoto for the first one
    const imageAtt = message.attachments?.find(a => a.mimeType.startsWith('image/'));
    const fileAtt  = message.attachments?.find(a => !a.mimeType.startsWith('image/'));

    if (imageAtt) {
      await this.api(token, 'sendPhoto', {
        chat_id:              chatId,
        photo:                imageAtt.url,
        caption:              message.text || undefined,
        parse_mode:           parseMode,
        reply_to_message_id:  replyTo,
        reply_markup:         replyMarkup,
      });
      return;
    }

    if (fileAtt) {
      await this.api(token, 'sendDocument', {
        chat_id:              chatId,
        document:             fileAtt.url,
        caption:              message.text || undefined,
        parse_mode:           parseMode,
        reply_to_message_id:  replyTo,
        reply_markup:         replyMarkup,
      });
      return;
    }

    // Text-only
    await this.api(token, 'sendMessage', {
      chat_id:             chatId,
      text:                message.text,
      parse_mode:          parseMode,
      reply_to_message_id: replyTo,
      reply_markup:        replyMarkup,
    });
  }

  // ─── Teardown ─────────────────────────────────────────────────────────

  async teardown(
    _config:  Record<string, unknown>,
    secrets:  Record<string, unknown>,
  ): Promise<void> {
    const token = secrets.botToken as string;
    await this.api(token, 'deleteWebhook', { drop_pending_updates: true });
  }

  // ─── Private helpers ───────────────────────────────────────────────────

  private async api(
    token:  string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(params),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Telegram API ${method} failed ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  private async getFileUrl(token: string, fileId: string): Promise<string> {
    const result = await this.api(token, 'getFile', { file_id: fileId }) as {
      result: { file_path: string };
    };
    return `${TELEGRAM_API}/file/bot${token}/${result.result.file_path}`;
  }
}

// ─── Telegram API type shims ────────────────────────────────────────────────
// Minimal typings for the Telegram Bot API Update object.
// Full typings: @types/node-telegram-bot-api (not required here).

interface TelegramUpdate {
  update_id:      number;
  message?:       TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from?:      Record<string, unknown>;
  chat:       { id: number; type: string };
  date:       number;
  text?:      string;
  caption?:   string;
  photo?:     Array<{ file_id: string; file_size?: number; width: number; height: number }>;
  document?:  { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?:     { file_id: string; duration: number; mime_type?: string; file_size?: number };
  sticker?:   Record<string, unknown>;
}

interface TelegramCallbackQuery {
  id:       string;
  from:     { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?:    string;
}
