/**
 * message-dispatcher.test.ts — [F3a-07]
 *
 * Tests unitarios del MessageDispatcher con vitest.
 * Usa un mock de IAgentExecutor — sin BD, sin FlowEngine.
 * 16 casos cubriendo success, retry, timeout, agent_error, events.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageDispatcher, TimeoutError }       from '../message-dispatcher.service'
import type {
  IAgentExecutor,
  DispatchInput,
  DispatchSuccessEvent,
  DispatchErrorEvent,
} from '../message-dispatcher.types'

// ── Helpers ───────────────────────────────────────────────────────────────

function makeExecutor(impl: IAgentExecutor['run']): IAgentExecutor {
  return { run: impl }
}

const BASE_INPUT: DispatchInput = {
  agentId:         'agent-001',
  history:         [{ role: 'user', content: 'Hola' }] as any,
  sessionId:       'sess-abc',
  channelConfigId: 'cfg-xyz',
  externalUserId:  'user-123',
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('MessageDispatcher', () => {

  // ── Éxito en el primer intento ──────────────────────────────────────────

  it('retorna DispatchSuccess con reply correcto en el primer intento', async () => {
    const executor = makeExecutor(async () => ({ reply: 'Hola humano' }))
    const dispatcher = new MessageDispatcher(executor)
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.reply).toBe('Hola humano')
      expect(result.attempts).toBe(1)
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('reemplaza reply vacío por "(sin respuesta)"', async () => {
    const executor = makeExecutor(async () => ({ reply: '' }))
    const dispatcher = new MessageDispatcher(executor)
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reply).toBe('(sin respuesta)')
  })

  it('reemplaza reply con solo espacios por "(sin respuesta)"', async () => {
    const executor = makeExecutor(async () => ({ reply: '   ' }))
    const dispatcher = new MessageDispatcher(executor)
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reply).toBe('(sin respuesta)')
  })

  // ── Reintento en error transitorio ──────────────────────────────────────

  it('reintenta en error transitorio y retorna éxito en el segundo intento', async () => {
    let calls = 0
    const executor = makeExecutor(async () => {
      calls++
      if (calls === 1) throw new Error('network error')
      return { reply: 'Recuperado' }
    })
    const dispatcher = new MessageDispatcher(executor, { retryDelayMs: 0 })
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.attempts).toBe(2)
      expect(result.reply).toBe('Recuperado')
    }
  })

  it('retorna DispatchFailure con kind=transient si todos los intentos fallan por red', async () => {
    const executor = makeExecutor(async () => { throw new Error('econnreset') })
    const dispatcher = new MessageDispatcher(executor, { retryDelayMs: 0 })
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errorKind).toBe('transient')
      expect(result.attempts).toBe(2)
    }
  })

  // ── Timeout ─────────────────────────────────────────────────────────────

  it('retorna DispatchFailure con kind=timeout cuando el agente excede timeoutMs', async () => {
    vi.useFakeTimers()

    const executor = makeExecutor(() => new Promise(() => { /* never resolves */ }))
    const dispatcher = new MessageDispatcher(executor, {
      timeoutMs:    100,
      maxAttempts:  1,
      retryDelayMs: 0,
    })

    const dispatchPromise = dispatcher.dispatch(BASE_INPUT)
    vi.advanceTimersByTime(200)
    const result = await dispatchPromise

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errorKind).toBe('timeout')

    vi.useRealTimers()
  })

  it('NO reintenta en timeout (timeout no es transitorio)', async () => {
    vi.useFakeTimers()

    let calls = 0
    const executor = makeExecutor(() => {
      calls++
      return new Promise(() => { /* never */ })
    })
    const dispatcher = new MessageDispatcher(executor, {
      timeoutMs:    100,
      maxAttempts:  2,
      retryDelayMs: 0,
    })

    const dispatchPromise = dispatcher.dispatch(BASE_INPUT)
    vi.advanceTimersByTime(500)
    await dispatchPromise

    // timeout NO es reintentable — solo 1 intento
    expect(calls).toBe(1)

    vi.useRealTimers()
  })

  // ── Error de agente (no reintentable) ────────────────────────────────────

  it('retorna kind=agent_error para errores 4xx y NO reintenta', async () => {
    let calls = 0
    const executor = makeExecutor(async () => {
      calls++
      throw new Error('agent not found')
    })
    const dispatcher = new MessageDispatcher(executor, { retryDelayMs: 0 })
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errorKind).toBe('agent_error')
    expect(calls).toBe(1) // sin reintento
  })

  it('retorna kind=agent_error para error con "invalid agent"', async () => {
    const executor = makeExecutor(async () => { throw new Error('Invalid agent configuration') })
    const dispatcher = new MessageDispatcher(executor, { retryDelayMs: 0 })
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errorKind).toBe('agent_error')
  })

  // ── maxAttempts = 1 (sin reintento) ──────────────────────────────────────

  it('con maxAttempts=1 no reintenta aunque el error sea transitorio', async () => {
    let calls = 0
    const executor = makeExecutor(async () => {
      calls++
      throw new Error('network error')
    })
    const dispatcher = new MessageDispatcher(executor, { maxAttempts: 1, retryDelayMs: 0 })
    await dispatcher.dispatch(BASE_INPUT)

    expect(calls).toBe(1)
  })

  // ── Eventos de métricas ──────────────────────────────────────────────────

  it('emite dispatch:success con el payload correcto en éxito', async () => {
    const executor = makeExecutor(async () => ({ reply: 'OK' }))
    const dispatcher = new MessageDispatcher(executor)

    const events: DispatchSuccessEvent[] = []
    dispatcher.on('dispatch:success', (e) => events.push(e))

    await dispatcher.dispatch(BASE_INPUT)

    expect(events).toHaveLength(1)
    expect(events[0]!.sessionId).toBe(BASE_INPUT.sessionId)
    expect(events[0]!.agentId).toBe(BASE_INPUT.agentId)
    expect(events[0]!.channelConfigId).toBe(BASE_INPUT.channelConfigId)
    expect(events[0]!.attempts).toBe(1)
  })

  it('emite dispatch:error con errorKind correcto en fallo', async () => {
    const executor = makeExecutor(async () => { throw new Error('econnrefused') })
    const dispatcher = new MessageDispatcher(executor, { retryDelayMs: 0 })

    const errorEvents: DispatchErrorEvent[] = []
    dispatcher.on('dispatch:error', (e) => errorEvents.push(e))

    await dispatcher.dispatch(BASE_INPUT)

    expect(errorEvents).toHaveLength(1)
    expect(errorEvents[0]!.errorKind).toBe('transient')
    expect(errorEvents[0]!.sessionId).toBe(BASE_INPUT.sessionId)
  })

  it('emite dispatch:success una sola vez incluso en reintento exitoso', async () => {
    let calls = 0
    const executor = makeExecutor(async () => {
      if (++calls === 1) throw new Error('503 overloaded')
      return { reply: 'OK en intento 2' }
    })
    const dispatcher = new MessageDispatcher(executor, { retryDelayMs: 0 })

    const successEvents: DispatchSuccessEvent[] = []
    const errorEvents:   DispatchErrorEvent[]   = []
    dispatcher.on('dispatch:success', (e) => successEvents.push(e))
    dispatcher.on('dispatch:error',   (e) => errorEvents.push(e))

    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(true)
    expect(successEvents).toHaveLength(1)   // un solo evento de éxito
    expect(errorEvents).toHaveLength(0)     // sin evento de error
    if (result.ok) expect(result.attempts).toBe(2)
  })

  // ── Campos de resultado ──────────────────────────────────────────────────

  it('durationMs es siempre un número >= 0', async () => {
    const executor = makeExecutor(async () => ({ reply: 'fast' }))
    const dispatcher = new MessageDispatcher(executor)
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof result.durationMs).toBe('number')
  })

  it('DispatchFailure incluye errorMessage como string no vacío', async () => {
    const executor = makeExecutor(async () => { throw new Error('some error msg') })
    const dispatcher = new MessageDispatcher(executor, { maxAttempts: 1, retryDelayMs: 0 })
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.errorMessage).toBe('string')
      expect(result.errorMessage.length).toBeGreaterThan(0)
    }
  })

  it('clasifica error desconocido (no Error instance) como unknown', async () => {
    const executor = makeExecutor(async () => { throw 'string error' })
    const dispatcher = new MessageDispatcher(executor, { maxAttempts: 1, retryDelayMs: 0 })
    const result = await dispatcher.dispatch(BASE_INPUT)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errorKind).toBe('unknown')
  })

})
