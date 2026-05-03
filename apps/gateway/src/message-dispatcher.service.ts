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
 *
 * FIX [F3b-04]: Rate limiting por canal + externalUserId (60 req/min).
 * El check se aplica ANTES de llamar al agente para que los webhooks de
 * Meta/Telegram siempre reciban HTTP 200 — nunca se lanza una excepción.
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
import { checkUserRateLimit }              from './middleware/user-rate-limiter.js'

// ── Constantes por defecto ─────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS    = 30_000
const DEFAULT_MAX_ATTEMPTS  = 2
const DEFAULT_RETRY_DELAY   = 1_000

// ── Clase principal ───────────────────────────────────────────────────

export class MessageDispatcher extends EventEmitter {
  private readonly executor:     IAgentExecutor
  private readonly timeoutMs:    number
  private readonly maxAttempts:  number
  private readonly retryDelayMs: number

  /** Logger inyectable — por defecto usa console para no depender de NestJS DI. */
  private readonly logger = {
    warn:  (msg: string) => console.warn(msg),
    error: (msg: string, err?: unknown) => console.error(msg, err),
  }

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

  // ── Método principal ─────────────────────────────────────────────────

  /**
   * Despacha el historial de conversación al agente y retorna un DispatchResult.
   * NUNCA lanza — todos los errores quedan encapsulados en DispatchFailure.
   *
   * [F3b-04] Rate limit: si el usuario supera 60 req/min en el canal,
   * se retorna DispatchFailure con errorKind 'rate_limited' sin llamar al agente.
   */
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    // ── [F3b-04] Rate limit check ───────────────────────────────────────
    const rateCheck = checkUserRateLimit(
      input.channelConfigId,
      input.externalUserId,
    )

    if (!rateCheck.allowed) {
      const resetIn = Math.ceil((rateCheck.resetAt - Date.now()) / 1000)
      this.logger.warn(
        `[rate-limit] User ${input.externalUserId} on channel ${input.channelConfigId} ` +
        `exceeded limit. Resets in ${resetIn}s. sessionId=${input.sessionId}`,
      )
      // No lanzar excepción — el webhook de Meta/Telegram espera 200 siempre.
      // sendRateLimitMessage() es best-effort: si falla, se loguea y se sigue.
      await this.sendRateLimitMessage(input, resetIn)
      return {
        ok:           false,
        errorKind:    'rate_limited' as DispatchErrorKind,
        errorMessage: `Rate limit exceeded. Resets in ${resetIn}s.`,
        durationMs:   0,
        attempts:     0,
      }
    }

    // ── Despacho normal ────────────────────────────────────────────────
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

  // ── Rate limit ─────────────────────────────────────────────────────

  /**
   * Intenta notificar al usuario que ha superado el rate limit.
   * Es best-effort: cualquier fallo se loguea y se absorbe para que el
   * webhook de Meta/Telegram siempre reciba HTTP 200.
   *
   * MessageDispatcher no tiene acceso a adapterRegistry (es una clase de
   * dominio pura). El adapter deberá inyectarse en F3b cuando el orquestador
   * superior lo proporcione. Por ahora solo se loguea.
   */
  private async sendRateLimitMessage(
    input:          DispatchInput,
    resetInSeconds: number,
  ): Promise<void> {
    try {
      // TODO(F3b-adapter): inject adapterRegistry and call adapter.send() here
      // once the orchestration layer wires it up. For now, the rate limit warning
      // is surfaced via logs only — the user won’t see an in-channel message yet.
      this.logger.warn(
        `[rate-limit] No adapter available to notify user ${input.externalUserId}` +
        ` — message dropped. Resets in ${resetInSeconds}s.`,
      )
    } catch (err) {
      // No relanzar — un fallo aquí no debe romper el flujo del webhook.
      this.logger.error('[rate-limit] Failed to send rate limit message', err)
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

// ── Errores internos ───────────────────────────────────────────────────

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

// ── Utilidades ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
