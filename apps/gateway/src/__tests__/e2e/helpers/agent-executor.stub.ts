/**
 * [F3a-10] agent-executor.stub.ts
 *
 * Stubs de IAgentExecutor para diferentes escenarios de test.
 * Ninguno realiza llamadas reales a LLM.
 */

import { vi } from 'vitest'

export const AGENT_REPLY    = 'Hello from the test agent!'
export const TIMEOUT_REPLY  = '[Agent timeout — please try again]'
export const FALLBACK_REPLY = TIMEOUT_REPLY  // alias semántico

/** Contrato mínimo que el gateway espera del executor */
export interface IAgentExecutorLike {
  run(agentId: string, history: Array<{ role: string; content: string }>): Promise<{ reply: string }>
}

/**
 * Stub principal: resuelve inmediatamente con AGENT_REPLY.
 * Se puede inspeccionar con .run.mock.calls entre tests.
 */
export const agentExecutorStub: IAgentExecutorLike & {
  run: ReturnType<typeof vi.fn>
} = {
  run: vi.fn((_agentId: string, _history: Array<{ role: string; content: string }>) =>
    Promise.resolve({ reply: AGENT_REPLY })
  ),
}

/**
 * Stub de timeout: nunca resuelve.
 * Úsalo con timeoutMs: 100 en startTestApp para que el test sea rápido.
 */
export const agentExecutorTimeoutStub: IAgentExecutorLike = {
  run: (_agentId, _history) => new Promise<{ reply: string }>(() => { /* never */ }),
}

/**
 * Stub transitorio: falla en el primer intento (ECONNRESET) y
 * resuelve en el segundo.
 * resetTransientStub() debe llamarse en beforeEach.
 */
let _transientCallCount = 0
export const agentExecutorTransientStub: IAgentExecutorLike = {
  run: (_agentId, _history) => {
    _transientCallCount++
    if (_transientCallCount === 1) {
      return Promise.reject(new Error('ECONNRESET'))
    }
    return Promise.resolve({ reply: 'Recovered reply' })
  },
}
export function resetTransientStub(): void {
  _transientCallCount = 0
}
