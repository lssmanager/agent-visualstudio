/**
 * slack.adapter.ts — F3a-28
 *
 * Adaptador Slack completo:
 *   - Socket Mode: SLACK_SOCKET_MODE=true + SLACK_APP_TOKEN=xapp-...
 *   - HTTP Mode:   recibe POST en /gateway/slack/:channelId
 *   - Slash commands: /ask <prompt>, /status
 *   - OAuth flow: SlackOAuthHandler.handleCallback()
 *   - replied=true SOLO tras res.ok (fix #182)
 *   - verifySignature() obligatorio en receiveHttp() (fix #178 reforzado)
 *
 * Secrets esperados en ChannelConfig.credentials:
 *   {
 *     botToken:      "xoxb-...",
 *     signingSecret: "...",       // OBLIGATORIO — lanzar Error si falta
 *     appToken?:     "xapp-...", // Solo Socket Mode
 *     oauthClientId?:     string,
 *     oauthClientSecret?: string,
 *   }
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

// ── Tipos internos ──────────────────────────────────────────────────────────

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
  botToken:           string;
  signingSecret:      string;
  appToken?:          string;
  socketMode?:        boolean;
  oauthClientId?:     string;
  oauthClientSecret?: string;
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

/** Payload de un slash command Slack (POST form-urlencoded). */
export type SlackSlashPayload = {
  command:      string;   // e.g. '/ask'
  text:         string;   // argumentos del comando
  user_id:      string;
  channel_id:   string;
  team_id?:     string;
  response_url: string;
};

