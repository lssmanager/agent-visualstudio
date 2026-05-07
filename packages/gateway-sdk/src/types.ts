/**
 * gateway-sdk/src/types.ts
 *
 * Canonical types for the gateway SDK public API.
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

/** Config object passed to an adapter at setup time */
export interface AdapterConfig {
  channelId:  string;
  config:     Record<string, unknown>;
  secrets?:   Record<string, unknown>;
}

export type ChannelAdapterFactory = (config: Record<string, unknown>) => ChannelAdapter;

// ── Session types ─────────────────────────────────────────────────────────────

/** Lifecycle states a gateway session can be in */
export type SessionStatus = 'active' | 'paused' | 'closed' | 'idle' | 'unknown';

/**
 * GatewaySession represents an open conversation between an external user
 * and an agent, mediated by a specific channel adapter.
 */
export interface GatewaySession {
  id:              string;
  agentId:         string;
  channelId:       string;
  externalUserId:  string;
  status:          SessionStatus;
  createdAt:       string;
  lastActivityAt?: string;
  metadata?:       Record<string, unknown>;
}

/**
 * SessionEvent is emitted by the SessionManager whenever a session
 * changes state (opened, message received, closed, etc.).
 */
export interface SessionEvent {
  sessionId:  string;
  type:       'opened' | 'message' | 'closed' | 'error' | 'paused' | 'resumed';
  payload?:   Record<string, unknown>;
  ts:         string;
}

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
