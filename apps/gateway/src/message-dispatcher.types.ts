/**
 * message-dispatcher.types.ts — [F3a-07]
 *
 * Tipos públicos del MessageDispatcher:
 *   - IAgentExecutor: abstracción del AgentRunner para inyección/testing
 *   - DispatchInput: contexto completo de un mensaje entrante
 *   - DispatchResult: union type ok/failure — el caller NUNCA recibe un throw
 *   - MessageDispatcherOptions: timeout, reintentos, delay
 *   - DispatchSuccessEvent / DispatchErrorEvent: payloads de métricas
 */

import type { SessionTurn } from '@agent-vs/gateway-sdk'

// ── Abstracción del ejecutor de agente ────────────────────────────────────

/**
 * Interfaz mínima que MessageDispatcher necesita del AgentRunner.
 * AgentRunner de @agent-vs/flow-engine implementa esta interfaz.
 */
export interface IAgentExecutor {
  run(agentId: string, history: SessionTurn[]): Promise<{ reply: string }>
}

// ── Input del dispatch ────────────────────────────────────────────────────

export interface DispatchInput {
  agentId:         string
  history:         SessionTurn[]
  /** Para logging y métricas */
  sessionId:       string
  /** Para logging */
  channelConfigId: string
  /** Para logging */
  externalUserId:  string
}

// ── Resultado del dispatch ────────────────────────────────────────────────

export type DispatchResult =
  | DispatchSuccess
  | DispatchFailure

export interface DispatchSuccess {
  ok:         true
  reply:      string
  durationMs: number
  /** Número de intentos realizados (1 = éxito directo, 2 = éxito en reintento) */
  attempts:   number
}

export interface DispatchFailure {
  ok:           false
  /** Tipo de error para que el caller decida el mensaje al usuario */
  errorKind:    DispatchErrorKind
  /** Mensaje técnico para logs */
  errorMessage: string
  durationMs:   number
  attempts:     number
}

export type DispatchErrorKind =
  | 'timeout'      // AgentRunner tardó más de timeoutMs
  | 'agent_error'  // AgentRunner lanzó un error de negocio (no reintentable)
  | 'transient'    // Error de red/LLM reintentado sin éxito
  | 'unknown'      // Error no clasificado

// ── Opciones del dispatcher ───────────────────────────────────────────────

export interface MessageDispatcherOptions {
  /**
   * Tiempo máximo de espera por intento en ms.
   * @default 30_000
   */
  timeoutMs?: number
  /**
   * Número máximo de intentos (1 = sin reintento).
   * @default 2
   */
  maxAttempts?: number
  /**
   * Delay entre intentos en ms.
   * @default 1_000
   */
  retryDelayMs?: number
}

// ── Eventos de métricas ───────────────────────────────────────────────────

export interface DispatchSuccessEvent {
  sessionId:       string
  agentId:         string
  channelConfigId: string
  durationMs:      number
  attempts:        number
}

export interface DispatchErrorEvent {
  sessionId:       string
  agentId:         string
  channelConfigId: string
  errorKind:       DispatchErrorKind
  errorMessage:    string
  durationMs:      number
  attempts:        number
}