// ── SlackAdapter ────────────────────────────────────────────────────────────

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

    // Validar signingSecret obligatorio (fix #178)
    if (!secrets.signingSecret) {
      throw new Error(
        `[SlackAdapter] signingSecret is required in ChannelConfig.credentials ` +
        `(channelConfigId=${channelConfigId}). ` +
        `Set it in the channel configuration, not as a global env var.`,
      );
    }

    this.socketMode =
      secrets.socketMode ??
      process.env.SLACK_SOCKET_MODE === 'true';

    if (this.socketMode) {
      await this.startSocketMode();
    }

    console.info(
      `[SlackAdapter] initialized (channelConfigId=${channelConfigId}, socketMode=${this.socketMode})`,
    );
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
  // Receive — HTTP mode (Events API)
  // ---------------------------------------------------------------------------

  /**
   * Procesa el body ya parseado de un evento Slack Events API.
   * Para URL_VERIFICATION devuelve null — el caller debe responder con challenge.
   * Para mensajes de bot (bot_id presente) devuelve null para evitar loops.
   *
   * @param rawPayload  Body JSON de la petición ya parseado
   */
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
      externalUserId:  event.user,
      senderId:        event.user,
      text:            event.text ?? '',
      type:            'text',
      receivedAt:      this.makeTimestamp(),
      metadata:        rawPayload,
    };
  }

  /**
   * Procesa una petición HTTP de Slack verificando la firma HMAC antes de parsear.
   * Este método debe usarse en lugar de receive() en el router HTTP.
   *
   * @param rawBody    Body raw de la petición como string (antes de parsear)
   * @param timestamp  Header X-Slack-Request-Timestamp
   * @param signature  Header X-Slack-Signature
   * @returns          IncomingMessage | null, igual que receive()
   * @throws           Error si la firma no es válida
   */
  async receiveHttp(
    rawBody:   string,
    timestamp: string,
    signature: string,
  ): Promise<IncomingMessage | null> {
    const secrets = this.credentials as SlackSecrets;

    const valid = await SlackAdapter.verifySignature(
      secrets.signingSecret,
      timestamp,
      signature,
      rawBody,
    );

    if (!valid) {
      throw new Error(`[SlackAdapter] Invalid Slack signature (channelConfigId=${this.channelConfigId})`);
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    return this.receive(payload);
  }

  // ---------------------------------------------------------------------------
  // Slash commands
  // ---------------------------------------------------------------------------

  /**
   * Procesa un slash command Slack (/ask, /status).
   * Los slash commands llegan como form-urlencoded — parsear antes de llamar.
   *
   * El caller debe responder HTTP 200 con el texto devuelto en ≤ 3 s.
   * Para respuestas largas, usar response_url con delayed_response.
   *
   * @param payload     Payload del slash command parseado
   * @param runAgent    Función que ejecuta el agente y devuelve la respuesta
   * @param getStatus   Función que devuelve el estado del canal
   * @returns           Texto de respuesta para enviar en el body HTTP
   */
  async handleSlashCommand(
    payload:   SlackSlashPayload,
    runAgent:  (userId: string, channelId: string, prompt: string) => Promise<string>,
    getStatus: (channelId: string) => Promise<string>,
  ): Promise<string> {
    const command = payload.command.toLowerCase().replace(/^\//, '');
    const text    = payload.text.trim();

    switch (command) {
      case 'ask': {
        if (!text) {
          return 'Debes proporcionar un prompt. Uso: `/ask <tu pregunta>`';
        }
        try {
          const reply = await runAgent(payload.user_id, payload.channel_id, text);
          return reply.slice(0, 3000); // Slack permite hasta 3000 chars en respuesta directa
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[SlackAdapter] /ask error:', msg);
          return `Error al procesar tu pregunta: ${msg}`;
        }
      }

      case 'status': {
        return getStatus(payload.channel_id);
      }

      default:
        return `Comando desconocido: \`/${command}\`. Comandos disponibles: \`/ask\`, \`/status\``;
    }
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — send
  // ---------------------------------------------------------------------------

  /**
   * Envía un mensaje a un canal Slack.
   * En Socket Mode usa el cliente Bolt; en HTTP Mode usa la Web API directamente.
   *
   * replied=true SOLO después de confirmar res.ok (fix #182).
   *
   * @throws Error si el envío falla
   */
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

    // replied=true SOLO después de res.ok (fix #182)
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`[SlackAdapter] send failed (${response.status}): ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Verificación de firma HMAC-SHA256
  // ---------------------------------------------------------------------------

  /**
   * Verifica la firma HMAC-SHA256 de una petición Slack.
   * Rechaza peticiones con timestamp > 5 minutos para prevenir replay attacks.
   *
   * @param signingSecret  Secret desde ChannelConfig.credentials.signingSecret
   * @param timestamp      Header X-Slack-Request-Timestamp
   * @param signature      Header X-Slack-Signature
   * @param rawBody        Body raw de la petición como string
   * @returns              true si la firma es válida
   */
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
        externalUserId:  msg.user,
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

// ── SlackOAuthHandler ────────────────────────────────────────────────────────

/**
 * Maneja el OAuth 2.0 flow de Slack para instalación de la app en workspaces.
 *
 * @example
 * const handler = new SlackOAuthHandler(clientId, clientSecret, redirectUri);
 * // En el router:
 * app.get('/slack/oauth/callback', async (req, res) => {
 *   const result = await handler.handleCallback(req.query.code as string);
 *   res.redirect(result.success ? '/success' : '/error');
 * });
 */
export class SlackOAuthHandler {
  constructor(
    private readonly clientId:     string,
    private readonly clientSecret: string,
    private readonly redirectUri:  string,
  ) {}

  /**
   * Intercambia el code OAuth por tokens de acceso.
   * Devuelve los tokens para persistir en ChannelConfig.credentials.
   *
   * @param code  Código de autorización de Slack (query param `code`)
   * @throws      Error si el intercambio falla
   */
  async handleCallback(code: string): Promise<{
    success:      boolean;
    accessToken?: string;
    botUserId?:   string;
    teamId?:      string;
    teamName?:    string;
    error?:       string;
  }> {
    const params = new URLSearchParams({
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri:  this.redirectUri,
    });

    const res = await fetch('https://slack.com/api/oauth.v2.access', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[SlackOAuthHandler] oauth.v2.access failed (${res.status}): ${err}`);
    }

    const data = await res.json() as Record<string, unknown>;

    if (!data['ok']) {
      return { success: false, error: String(data['error'] ?? 'unknown_error') };
    }

    const authedUser = data['authed_user'] as Record<string, string> | undefined;
    const team       = data['team']        as Record<string, string> | undefined;

    return {
      success:     true,
      accessToken: String(data['access_token'] ?? authedUser?.['access_token'] ?? ''),
      botUserId:   String(data['bot_user_id'] ?? ''),
      teamId:      team?.['id']   ?? '',
      teamName:    team?.['name'] ?? '',
    };
  }
}
