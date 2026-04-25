/**
 * native-runtime.adapter.ts — NativeRuntimeAdapter
 *
 * Implementa RuntimeAdapter SIN depender de OpenClaw.
 * Usa directamente:
 *   - Prisma (DB) para leer agentes, sesiones, runs
 *   - LLMStepExecutor (packages/run-engine) para ejecutar steps
 *   - BullMQ (opcional) para encolar runs en background
 *
 * Patrones tomados de:
 *   - LangGraph: state checkpointing y topology ops
 *   - AutoGen: conversational session management
 *   - Flowise: channel session routing
 */

import type {
  ConnectionSpec,
  RuntimeCapabilityMatrix,
  SessionState,
  TopologyActionRequest,
  TopologyActionResult,
  TopologyLinkState,
} from '../../../../../../packages/core-types/src';
import { topologyActionResultSchema } from '../../../../../../packages/schemas/src';
import type { RuntimeAdapter, RuntimeSnapshot } from '../runtime-adapter.interface';
import { prisma } from '../../core/db/prisma.service';

// ---------------------------------------------------------------------------
// NativeRuntimeAdapter
// ---------------------------------------------------------------------------

export class NativeRuntimeAdapter implements RuntimeAdapter {
  readonly name = 'native';

  // ── Snapshot ────────────────────────────────────────────────────────────

  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const [health, diagnostics, sessions] = await Promise.all([
      this._health(),
      this._diagnostics(),
      this._sessions(),
    ]);
    return { health, diagnostics, sessions };
  }

  private async _health(): Promise<RuntimeSnapshot['health']> {
    try {
      const activeRuns = await prisma.run.count({ where: { status: 'running' } });
      return { ok: true, status: 'online', mode: 'native', activeRuns };
    } catch (err) {
      return { ok: false, status: 'db_error', error: String(err) };
    }
  }

  private async _diagnostics(): Promise<RuntimeSnapshot['diagnostics']> {
    const [agents, flows, sessions, runs] = await Promise.all([
      prisma.agent.count({ where: { isEnabled: true } }),
      prisma.flow.count({ where: { isEnabled: true } }),
      prisma.gatewaySession.count(),
      prisma.run.count({ where: { status: { in: ['running', 'queued'] } } }),
    ]);
    return { ok: true, mode: 'native', agents, activeFlows: flows, sessions, pendingRuns: runs };
  }

  private async _sessions(): Promise<RuntimeSnapshot['sessions']> {
    const rows = await prisma.gatewaySession.findMany({
      orderBy: { lastActivityAt: 'desc' },
      take: 50,
    });
    return { ok: true, payload: rows };
  }

  // ── Capabilities ────────────────────────────────────────────────────────

  async getCapabilities(): Promise<RuntimeCapabilityMatrix> {
    return {
      source: 'native_runtime' as any,
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

  // ── Sessions ────────────────────────────────────────────────────────────

  async inspectSessions(): Promise<SessionState[]> {
    const rows = await prisma.gatewaySession.findMany({
      orderBy: { lastActivityAt: 'desc' },
      take: 100,
    });
    return rows.map((row: any) => ({
      ref: { id: row.id, channel: row.channelConfigId },
      status: 'active' as const,
      lastEventAt: row.lastActivityAt.toISOString(),
      metadata: {
        agentId: row.agentId,
        externalId: row.externalId,
        channelConfigId: row.channelConfigId,
      },
    }));
  }

  // ── Channels ────────────────────────────────────────────────────────────

  async inspectChannels(): Promise<
    Array<{ channel: string; sessions: number; activeSessions: number }>
  > {
    // Agrupa sesiones por ChannelConfig.channel
    const configs = await prisma.channelConfig.findMany({
      where: { isActive: true },
      include: { _count: { select: { bindings: true } } },
    });
    return configs.map((c: any) => ({
      channel: c.channel,
      sessions: c._count.bindings,
      activeSessions: c._count.bindings, // refinable con GatewaySession
    }));
  }

  // ── Topology Links ───────────────────────────────────────────────────────

  async inspectTopologyLinks(
    connections: ConnectionSpec[],
  ): Promise<TopologyLinkState[]> {
    const observedAt = new Date().toISOString();
    return connections.map((connection) => ({
      linkId: connection.id,
      runtimeState: connection.state,
      runtimeSupported: true,
      lastObservedAt: observedAt,
    }));
  }

  // ── Topology Actions ─────────────────────────────────────────────────────
  //
  // Implementación basada en LangGraph interrupt/resume pattern.

  async executeTopologyAction(
    action: TopologyActionRequest['action'],
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<TopologyActionResult> {
    const requestedAt = new Date().toISOString();

    try {
      switch (action) {
        case 'connect':
          await this._topologyConnect(payload);
          break;
        case 'disconnect':
          await this._topologyDisconnect(payload);
          break;
        case 'pause':
          await this._topologyPause(payload);
          break;
        case 'reactivate':
          await this._topologyReactivate(payload);
          break;
        case 'redirect':
          await this._topologyRedirect(payload);
          break;
        case 'continue':
          await this._topologyContinue(payload);
          break;
        default:
          return topologyActionResultSchema.parse({
            action,
            status: 'unsupported_by_runtime',
            runtimeSupported: false,
            message: `Unknown topology action: ${action}`,
            requestedAt,
            errorCode: 'UNSUPPORTED_BY_RUNTIME',
          });
      }

      return topologyActionResultSchema.parse({
        action,
        status: 'applied',
        runtimeSupported: true,
        message: `Topology action "${action}" applied (native)`,
        requestedAt,
        appliedAt: new Date().toISOString(),
      });
    } catch (err) {
      return topologyActionResultSchema.parse({
        action,
        status: 'rejected',
        runtimeSupported: true,
        message: String(err),
        requestedAt,
        errorCode: 'NATIVE_ERROR',
      });
    }
  }

  // ── Topology implementation helpers ──────────────────────────────────────

  private async _topologyConnect(
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<void> {
    // Habilitar ChannelBinding entre "from" (canal) y "to" (agente)
    if (payload.from && payload.to) {
      await prisma.channelBinding.updateMany({
        where: { channelConfigId: payload.from, agentId: payload.to },
        data: { isEnabled: true },
      });
    }
  }

  private async _topologyDisconnect(
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<void> {
    if (payload.from && payload.to) {
      await prisma.channelBinding.updateMany({
        where: { channelConfigId: payload.from, agentId: payload.to },
        data: { isEnabled: false },
      });
    }
  }

  private async _topologyPause(
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<void> {
    // Pausar runs activos del agente
    if (payload.from) {
      await prisma.run.updateMany({
        where: {
          status: 'running',
          trigger: { path: ['agentId'], equals: payload.from },
        },
        data: { status: 'waiting_approval' },
      });
    }
  }

  private async _topologyReactivate(
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<void> {
    if (payload.from) {
      await prisma.run.updateMany({
        where: {
          status: 'waiting_approval',
          trigger: { path: ['agentId'], equals: payload.from },
        },
        data: { status: 'queued' },
      });
    }
  }

  private async _topologyRedirect(
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<void> {
    // Redirigir sesiones de "from" agente a "to" agente
    if (payload.from && payload.to) {
      await prisma.gatewaySession.updateMany({
        where: { agentId: payload.from },
        data: { agentId: payload.to },
      });
    }
  }

  private async _topologyContinue(
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<void> {
    // Reanudar runs pausados de un agente (LangGraph resume pattern)
    if (payload.from) {
      await prisma.runStep.updateMany({
        where: {
          agentId: payload.from,
          durableState: 'paused',
        },
        data: { durableState: 'resuming', status: 'running' },
      });
    }
  }
}
