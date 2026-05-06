/**
 * gateway-sdk/src/types.ts
 *
 * Fix B: Added ChannelMessage, ChannelAdapter, ChannelAdapterFactory
 * and gatewayMethods — consumed by index.ts, telegram.ts and gateway.service.ts
 * but previously absent from this file.
 */

// ── Channel message contract ─────────────────────────────────────────────────

export interface ChannelMessage {
  id:         string;
  channelId:  string;
  content:    string;
  senderId:   string;
  timestamp:  string;
  metadata?:  Record<string, unknown>;
}

// ── Adapter contract ─────────────────────────────────────────────────────────

export interface ChannelAdapter {
  readonly channelType: string;
  parseIncoming(raw: unknown): ChannelMessage | null;
  sendMessage(channelId: string, content: string): Promise<void>;
}

export type ChannelAdapterFactory = (config: Record<string, unknown>) => ChannelAdapter;

// ── RPC method names (used by gateway.service.ts) ────────────────────────────

export const gatewayMethods = {
  agentsList:   'agents.list',
  sessionsList: 'sessions.list',
  status:       'gateway.status',
  health:       'gateway.health',
  sendMessage:  'session.sendMessage',
  closeSession: 'session.close',
} as const;

export type GatewayMethod = typeof gatewayMethods[keyof typeof gatewayMethods];

// ── Gateway RPC envelopes ─────────────────────────────────────────────────────

export interface GatewayHealthPayload {
  ok: boolean;
  status?: string;
}

export interface GatewayDiagnosticsPayload {
  ok?: boolean;
  [key: string]: unknown;
}

export interface GatewayAgentSummary {
  id: string;
  name?: string;
  model?: string;
  status?: string;
  [key: string]: unknown;
}

export interface GatewaySessionSummary {
  id?: string;
  agentId?: string;
  channel?: string;
  status?: string;
  [key: string]: unknown;
}

export interface GatewayUsagePayload {
  totalCostUsd?: number;
  [key: string]: unknown;
}

export interface GatewayRpcEnvelope<T = unknown> {
  ok: boolean;
  payload?: T;
  error?: string;
}
