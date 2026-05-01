/**
 * AES-256-GCM encrypt/decrypt para credenciales de ChannelConfig.
 *
 * Formato del ciphertext (base64-encoded):
 *   [ IV (12 bytes) | CIPHERTEXT (variable) | AUTH_TAG (16 bytes) ]
 *
 * La clave maestra viene de process.env.CHANNEL_SECRET.
 * Debe ser exactamente 32 bytes (256 bits) en base64 o hex.
 *
 * Generar una nueva clave:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM  = 'aes-256-gcm' as const
const IV_LENGTH  = 12   // bytes — NIST recomendación para GCM
const TAG_LENGTH = 16   // bytes — máximo en GCM

// ── Clave maestra ───────────────────────────────────────────────────────

function getMasterKey(): Buffer {
  const raw = process.env.CHANNEL_SECRET
  if (!raw) {
    throw new Error(
      '[crypto] CHANNEL_SECRET env var is not set. ' +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    )
  }

  // Aceptar base64 (44 chars) o hex (64 chars)
  let buf: Buffer
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    buf = Buffer.from(raw, 'hex')
  } else {
    buf = Buffer.from(raw, 'base64')
  }

  if (buf.length !== 32) {
    throw new Error(
      `[crypto] CHANNEL_SECRET must decode to exactly 32 bytes. ` +
      `Got ${buf.length} bytes. ` +
      `Regenerate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    )
  }
  return buf
}

// ── API pública ─────────────────────────────────────────────────────────

/**
 * Cifra un objeto JSON de credenciales.
 * @param credentials - El objeto POJO de credenciales (ya validado con Zod)
 * @returns string base64 apto para almacenar en ChannelConfig.secretsEncrypted
 */
export function encryptSecrets(credentials: Record<string, unknown>): string {
  const key       = getMasterKey()
  const iv        = randomBytes(IV_LENGTH)
  const cipher    = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8')

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag   = cipher.getAuthTag()

  // Concatenar: iv || ciphertext || authTag → base64
  return Buffer.concat([iv, encrypted, authTag]).toString('base64')
}

/**
 * Descifra el campo secretsEncrypted de ChannelConfig.
 * @returns El objeto de credenciales original (sin tipar — usar parseCredentials() post-decrypt)
 * @throws Error si el ciphertext está corrupto, el tag no coincide, o la clave es incorrecta
 */
export function decryptSecrets(secretsEncrypted: string): Record<string, unknown> {
  const key  = getMasterKey()
  const buf  = Buffer.from(secretsEncrypted, 'base64')

  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('[crypto] Invalid ciphertext: too short')
  }

  const iv         = buf.subarray(0, IV_LENGTH)
  const authTag    = buf.subarray(buf.length - TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>
  } catch (err) {
    throw new Error(
      '[crypto] Failed to decrypt secrets. ' +
      'Possible causes: wrong CHANNEL_SECRET, corrupted data, or tampered ciphertext. ' +
      `Original: ${(err as Error).message}`
    )
  }
}

/**
 * Rota las credenciales: descifra con la clave actual y recifra.
 * Usado para rotación de clave: primero cambiar CHANNEL_SECRET_OLD → NEW,
 * luego llamar este método para reencriptar todos los registros.
 */
export function rotateEncryption(
  secretsEncrypted: string,
  oldKey:           string,
  newKey:           string,
): string {
  const origEnv = process.env.CHANNEL_SECRET
  process.env.CHANNEL_SECRET = oldKey
  let plainObj: Record<string, unknown>
  try {
    plainObj = decryptSecrets(secretsEncrypted)
  } finally {
    process.env.CHANNEL_SECRET = origEnv
  }
  process.env.CHANNEL_SECRET = newKey
  try {
    return encryptSecrets(plainObj)
  } finally {
    process.env.CHANNEL_SECRET = origEnv
  }
}
