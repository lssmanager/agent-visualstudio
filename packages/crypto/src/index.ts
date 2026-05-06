// packages/crypto/src/index.ts
// @agent-vs/crypto — public API

export {
  encryptSecrets,
  decryptSecrets,
  encryptSecret,
  decryptSecret,
} from './channel-secrets.js'

// Fix 9: exportar Zod schemas CON sufijo Schema (los DTOs los importan así)
// Los types (sin sufijo) también se exportan para backward compat.
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
} from './credentials-schema.js'

export type {
  TelegramCredentials,
  WhatsAppCredentials,
  DiscordCredentials,
  TeamsCredentials,
  SlackCredentials,
  WebhookCredentials,
  WebchatCredentials,
  CredentialsByType,
} from './credentials-schema.js'

// [F3b-05] API de bajo nivel AES-256-GCM con SECRETS_ENCRYPTION_KEY (hex 64 chars).
// Formato: <iv_b64url>.<tag_b64url>.<ct_b64url> — distinto del formato binario de channel-secrets.
export { encrypt, decrypt, encryptObject, decryptObject } from './aes.js'
