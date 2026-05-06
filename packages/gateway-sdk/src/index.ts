/**
 * gateway-sdk/src/index.ts — public API
 *
 * Fix B: Added gatewayMethods to exports so gateway.service.ts can import
 * it from the package root instead of a deep src path.
 */
export { SessionManager } from './session-manager.js';
export type { SessionHistoryEntry, ActiveSession } from './session-manager.js';

export { TelegramAdapter } from './adapters/telegram.js';

export type { ChannelMessage, ChannelAdapter, ChannelAdapterFactory } from './types.js';
export { gatewayMethods } from './types.js';
export type { GatewayMethod, GatewayRpcEnvelope, GatewayHealthPayload } from './types.js';
