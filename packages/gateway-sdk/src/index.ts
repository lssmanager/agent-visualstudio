/**
 * gateway-sdk/src/index.ts — public API
 */
export { SessionManager } from './session-manager.js';
export type { SessionHistoryEntry, ActiveSession } from './session-manager.js';

export { TelegramAdapter } from './adapters/telegram.js';

export type { ChannelMessage, ChannelAdapter, ChannelAdapterFactory } from './types.js';
