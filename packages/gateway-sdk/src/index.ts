/**
 * gateway-sdk/src/index.ts — public API
 *
 * Fix: Removed .js extensions from relative imports.
 * CommonJS + moduleResolution:node10 with ts-node --transpile-only does NOT
 * remap .js → .ts, so bare relative imports are required.
 */
export { SessionManager } from './session-manager';
export type { SessionHistoryEntry, ActiveSession } from './session-manager';

export { TelegramAdapter } from './adapters/telegram';

export type { ChannelMessage, ChannelAdapter, ChannelAdapterFactory } from './types';
export { gatewayMethods } from './types';
export type { GatewayMethod, GatewayRpcEnvelope, GatewayHealthPayload } from './types';
