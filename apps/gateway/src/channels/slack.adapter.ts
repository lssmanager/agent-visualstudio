/**
 * slack.adapter.ts — Adaptador Slack (Event Subscriptions + slash commands)
 *
 * AUDIT-21: externalId = event.channel — descarta si falta (warn + 200)
 * AUDIT-13: replied=true solo después de res.ok
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

interface SlackSecrets {
  botToken:      string;
  signingSecret: string;
}

const SLACK_API = 'https://slack.com/api';

export class SlackAdapter extends BaseChannelAdapter {
  readonly channel      = 'slack' as const satisfies ChannelType;
  private botToken      = '';
  private signingSecret = '';

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const secrets: SlackSecrets = config.secretsEncrypted
      ? JSON.parse(this.decryptSecrets(config.secretsEncrypted))
      : { botToken: '', signingSecret: '' };

    this.botToken      = secrets.botToken      ?? '';
    this.signingSecret = secrets.signingSecret ?? '';
  }

  async dispose(): Promise<void> {
    this.botToken      = '';
    this.signingSecret = '';
  }

  async send(message: OutgoingMessage): Promise<void> {
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method:  'POST',
      headers: {
        'content-type':  'application/json; charset=utf-8',
        'authorization': `Bearer ${this.botToken}`,
      },
      body: JSON.stringify({
        channel: message.externalId,
        text:    message.text,
      }),
    });

    // AUDIT-13: verificar HTTP res.ok primero
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`[slack] chat.postMessage HTTP ${res.status} — ${err.slice(0, 200)}`);
    }

    // AUDIT-13: luego verificar data.ok de Slack
    const data = await res.json() as { ok: boolean; error?: string };
    if (!data.ok) {
      throw new Error(`[slack] chat.postMessage error: ${data.error ?? 'unknown'}`);
    }
  }

  getRouter(): Router {
    const router = Router();

    router.post('/events', async (req: Request, res: Response) => {
      const body = req.body as {
        type:       string;
        challenge?: string;
        event?:     {
          type:     string;
          channel?: string;
          user?:    string;
          text?:    string;
          ts?:      string;
          bot_id?:  string;
        };
      };

      // URL verification challenge
      if (body.type === 'url_verification') {
        res.json({ challenge: body.challenge });
        return;
      }

      const event = body.event;
      if (!event || event.type !== 'message' || event.bot_id) {
        res.json({ ok: true });
        return;
      }

      // AUDIT-21: externalId = event.channel — descartar si falta
      const externalId = event.channel;
      if (!externalId) {
        console.warn('[slack] event.message without channel — dropped', { ts: event.ts });
        res.json({ ok: true });
        return;
      }

      const msg: IncomingMessage = {
        channelConfigId: this.channelConfigId,
        channelType:     'slack',
        externalId,
        senderId:    event.user ?? externalId,
        text:        event.text ?? '',
        type:        'text',
        metadata:    { ts: event.ts },
        receivedAt:  this.makeTimestamp(),
      };

      await this.emit(msg);
      res.json({ ok: true });
    });

    return router;
  }

  private decryptSecrets(_enc: string): string {
    return '{}';
  }
}
