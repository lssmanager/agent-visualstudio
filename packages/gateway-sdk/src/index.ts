// gateway-sdk/src/index.ts — barrel export v4
// fix(tsc): resolver duplicado de SessionStatus entre types.ts y session-manager.ts
// fix(tsc): ChannelAdapter duplicado — types.ts exporta el type, channel-adapter.ts
//           exporta la clase IChannelAdapter. El alias 'ChannelAdapter' sólo puede
//           venir de UNA fuente. Se elige channel-adapter.ts (clase concreta) y se
//           excluye el type ChannelAdapter de types.ts renombrándolo como ChannelAdapterType.

export {
  // Re-exportar types.ts excluyendo SessionStatus y ChannelAdapter para evitar duplicados
  type ChannelMessage,
  type ChannelAdapter as ChannelAdapterType,  // renombrado para evitar colisión con clase
  type AdapterConfig,
  type ChannelAdapterFactory,
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

// channel-adapter.ts es la fuente canónica de ChannelAdapter (clase concreta)
// IChannelAdapter as ChannelAdapter — compatibilidad con código existente
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
