/**
 * Schemas Zod para las credenciales por canal.
 *
 * Separación de conceptos:
 *   credentials (secretsEncrypted) → tokens, secrets, API keys
 *   config (Json, plaintext)       → parseMode, allowedOrigins, maxMessageLength, etc.
 *
 * NUNCA mezclar — si un campo es un secreto, va en credentials.
 * Si es configuración pública/no sensible, va en config.
 */

import { z } from 'zod'
// Fix 3: usar ChannelKind (nombre canónico del schema v10)
// ChannelType sigue existiendo como enum alias en el schema (backward compat)
import { ChannelKind } from '@prisma/client'

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
  /** Token de acceso de larga duración (permanent token) */
  accessToken:        z.string().min(10),
  /** Phone Number ID de la cuenta de negocio */
  phoneNumberId:      z.string().min(5),
  /** WhatsApp Business Account ID */
  wabaId:             z.string().min(5),
  /** Verify token para la verificación del webhook */
  webhookVerifyToken: z.string().min(8).max(128),
  /** App Secret para verificar firma HMAC-SHA256 */
  appSecret:          z.string().min(10).optional(),
})
export type WhatsAppCredentials = z.infer<typeof WhatsAppCredentialsSchema>

/** Discord Bot */
export const DiscordCredentialsSchema = z.object({
  botToken:      z.string().min(50, 'Discord bot token too short'),
  /** Public key para verificar interacciones (slash commands) */
  publicKey:     z.string().length(64, 'Public key must be 64 hex chars'),
  applicationId: z.string().min(10),
  /** Guild ID — opcional si el bot opera en múltiples guilds */
  guildId:       z.string().min(10).optional(),
  /** Client Secret — requerido para OAuth2 flows */
  clientSecret:  z.string().min(20).optional(),
})
export type DiscordCredentials = z.infer<typeof DiscordCredentialsSchema>

/** Microsoft Teams (Azure Bot Service) */
export const TeamsCredentialsSchema = z.object({
  /** Microsoft App ID (guid) */
  appId:       z.string().uuid('appId must be a valid UUID'),
  /** Microsoft App Password */
  appPassword: z.string().min(8),
  /** Tenant ID — 'common' para multi-tenant, guid para single */
  tenantId:    z.string().min(4).default('common'),
  /** Service URL base (ej: https://smba.trafficmanager.net/apis/) */
  serviceUrl:  z.string().url().optional(),
})
export type TeamsCredentials = z.infer<typeof TeamsCredentialsSchema>

/** Slack */
export const SlackCredentialsSchema = z.object({
  botToken:      z.string().regex(/^xoxb-/, 'Must start with xoxb-'),
  signingSecret: z.string().min(20),
  appToken:      z.string().regex(/^xapp-/).optional(),
  /** Para Slack OAuth: Client ID/Secret */
  clientId:      z.string().optional(),
  clientSecret:  z.string().optional(),
})
export type SlackCredentials = z.infer<typeof SlackCredentialsSchema>

/**
 * Webhook genérico — acepta secret para validación HMAC opcional
 */
export const WebhookCredentialsSchema = z.object({
  /** Secret para verificar HMAC-SHA256 del payload entrante */
  signingSecret: z.string().min(8).optional(),
  /** Bearer token para autenticar requests salientes */
  outboundToken: z.string().min(8).optional(),
})
export type WebhookCredentials = z.infer<typeof WebhookCredentialsSchema>

/** Webchat — sin credenciales sensibles obligatorias */
export const WebchatCredentialsSchema = z.object({
  /** JWT secret para autenticar sesiones de webchat */
  jwtSecret:   z.string().min(16).optional(),
  /** API key para integrar en sitios externos */
  embedApiKey: z.string().min(16).optional(),
})
export type WebchatCredentials = z.infer<typeof WebchatCredentialsSchema>

// ── Discriminated union — mapeo ChannelKind → schema ─────────────────────

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

/**
 * Valida un objeto de credenciales según el ChannelKind.
 * Lanza ZodError si la validación falla.
 */
export function parseCredentials<T extends ChannelKind>(
  type:  T,
  input: unknown,
): CredentialsByType[T] {
  return CREDENTIALS_SCHEMA_BY_TYPE[type].parse(input) as CredentialsByType[T]
}

/**
 * Valida sin lanzar excepciones.
 * Retorna { success, data, error }.
 */
export function safeParseCredentials<T extends ChannelKind>(
  type:  T,
  input: unknown,
): z.SafeParseReturnType<CredentialsByType[T], CredentialsByType[T]> {
  return CREDENTIALS_SCHEMA_BY_TYPE[type].safeParse(input) as z.SafeParseReturnType<
    CredentialsByType[T],
    CredentialsByType[T]
  >
}
