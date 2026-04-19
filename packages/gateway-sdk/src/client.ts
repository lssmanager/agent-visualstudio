import { buildGatewayAuthHeaders, GatewayAuthOptions } from './auth';
import { gatewayMethods } from './methods';
import { GatewayTransport } from './protocol';
import {
  GatewayAgentSummary,
  GatewayDiagnosticsPayload,
  GatewayHealthPayload,
  GatewayRpcEnvelope,
  GatewaySessionSummary,
  GatewayUsagePayload,
} from './types';

export interface OpenClawClientOptions extends GatewayAuthOptions {
  baseUrl: string;
}

export class HttpGatewayTransport implements GatewayTransport {
  constructor(private readonly options: OpenClawClientOptions) {}

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.options.baseUrl}/studio/gateway/call`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...buildGatewayAuthHeaders(this.options),
      },
      body: JSON.stringify({ method, params }),
    });

    if (!response.ok) {
      throw new Error(`Gateway adapter error: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GatewayRpcEnvelope<T>;
    if (!payload.ok) {
      throw new Error(payload.error ?? `Gateway method failed: ${method}`);
    }

    return payload.payload as T;
  }
}

export class OpenClawClient {
  constructor(private readonly transport: GatewayTransport) {}

  health() {
    return this.transport.call<GatewayHealthPayload>(gatewayMethods.health);
  }

  status() {
    return this.transport.call<Record<string, unknown>>(gatewayMethods.status);
  }

  diagnostics() {
    return this.transport.call<GatewayDiagnosticsPayload>(gatewayMethods.diagnostics);
  }

  listAgents() {
    return this.transport.call<GatewayAgentSummary[]>(gatewayMethods.agentsList);
  }

  listSessions() {
    return this.transport.call<GatewaySessionSummary[]>(gatewayMethods.sessionsList);
  }

  usageCost() {
    return this.transport.call<GatewayUsagePayload>(gatewayMethods.usageCost);
  }

  spawnAgent(params: { agentId: string; input?: Record<string, unknown> }) {
    return this.transport.call<{ sessionId: string }>(gatewayMethods.agentsSpawn, params);
  }

  sendToAgent(params: { sessionId: string; message: string; payload?: Record<string, unknown> }) {
    return this.transport.call<{ ok: boolean }>(gatewayMethods.agentsSend, params);
  }

  cancelAgent(params: { sessionId: string }) {
    return this.transport.call<{ ok: boolean }>(gatewayMethods.agentsCancel, params);
  }
}
