/**
 * DTO para POST /channels — crea un nuevo ChannelConfig.
 *
 * ChannelKind es el enum canónico del schema Prisma (antes ChannelType).
 * Los valores son los mismos 7: telegram, whatsapp, webchat, discord, teams, slack, webhook.
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

// ── Schemas de config (no-sensible) por canal ───────────────────────────────────

const TelegramConfigSchema = z.object({
  parseMode:        z.enum(['Markdown', 'HTML', 'MarkdownV2']).default('Markdown'),
  maxMessageLength: z.number().int().min(1).max(4096).default(4096),
  webhookPath:      z.string().optional(),
}).default({})

const WhatsAppConfigSchema = z.object({
  webhookPath: z.string().optional(),
  apiVersion:  z.string().default('v18.0'),
}).default({})

const DiscordConfigSchema = z.object({
  interactionsPath: z.string().optional(),
  commandPrefix:    z.string().max(5).default('!'),
}).default({})

const TeamsConfigSchema = z.object({
  webhookPath: z.string().optional(),
}).default({})

const SlackConfigSchema = z.object({
  eventsPath: z.string().optional(),
  slashPath:  z.string().optional(),
}).default({})

const WebhookConfigSchema = z.object({
  path:   z.string().min(1).default('/webhook'),
  method: z.enum(['POST', 'GET']).default('POST'),
}).default({})

const WebchatConfigSchema = z.object({
  allowedOrigins:   z.array(z.string().url()).default([]),
  sessionTimeoutMs: z.number().int().positive().default(1_800_000),
}).default({})

// ── Discriminated union ──────────────────────────────────────────────────────────

export const CreateChannelConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type:        z.literal(ChannelKind.telegram),
    name:        z.string().min(1).max(128),
    credentials: TelegramCredentialsSchema,
    config:      TelegramConfigSchema,
  }),
  z.object({
    type:        z.literal(ChannelKind.whatsapp),
    name:        z.string().min(1).max(128),
    credentials: WhatsAppCredentialsSchema,
    config:      WhatsAppConfigSchema,
  }),
  z.object({
    type:        z.literal(ChannelKind.discord),
    name:        z.string().min(1).max(128),
    credentials: DiscordCredentialsSchema,
    config:      DiscordConfigSchema,
  }),
  z.object({
    type:        z.literal(ChannelKind.teams),
    name:        z.string().min(1).max(128),
    credentials: TeamsCredentialsSchema,
    config:      TeamsConfigSchema,
  }),
  z.object({
    type:        z.literal(ChannelKind.slack),
    name:        z.string().min(1).max(128),
    credentials: SlackCredentialsSchema,
    config:      SlackConfigSchema,
  }),
  z.object({
    type:        z.literal(ChannelKind.webhook),
    name:        z.string().min(1).max(128),
    credentials: WebhookCredentialsSchema,
    config:      WebhookConfigSchema,
  }),
  z.object({
    type:        z.literal(ChannelKind.webchat),
    name:        z.string().min(1).max(128),
    credentials: WebchatCredentialsSchema,
    config:      WebchatConfigSchema,
  }),
])

export type CreateChannelConfigDto = z.infer<typeof CreateChannelConfigSchema>
