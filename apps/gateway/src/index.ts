/**
 * apps/gateway/src/index.ts
 *
 * Re-exporta los símbolos que gateway.service.ts importa
 * desde '@agent-vs/gateway-sdk'.
 *
 * El alias @agent-vs/gateway-sdk está mapeado a este archivo
 * en apps/gateway/tsconfig.json.
 */

export { SessionManager } from './session/index'
export type {
  GatewaySessionDto,
  SessionTurn,
  IncomingMessage,
  OutboundMessage,
} from './session/index'
