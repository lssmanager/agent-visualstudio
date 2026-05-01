/**
 * whatsapp-backoff.test.ts — [F3a-23]
 *
 * Tests unitarios para ExponentialBackoff.
 * Usa fake timers de Vitest para evitar esperas reales.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ExponentialBackoff } from '../whatsapp-backoff.js'

describe('ExponentialBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── peekDelay ────────────────────────────────────────────────────────────

  it('peekDelay() returns value in range [0, capMs]', () => {
    const backoff = new ExponentialBackoff({ baseMs: 1_000, capMs: 4_000 })
    for (let i = 0; i < 20; i++) {
      const d = backoff.peekDelay()
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(4_000)
    }
  })

  it('peekDelay() does not advance currentAttempt', () => {
    const backoff = new ExponentialBackoff({ baseMs: 100, capMs: 1_000 })
    backoff.peekDelay()
    backoff.peekDelay()
    expect(backoff.currentAttempt).toBe(0)
  })

  // ── next ─────────────────────────────────────────────────────────────────

  it('next() increments currentAttempt by 1', async () => {
    const backoff = new ExponentialBackoff({ baseMs: 10, capMs: 100 })
    const p = backoff.next()
    vi.runAllTimers()
    await p
    expect(backoff.currentAttempt).toBe(1)
  })

  it('next() after maxRetries throws backoff_exhausted', () => {
    const backoff = new ExponentialBackoff({ baseMs: 10, capMs: 100, maxRetries: 1 })
    // consumir el único intento disponible de forma síncrona
    backoff['attempt'] = 1 // forzar estado exhausted
    expect(() => backoff.next()).toThrowError('backoff_exhausted')
  })

  it('exhausted is true after maxRetries calls to next()', async () => {
    const backoff = new ExponentialBackoff({ baseMs: 1, capMs: 10, maxRetries: 2 })

    const p1 = backoff.next()
    vi.runAllTimers()
    await p1

    const p2 = backoff.next()
    vi.runAllTimers()
    await p2

    expect(backoff.exhausted).toBe(true)
    expect(() => backoff.next()).toThrowError('backoff_exhausted')
  })

  // ── abort ────────────────────────────────────────────────────────────────

  it('abort() during wait rejects with backoff_aborted', async () => {
    const backoff = new ExponentialBackoff({ baseMs: 10_000, capMs: 60_000 })
    const p = backoff.next()
    backoff.abort()
    vi.runAllTimers()
    await expect(p).rejects.toThrowError('backoff_aborted')
  })

  it('abort() clears the timer (no memory leak)', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const backoff = new ExponentialBackoff({ baseMs: 10_000, capMs: 60_000 })
    backoff.next() // starts timer
    backoff.abort()
    expect(clearSpy).toHaveBeenCalled()
    expect(backoff.isAborted).toBe(true)
  })

  it('next() after abort() throws backoff_aborted immediately', () => {
    const backoff = new ExponentialBackoff()
    backoff.abort()
    expect(() => backoff.next()).toThrowError('backoff_aborted')
  })

  // ── reset ────────────────────────────────────────────────────────────────

  it('reset() sets currentAttempt to 0 and clears aborted flag', async () => {
    const backoff = new ExponentialBackoff({ baseMs: 1, capMs: 10, maxRetries: 3 })

    const p = backoff.next()
    vi.runAllTimers()
    await p
    expect(backoff.currentAttempt).toBe(1)

    backoff.reset()
    expect(backoff.currentAttempt).toBe(0)
    expect(backoff.exhausted).toBe(false)
    expect(backoff.isAborted).toBe(false)
  })

  it('reset() after abort() allows next() to work again', async () => {
    const backoff = new ExponentialBackoff({ baseMs: 1, capMs: 10 })
    backoff.abort()
    backoff.reset()
    const p = backoff.next()
    vi.runAllTimers()
    await expect(p).resolves.toBeUndefined()
  })
})
