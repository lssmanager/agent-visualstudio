/**
 * DTO para PATCH /channels/:id — actualización parcial.
 *
 * Regla: si se envía credentials, DEBE ser completo para ese canal.
 * No se permiten patches parciales de credentials (seguridad: evitar
 * reemplazar solo el botToken dejando el webhookSecret del canal anterior).
 *
 * Si credentials no se envía, secretsEncrypted no se toca.
 */

import { z }           from 'zod'
import { ChannelType } from '@prisma/client'
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
  /**
   * Para actualizar credenciales: enviar el tipo explícito + credentials completas.
   * Si credentials se envía, type es obligatorio para saber qué schema usar.
   */
  credentials: z.union([
    z.object({ type: z.literal(ChannelType.telegram), data: TelegramCredentialsSchema }),
    z.object({ type: z.literal(ChannelType.whatsapp), data: WhatsAppCredentialsSchema }),
    z.object({ type: z.literal(ChannelType.discord),  data: DiscordCredentialsSchema }),
    z.object({ type: z.literal(ChannelType.teams),    data: TeamsCredentialsSchema }),
    z.object({ type: z.literal(ChannelType.slack),    data: SlackCredentialsSchema }),
    z.object({ type: z.literal(ChannelType.webhook),  data: WebhookCredentialsSchema }),
    z.object({ type: z.literal(ChannelType.webchat),  data: WebchatCredentialsSchema }),
  ]).optional(),
})

export type UpdateChannelConfigDto = z.infer<typeof UpdateChannelConfigSchema>
