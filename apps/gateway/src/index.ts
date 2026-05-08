/**
 * apps/gateway/src/index.ts
 * SDK interno del Gateway. El alias @agent-vs/gateway-sdk mapea aqui.
 */

export { SessionManager } from './session/index'
export type {
  GatewaySessionDto,
  SessionTurn,
  IncomingMessage,
  OutboundMessage,
} from './session/index'

export { TelegramAdapter }          from './channels/telegram.adapter'
export { WebChatAdapter }           from './channels/webchat.adapter'
export type { IChannelAdapter }     from './channels/channel-adapter.interface'
export { registry }                 from './channels/registry'
