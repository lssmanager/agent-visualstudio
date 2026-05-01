export type {
  MessageRole,
  MessageAttachment,
  IncomingMessage,
  OutboundMessage,
  IChannelAdapter,
} from './channel-adapter.js'

export {
  ChannelAdapterRegistry,
  registry,
} from './channel-adapter.js'

export type {
  SessionHistoryEntry,
  ActiveSession,
} from './session-manager.js'

export { SessionManager } from './session-manager.js'

// Gateway methods — exported here so consumers can import from '@agent-vs/gateway-sdk'
// instead of reaching into the internal methods.ts file directly.
export { gatewayMethods, buildRequest } from './methods.js'

export type { GatewayRequest } from './protocol.js'
