/**
 * webhook.adapter.ts — Adaptador genérico Webhook (punto a punto)
 *
 * AUDIT-21: externalId = body.externalId ?? channelConfigId
 *   El caller puede pasar externalId explícito.
 *   Si no lo pasa, se usa channelConfigId como clave única
 *   (canal punto a punto — una sola sesión por canal).
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

export class WebhookAdapter extends BaseChannelAdapter {
  readonly channel = 'webhook' as const satisfies ChannelType;
  private callbackUrl = '';

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const cfg = (config.config as Record<string, unknown>) ?? {};
    this.callbackUrl = (cfg['callbackUrl'] as string | undefined) ?? '';
  }

  async dispose(): Promise<void> {
    this.callbackUrl = '';
  }

  async send(message: OutgoingMessage): Promise<void> {
    if (!this.callbackUrl) return;
    const res = await fetch(this.callbackUrl, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(message),
    });

    // AUDIT-13: verificar res.ok
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(
        `[webhook] callbackUrl POST HTTP ${res.status} — ${err.slice(0, 200)}`,
      );
    }
  }

  getRouter(): Router {
    const router = Router();

    router.post('/message', async (req: Request, res: Response) => {
      const body = req.body as {
        externalId?: string;
        text?:       string;
        userId?:     string;
        metadata?:   Record<string, unknown>;
      };

      if (!body.text) {
        res.status(400).json({ ok: false, error: '[webhook] text is required' });
        return;
      }

      // AUDIT-21: externalId del body o fallback a channelConfigId
      // El webhook es punto a punto: una sola sesión por canal está OK
      const externalId = body.externalId ?? this.channelConfigId;

      const msg: IncomingMessage = {
        channelConfigId: this.channelConfigId,
        channelType:     'webhook',
        externalId,
        senderId:   body.userId ?? externalId,
        text:       body.text,
        type:       'text',
        metadata:   body.metadata ?? {},
        receivedAt: this.makeTimestamp(),
      };

      await this.emit(msg);
      res.json({ ok: true });
    });

    return router;
  }
}
