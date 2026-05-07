// Core client
export {
  OpenClawClient,
  OpenClawClientOptions,
  HttpGatewayTransport,
} from './client';

// Back-compat aliases — consumers that import GatewayClient still work
export type { OpenClawClientOptions as GatewayClientOptions } from './client';
export { OpenClawClient as GatewayClient } from './client';

// Types
export type {
  GatewayAgentSummary,
  GatewaySessionSummary,
  GatewayHealthPayload,
  GatewayDiagnosticsPayload,
  GatewayUsagePayload,
  GatewayRpcEnvelope,
} from './types';

// Channel adapter
export { ChannelAdapter } from './channel-adapter';
export type { ChannelAdapterOptions } from './channel-adapter';

// Auth
export type { GatewayAuthOptions } from './auth';

// Protocol
export type { GatewayTransport } from './protocol';

// Events
export * from './events';
