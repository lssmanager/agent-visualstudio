/**
 * discord.adapter.ts — Adaptador Discord
 *
 * Recibe slash commands e interacciones via webhook de Discord.
 * Envía DMs y mensajes de canal usando Discord REST API.
 *
 * Credentials en ChannelConfig.credentials (cifrado en DB):
 *   { botToken, applicationId, publicKey }
 *
 * Endpoints:
 *   POST /gateway/discord/interactions — slash commands e interacciones
 *
 * Inspirado en n8n DiscordTrigger y Semantic Kernel DiscordPlugin.
 */

import { createVerify } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { getPrisma } from '../../lib/prisma.js';
import {
  BaseChannelAdapter,
  type ChannelType,
  type IncomingMessage,
  type OutgoingMessage,
} from './channel-adapter.interface';

const DISCORD_API = 'https://discord.com/api/v10';

interface DiscordCredentials {
  botToken:      string;
  applicationId: string;
  publicKey:     string;
}

const INTERACTION_TYPE          = { PING: 1, APPLICATION_COMMAND: 2, MESSAGE_COMPONENT: 3 };
const INTERACTION_RESPONSE_TYPE = { PONG: 1, CHANNEL_MESSAGE_WITH_SOURCE: 4 };

export class DiscordAdapter extends BaseChannelAdapter {
  readonly channel = 'discord' as const satisfies ChannelType;
  private botToken      = '';
  private applicationId = '';
  private publicKey     = '';

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const creds        = config.credentials as DiscordCredentials;
    this.botToken      = creds.botToken;
    this.applicationId = creds.applicationId;
    this.publicKey     = creds.publicKey;
    this.credentials   = config.credentials as Record<string, unknown>;

    console.info(`[discord] Initialized app ${this.applicationId}`);
  }

  async dispose(): Promise<void> {
    console.info('[discord] Adapter disposed');
  }

  // ── Send ────────────────────────────────────────────────────────────────────────

  async send(message: OutgoingMessage): Promise<void> {
    const url  = `${DISCORD_API}/channels/${message.externalId}/messages`;
    const body: Record<string, unknown> = { content: message.text };
    if (message.richContent) body.embeds = [message.richContent];

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bot ${this.botToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[discord] send failed: ${err}`);
      throw new Error(`Discord send failed: ${err}`);
    }
  }

  // ── Router ────────────────────────────────────────────────────────────────────

  getRouter(): Router {
    const router = Router();

    router.post('/interactions', async (req: Request, res: Response) => {
      const timestamp = req.headers['x-signature-timestamp'] as string;
      const sig       = req.headers['x-signature-ed25519']   as string;

      if (!this._verifySignature(JSON.stringify(req.body), timestamp, sig)) {
        res.status(401).json({ error: 'Invalid request signature' });
        return;
      }

      const interaction = req.body as {
        type:           number;
        id:             string;
        token:          string;
        application_id: string;
        data?:          { name?: string; options?: Array<{ name: string; value: unknown }> };
        member?:        { user?: { id: string; username?: string } };
        user?:          { id: string; username?: string };
        channel_id?:    string;
      };

      if (interaction.type === INTERACTION_TYPE.PING) {
        res.json({ type: INTERACTION_RESPONSE_TYPE.PONG });
        return;
      }

      if (interaction.type === INTERACTION_TYPE.APPLICATION_COMMAND) {
        const commandName = interaction.data?.name ?? 'unknown';
        const options     = interaction.data?.options ?? [];
        const userInput   = (options.find((o) => o.name === 'prompt')?.value as string) ?? commandName;
        const userId      = interaction.member?.user?.id ?? interaction.user?.id ?? interaction.id;
        const channelId   = interaction.channel_id ?? interaction.id;

        res.json({
          type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '⏳ Procesando...', flags: 64 },
        });

        const msg: IncomingMessage = {
          channelConfigId: this.channelConfigId,
          channelType:     'discord',
          externalId:      channelId,
          senderId:        userId,
          text:            userInput,
          type:            'command',
          metadata:        { interactionId: interaction.id, interactionToken: interaction.token, commandName, raw: interaction },
          receivedAt:      this.makeTimestamp(),
        };
        this.emit(msg).catch((err) => console.error('[discord] emit error:', err));
        return;
      }

      res.json({ type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Interacción no soportada', flags: 64 } });
    });

    return router;
  }

  private _verifySignature(body: string, timestamp: string, signature: string): boolean {
    try {
      const verify = createVerify('ed25519');
      verify.update(timestamp + body);
      return verify.verify(Buffer.from(this.publicKey, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
      return false;
    }
  }
}
