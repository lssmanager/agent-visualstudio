// packages/crypto/src/index.ts
// @lss/crypto — public API

export {
  encryptSecrets,
  decryptSecrets,
} from './channel-secrets'

export {
  TelegramCredentialsSchema,
  WhatsAppCredentialsSchema,
  DiscordCredentialsSchema,
  TeamsCredentialsSchema,
  SlackCredentialsSchema,
  WebhookCredentialsSchema,
  WebchatCredentialsSchema,
  CREDENTIALS_SCHEMA_BY_TYPE,
  parseCredentials,
  safeParseCredentials,
} from './credentials-schema'

export type {
  TelegramCredentials,
  WhatsAppCredentials,
  DiscordCredentials,
  TeamsCredentials,
  SlackCredentials,
  WebhookCredentials,
  WebchatCredentials,
  CredentialsByType,
} from './credentials-schema'

export { encrypt, decrypt, encryptObject, decryptObject } from './aes'

// CreateChannelConfigSchema — source of truth en @lss/crypto
export { CreateChannelConfigSchema } from './create-channel-config.schema'
export type { CreateChannelConfigDto } from './create-channel-config.schema'
