import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { encryptSecrets, decryptSecrets, rotateEncryption } from '../channel-secrets.js'

const validKey = () => Buffer.from(randomBytes(32)).toString('base64')

describe('encryptSecrets / decryptSecrets', () => {
  let testKey: string

  beforeAll(() => {
    testKey = validKey()
    process.env.CHANNEL_SECRET = testKey
  })

  afterAll(() => {
    delete process.env.CHANNEL_SECRET
  })

  it('encryptSecrets({}) returns a non-empty base64 string', () => {
    const result = encryptSecrets({})
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    // valid base64
    expect(() => Buffer.from(result, 'base64')).not.toThrow()
  })

  it('round-trip: decryptSecrets(encryptSecrets(obj)) deep-equals obj', () => {
    const obj = { botToken: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij', webhookSecret: 'abc123xyz' }
    const encrypted = encryptSecrets(obj)
    const decrypted = decryptSecrets(encrypted)
    expect(decrypted).toEqual(obj)
  })

  it('two calls to encryptSecrets with same obj produce different ciphertexts (random IV)', () => {
    const obj = { botToken: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij' }
    const a = encryptSecrets(obj)
    const b = encryptSecrets(obj)
    expect(a).not.toBe(b)
  })

  it('decryptSecrets with tampered ciphertext throws with [crypto] Failed to decrypt', () => {
    const encrypted = encryptSecrets({ key: 'value' })
    const buf = Buffer.from(encrypted, 'base64')
    // Flip last byte
    buf[buf.length - 1] ^= 0x01
    const tampered = buf.toString('base64')
    expect(() => decryptSecrets(tampered)).toThrow('[crypto] Failed to decrypt secrets')
  })

  it('decryptSecrets with too-short base64 string throws "too short"', () => {
    // 12 IV + 16 tag = 28 bytes minimum with 1 byte payload = 29. Give only 10.
    const short = Buffer.alloc(10).toString('base64')
    expect(() => decryptSecrets(short)).toThrow('too short')
  })

  it('throws when CHANNEL_SECRET is not set', () => {
    const orig = process.env.CHANNEL_SECRET
    delete process.env.CHANNEL_SECRET
    try {
      expect(() => encryptSecrets({ x: 1 })).toThrow('CHANNEL_SECRET env var is not set')
    } finally {
      process.env.CHANNEL_SECRET = orig
    }
  })

  it('throws when CHANNEL_SECRET decodes to wrong byte length', () => {
    const orig = process.env.CHANNEL_SECRET
    // 31 bytes → base64
    process.env.CHANNEL_SECRET = Buffer.from(randomBytes(31)).toString('base64')
    try {
      expect(() => encryptSecrets({ x: 1 })).toThrow('must decode to exactly 32 bytes')
    } finally {
      process.env.CHANNEL_SECRET = orig
    }
  })

  it('rotateEncryption: encrypt with key A, rotate to key B, decrypt with key B gives original', () => {
    const keyA = validKey()
    const keyB = validKey()
    const origEnv = process.env.CHANNEL_SECRET
    process.env.CHANNEL_SECRET = keyA
    const original = { botToken: '111111111:AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIa' }
    const encryptedWithA = encryptSecrets(original)
    const rotated = rotateEncryption(encryptedWithA, keyA, keyB)
    process.env.CHANNEL_SECRET = keyB
    const decrypted = decryptSecrets(rotated)
    expect(decrypted).toEqual(original)
    process.env.CHANNEL_SECRET = origEnv
  })
})
