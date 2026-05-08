/**
 * stubs/crypto.stub.ts
 * Stub de @lss/crypto hasta que el paquete exista.
 */
import { createDecipheriv, createCipheriv, randomBytes } from 'crypto'

export function decrypt(encryptedHex: string, keyHex: string): Record<string, unknown> {
  try {
    const key     = Buffer.from(keyHex, 'hex')
    const buf     = Buffer.from(encryptedHex, 'hex')
    const iv      = buf.subarray(0, 12)
    const authTag = buf.subarray(12, 28)
    const cipher  = buf.subarray(28)
    const dec     = createDecipheriv('aes-256-gcm', key, iv)
    dec.setAuthTag(authTag)
    const plain = Buffer.concat([dec.update(cipher), dec.final()])
    return JSON.parse(plain.toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function encrypt(data: Record<string, unknown>, keyHex: string): string {
  const key  = Buffer.from(keyHex, 'hex')
  const iv   = randomBytes(12)
  const enc  = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([enc.update(JSON.stringify(data), 'utf8'), enc.final()])
  return Buffer.concat([iv, enc.getAuthTag(), body]).toString('hex')
}
