/**
 * session/index.ts — barrel del módulo session
 */

export { SessionManager }      from './session-manager.service.js'
export type {
  GatewaySessionDto,
  SessionTurn,
  IncomingMessage,
  OutboundMessage,
} from './types.js'
