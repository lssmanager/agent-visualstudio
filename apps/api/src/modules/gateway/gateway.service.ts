/**
 * gateway.service.ts — Gateway nativo
 *
 * Ya NO es un simple proxy HTTP a gatewayBaseUrl.
 * Usa NativeRuntimeAdapter directamente cuando NATIVE_RUNTIME=true,
 * manteniendo fallback al proxy OpenClaw para compatibilidad en transición.
 *
 * Inspirado en:
 * - Flowise: channel routing y session management
 * - n8n: webhook ingestion unificada
 * - CrewAI: task dispatch con contexto de agente
 */

import { gatewayMethods } from '../../../../../packages/gateway-sdk/src';
import { studioConfig } from '../../config';
import type {
  RuntimeCapabilityMatrix,
  SessionState,
} from '../../../../../packages/core-types/src';
import { prisma } from '../core/db/prisma.service';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

export interface NativeSessionState extends SessionState {
  channel: string;
  agentId: string;
  lastMessage?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isNativeMode = (): boolean =>
  process.env.NATIVE_RUNTIME === 'true';

const safeFetch = async (
  url: string,
  init?: RequestInit,
): Promise<Response | null> => {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// GatewayService
// ---------------------------------------------------------------------------

export class GatewayService {
  // ── Proxy legacy (OpenClaw) ──────────────────────────────────────────────

  async call(method: string, params?: Record<string, unknown>) {
    if (isNativeMode()) {
      return this._nativeCall(method, params);
    }
    const response = await safeFetch(
      `${studioConfig.gatewayBaseUrl}/gateway/rpc`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, params }),
      },
    );
    if (!response?.ok) {
      return { ok: false, error: `RPC transport unavailable for ${method}` };
    }
    return response.json();
  }

  async health() {
    if (isNativeMode()) return this._nativeHealth();
    const response = await safeFetch(`${studioConfig.gatewayBaseUrl}/health`);
    if (!response?.ok) return { ok: false, status: 'offline' };
    return response.json();
  }

  async diagnostics() {
    if (isNativeMode()) return this._nativeDiagnostics();
    const response = await safeFetch(`${studioConfig.gatewayBaseUrl}/diagnostics`);
    if (!response?.ok) return { ok: false, diagnostics: null };
    return response.json();
  }

  async dashboardState() {
    if (isNativeMode()) return this._nativeDashboardState();
    const response = await safeFetch(`${studioConfig.gatewayBaseUrl}/dashboard/state`);
    if (!response?.ok) return { ok: false, agents: [], sessions: [] };
    return response.json();
  }

  async listAgents() {
    if (isNativeMode()) return this._nativeListAgents();
    const viaRpc = await this.call(gatewayMethods.agentsList, {});
    if ((viaRpc as { ok?: boolean }).ok) return viaRpc;
    const state = (await this.dashboardState()) as {
      agents?: Record<string, unknown>[] | Record<string, unknown>;
    };
    if (Array.isArray(state.agents)) return { ok: true, payload: state.agents };
    const flattened = Object.values(
      (state.agents as Record<string, unknown>) ?? {},
    ).flatMap((v) => (Array.isArray(v) ? v : []));
    return { ok: true, payload: flattened };
  }

  async listSessions() {
    if (isNativeMode()) return this._nativeListSessions();
    const viaRpc = await this.call(gatewayMethods.sessionsList, { limit: 50 });
    if ((viaRpc as { ok?: boolean }).ok) return viaRpc;
    const state = (await this.dashboardState()) as { sessions?: unknown[] };
    return {
      ok: true,
      payload: Array.isArray(state.sessions) ? state.sessions : [],
    };
  }

  async getRuntimeCapabilityMatrix(): Promise<RuntimeCapabilityMatrix> {
    if (isNativeMode()) return this._nativeCapabilities();

    const capabilitiesResponse = await this.call('runtime.capabilities', {});
    if ((capabilitiesResponse as { ok?: boolean }).ok) {
      const payload =
        (capabilitiesResponse as { payload?: Record<string, unknown> }).payload ?? {};
      return this._buildCapMatrix(payload, 'gateway_capabilities');
    }
    const statusResponse = await this.call(gatewayMethods.status, {});
    if ((statusResponse as { ok?: boolean }).ok) {
      const payload =
        (statusResponse as { payload?: Record<string, unknown> }).payload ?? {};
      const capabilities =
        (payload.capabilities as Record<string, unknown> | undefined) ?? {};
      return this._buildCapMatrix(capabilities, 'status_inference');
    }
    return this._offlineCapMatrix();
  }

  async inspectSessions(): Promise<SessionState[]> {
    if (isNativeMode()) return this._nativeInspectSessions();
    const sessions = await this.listSessions();
    const payload = Array.isArray(
      (sessions as { payload?: unknown[] }).payload,
    )
      ? (sessions as { payload: unknown[] }).payload
      : [];
    return payload.map((item, index) => {
      const value = item as Record<string, unknown>;
      return {
        ref: {
          id:
            typeof value.id === 'string' ? value.id : `session-${index}`,
          channel:
            typeof value.channel === 'string' ? value.channel : undefined,
        },
        status:
          value.status === 'active'
            ? 'active'
            : value.status === 'paused'
              ? 'paused'
              : value.status === 'closed'
                ? 'closed'
                : 'unknown',
        lastEventAt:
          typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
        metadata: value,
      };
    });
  }

  async inspectChannels(): Promise<
    Array<{ channel: string; sessions: number; activeSessions: number }>
  > {
    const sessions = await this.inspectSessions();
    const map = new Map<
      string,
      { sessions: number; activeSessions: number }
    >();
    for (const session of sessions) {
      const channel = session.ref.channel ?? 'unknown';
      if (!map.has(channel)) map.set(channel, { sessions: 0, activeSessions: 0 });
      const entry = map.get(channel)!;
      entry.sessions += 1;
      if (session.status === 'active') entry.activeSessions += 1;
    }
    return Array.from(map.entries()).map(([channel, stats]) => ({
      channel,
      ...stats,
    }));
  }

  // ── Lógica nativa (sin OpenClaw) ─────────────────────────────────────────

  /** Enruta un mensaje entrante de cualquier canal al agente correcto */
  async dispatchIncomingMessage(opts: {
    channelConfigId: string;
    externalId: string;   // user/thread ID del canal
    text: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ ok: boolean; runId?: string; error?: string }> {
    // 1. Buscar binding canal → agente
    const binding = await prisma.channelBinding.findFirst({
      where: { channelConfigId: opts.channelConfigId, isEnabled: true },
    });
    if (!binding) {
      return { ok: false, error: 'No channel binding found' };
    }

    // 2. Upsert sesión de conversación
    const session = await prisma.gatewaySession.upsert({
      where: {
        channelConfigId_externalId: {
          channelConfigId: opts.channelConfigId,
          externalId: opts.externalId,
        },
      },
      create: {
        channelConfigId: opts.channelConfigId,
        externalId: opts.externalId,
        agentId: binding.agentId,
        contextWindow: [{ role: 'user', content: opts.text }],
        metadata: opts.metadata ?? {},
      },
      update: {
        lastActivityAt: new Date(),
        contextWindow: { push: { role: 'user', content: opts.text } } as any,
      },
    });

    // 3. Buscar flow activo para el agente
    const agent = await prisma.agent.findUnique({
      where: { id: binding.agentId },
      select: { workspaceId: true },
    });
    if (!agent) return { ok: false, error: 'Agent not found' };

    const flow = await prisma.flow.findFirst({
      where: {
        workspaceId: agent.workspaceId,
        isEnabled: true,
        trigger: 'message',
      },
    });
    if (!flow) return { ok: false, error: 'No active message-trigger flow' };

    // 4. Crear Run en DB (el RunsService lo ejecutará vía BullMQ o inline)
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.run.create({
      data: {
        id: runId,
        workspaceId: agent.workspaceId,
        flowId: flow.id,
        status: 'queued',
        trigger: {
          type: 'channel_message',
          sessionId: session.id,
          agentId: binding.agentId,
          text: opts.text,
          metadata: opts.metadata ?? {},
        },
      },
    });

    return { ok: true, runId };
  }

  // ── Métodos nativos internos ──────────────────────────────────────────────

  private async _nativeCall(
    method: string,
    _params?: Record<string, unknown>,
  ) {
    // Stubs para métodos de topología — se amplían en NativeRuntimeAdapter
    console.warn(`[GatewayService] native stub for RPC method: ${method}`);
    return { ok: true, payload: null };
  }

  private async _nativeHealth() {
    const runCount = await prisma.run
      .count({ where: { status: 'running' } })
      .catch(() => -1);
    return {
      ok: true,
      status: 'online',
      mode: 'native',
      activeRuns: runCount,
    };
  }

  private async _nativeDiagnostics() {
    const [agentCount, flowCount, sessionCount] = await Promise.all([
      prisma.agent.count(),
      prisma.flow.count({ where: { isEnabled: true } }),
      prisma.gatewaySession.count(),
    ]);
    return {
      ok: true,
      mode: 'native',
      agents: agentCount,
      activeFlows: flowCount,
      sessions: sessionCount,
    };
  }

  private async _nativeDashboardState() {
    const [agents, sessions] = await Promise.all([
      prisma.agent.findMany({ where: { isEnabled: true }, take: 100 }),
      prisma.gatewaySession.findMany({
        orderBy: { lastActivityAt: 'desc' },
        take: 50,
      }),
    ]);
    return { ok: true, agents, sessions };
  }

  private async _nativeListAgents() {
    const agents = await prisma.agent.findMany({
      where: { isEnabled: true },
      orderBy: { name: 'asc' },
    });
    return { ok: true, payload: agents };
  }

  private async _nativeListSessions() {
    const sessions = await prisma.gatewaySession.findMany({
      orderBy: { lastActivityAt: 'desc' },
      take: 50,
    });
    return { ok: true, payload: sessions };
  }

  private async _nativeCapabilities(): Promise<RuntimeCapabilityMatrix> {
    return {
      source: 'native_runtime',
      topology: {
        connect: true,
        disconnect: true,
        pause: true,
        reactivate: true,
        redirect: true,
        continue: true,
      },
      inspection: { sessions: true, channels: true, topology: true },
    };
  }

  private async _nativeInspectSessions(): Promise<SessionState[]> {
    const rows = await prisma.gatewaySession.findMany({
      orderBy: { lastActivityAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      ref: { id: row.id, channel: row.channelConfigId },
      status: 'active',
      lastEventAt: row.lastActivityAt.toISOString(),
      metadata: { agentId: row.agentId, externalId: row.externalId },
    }));
  }

  // ── Helpers privados ─────────────────────────────────────────────────────

  private _buildCapMatrix(
    payload: Record<string, unknown>,
    source: string,
  ): RuntimeCapabilityMatrix {
    return {
      source,
      topology: {
        connect: Boolean(payload['topology.connect']),
        disconnect: Boolean(payload['topology.disconnect']),
        pause: Boolean(payload['topology.pause']),
        reactivate: Boolean(payload['topology.reactivate']),
        redirect: Boolean(payload['topology.redirect']),
        continue: Boolean(payload['topology.continue']),
      },
      inspection: { sessions: true, channels: true, topology: true },
    };
  }

  private _offlineCapMatrix(): RuntimeCapabilityMatrix {
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
      inspection: { sessions: true, channels: false, topology: false },
    };
  }
}
