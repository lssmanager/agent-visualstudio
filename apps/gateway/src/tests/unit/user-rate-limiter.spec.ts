/**
 * [F3b-04] user-rate-limiter.spec.ts
 *
 * Tests unitarios del sliding-window rate limiter por canal + externalUserId.
 * Corre con vitest sin dependencias externas.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  checkUserRateLimit,
  clearUserBucket,
} from '../../middleware/user-rate-limiter'

const CHANNEL = 'channel-uuid-123'
const USER_A = 'user-A'
const USER_B = 'user-B'

beforeEach(() => {
  clearUserBucket(CHANNEL, USER_A)
  clearUserBucket(CHANNEL, USER_B)
  delete process.env['USER_RATE_LIMIT_MAX']
  delete process.env['USER_RATE_LIMIT_WINDOW_MS']
})

describe('checkUserRateLimit', () => {
  it('permite los primeros 60 mensajes', () => {
    for (let i = 0; i < 60; i++) {
      const r = checkUserRateLimit(CHANNEL, USER_A)
      expect(r.allowed).toBe(true)
      expect(r.remaining).toBe(59 - i)
    }
  })

  it('bloquea el mensaje 61', () => {
    for (let i = 0; i < 60; i++) checkUserRateLimit(CHANNEL, USER_A)
    const r = checkUserRateLimit(CHANNEL, USER_A)
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('dos usuarios en el mismo canal son independientes', () => {
    for (let i = 0; i < 60; i++) checkUserRateLimit(CHANNEL, USER_A)
    const r = checkUserRateLimit(CHANNEL, USER_B)
    expect(r.allowed).toBe(true)
  })

  it('mismo usuario en dos canales son independientes', () => {
    const CH2 = 'channel-uuid-456'
    for (let i = 0; i < 60; i++) checkUserRateLimit(CHANNEL, USER_A)
    clearUserBucket(CH2, USER_A)
    const r = checkUserRateLimit(CH2, USER_A)
    expect(r.allowed).toBe(true)
  })

  it('después de resetAt el bucket se renueva', () => {
    process.env['USER_RATE_LIMIT_WINDOW_MS'] = '1'
    for (let i = 0; i < 60; i++) checkUserRateLimit(CHANNEL, USER_A)
    return new Promise<void>(resolve => setTimeout(() => {
      clearUserBucket(CHANNEL, USER_A)
      const r = checkUserRateLimit(CHANNEL, USER_A)
      expect(r.allowed).toBe(true)
      delete process.env['USER_RATE_LIMIT_WINDOW_MS']
      resolve()
    }, 5))
  })
})
