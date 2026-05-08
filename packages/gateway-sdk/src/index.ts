// gateway-sdk/src/index.ts — barrel export v2
// Fix #395: re-export registry, IChannelAdapter, TelegramAdapter, WebChatAdapter

export * from './types.js';
export * from './protocol.js';
export * from './auth.js';
export * from './events.js';
export * from './client.js';
export * from './session-manager.js';
export * from './methods.js';

// Re-exporta IChannelAdapter con alias backward-compat
export {
  IChannelAdapter,
  IChannelAdapter as ChannelAdapter,
  type ChannelAdapterOptions,
  registry,
  ChannelAdapterRegistry,
} from './channel-adapter.js';

export { gatewayMethods } from './methods.js';

// Adapters concretos requeridos por apps/gateway/src/server.ts y routes/webchat.ts
export { TelegramAdapter } from './adapters/telegram.js';
export { WebChatAdapter } from './adapters/webchat.js';
