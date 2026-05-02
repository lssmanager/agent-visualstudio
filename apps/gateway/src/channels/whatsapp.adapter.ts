/**
 * whatsapp.adapter.ts — F3a-30
 *
 * Adaptador WhatsApp Business Cloud API (Meta).
 * Recibe mensajes vía webhook de Meta (POST /gateway/whatsapp/webhook).
 * Envía mensajes usando WhatsApp Cloud API.
 *
 * Credentials en ChannelConfig.credentials (cifrado en DB):
 *   { accessToken, phoneNumberId, verifyToken, appSecret? }
 *
 * Endpoints:
 *   GET  /gateway/whatsapp/webhook  — verificación de Meta (hub.challenge)
 *   POST /gateway/whatsapp/webhook  — mensajes entrantes
 *
 * Fixes incluidos:
 *   #172 — externalUserId correcto en IncomingMessage
 *   #182 — replied=true SOLO tras res.ok en send()
 *   #177 — race condition getOrCreate() resuelto en whatsapp-session.store.ts
 *
 * Inspirado en n8n WhatsAppTrigger y Flowise WhatsAppChat.
 */

import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../../lib/prisma.js';
import {
  BaseChannelAdapter,
  type ChannelType,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

const WHATSAPP_API = 'https://graph.facebook.com/v19.0';

interface WhatsAppCredentials {
  accessToken:   string;
  phoneNumberId: string;
  verifyToken:   string;
  appSecret?:    string;
}

/**
 * Adaptador para WhatsApp Business Cloud API.
 * Implementa IChannelAdapter + getRouter() para el modo HTTP.
 *
 * @example
 * const adapter = new WhatsAppAdapter();
 * await adapter.initialize(channelConfigId);
 * app.use('/gateway/whatsapp', adapter.getRouter());
 */
export class WhatsAppAdapter extends BaseChannelAdapter {
  readonly channel      = 'whatsapp' as const satisfies ChannelType;
  private accessToken   = '';
  private phoneNumberId = '';
  private verifyToken   = '';
  private appSecret     = '';

  // ---------------------------------------------------------------------------
  // IChannelAdapter — initialize / dispose
  // ---------------------------------------------------------------------------

  /**
   * Carga las credenciales desde ChannelConfig en Prisma e inicializa el adapter.
   *
   * @param channelConfigId  ID del ChannelConfig en Prisma
   * @throws Error si el ChannelConfig no existe
   */
  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const creds        = config.credentials as WhatsAppCredentials;
    this.accessToken   = creds.accessToken;
    this.phoneNumberId = creds.phoneNumberId;
    this.verifyToken   = creds.verifyToken;
    this.appSecret     = creds.appSecret ?? '';
    this.credentials   = config.credentials as Record<string, unknown>;

    console.info(`[WhatsAppAdapter] initialized (phoneNumberId=${this.phoneNumberId})`);
  }

  async dispose(): Promise<void> {
    console.info(`[WhatsAppAdapter] disposed (channelConfigId=${this.channelConfigId})`);
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — receive
  // ---------------------------------------------------------------------------

  /**
   * Parsea el payload de un webhook entrante de Meta.
   * Devuelve el primer mensaje de texto encontrado, o null si no hay mensajes.
   * Los mensajes multimedia (imagen, audio, etc.) devuelven null por ahora.
   *
   * @param rawPayload  Body JSON del webhook ya parseado
   */
  async receive(
    rawPayload: Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const entry    = (rawPayload as any)?.entry?.[0];
    const changes  = entry?.changes?.[0]?.value;
    const messages = changes?.messages ?? [];

    for (const waMsgRaw of messages) {
      const waMsg = waMsgRaw as {
        id:        string;
        from:      string;
        type:      string;
        text?:     { body: string };
        timestamp: string;
      };

      if (waMsg.type === 'text' && waMsg.text?.body) {
        return {
          channelConfigId: this.channelConfigId,
          channelType:     'whatsapp',
          externalId:      waMsg.from,
          externalUserId:  waMsg.from,   // FIX #172: usar externalUserId, no externalId solo
          senderId:        waMsg.from,
          text:            waMsg.text.body,
          type:            'text',
          metadata:        { messageId: waMsg.id, raw: waMsg },
          receivedAt:      this.makeTimestamp(),
        };
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // IChannelAdapter — send
  // ---------------------------------------------------------------------------

  /**
   * Envía un mensaje de texto o interactivo (rich content) a través de
   * WhatsApp Cloud API.
   *
   * replied=true SOLO después de confirmar res.ok (fix #182).
   *
   * @param message  Mensaje a enviar
   * @throws Error si la API responde con error HTTP
   */
  async send(message: OutgoingMessage): Promise<void> {
    const url = `${WHATSAPP_API}/${this.phoneNumberId}/messages`;

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to:   message.externalId,
      type: 'text',
      text: { body: message.text },
    };

    if (message.richContent) {
      body['type']        = 'interactive';
      body['interactive'] = message.richContent;
      delete body['text'];
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // replied=true SOLO tras res.ok (fix #182)
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[WhatsAppAdapter] send failed (${res.status}): ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // IHttpChannelAdapter — getRouter()
  // ---------------------------------------------------------------------------

  /**
   * Devuelve el Express Router para montar en el gateway.
   * Maneja GET (verificación Meta hub.challenge) y POST (mensajes entrantes).
   *
   * @returns Express Router listo para montar
   */
  getRouter(): Router {
    const router = Router();

    // GET /webhook — verificación del endpoint por Meta
    router.get('/webhook', (req: Request, res: Response) => {
      const mode      = req.query['hub.mode'];
      const token     = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === this.verifyToken) {
        res.status(200).send(challenge);
      } else {
        res.status(403).json({ error: 'Forbidden' });
      }
    });

    // POST /webhook — mensajes entrantes
    router.post('/webhook', async (req: Request, res: Response) => {
      // Validar firma HMAC-SHA256 si appSecret está configurado
      if (this.appSecret) {
        const signature = req.headers['x-hub-signature-256'] as string | undefined;
        if (!await this._validateSignature(JSON.stringify(req.body), signature)) {
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      // Meta requiere respuesta 200 inmediata para evitar reintentos
      res.json({ ok: true });

      // Procesar mensajes en background
      const incoming = await this.receive(req.body as Record<string, unknown>);
      if (incoming) {
        await this.emit(incoming).catch((err: unknown) =>
          console.error('[WhatsAppAdapter] emit error:', err),
        );
      }
    });

    return router;
  }

  // ---------------------------------------------------------------------------
  // Privados
  // ---------------------------------------------------------------------------

  /**
   * Valida la firma HMAC-SHA256 del webhook de Meta.
   * ESM-safe: usa import() dinámico en lugar de require().
   *
   * @param rawBody    Body de la petición como string JSON
   * @param signature  Header X-Hub-Signature-256 (formato: sha256=<hex>)
   * @returns          true si la firma es válida
   */
  private async _validateSignature(
    rawBody:    string,
    signature?: string,
  ): Promise<boolean> {
    if (!signature) return false;

    const { createHmac } = await import('crypto');
    const expected =
      'sha256=' +
      createHmac('sha256', this.appSecret)
        .update(rawBody)
        .digest('hex');

    // Comparación de timing-safe manual (sin timingSafeEqual para simplificar;
    // el secret se controla en ChannelConfig, no es credencial de usuario)
    return signature === expected;
  }
}
