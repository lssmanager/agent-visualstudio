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
 *     userId:  string,                       // ID del usuario/origen (requerido)
 *     text?:   string,                       // Mensaje de texto
 *     data?:   Record<string, unknown>,      // Payload arbitrario
 *     source?: string                        // Identificador del sistema origen
 *   }
 *
 * Autenticación:
 *   Opcional — si credentials.webhookSecret está configurado, se valida
 *   el header Authorization: Bearer <secret> o X-Webhook-Secret: <secret>.
 *
 * Respuesta:
 *   El adapter envía la respuesta del agente como JSON en el reply del mismo POST:
 *   { ok: true, reply: "..." }
 *
 * Outbound (send):
 *   Si credentials.replyWebhookUrl está configurado, hace POST a esa URL
 *   con la respuesta del agente (push mode).
 */

import { getPrisma } from '../../lib/prisma.js';
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

type WebhookCredentials = {
  webhookSecret?:   string;   // Opcional: valida Authorization header
  replyWebhookUrl?: string;   // URL a la que enviar la respuesta (push mode)
  source?:          string;   // Identificador de origen para logging
};

type WebhookPayload = {
  userId:  string;
  text?:   string;
  data?:   Record<string, unknown>;
  source?: string;
};

export class WebhookAdapter extends BaseChannelAdapter {
  readonly channel = 'webhook';

  // ---------------------------------------------------------------------------
  // IChannelAdapter — initialize / dispose
  // ---------------------------------------------------------------------------

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;

    // Carga credenciales desde DB — mismo patrón que discord/telegram/whatsapp adapters
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    this.credentials = config.credentials as Record<string, unknown>;

    // Canal HTTP stateless — no hay conexión persistente que iniciar
    console.info(`[WebhookAdapter] ready (channelConfigId=${channelConfigId})`);
  }

  async dispose(): Promise<void> {
    // Nada que cerrar — canal HTTP stateless
  }

  // ---------------------------------------------------------------------------
  // Receive — parsea payload entrante
  // ---------------------------------------------------------------------------

  async receive(
    rawPayload: Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const payload = rawPayload as WebhookPayload;

    if (!payload.userId) {
      console.warn('[WebhookAdapter] received payload without userId — ignoring');
      return null;
    }

    let text = payload.text ?? '';
    if (!text && payload.data) {
      text = JSON.stringify(payload.data);
    }
    if (!text) {
      console.warn('[WebhookAdapter] no text or data in payload — ignoring');
      return null;
    }

    return {
      externalId:  payload.userId,
      senderId:    payload.userId,
      text,
      type:       'text',
      receivedAt: this.makeTimestamp(),
      metadata:   rawPayload,
    };
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — send
  // ---------------------------------------------------------------------------

  async send(message: OutgoingMessage): Promise<void> {
    const creds = this.credentials as WebhookCredentials;

    if (creds.replyWebhookUrl) {
      const response = await fetch(creds.replyWebhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: message.externalId,
          reply:  message.text,
          ts:     new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error(
          `[WebhookAdapter] push reply failed: HTTP ${response.status} → ${creds.replyWebhookUrl}`,
        );
      }
    }
    // Sin replyWebhookUrl: la respuesta se retorna en el body del POST original
    // (manejado por el router webhook.ts)
  }

  // ---------------------------------------------------------------------------
  // Verificación de secreto (llamar desde el router antes de dispatch)
  // ---------------------------------------------------------------------------

  /**
   * Valida Authorization: Bearer <secret> o X-Webhook-Secret contra
   * credentials.webhookSecret.
   * Retorna true si la validación pasa o si no hay secreto configurado.
   */
  static verifySecret(
    credentials:  Record<string, unknown>,
    authHeader?:  string,
    xSecret?:     string,
  ): boolean {
    const expected = (credentials as WebhookCredentials).webhookSecret;
    if (!expected) return true;

    const provided =
      authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : xSecret;

    if (!provided) return false;
    return provided === expected;
  }
}
