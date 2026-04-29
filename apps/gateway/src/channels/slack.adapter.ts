/**
 * slack.adapter.ts — Canal Slack vía @slack/bolt
 *
 * Modo de operación: Socket Mode (no requiere URL pública) o HTTP mode.
 *   - Socket Mode: SLACK_SOCKET_MODE=true + SLACK_APP_TOKEN=xapp-...
 *   - HTTP Mode: recibe POST en /gateway/slack/:channelId
 *
 * Secrets esperados en ChannelConfig.secretsEncrypted:
 *   {
 *     botToken:     "xoxb-...",
 *     signingSecret: "...",
 *     appToken?:    "xapp-..." (solo Socket Mode)
 *   }
 *
 * Patrón de integración:
 *   El SlackAdapter implementa IChannelAdapter.
 *   En HTTP mode, receive() parsea el payload de Slack Events API.
 *   En Socket Mode, la App Bolt maneja internamente y llama onMessage handler.
 *
 * Ref: https://slack.dev/bolt-js/
 */

import type { IChannelAdapter, IncomingMessage, OutgoingMessage } from './channel-adapter.interface';

// Tipos Bolt importados dinámicamente para lazy-load
type BoltApp = {
  client: {
    chat: {
      postMessage: (args: { channel: string; text: string; mrkdwn?: boolean }) => Promise<unknown>;
    };
  };
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type SlackSecrets = {
  botToken: string;
  signingSecret: string;
  appToken?: string;
};

type SlackMessageEvent = {
  type: string;
  user?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  ts?: string;
};

type SlackEventPayload = {
  type: string;
  event?: SlackMessageEvent;
  challenge?: string;
};

export class SlackAdapter implements IChannelAdapter {
  readonly channelType = 'slack';

  private boltApp: BoltApp | null = null;
  private secrets: SlackSecrets | null = null;
  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private socketMode = false;

  // ---------------------------------------------------------------------------
  // IChannelAdapter — setup / teardown
  // ---------------------------------------------------------------------------

  async setup(
    config: Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<void> {
    this.secrets = secrets as SlackSecrets;
    this.socketMode =
      (config['socketMode'] as boolean | undefined) ??
      process.env.SLACK_SOCKET_MODE === 'true';

    if (this.socketMode) {
      await this.startSocketMode();
    }
    // En HTTP mode no hay nada que iniciar — los mensajes llegan vía receive()
  }

  async teardown(
    _config: Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<void> {
    if (this.boltApp && this.socketMode) {
      await this.boltApp.stop().catch((err: unknown) =>
        console.warn('[SlackAdapter] stop error:', err),
      );
      this.boltApp = null;
    }
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — onMessage / receive / send
  // ---------------------------------------------------------------------------

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * HTTP mode: parsea el payload de Slack Events API.
   * Retorna null para eventos que no son mensajes (ej. url_verification ya
   * se maneja en el router antes de llegar aquí).
   */
  async receive(
    rawPayload: Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const payload = rawPayload as SlackEventPayload;

    // Ignorar mensajes de bots
    const event = payload.event;
    if (!event || event.type !== 'message' || event.bot_id) {
      return null;
    }

    if (!event.user || !event.channel) return null;

    return {
      channelType: 'slack',
      externalUserId: event.user,
      externalChatId: event.channel,
      text: event.text ?? '',
      rawPayload,
    };
  }

  async send(
    outbound: OutgoingMessage,
    _config: Record<string, unknown>,
    secrets: Record<string, unknown>,
  ): Promise<void> {
    const s = (secrets as SlackSecrets);

    // En Socket Mode, usamos el cliente Bolt
    if (this.socketMode && this.boltApp) {
      await this.boltApp.client.chat.postMessage({
        channel: outbound.externalChatId ?? outbound.externalUserId,
        text: outbound.text,
        mrkdwn: outbound.parseMode === 'markdown',
      });
      return;
    }

    // En HTTP mode, llamamos directo a la Slack Web API con fetch
    const channel = outbound.externalChatId ?? outbound.externalUserId;
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text: outbound.text,
        mrkdwn: outbound.parseMode === 'markdown',
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

  /**
   * Verifica la firma X-Slack-Signature del request.
   * Llamar desde el router antes de dispatch().
   *
   * @param signingSecret  ChannelConfig.secretsEncrypted.signingSecret
   * @param timestamp      Header X-Slack-Request-Timestamp
   * @param signature      Header X-Slack-Signature
   * @param rawBody        Raw body string (antes de JSON.parse)
   */
  static async verifySignature(
    signingSecret: string,
    timestamp: string,
    signature: string,
    rawBody: string,
  ): Promise<boolean> {
    // Rechazar requests con más de 5 minutos de antigüedad (replay attacks)
    const ts = parseInt(timestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

    const { createHmac } = await import('crypto');
    const baseString = `v0:${timestamp}:${rawBody}`;
    const expectedSig =
      'v0=' + createHmac('sha256', signingSecret).update(baseString).digest('hex');

    // Comparación segura para evitar timing attacks
    const { timingSafeEqual } = await import('crypto');
    try {
      return timingSafeEqual(
        Buffer.from(expectedSig, 'utf8'),
        Buffer.from(signature, 'utf8'),
      );
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Socket Mode interno
  // ---------------------------------------------------------------------------

  private async startSocketMode(): Promise<void> {
    if (!this.secrets?.appToken) {
      throw new Error('[SlackAdapter] Socket Mode requires appToken (xapp-...)');
    }

    // Importación dinámica — @slack/bolt no se carga si no se usa
    const { App, LogLevel } = await import('@slack/bolt').catch(() => {
      throw new Error(
        '[SlackAdapter] @slack/bolt not installed. Run: pnpm add @slack/bolt',
      );
    });

    const app = new App({
      token: this.secrets.botToken,
      signingSecret: this.secrets.signingSecret,
      appToken: this.secrets.appToken,
      socketMode: true,
      logLevel: LogLevel.WARN,
    });

    // Escuchar mensajes
    app.message(async ({ message, say: _say }) => {
      const msg = message as SlackMessageEvent;
      if (!this.messageHandler || msg.bot_id || !msg.user) return;

      const incoming: IncomingMessage = {
        channelType: 'slack',
        externalUserId: msg.user,
        externalChatId: msg.channel,
        text: msg.text ?? '',
        rawPayload: message as unknown as Record<string, unknown>,
      };

      await this.messageHandler(incoming).catch((err: unknown) => {
        console.error('[SlackAdapter] messageHandler error:', err);
      });
    });

    await app.start();
    this.boltApp = app as unknown as BoltApp;
    console.info('[SlackAdapter] Socket Mode started');
  }
}
