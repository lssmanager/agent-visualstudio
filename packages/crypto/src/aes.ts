/**
 * aes.ts — [F3b-05] AES-256-GCM encrypt/decrypt para ChannelConfig.secretsEncrypted
 *
 * Formato del ciphertext almacenado (todo base64url, separado por '.'):
 *   <iv_base64url>.<authTag_base64url>.<ciphertext_base64url>
 *
 * IV:       12 bytes aleatorios (96 bits — recomendado para GCM)
 * AuthTag:  16 bytes (128 bits — máximo, más seguro)
 * Clave:    32 bytes desde SECRETS_ENCRYPTION_KEY (hex 64 chars)
 *
 * Por qué base64url en lugar de hex:
 *   - Más compacto (33% menos chars que hex)
 *   - Seguro para almacenar en columnas TEXT de Postgres sin escaping
 *
 * Nota: coexiste con channel-secrets.ts que usa CHANNEL_SECRET (base64/hex)
 * y formato binario concatenado. Son APIs distintas para contextos distintos.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm' as const
const IV_BYTES  = 12  // 96 bits — recomendado GCM
const TAG_BYTES = 16  // 128 bits

// ── Clave maestra ─────────────────────────────────────────────────────────────

function getMasterKey(): Buffer {
  const hex = process.env['SECRETS_ENCRYPTION_KEY']
  if (!hex) {
    throw new Error(
      '[crypto] SECRETS_ENCRYPTION_KEY is not set. ' +
      'Generate one with: openssl rand -hex 32',
    )
  }
  if (hex.length !== 64) {
    throw new Error(
      `[crypto] SECRETS_ENCRYPTION_KEY must be 64 hex chars (32 bytes), ` +
      `got ${hex.length} chars.`,
    )
  }
  return Buffer.from(hex, 'hex')
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Cifra un texto plano (JSON de credenciales) y devuelve el string
 * listo para almacenar en ChannelConfig.secretsEncrypted.
 *
 * @param plaintext  Texto plano — normalmente JSON.stringify({ token: '...', ... })
 * @returns          "<iv>.<tag>.<ciphertext>" en base64url
 */
export function encrypt(plaintext: string): string {
  const key    = getMasterKey()
  const iv     = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

/**
 * Descifra un valor almacenado en ChannelConfig.secretsEncrypted.
 *
 * @param stored  Valor tal como está en BD: "<iv>.<tag>.<ciphertext>"
 * @returns       Texto plano original
 * @throws        Si el formato es incorrecto o el tag de autenticación falla
 */
export function decrypt(stored: string): string {
  const key   = getMasterKey()
  const parts = stored.split('.')

  if (parts.length !== 3) {
    throw new Error(
      `[crypto] Invalid encrypted format. Expected "<iv>.<tag>.<ciphertext>", ` +
      `got ${parts.length} parts.`,
    )
  }

  const [ivB64, tagB64, ciphertextB64] = parts as [string, string, string]
  const iv         = Buffer.from(ivB64,        'base64url')
  const tag        = Buffer.from(tagB64,        'base64url')
  const ciphertext = Buffer.from(ciphertextB64, 'base64url')

  if (iv.length !== IV_BYTES) {
    throw new Error(
      `[crypto] Invalid IV length: expected ${IV_BYTES}, got ${iv.length}`,
    )
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(
      `[crypto] Invalid tag length: expected ${TAG_BYTES}, got ${tag.length}`,
    )
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    return decrypted.toString('utf8')
  } catch {
    // Node lanza 'Unsupported state or unable to authenticate data'
    // al fallar la verificación del authTag — convertir en error legible.
    throw new Error(
      '[crypto] Decryption failed: authentication tag mismatch. ' +
      'Key may be wrong or data tampered.',
    )
  }
}

/**
 * Helper: cifra un objeto JS directamente.
 * Equivale a encrypt(JSON.stringify(obj)).
 */
export function encryptObject<T extends object>(obj: T): string {
  return encrypt(JSON.stringify(obj))
}

/**
 * Helper: descifra y parsea a objeto JS.
 * Equivale a JSON.parse(decrypt(stored)).
 */
export function decryptObject<T extends object>(stored: string): T {
  return JSON.parse(decrypt(stored)) as T
}
