/**
 * slack.adapter.ts — Adaptador Slack
 *
 * Soporta dos modos:
 *   - Socket Mode: SLACK_SOCKET_MODE=true + SLACK_APP_TOKEN=xapp-...
 *   - HTTP Mode: recibe POST en /gateway/slack/:channelId
 *
 * Secrets esperados en ChannelConfig.secrets (cifrado en DB), NO de env global:
 *   {
 *     botToken:      "xoxb-...",
 *     signingSecret: "...",     // OBLIGATORIO — sin él se lanza Error
 *     appToken?:     "xapp-..." // solo Socket Mode
 *   }
 *
 * FIX #178: verifySignature() recibe signingSecret explícito (no SLACK_SIGNING_SECRET env).
 *           initialize() lanza Error si signingSecret está ausente o vacío.
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

    // FIX #178: lanzar Error (no console.warn) si signingSecret no está configurado.
    // El secret DEBE venir de channelConfig.credentials (cifrado en DB), nunca de env global.
    if (!secrets.signingSecret) {
      throw new Error(
        `[SlackAdapter] ChannelConfig ${channelConfigId} is missing secrets.signingSecret. ` +
        'Configure it in ChannelConfig.credentials. ' +
        'Do NOT use the SLACK_SIGNING_SECRET environment variable — use per-channel secrets.',
      );
    }

    if (!secrets.botToken) {
      throw new Error(
        `[SlackAdapter] ChannelConfig ${channelConfigId} is missing secrets.botToken.`,
      );
    }

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
    }
    this.boltApp = null;
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
      externalUserId:  event.user,
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

    // FIX #182: verificar res.ok ANTES de considerar la entrega exitosa
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`[SlackAdapter] send failed: HTTP ${response.status} — ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Slack signature verification (HMAC-SHA256)
  // FIX #178: recibe signingSecret explícito — NO lee de env global
  // ---------------------------------------------------------------------------

  /**
   * Verifica la firma Slack (X-Slack-Signature) del request entrante.
   *
   * @param signingSecret  Secret obtenido de ChannelConfig.secrets.signingSecret (nunca de env)
   * @param timestamp      Valor del header X-Slack-Request-Timestamp
   * @param signature      Valor del header X-Slack-Signature
   * @param rawBody        Body del request como string sin parsear
   */
  static async verifySignature(
    signingSecret: string,
    timestamp:     string,
    signature:     string,
    rawBody:       string,
  ): Promise<boolean> {
    if (!signingSecret) {
      throw new Error(
        '[SlackAdapter.verifySignature] signingSecret is empty. ' +
        'Pass channelConfig.secrets.signingSecret explicitly.',
      );
    }

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
  // Socket Mode bootstrap
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
      signingSecret: secrets.signingSecret, // siempre del DB, nunca de env
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
        externalUserId:  msg.user,
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
    console.info('[SlackAdapter] Socket Mode connected');
  }
}
