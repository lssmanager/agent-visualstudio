/**
 * message-dispatcher.service.ts — [F3a-07]
 *
 * Encapsula la llamada al AgentExecutor (AgentRunner) con:
 *   - Timeout por intento (default 30s)
 *   - Reintento automático en errores transitorios (max 2 intentos)
 *   - EventEmitter para métricas observables
 *   - DispatchResult tipado — NUNCA lanza al caller
 *   - Logging estructurado con duración y número de intentos
 *
 * Clasificación de errores:
 *   - timeout:     AbortError o Promise.race ganó la señal de timeout
 *   - agent_error: el AgentRunner lanzó un error con status 4xx (no reintentable)
 *   - transient:   error de red, 5xx, o desconocido — se reintenta
 *   - unknown:     cualquier otro tipo de error no clasificado
 *
 * Uso:
 *   const dispatcher = new MessageDispatcher(agentRunner, { timeoutMs: 20_000 })
 *   const result = await dispatcher.dispatch(input)
 *   if (result.ok) { ... result.reply ... }
 *   else { ... result.errorKind ... }
 *
 * Métricas:
 *   dispatcher.on('dispatch:success', (e: DispatchSuccessEvent) => ...)
 *   dispatcher.on('dispatch:error',   (e: DispatchErrorEvent)   => ...)
 */

import { EventEmitter }                    from 'node:events'
import type {
  IAgentExecutor,
  DispatchInput,
  DispatchResult,
  DispatchErrorKind,
  MessageDispatcherOptions,
  DispatchSuccessEvent,
  DispatchErrorEvent,
} from './message-dispatcher.types.js'

// ── Constantes por defecto ────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS    = 30_000
const DEFAULT_MAX_ATTEMPTS  = 2
const DEFAULT_RETRY_DELAY   = 1_000

// ── Clase principal ───────────────────────────────────────────────────────

export class MessageDispatcher extends EventEmitter {
  private readonly executor:     IAgentExecutor
  private readonly timeoutMs:    number
  private readonly maxAttempts:  number
  private readonly retryDelayMs: number

  constructor(
    executor: IAgentExecutor,
    options:  MessageDispatcherOptions = {},
  ) {
    super()
    this.executor     = executor
    this.timeoutMs    = options.timeoutMs    ?? DEFAULT_TIMEOUT_MS
    this.maxAttempts  = options.maxAttempts  ?? DEFAULT_MAX_ATTEMPTS
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY
  }

  // ── Método principal ────────────────────────────────────────────────────

  /**
   * Despacha el historial de conversación al agente y retorna un DispatchResult.
   * NUNCA lanza — todos los errores quedan encapsulados en DispatchFailure.
   */
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const startMs = Date.now()
    let   attempt = 0
    let   lastErrorKind:    DispatchErrorKind = 'unknown'
    let   lastErrorMessage: string            = ''

    while (attempt < this.maxAttempts) {
      attempt++

      try {
        const reply = await this.runWithTimeout(input.agentId, input.history)
        const durationMs = Date.now() - startMs
        const replyText  = reply.trim().length > 0 ? reply : '(sin respuesta)'

        const successEvent: DispatchSuccessEvent = {
          sessionId:       input.sessionId,
          agentId:         input.agentId,
          channelConfigId: input.channelConfigId,
          durationMs,
          attempts:        attempt,
        }
        this.emit('dispatch:success', successEvent)

        console.log(
          `[MessageDispatcher] ok sessionId=${input.sessionId}` +
          ` agentId=${input.agentId} attempts=${attempt} durationMs=${durationMs}`,
        )

        return {
          ok:         true,
          reply:      replyText,
          durationMs,
          attempts:   attempt,
        }

      } catch (err: unknown) {
        const { kind, message } = classifyError(err)
        lastErrorKind    = kind
        lastErrorMessage = message

        const isRetryable = kind === 'transient' || kind === 'unknown'
        const hasRetry    = attempt < this.maxAttempts

        console.warn(
          `[MessageDispatcher] attempt=${attempt}/${this.maxAttempts}` +
          ` kind=${kind} retryable=${isRetryable && hasRetry}` +
          ` sessionId=${input.sessionId} error=${message}`,
        )

        if (!isRetryable || !hasRetry) break

        // Delay antes del reintento
        await sleep(this.retryDelayMs)
      }
    }

    // Todos los intentos fallaron
    const durationMs = Date.now() - startMs

    const errorEvent: DispatchErrorEvent = {
      sessionId:       input.sessionId,
      agentId:         input.agentId,
      channelConfigId: input.channelConfigId,
      errorKind:       lastErrorKind,
      errorMessage:    lastErrorMessage,
      durationMs,
      attempts:        attempt,
    }
    this.emit('dispatch:error', errorEvent)

    console.error(
      `[MessageDispatcher] failed sessionId=${input.sessionId}` +
      ` agentId=${input.agentId} kind=${lastErrorKind}` +
      ` attempts=${attempt} durationMs=${durationMs}`,
    )

    return {
      ok:           false,
      errorKind:    lastErrorKind,
      errorMessage: lastErrorMessage,
      durationMs,
      attempts:     attempt,
    }
  }

  // ── Ejecución con timeout ────────────────────────────────────────────────

  private async runWithTimeout(
    agentId: string,
    history: import('@agent-vs/gateway-sdk').SessionTurn[],
  ): Promise<string> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new TimeoutError(`AgentRunner exceeded ${this.timeoutMs}ms`))
      }, this.timeoutMs)
    })

    try {
      const result = await Promise.race([
        this.executor.run(agentId, history),
        timeoutPromise,
      ])
      return result.reply ?? ''
    } finally {
      clearTimeout(timeoutHandle)
    }
  }
}

// ── Errores internos ──────────────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

// ── Clasificación de errores ──────────────────────────────────────────────

function classifyError(err: unknown): { kind: DispatchErrorKind; message: string } {
  if (err instanceof TimeoutError) {
    return { kind: 'timeout', message: err.message }
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase()

    // Errores 4xx de negocio — no reintentables
    if (
      msg.includes('400') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('404') ||
      msg.includes('agent not found') ||
      msg.includes('invalid agent') ||
      msg.includes('not found')
    ) {
      return { kind: 'agent_error', message: err.message }
    }

    // Errores de red / LLM / 5xx — reintentables
    if (
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('fetch') ||
      msg.includes('timeout') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('500') ||
      msg.includes('rate limit') ||
      msg.includes('overloaded')
    ) {
      return { kind: 'transient', message: err.message }
    }

    return { kind: 'unknown', message: err.message }
  }

  return { kind: 'unknown', message: String(err) }
}

// ── Utilidades ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
