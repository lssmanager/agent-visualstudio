// packages/crypto/src/index.ts
// @agent-vs/crypto — public API

export {
  encryptSecrets,
  decryptSecrets,
  encryptSecret,
  decryptSecret,
} from './channel-secrets.js'

export type {
  TelegramCredentials,
  WhatsAppBaileysCredentials,
  WhatsAppCloudCredentials,
  DiscordCredentials,
  TeamsCredentials,
  SlackCredentials,
  WebhookCredentials,
  WebchatCredentials,
  CredentialsByType,
} from './credentials-schema.js'

// [F3b-05] API AES-256-GCM con SECRETS_ENCRYPTION_KEY (hex 64 chars).
// Formato: <iv_b64url>.<tag_b64url>.<ct_b64url> — distinto del formato binario de channel-secrets.
export { encrypt, decrypt, encryptObject, decryptObject } from './aes.js'
