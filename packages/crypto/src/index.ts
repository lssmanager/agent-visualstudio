// packages/crypto/src/index.ts
// @agent-vs/crypto — public API

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
