/**
 * credentials-schema.ts — Schemas Zod para credenciales por canal.
 *
 * Separación de conceptos:
 *   credentials (secretsEncrypted) → tokens, secrets, API keys
 *   config (Json, plaintext)       → parseMode, allowedOrigins, etc.
 *
 * FIX TS2305: Reemplazado import { ChannelKind } from '@prisma/client'
 * por import local de ./channel-kind — evita dependencia de prisma generate.
 */

import { z } from 'zod'
import { ChannelKind } from './channel-kind.js'

// ── Schemas de credenciales por canal ───────────────────────────────────

/** Telegram Bot API */
export const TelegramCredentialsSchema = z.object({
  botToken:      z.string().min(20, 'Bot token too short').regex(
    /^\d+:[A-Za-z0-9_-]{35,}$/,
    'Invalid Telegram bot token format (expected: <id>:<token>)'
  ),
  webhookSecret: z.string().min(8).max(256).optional(),
})
export type TelegramCredentials = z.infer<typeof TelegramCredentialsSchema>

/** WhatsApp Cloud API (Meta) */
export const WhatsAppCredentialsSchema = z.object({
  accessToken:        z.string().min(10),
  phoneNumberId:      z.string().min(5),
  wabaId:             z.string().min(5),
  webhookVerifyToken: z.string().min(8).max(128),
  appSecret:          z.string().min(10).optional(),
})
export type WhatsAppCredentials = z.infer<typeof WhatsAppCredentialsSchema>

/** Discord Bot */
export const DiscordCredentialsSchema = z.object({
  botToken:      z.string().min(50, 'Discord bot token too short'),
  publicKey:     z.string().length(64, 'Public key must be 64 hex chars'),
  applicationId: z.string().min(10),
  guildId:       z.string().min(10).optional(),
  clientSecret:  z.string().min(20).optional(),
})
export type DiscordCredentials = z.infer<typeof DiscordCredentialsSchema>

/** Microsoft Teams (Azure Bot Service) */
export const TeamsCredentialsSchema = z.object({
  appId:       z.string().uuid('appId must be a valid UUID'),
  appPassword: z.string().min(8),
  tenantId:    z.string().min(4).default('common'),
  serviceUrl:  z.string().url().optional(),
})
export type TeamsCredentials = z.infer<typeof TeamsCredentialsSchema>

/** Slack */
export const SlackCredentialsSchema = z.object({
  botToken:      z.string().regex(/^xoxb-/, 'Must start with xoxb-'),
  signingSecret: z.string().min(20),
  appToken:      z.string().regex(/^xapp-/).optional(),
  clientId:      z.string().optional(),
  clientSecret:  z.string().optional(),
})
export type SlackCredentials = z.infer<typeof SlackCredentialsSchema>

/** Webhook genérico */
export const WebhookCredentialsSchema = z.object({
  signingSecret: z.string().min(8).optional(),
  outboundToken: z.string().min(8).optional(),
})
export type WebhookCredentials = z.infer<typeof WebhookCredentialsSchema>

/** Webchat */
export const WebchatCredentialsSchema = z.object({
  jwtSecret:   z.string().min(16).optional(),
  embedApiKey: z.string().min(16).optional(),
})
export type WebchatCredentials = z.infer<typeof WebchatCredentialsSchema>

// ── Discriminated union ────────────────────────────────────────────────

export const CREDENTIALS_SCHEMA_BY_TYPE = {
  [ChannelKind.telegram]: TelegramCredentialsSchema,
  [ChannelKind.whatsapp]: WhatsAppCredentialsSchema,
  [ChannelKind.discord]:  DiscordCredentialsSchema,
  [ChannelKind.teams]:    TeamsCredentialsSchema,
  [ChannelKind.slack]:    SlackCredentialsSchema,
  [ChannelKind.webhook]:  WebhookCredentialsSchema,
  [ChannelKind.webchat]:  WebchatCredentialsSchema,
} as const satisfies Record<ChannelKind, z.ZodObject<z.ZodRawShape>>

export type CredentialsByType = {
  [K in ChannelKind]: z.infer<typeof CREDENTIALS_SCHEMA_BY_TYPE[K]>
}

export function parseCredentials<T extends ChannelKind>(
  type:  T,
  input: unknown,
): CredentialsByType[T] {
  return CREDENTIALS_SCHEMA_BY_TYPE[type].parse(input) as CredentialsByType[T]
}

export function safeParseCredentials<T extends ChannelKind>(
  type:  T,
  input: unknown,
): z.SafeParseReturnType<CredentialsByType[T], CredentialsByType[T]> {
  return CREDENTIALS_SCHEMA_BY_TYPE[type].safeParse(input) as z.SafeParseReturnType<
    CredentialsByType[T],
    CredentialsByType[T]
  >
}
