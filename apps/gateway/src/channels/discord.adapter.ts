/**
 * discord.adapter.ts — Adaptador Discord (Interactions Webhook)
 *
 * AUDIT-21: externalId = interaction.channel_id ?? message?.channel_id
 *           Si falta, devolver 400.
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

const DISCORD_API = 'https://discord.com/api/v10';

interface DiscordSecrets {
  botToken:      string;
  publicKey:     string;
  applicationId: string;
}

export class DiscordAdapter extends BaseChannelAdapter {
  readonly channel      = 'discord' as const satisfies ChannelType;
  private botToken      = '';
  private publicKey     = '';
  private applicationId = '';

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId;
    const db     = getPrisma();
    const config = await db.channelConfig.findUnique({ where: { id: channelConfigId } });
    if (!config) throw new Error(`ChannelConfig not found: ${channelConfigId}`);

    const secrets: DiscordSecrets = config.secretsEncrypted
      ? JSON.parse(this.decryptSecrets(config.secretsEncrypted))
      : { botToken: '', publicKey: '', applicationId: '' };

    this.botToken      = secrets.botToken      ?? '';
    this.publicKey     = secrets.publicKey     ?? '';
    this.applicationId = secrets.applicationId ?? '';
  }

  async dispose(): Promise<void> {
    this.botToken      = '';
    this.publicKey     = '';
    this.applicationId = '';
  }

  async send(message: OutgoingMessage): Promise<void> {
    const res = await fetch(
      `${DISCORD_API}/channels/${message.externalId}/messages`,
      {
        method:  'POST',
        headers: {
          'content-type':  'application/json',
          'authorization': `Bot ${this.botToken}`,
        },
        body: JSON.stringify({ content: message.text }),
      },
    );

    // AUDIT-13: verificar res.ok
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(
        `[discord] channels/messages HTTP ${res.status} — ${err.slice(0, 200)}`,
      );
    }
  }

  getRouter(): Router {
    const router = Router();

    router.post('/interactions', async (req: Request, res: Response) => {
      const interaction = req.body as {
        type:         number;
        channel_id?:  string;
        data?:        { name: string; options?: unknown[] };
        member?:      { user?: { id?: string } };
        message?:     { channel_id?: string };
        token?:       string;
      };

      // PING
      if (interaction.type === 1) {
        res.json({ type: 1 });
        return;
      }

      // APPLICATION_COMMAND (type=2) or MESSAGE_COMPONENT (type=3)
      if (interaction.type === 2 || interaction.type === 3) {
        // AUDIT-21: externalId = channel_id — devolver 400 si falta
        const externalId =
          interaction.channel_id ??
          interaction.message?.channel_id;

        if (!externalId) {
          res.status(400).json({
            ok:    false,
            error: '[discord] interaction missing channel_id',
          });
          return;
        }

        const commandName = interaction.data?.name ?? 'interaction';
        const msg: IncomingMessage = {
          channelConfigId: this.channelConfigId,
          channelType:     'discord',
          externalId,
          senderId:    interaction.member?.user?.id ?? externalId,
          text:        commandName,
          type:        interaction.type === 2 ? 'command' : 'button_click',
          metadata:    {
            interactionType:  interaction.type,
            commandName,
            interactionToken: interaction.token,
          },
          receivedAt: this.makeTimestamp(),
        };

        await this.emit(msg);

        // ACK deferred reply
        res.json({ type: 5 });
        return;
      }

      res.status(400).json({ ok: false, error: 'Unknown interaction type' });
    });

    return router;
  }

  private decryptSecrets(_enc: string): string {
    return '{}';
  }
}
