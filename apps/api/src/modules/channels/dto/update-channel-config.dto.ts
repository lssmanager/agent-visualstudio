/**
 * DTO para PATCH /channels/:id — actualización parcial.
 *
 * ChannelKind es el enum canónico del schema Prisma (antes ChannelType).
 */

import { z }            from 'zod'
import { ChannelKind }  from '@prisma/client'
import {
  TelegramCredentialsSchema,
  WhatsAppCredentialsSchema,
  DiscordCredentialsSchema,
  TeamsCredentialsSchema,
  SlackCredentialsSchema,
  WebhookCredentialsSchema,
  WebchatCredentialsSchema,
} from '@lss/crypto'

export const UpdateChannelConfigSchema = z.object({
  name:     z.string().min(1).max(128).optional(),
  isActive: z.boolean().optional(),
  config:   z.record(z.unknown()).optional(),
  credentials: z.union([
    z.object({ type: z.literal(ChannelKind.telegram), data: TelegramCredentialsSchema }),
    z.object({ type: z.literal(ChannelKind.whatsapp), data: WhatsAppCredentialsSchema }),
    z.object({ type: z.literal(ChannelKind.discord),  data: DiscordCredentialsSchema }),
    z.object({ type: z.literal(ChannelKind.teams),    data: TeamsCredentialsSchema }),
    z.object({ type: z.literal(ChannelKind.slack),    data: SlackCredentialsSchema }),
    z.object({ type: z.literal(ChannelKind.webhook),  data: WebhookCredentialsSchema }),
    z.object({ type: z.literal(ChannelKind.webchat),  data: WebchatCredentialsSchema }),
  ]).optional(),
})

export type UpdateChannelConfigDto = z.infer<typeof UpdateChannelConfigSchema>
