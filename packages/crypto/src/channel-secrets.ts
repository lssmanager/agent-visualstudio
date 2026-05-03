/**
 * AES-256-GCM encrypt/decrypt para credenciales de ChannelConfig.
 *
 * Formato del ciphertext (base64-encoded):
 *   [ IV (12 bytes) | CIPHERTEXT (variable) | AUTH_TAG (16 bytes) ]
 *
 * La clave maestra viene de process.env.SECRETS_ENCRYPTION_KEY (canónico).
 * Fallback legacy: process.env.CHANNEL_SECRET (deprecated — renombrar).
 * Debe ser exactamente 32 bytes (256 bits) en base64 o hex.
 *
 * Generar una nueva clave:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM  = 'aes-256-gcm' as const
const IV_LENGTH  = 12
const TAG_LENGTH = 16

function parseKey(raw: string): Buffer {
  let buf: Buffer
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    buf = Buffer.from(raw, 'hex')
  } else {
    buf = Buffer.from(raw, 'base64')
  }

  if (buf.length !== 32) {
    throw new Error(
      `[crypto] SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes. Got ${buf.length} bytes. ` +
      `Regenerate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    )
  }

  return buf
}

function getMasterKey(): Buffer {
  let raw = process.env.SECRETS_ENCRYPTION_KEY

  if (!raw && process.env.CHANNEL_SECRET) {
    console.warn(
      '[crypto] CHANNEL_SECRET is deprecated. ' +
      'Rename to SECRETS_ENCRYPTION_KEY in your environment. ' +
      'CHANNEL_SECRET will stop working in a future release.'
    )
    raw = process.env.CHANNEL_SECRET
  }

  if (!raw) {
    throw new Error(
      '[crypto] SECRETS_ENCRYPTION_KEY env var is not set. ' +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"" +
      '\n(Legacy name CHANNEL_SECRET is also accepted but deprecated.)'
    )
  }

  return parseKey(raw)
}

function encryptWithKey(credentials: Record<string, unknown>, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8')

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([iv, encrypted, authTag]).toString('base64')
}

function decryptWithKey(secretsEncrypted: string, key: Buffer): Record<string, unknown> {
  const buf = Buffer.from(secretsEncrypted, 'base64')

  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('[crypto] Invalid ciphertext: too short')
  }

  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(buf.length - TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>
  } catch (err) {
    throw new Error(
      '[crypto] Failed to decrypt secrets. ' +
      'Possible causes: wrong key, corrupted data, or tampered ciphertext. ' +
      `Original: ${(err as Error).message}`
    )
  }
}

/**
 * Cifra un objeto JSON de credenciales.
 * @param credentials - El objeto POJO de credenciales (ya validado con Zod)
 * @returns string base64 apto para almacenar en ChannelConfig.secretsEncrypted
 */
export function encryptSecrets(credentials: Record<string, unknown>): string {
  return encryptWithKey(credentials, getMasterKey())
}

/**
 * Descifra el campo secretsEncrypted de ChannelConfig.
 * @returns El objeto de credenciales original (sin tipar â€” usar parseCredentials() post-decrypt)
 * @throws Error si el ciphertext está corrupto, el tag no coincide, o la clave es incorrecta
 */
export function decryptSecrets(secretsEncrypted: string): Record<string, unknown> {
  try {
    return decryptWithKey(secretsEncrypted, getMasterKey())
  } catch (err) {
    throw new Error(
      '[crypto] Failed to decrypt secrets. ' +
      'Possible causes: wrong SECRETS_ENCRYPTION_KEY, corrupted data, or tampered ciphertext. ' +
      `Original: ${(err as Error).message}`
    )
  }
}

/**
 * Rota las credenciales: descifra con oldKey y recifra con newKey.
 * NO muta process.env. Es segura para llamadas concurrentes.
 */
export function rotateEncryption(
  secretsEncrypted: string,
  oldKey:           string,
  newKey:           string,
): string {
  const plainObj = decryptWithKey(secretsEncrypted, parseKey(oldKey))
  return encryptWithKey(plainObj, parseKey(newKey))
}
