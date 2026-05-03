/**
 * [F3b-05] aes.test.ts
 *
 * Tests unitarios del módulo AES-256-GCM con SECRETS_ENCRYPTION_KEY.
 * Sigue la convención __tests__/*.test.ts del paquete @agent-vs/crypto.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encrypt, decrypt, encryptObject, decryptObject } from '../aes.js'

const TEST_KEY = 'a'.repeat(64)  // 64 hex chars = 32 bytes válidos

beforeEach(() => {
  process.env['SECRETS_ENCRYPTION_KEY'] = TEST_KEY
})

afterEach(() => {
  delete process.env['SECRETS_ENCRYPTION_KEY']
})

describe('encrypt / decrypt', () => {
  it('roundtrip: decrypt(encrypt(x)) === x', () => {
    const plain = '{"token":"bot123:ABC","secret":"xyz"}'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it('dos llamadas a encrypt producen ciphertexts distintos (IV aleatorio)', () => {
    const a = encrypt('same text')
    const b = encrypt('same text')
    expect(a).not.toBe(b)
  })

  it('decrypt lanza si el ciphertext está corrupto', () => {
    const stored = encrypt('hello')
    const [iv, tag, ct] = stored.split('.') as [string, string, string]
    // Corromper último byte del ciphertext
    const badCt = ct.slice(0, -2) + 'AA'
    expect(() => decrypt(`${iv}.${tag}.${badCt}`)).toThrow('authentication tag mismatch')
  })

  it('decrypt lanza si el formato no tiene 3 partes', () => {
    expect(() => decrypt('solounbloque')).toThrow('Invalid encrypted format')
  })

  it('encrypt lanza si SECRETS_ENCRYPTION_KEY no está definida', () => {
    delete process.env['SECRETS_ENCRYPTION_KEY']
    expect(() => encrypt('test')).toThrow('SECRETS_ENCRYPTION_KEY is not set')
  })

  it('encrypt lanza si la clave tiene longitud incorrecta', () => {
    process.env['SECRETS_ENCRYPTION_KEY'] = 'tooshort'
    expect(() => encrypt('test')).toThrow('must be 64 hex chars')
  })
})

describe('encryptObject / decryptObject', () => {
  it('roundtrip con objeto JS', () => {
    const obj = { token: 'abc123', secret: 'xyz' }
    expect(decryptObject(encryptObject(obj))).toEqual(obj)
  })
})
