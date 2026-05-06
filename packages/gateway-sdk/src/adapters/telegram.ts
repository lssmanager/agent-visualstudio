/**
 * telegram.ts — Telegram gateway adapter
 *
 * Fix: Removed .js extension from relative import (CJS/node10 mode).
 */
import type { ChannelMessage, ChannelAdapter } from '../types';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name: string };
    data?: string;
  };
}

export class TelegramAdapter implements ChannelAdapter {
  readonly channelType = 'telegram' as const;

  parseIncoming(raw: unknown): ChannelMessage | null {
    const update = raw as unknown as TelegramUpdate;

    if (!update || typeof update !== 'object') return null;
    if (!('update_id' in update)) return null;

    if (update.message?.text) {
      return {
        id:        String(update.message.message_id),
        channelId: String(update.message.chat.id),
        content:   update.message.text,
        senderId:  String(update.message.from?.id ?? 'unknown'),
        timestamp: new Date(update.message.date * 1000).toISOString(),
      };
    }

    if (update.callback_query) {
      return {
        id:        update.callback_query.id,
        channelId: String(update.callback_query.from.id),
        content:   update.callback_query.data ?? '',
        senderId:  String(update.callback_query.from.id),
        timestamp: new Date().toISOString(),
      };
    }

    return null;
  }

  async sendMessage(_channelId: string, _content: string): Promise<void> {
    // Implementation via Telegram Bot API
  }
}
