/**
 * webchat.adapter.ts — Adaptador WebChat (HTTP polling / SSE)
 *
 * AUDIT-21: externalId = body.sessionId — devuelve 400 si falta
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

export class WebchatAdapter extends BaseChannelAdapter {
  readonly channel = 'webchat' as const satisfies ChannelType;

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);
  }

  async dispose(): Promise<void> {
    // WebChat es HTTP puro — nada que limpiar
  }

  async send(_message: OutgoingMessage): Promise<void> {
    // WebChat reply se hace vía polling o SSE, no push proactivo
    // El cliente hace GET /reply para recoger la respuesta
  }

  getRouter(): Router {
    const router = Router();

    router.post('/message', async (req: Request, res: Response) => {
      const body = req.body as {
        sessionId?: string;
        text?:      string;
        userId?:    string;
      };

      // AUDIT-21: externalId = sessionId — devolver 400 si falta
      const externalId = body.sessionId;
      if (!externalId) {
        res.status(400).json({
          ok:    false,
          error: '[webchat] sessionId is required',
        });
        return;
      }

      if (!body.text) {
        res.status(400).json({ ok: false, error: '[webchat] text is required' });
        return;
      }

      const msg: IncomingMessage = {
        channelConfigId: this.channelConfigId,
        channelType:     'webchat',
        externalId,
        senderId:   body.userId ?? externalId,
        text:       body.text,
        type:       'text',
        metadata:   {},
        receivedAt: this.makeTimestamp(),
      };

      await this.emit(msg);
      res.json({ ok: true });
    });

    return router;
  }
}
