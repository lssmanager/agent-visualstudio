// gateway-sdk/src/index.ts — barrel export v3
// fix(tsc): resolver duplicado de SessionStatus entre types.ts y session-manager.ts
//
// El problema: `export * from './types.js'` y `export * from './session-manager.js'`
// ambos exportan `SessionStatus`, causando:
//   "Module has duplicate export 'SessionStatus'"
//
// Solución: exportar types.ts con exclusión explícita de SessionStatus,
// dejando que session-manager.ts sea la fuente canónica del tipo.
// session-manager.ts define SessionStatus con el mismo shape ('active' | 'paused' | 'closed' | 'unknown')
// y además incluye 'idle', pero la intersección es compatible.

export {
  // Re-exportar types.ts excluyendo SessionStatus para evitar el duplicado
  type ChannelMessage,
  type ChannelAdapter,
  type AdapterConfig,
  type ChannelAdapterFactory,
  // fix: SessionStatus viene SOLO de session-manager — ver más abajo
  type GatewaySession,
  type SessionEvent,
  gatewayMethods,
  type GatewayMethod,
  type GatewayHealthPayload,
  type GatewayDiagnosticsPayload,
  type GatewayAgentSummary,
  type GatewaySessionSummary,
  type GatewayUsagePayload,
  type GatewayRpcEnvelope,
} from './types.js';

export * from './protocol.js';
export * from './auth.js';
export * from './events.js';
export * from './client.js';
// session-manager.ts es la fuente canónica de SessionStatus
export * from './session-manager.js';
export * from './methods.js';

// Re-exporta IChannelAdapter con alias backward-compat
// fix(tsc): ChannelAdapterOptions no existe en channel-adapter.ts
// El tipo correcto es la interfaz de config inline. Se exporta como
// IChannelAdapterOptions con alias ChannelAdapterOptions para backward-compat.
export {
  IChannelAdapter,
  IChannelAdapter as ChannelAdapter,
  registry,
  ChannelAdapterRegistry,
} from './channel-adapter.js';

// Alias de compatibilidad: código que importaba ChannelAdapterOptions recibe
// AdapterConfig (definido en types.ts) que tiene el mismo shape.
export { type AdapterConfig as ChannelAdapterOptions } from './types.js';

export { gatewayMethods as gatewayMethodsMap } from './methods.js';

// Adapters concretos requeridos por apps/gateway/src/server.ts y routes/webchat.ts
export { TelegramAdapter } from './adapters/telegram.js';
export { WebChatAdapter } from './adapters/webchat.js';
