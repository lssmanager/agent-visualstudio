// gateway-sdk/src/index.ts — barrel export v2
// Fix #395: re-export registry, IChannelAdapter, TelegramAdapter, WebChatAdapter
// Fix build: remove duplicate SessionStatus (already exported from types.ts),
//            use type-only import for ChannelAdapterOptions (not exported from channel-adapter).

export * from './types.js';
export * from './protocol.js';
export * from './auth.js';
export * from './events.js';
export * from './client.js';
export * from './session-manager.js';
// Note: gatewayMethods is already exported from types.ts via export * above;
// removing the duplicate named export from methods.js to avoid re-export conflict.
// export * from './methods.js';  -- commented out: gatewayMethods defined in types.ts

// Re-exporta IChannelAdapter con alias backward-compat
// ChannelAdapterOptions is NOT exported from channel-adapter.ts — removed to fix TS2305.
export {
  IChannelAdapter,
  IChannelAdapter as ChannelAdapter,
  registry,
  ChannelAdapterRegistry,
} from './channel-adapter.js';

// Adapters concretos requeridos por apps/gateway/src/server.ts y routes/webchat.ts
export { TelegramAdapter } from './adapters/telegram.js';
export { WebChatAdapter } from './adapters/webchat.js';
