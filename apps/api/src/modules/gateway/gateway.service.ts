import { gatewayMethods } from '../../../../../packages/gateway-sdk/src';
import { studioConfig } from '../../config';
import type { RuntimeCapabilityMatrix, SessionState } from '../../../../../packages/core-types/src';

export class GatewayService {
  async call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    let response: Response | null = null;
    try {
      response = await fetch(`${studioConfig.gatewayBaseUrl}/gateway/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, params }),
      });
    } catch {
      return { ok: false, error: `RPC transport unavailable for ${method}` };
    }

    if (!response || !response.ok) {
      return { ok: false, error: `RPC transport unavailable for ${method}` };
    }

    return response.json();
  }

  async health() {
    let response: Response | null = null;
    try {
      response = await fetch(`${studioConfig.gatewayBaseUrl}/health`);
    } catch {
      return { ok: false, status: 'offline' };
    }
    if (!response?.ok) {
      return { ok: false, status: 'offline' };
    }
    return response.json();
  }

  async diagnostics() {
    let response: Response | null = null;
    try {
      response = await fetch(`${studioConfig.gatewayBaseUrl}/diagnostics`);
    } catch {
      return { ok: false, diagnostics: null };
    }
    if (!response?.ok) {
      return { ok: false, diagnostics: null };
    }
    return response.json();
  }

  async activateChannel(channelConfigId: string): Promise<unknown> {
    let response: Response | null = null;
    try {
      response = await fetch(`${studioConfig.gatewayBaseUrl}/api/channels/${channelConfigId}/activate`, {
        method: 'POST',
      });
    } catch {
      throw new Error(`Unable to activate channel ${channelConfigId}`);
    }

    if (!response.ok) {
      throw new Error(`Unable to activate channel ${channelConfigId}: HTTP ${response.status}`);
    }

    return response.json();
  }

  async deactivateChannel(channelConfigId: string): Promise<unknown> {
    let response: Response | null = null;
    try {
      response = await fetch(`${studioConfig.gatewayBaseUrl}/api/channels/${channelConfigId}/deactivate`, {
        method: 'POST',
      });
    } catch {
      throw new Error(`Unable to deactivate channel ${channelConfigId}`);
    }

    if (!response.ok) {
      throw new Error(`Unable to deactivate channel ${channelConfigId}: HTTP ${response.status}`);
    }

    return response.json();
  }

  async dashboardState(): Promise<{ ok: boolean; agents: unknown[]; sessions: unknown[] }> {
    let response: Response | null = null;
    try {
      response = await fetch(`${studioConfig.gatewayBaseUrl}/dashboard/state`);
    } catch {
      return { ok: false, agents: [], sessions: [] };
    }
    if (!response?.ok) {
      return { ok: false, agents: [], sessions: [] };
    }
    try {
      const data = (await response.json()) as Record<string, unknown>;
      return {
        ok: true,
        agents: Array.isArray(data.agents) ? data.agents : Object.values((data.agents as Record<string, unknown>) ?? {}),
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
      };
    } catch {
      return { ok: false, agents: [], sessions: [] };
    }
  }

  async listAgents() {
    const viaRpc = await this.call(gatewayMethods.agentsList, {});
    if ((viaRpc as { ok?: boolean }).ok) {
      return viaRpc;
    }

    const state = await this.dashboardState();
    return { ok: true, payload: state.agents };
  }

  async listSessions() {
    const viaRpc = await this.call(gatewayMethods.sessionsList, { limit: 50 });
    if ((viaRpc as { ok?: boolean }).ok) {
      return viaRpc;
    }

    const state = await this.dashboardState();
    return { ok: true, payload: state.sessions };
  }

  async getRuntimeCapabilityMatrix(): Promise<RuntimeCapabilityMatrix> {
    const capabilitiesResponse = await this.call('runtime.capabilities', {});
    if ((capabilitiesResponse as { ok?: boolean }).ok) {
      const payload = (capabilitiesResponse as { payload?: Record<string, unknown> }).payload ?? {};
      return {
        source: 'gateway_capabilities',
        topology: {
          connect: Boolean(payload['topology.connect']),
          disconnect: Boolean(payload['topology.disconnect']),
          pause: Boolean(payload['topology.pause']),
          reactivate: Boolean(payload['topology.reactivate']),
          redirect: Boolean(payload['topology.redirect']),
          continue: Boolean(payload['topology.continue']),
        },
        inspection: {
          sessions: true,
          channels: true,
          topology: true,
        },
      };
    }

    const statusResponse = await this.call(gatewayMethods.status, {});
    if ((statusResponse as { ok?: boolean }).ok) {
      const payload = (statusResponse as { payload?: Record<string, unknown> }).payload ?? {};
      const capabilities = (payload.capabilities as Record<string, unknown> | undefined) ?? {};
      return {
        source: 'status_inference',
        topology: {
          connect: Boolean(capabilities['topology.connect']),
          disconnect: Boolean(capabilities['topology.disconnect']),
          pause: Boolean(capabilities['topology.pause']),
          reactivate: Boolean(capabilities['topology.reactivate']),
          redirect: Boolean(capabilities['topology.redirect']),
          continue: Boolean(capabilities['topology.continue']),
        },
        inspection: {
          sessions: true,
          channels: true,
          topology: true,
        },
      };
    }

    return {
      source: 'unknown',
      topology: {
        connect: false,
        disconnect: false,
        pause: false,
        reactivate: false,
        redirect: false,
        continue: false,
      },
      inspection: {
        sessions: true,
        channels: false,
        topology: false,
      },
    };
  }

  async inspectSessions(): Promise<SessionState[]> {
    const sessions = await this.listSessions();
    const payload = Array.isArray((sessions as { payload?: unknown[] }).payload)
      ? (sessions as { payload: unknown[] }).payload
      : [];

    return payload.map((item, index) => {
      const value = item as Record<string, unknown>;
      return {
        ref: {
          id: typeof value.id === 'string' ? value.id : `session-${index}`,
          channel: typeof value.channel === 'string' ? value.channel : undefined,
        },
        status:
          value.status === 'active'
            ? 'active'
            : value.status === 'paused'
              ? 'paused'
              : value.status === 'closed'
                ? 'closed'
                : 'unknown',
        lastEventAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
        metadata: value,
      };
    });
  }

  async inspectChannels(): Promise<Array<{ channel: string; sessions: number; activeSessions: number }>> {
    const sessions = await this.inspectSessions();
    const map = new Map<string, { sessions: number; activeSessions: number }>();

    for (const session of sessions) {
      const channel = session.ref.channel ?? 'unknown';
      if (!map.has(channel)) {
        map.set(channel, { sessions: 0, activeSessions: 0 });
      }
      const entry = map.get(channel)!;
      entry.sessions += 1;
      if (session.status === 'active') {
        entry.activeSessions += 1;
      }
    }

    return Array.from(map.entries()).map(([channel, stats]) => ({
      channel,
      ...stats,
    }));
  }
}
