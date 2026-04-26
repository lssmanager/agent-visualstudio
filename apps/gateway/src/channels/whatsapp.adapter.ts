/**
 * whatsapp.adapter.ts — Adaptador WhatsApp Cloud API (Meta)
 *
 * Recibe mensajes via webhook de Meta Webhooks.
 * Envía respuestas via WhatsApp Cloud API.
 *
 * Credentials en ChannelConfig.credentials (cifrado en DB):
 *   { accessToken, phoneNumberId, verifyToken, appSecret }
 *
 * Endpoints:
 *   GET  /gateway/whatsapp/webhook — verificación de Meta
 *   POST /gateway/whatsapp/webhook — mensajes entrantes
 *
 * Inspirado en n8n WhatsAppTrigger y Flowise WhatsAppChannel.
 */

import { createHmac } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { prisma } from '../../../api/src/modules/core/db/prisma.service';
import {
  BaseChannelAdapter,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

const db = prisma as any;

const WHATSAPP_API = 'https://graph.facebook.com/v19.0';

interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret?: string;
}

export class WhatsAppAdapter extends BaseChannelAdapter {
  readonly channel = 'whatsapp';
  private accessToken = '';
  private phoneNumberId = '';
  private verifyToken = '';
  private appSecret = '';

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const config = await db.channelConfig.findUnique({
      where: { id: channelConfigId },
    });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const creds = config.credentials as WhatsAppCredentials;
    this.accessToken = creds.accessToken;
    this.phoneNumberId = creds.phoneNumberId;
    this.verifyToken = creds.verifyToken;
    this.appSecret = creds.appSecret ?? '';
    this.credentials = config.credentials as Record<string, unknown>;

    console.info(`[whatsapp] Initialized for phoneNumberId ${this.phoneNumberId}`);
  }

  async dispose(): Promise<void> {
    console.info('[whatsapp] Adapter disposed');
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const url = `${WHATSAPP_API}/${this.phoneNumberId}/messages`;

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: message.externalId,
      type: 'text',
      text: { body: message.text },
    };

    // Interactive buttons/list (richContent)
    if (message.richContent) {
      body.type = 'interactive';
      body.interactive = message.richContent;
      delete body.text;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[whatsapp] send failed: ${err}`);
      throw new Error(`WhatsApp send failed: ${err}`);
    }
  }

  // ── Router ───────────────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    // GET /whatsapp/webhook — verificación de Meta
    router.get('/webhook', (req: Request, res: Response) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === this.verifyToken) {
        console.info('[whatsapp] Webhook verified by Meta');
        res.status(200).send(challenge);
      } else {
        res.status(403).json({ ok: false, error: 'Verification failed' });
      }
    });

    // POST /whatsapp/webhook — mensajes entrantes
    router.post('/webhook', async (req: Request, res: Response) => {
      // Validar firma HMAC si appSecret está configurado
      if (this.appSecret) {
        const signature = req.headers['x-hub-signature-256'] as string | undefined;
        if (!this._validateSignature(JSON.stringify(req.body), signature)) {
          res.status(403).json({ ok: false, error: 'Invalid signature' });
          return;
        }
      }

      // Responder 200 inmediatamente (Meta requiere < 200ms)
      res.json({ ok: true });

      // Procesar mensajes en background
      const entry = (req.body as any)?.entry?.[0];
      const changes = entry?.changes?.[0]?.value;
      const messages = changes?.messages ?? [];

      for (const waMsgRaw of messages) {
        const waMsg = waMsgRaw as {
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          timestamp: string;
        };

        if (waMsg.type === 'text' && waMsg.text?.body) {
          const msg: IncomingMessage = {
            externalId: waMsg.from,
            senderId: waMsg.from,
            text: waMsg.text.body,
            type: 'text',
            metadata: { messageId: waMsg.id, raw: waMsg },
            receivedAt: this.makeTimestamp(),
          };
          await this.emit(msg).catch((err) =>
            console.error('[whatsapp] emit error:', err),
          );
        }
      }
    });

    return router;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private _validateSignature(
    rawBody: string,
    signature?: string,
  ): boolean {
    if (!signature) return false;
    const expected =
      'sha256=' +
      createHmac('sha256', this.appSecret)
        .update(rawBody, 'utf8')
        .digest('hex');
    return signature === expected;
  }
}
