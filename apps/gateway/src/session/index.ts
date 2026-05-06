/**
 * session/index.ts — barrel del módulo session
 */

export { SessionManager }      from './session-manager.service'
export type {
  GatewaySessionDto,
  SessionTurn,
  IncomingMessage,
  OutboundMessage,
} from './types'
