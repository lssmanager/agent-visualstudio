/**
 * slack.adapter.ts — Canal Slack vía @slack/bolt
 *
 * Modo de operación: Socket Mode (no requiere URL pública) o HTTP mode.
 *   - Socket Mode: SLACK_SOCKET_MODE=true + SLACK_APP_TOKEN=xapp-...
 *   - HTTP Mode: recibe POST en /gateway/slack/:channelId
 *
 * Secrets esperados en ChannelConfig.credentials (cifrado en DB):
 *   {
 *     botToken:      "xoxb-...",
 *     signingSecret: "...",
 *     appToken?:     "xapp-..." (solo Socket Mode)
 *   }
 *
 * Patrón de integración:
 *   SlackAdapter extiende BaseChannelAdapter.
 *   En HTTP mode, receive() parsea el payload de Slack Events API.
 *   En Socket Mode, la App Bolt maneja internamente y llama onMessage handler.
 *
 * Ref: https://slack.dev/bolt-js/
 */

import { getPrisma } from '../../lib/prisma.js';
import {
  BaseChannelAdapter,
  type ChannelType,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

// Tipos Bolt importados dinámicamente para lazy-load
type BoltApp = {
  client: {
    chat: {
      postMessage: (args: { channel: string; text: string; mrkdwn?: boolean }) => Promise<unknown>;
    };
  };
  start: () => Promise<void>;
  stop:  () => Promise<void>;
};

type SlackSecrets = {
  botToken:       string;
  signingSecret:  string;
  appToken?:      string;
  socketMode?:    boolean;
};

type SlackMessageEvent = {
  type:     string;
  user?:    string;
  bot_id?:  string;
  text?:    string;
  channel?: string;
  ts?:      string;
};

type SlackEventPayload = {
  type:       string;
  event?:     SlackMessageEvent;
  challenge?: string;
};

export class SlackAdapter extends BaseChannelAdapter {
  readonly channel = 'slack' as const satisfies ChannelType;

  private boltApp:    BoltApp | null = null;
  private socketMode = false;

  // ---------------------------------------------------------------------------
  // IChannelAdapter — initialize / dispose
  // ---------------------------------------------------------------------------

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;

    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    this.credentials = config.credentials as Record<string, unknown>;

    const secrets = this.credentials as SlackSecrets;
    this.socketMode =
      secrets.socketMode ??
      process.env.SLACK_SOCKET_MODE === 'true';

    if (this.socketMode) {
      await this.startSocketMode();
    }

    console.info(`[SlackAdapter] initialized (channelConfigId=${channelConfigId}, socketMode=${this.socketMode})`);
  }

  async dispose(): Promise<void> {
    if (this.boltApp && this.socketMode) {
      await this.boltApp.stop().catch((err: unknown) =>
        console.warn('[SlackAdapter] stop error:', err),
      );
      this.boltApp = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Receive (HTTP mode)
  // ---------------------------------------------------------------------------

  async receive(
    rawPayload: Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const payload = rawPayload as SlackEventPayload;

    const event = payload.event;
    if (!event || event.type !== 'message' || event.bot_id) {
      return null;
    }

    if (!event.user || !event.channel) return null;

    return {
      channelConfigId: this.channelConfigId,
      channelType:     'slack',
      externalId:      event.channel,
      senderId:        event.user,
      text:            event.text ?? '',
      type:            'text',
      receivedAt:      this.makeTimestamp(),
      metadata:        rawPayload,
    };
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — send
  // ---------------------------------------------------------------------------

  async send(message: OutgoingMessage): Promise<void> {
    const secrets    = this.credentials as SlackSecrets;
    const isMarkdown = message.type === 'markdown';

    if (this.socketMode && this.boltApp) {
      await this.boltApp.client.chat.postMessage({
        channel: message.externalId,
        text:    message.text,
        mrkdwn:  isMarkdown,
      });
      return;
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${secrets.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: message.externalId,
        text:    message.text,
        mrkdwn:  isMarkdown,
      }),
    });

    if (!response.ok) {
      throw new Error(`[SlackAdapter] send failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as { ok: boolean; error?: string };
    if (!body.ok) {
      throw new Error(`[SlackAdapter] Slack API error: ${body.error}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Slack signature verification (HMAC-SHA256)
  // ---------------------------------------------------------------------------

  static async verifySignature(
    signingSecret: string,
    timestamp:     string,
    signature:     string,
    rawBody:       string,
  ): Promise<boolean> {
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const { createHmac, timingSafeEqual } = await import('crypto');
    const baseString  = `v0:${timestamp}:${rawBody}`;
    const expectedSig = 'v0=' + createHmac('sha256', signingSecret).update(baseString).digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(expectedSig, 'utf8'),
        Buffer.from(signature,   'utf8'),
      );
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Socket Mode interno
  // ---------------------------------------------------------------------------

  private async startSocketMode(): Promise<void> {
    const secrets = this.credentials as SlackSecrets;

    if (!secrets.appToken) {
      throw new Error('[SlackAdapter] Socket Mode requires appToken (xapp-...)');
    }

    const { App, LogLevel } = await import('@slack/bolt').catch(() => {
      throw new Error(
        '[SlackAdapter] @slack/bolt not installed. Run: pnpm add @slack/bolt',
      );
    });

    const app = new App({
      token:         secrets.botToken,
      signingSecret: secrets.signingSecret,
      appToken:      secrets.appToken,
      socketMode:    true,
      logLevel:      LogLevel.WARN,
    });

    app.message(async ({ message }) => {
      const msg = message as SlackMessageEvent;
      if (!this.messageHandler || msg.bot_id || !msg.user) return;

      const incoming: IncomingMessage = {
        channelConfigId: this.channelConfigId,
        channelType:     'slack',
        externalId:      msg.channel ?? '',
        senderId:        msg.user,
        text:            msg.text ?? '',
        type:            'text',
        receivedAt:      this.makeTimestamp(),
        metadata:        message as unknown as Record<string, unknown>,
      };

      await this.emit(incoming);
    });

    await app.start();
    this.boltApp = app as unknown as BoltApp;
    console.info('[SlackAdapter] Socket Mode started');
  }
}
