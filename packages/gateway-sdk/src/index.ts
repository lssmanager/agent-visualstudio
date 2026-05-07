// packages/gateway-sdk/src/index.ts
// @lss/gateway-sdk — public API

export { SessionManager } from './session-manager'
export { TelegramAdapter } from './adapters/telegram'
export type { GatewaySession, SessionEvent } from './types'
export type { ChannelAdapter, AdapterConfig, ChannelAdapterFactory, ChannelMessage } from './types'
export type { IChannelAdapter } from './channel-adapter'
export { ChannelAdapterRegistry, registry } from './channel-adapter'
export { GatewayClient } from './client'
export type { GatewayClientOptions } from './client'
export * from './protocol'
export * from './methods'
export * from './events'
export * from './auth'
