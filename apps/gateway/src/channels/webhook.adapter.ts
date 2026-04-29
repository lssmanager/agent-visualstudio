/**
 * webhook.adapter.ts — Canal Webhook HTTP genérico
 *
 * Permite recibir mensajes vía HTTP POST desde cualquier sistema externo:
 *   n8n, Zapier, Make, formularios web, pipelines CI/CD, etc.
 *
 * Endpoint montado en: POST /gateway/webhook/:channelId
 *
 * Formato del payload entrante (flexible):
 *   {
 *     userId:  string,          // ID del usuario/origen (requerido)
 *     text?:   string,          // Mensaje de texto
 *     data?:   Record<string, unknown>, // Payload arbitrario (se serializa como texto si no hay text)
 *     source?: string           // Identificador del sistema origen (ej. "n8n", "zapier")
 *   }
 *
 * Autenticación del webhook:
 *   Opcional: si ChannelConfig tiene secrets.webhookSecret, se valida
 *   el header Authorization: Bearer <webhookSecret> o X-Webhook-Secret: <webhookSecret>.
 *   Si no está configurado, solo la URL actua como factor de seguridad.
 *
 * Respuesta:
 *   El adapter envía la respuesta del agente como JSON en el reply del mismo POST:
 *   { ok: true, reply: "..." }
 *   (a diferencia de Telegram/Slack que son async — aquí el caller espera la respuesta)
 *
 * Outbound (send):
 *   Si ChannelConfig.config.replyWebhookUrl está configurado, el adapter
 *   hace POST a esa URL con la respuesta del agente (push mode).
 *   Si no, la respuesta ya fue enviada en el body del request original.
 */

import type { IChannelAdapter, IncomingMessage, OutgoingMessage } from './channel-adapter.interface';

type WebhookConfig = {
  replyWebhookUrl?: string;   // URL a la que enviar la respuesta del agente (push mode)
  source?: string;             // Identificador de origen para logging
};

type WebhookSecrets = {
  webhookSecret?: string;      // Opcional: valida Authorization header
};

type WebhookPayload = {
  userId: string;
  text?: string;
  data?: Record<string, unknown>;
  source?: string;
};

export class WebhookAdapter implements IChannelAdapter {
  readonly channelType = 'webhook';

  private messageHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;

  // ---------------------------------------------------------------------------
  // IChannelAdapter — setup / teardown
  // ---------------------------------------------------------------------------

  async setup(
    _config: Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<void> {
    // No hay conexión persistente que establecer — el canal es HTTP stateless
    console.info('[WebhookAdapter] ready (HTTP POST mode)');
  }

  async teardown(
    _config: Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<void> {
    // Nada que cerrar
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — onMessage / receive / send
  // ---------------------------------------------------------------------------

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async receive(
    rawPayload: Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const payload = rawPayload as WebhookPayload;

    if (!payload.userId) {
      console.warn('[WebhookAdapter] received payload without userId — ignoring');
      return null;
    }

    // Si no hay texto, serializar data como JSON string
    let text = payload.text ?? '';
    if (!text && payload.data) {
      text = JSON.stringify(payload.data);
    }
    if (!text) {
      console.warn('[WebhookAdapter] no text or data in payload — ignoring');
      return null;
    }

    return {
      channelType: 'webhook',
      externalUserId: payload.userId,
      text,
      rawPayload,
    };
  }

  async send(
    outbound: OutgoingMessage,
    config: Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<void> {
    const cfg = config as WebhookConfig;

    // Push mode: si hay replyWebhookUrl, enviamos la respuesta ahí
    if (cfg.replyWebhookUrl) {
      const response = await fetch(cfg.replyWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: outbound.externalUserId,
          reply: outbound.text,
          ts: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error(
          `[WebhookAdapter] push reply failed: HTTP ${response.status} → ${cfg.replyWebhookUrl}`,
        );
      }
    }
    // Si no hay replyWebhookUrl, la respuesta se retorna directamente
    // en el body del POST original (manejado por el router webhook.ts)
  }

  // ---------------------------------------------------------------------------
  // Verificación de secreto (llamar desde el router)
  // ---------------------------------------------------------------------------

  /**
   * Valida el header Authorization o X-Webhook-Secret contra secrets.webhookSecret.
   * Retorna true si la validación pasa o si no hay secreto configurado.
   */
  static verifySecret(
    secrets: Record<string, unknown>,
    authHeader?: string,
    xSecret?: string,
  ): boolean {
    const expected = (secrets as WebhookSecrets).webhookSecret;
    if (!expected) return true; // Sin secreto configurado — pass

    const provided =
      authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : xSecret;

    if (!provided) return false;
    return provided === expected;
  }
}
