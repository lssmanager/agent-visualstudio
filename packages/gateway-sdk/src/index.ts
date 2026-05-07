// gateway-sdk/src/index.ts — barrel export v2
// Fix: re-exporta IChannelAdapter con alias ChannelAdapter,
//      ChannelAdapterOptions, y gatewayMethods

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
} from './channel-adapter.js';

export { gatewayMethods } from './methods.js';
