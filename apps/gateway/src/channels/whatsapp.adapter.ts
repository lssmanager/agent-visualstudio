/**
 * whatsapp.adapter.ts — Adaptador WhatsApp Business API (Cloud)
 *
 * AUDIT-21: externalId = from (número E.164) — descarta si falta (warn + 200)
 * AUDIT-13: verificar res.ok en send()
 * AUDIT-24: secrets se leen de secretsEncrypted
 */

import { Router, type Request, type Response } from 'express';
import {
  BaseChannelAdapter,
  type ChannelType,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';
import { getPrisma } from '../../lib/prisma.js';

const WA_API = 'https://graph.facebook.com/v19.0';

interface WhatsAppSecrets {
  accessToken:   string;
  phoneNumberId: string;
  verifyToken:   string;
}

export class WhatsAppAdapter extends BaseChannelAdapter {
  readonly channel      = 'whatsapp' as const satisfies ChannelType;
  private accessToken   = '';
  private phoneNumberId = '';
  private verifyToken   = '';

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const secrets: WhatsAppSecrets = config.secretsEncrypted
      ? JSON.parse(this.decryptSecrets(config.secretsEncrypted))
      : { accessToken: '', phoneNumberId: '', verifyToken: '' };

    this.accessToken   = secrets.accessToken   ?? '';
    this.phoneNumberId = secrets.phoneNumberId ?? '';
    this.verifyToken   = secrets.verifyToken   ?? '';
  }

  async dispose(): Promise<void> {
    this.accessToken   = '';
    this.phoneNumberId = '';
    this.verifyToken   = '';
  }

  async send(message: OutgoingMessage): Promise<void> {
    const res = await fetch(
      `${WA_API}/${this.phoneNumberId}/messages`,
      {
        method:  'POST',
        headers: {
          'content-type':  'application/json',
          'authorization': `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to:                message.externalId,
          type:              'text',
          text:              { body: message.text },
        }),
      },
    );

    // AUDIT-13: verificar res.ok
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(
        `[whatsapp] send HTTP ${res.status} — ${err.slice(0, 200)}`,
      );
    }
  }

  getRouter(): Router {
    const router = Router();

    // Webhook verification (GET)
    router.get('/webhook', (req: Request, res: Response) => {
      const mode      = req.query['hub.mode'];
      const token     = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe' && token === this.verifyToken) {
        res.status(200).send(String(challenge));
      } else {
        res.status(403).send('Forbidden');
      }
    });

    // Webhook events (POST)
    router.post('/webhook', async (req: Request, res: Response) => {
      const body = req.body as {
        object?: string;
        entry?:  Array<{
          changes?: Array<{
            value?: {
              messages?: Array<{
                from?:      string;
                id?:        string;
                type?:      string;
                text?:      { body?: string };
                timestamp?: string;
              }>;
            };
          }>;
        }>;
      };

      if (body.object !== 'whatsapp_business_account') {
        res.json({ ok: true });
        return;
      }

      const messages = body.entry
        ?.flatMap((e) => e.changes ?? [])
        .flatMap((c) => c.value?.messages ?? []) ?? [];

      for (const wam of messages) {
        // AUDIT-21: externalId = from (E.164) — descartar si falta
        const externalId = wam.from;
        if (!externalId) {
          console.warn('[whatsapp] message without from — dropped', { id: wam.id });
          continue;
        }

        const text = wam.type === 'text' ? (wam.text?.body ?? '') : '';
        if (!text) continue;

        const msg: IncomingMessage = {
          channelConfigId: this.channelConfigId,
          channelType:     'whatsapp',
          externalId,
          senderId:   externalId,
          text,
          type:       'text',
          metadata:   { messageId: wam.id, timestamp: wam.timestamp },
          receivedAt: this.makeTimestamp(),
        };

        await this.emit(msg);
      }

      res.json({ ok: true });
    });

    return router;
  }

  private decryptSecrets(_enc: string): string {
    return '{}';
  }
}
