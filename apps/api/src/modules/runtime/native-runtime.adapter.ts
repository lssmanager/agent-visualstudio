import type {
  ConnectionSpec,
  RuntimeCapabilityMatrix,
  SessionState,
  TopologyActionRequest,
  TopologyActionResult,
  TopologyLinkState,
} from '../../../../../packages/core-types/src';
import { topologyActionResultSchema } from '../../../../../packages/schemas/src';
import { RuntimeAdapter, RuntimeSnapshot } from './runtime-adapter.interface';

/**
 * NativeRuntimeAdapter — a self-contained RuntimeAdapter that does NOT depend
 * on the OpenClaw gateway service.
 *
 * This adapter is designed for the Studio-native execution path where all
 * agent orchestration is handled directly by the Studio backend rather than
 * being proxied through the external OpenClaw runtime.
 *
 * Current state: scaffolding / in-memory implementation.
 * TODO: Wire this to the Studio database (Prisma) and the run-engine once
 * those services are available in the module DI context.
 */
export class NativeRuntimeAdapter implements RuntimeAdapter {
  readonly name = 'native';

  /**
   * In-memory session store for development/testing.
   * TODO: Replace with PrismaClient queries against the GatewaySession table.
   */
  private readonly sessions = new Map<string, SessionState>();

  // ── RuntimeAdapter implementation ────────────────────────────────────

  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const sessionList = Array.from(this.sessions.values());
    const activeSessions = sessionList.filter((s) => s.status === 'active');

    return {
      health: {
        ok: true,
        source: 'native',
        activeSessions: activeSessions.length,
        totalSessions: sessionList.length,
        checkedAt: new Date().toISOString(),
      },
      diagnostics: {
        adapter: this.name,
        sessions: {
          total: sessionList.length,
          active: activeSessions.length,
          idle: sessionList.filter((s) => s.status === 'idle').length,
          paused: sessionList.filter((s) => s.status === 'paused').length,
          closed: sessionList.filter((s) => s.status === 'closed').length,
        },
      },
      sessions: {
        ok: true,
        payload: sessionList,
      },
    };
  }

  async getCapabilities(): Promise<RuntimeCapabilityMatrix> {
    return {
      source: 'unknown',
      topology: {
        connect: true,
        disconnect: true,
        pause: true,
        reactivate: true,
        redirect: false, // TODO: implement redirect in native path
        continue: true,
      },
      inspection: {
        sessions: true,
        channels: true,
        topology: true,
      },
    };
  }

  async inspectSessions(): Promise<SessionState[]> {
    return Array.from(this.sessions.values());
  }

  async inspectChannels(): Promise<Array<{ channel: string; sessions: number; activeSessions: number }>> {
    const channelMap = new Map<string, { sessions: number; activeSessions: number }>();

    for (const session of this.sessions.values()) {
      const channel = session.ref.channel ?? '__unknown__';
      if (!channelMap.has(channel)) {
        channelMap.set(channel, { sessions: 0, activeSessions: 0 });
      }
      const entry = channelMap.get(channel)!;
      entry.sessions += 1;
      if (session.status === 'active') {
        entry.activeSessions += 1;
      }
    }

    return Array.from(channelMap.entries()).map(([channel, counts]) => ({
      channel,
      ...counts,
    }));
  }

  async inspectTopologyLinks(connections: ConnectionSpec[]): Promise<TopologyLinkState[]> {
    const observedAt = new Date().toISOString();
    return connections.map((conn) => ({
      linkId: conn.id,
      runtimeState: conn.state,
      runtimeSupported: true,
      lastObservedAt: observedAt,
    }));
  }

  async executeTopologyAction(
    action: TopologyActionRequest['action'],
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<TopologyActionResult> {
    const requestedAt = new Date().toISOString();

    switch (action) {
      case 'connect':
        return this.handleConnect(payload, requestedAt);
      case 'disconnect':
        return this.handleDisconnect(payload, requestedAt);
      case 'pause':
        return this.handlePause(payload, requestedAt);
      case 'reactivate':
        return this.handleReactivate(payload, requestedAt);
      case 'continue':
        return this.handleContinue(payload, requestedAt);
      case 'redirect':
        // TODO: implement redirect
        return topologyActionResultSchema.parse({
          action,
          status: 'unsupported_by_runtime',
          runtimeSupported: false,
          message: 'Topology action "redirect" is not yet implemented in the native adapter',
          requestedAt,
          errorCode: 'UNSUPPORTED_BY_RUNTIME',
        });
      default: {
        // Exhaustiveness guard: TypeScript will error here if a new action is added to
        // TopologyRuntimeAction without being handled above. The throw ensures this
        // branch is genuinely unreachable at runtime.
        const _exhaustive: never = action;
        throw new Error(`Unhandled topology action: ${String(_exhaustive)}`);
      }
    }
  }

  // ── Session management helpers ────────────────────────────────────────

  /**
   * Register a new session.
   * TODO: Persist to GatewaySession table via PrismaClient.
   */
  openSession(session: SessionState): void {
    this.sessions.set(session.ref.id, session);
  }

  /**
   * Close a session by ID.
   * TODO: Update GatewaySession.status and GatewaySession.closedAt via Prisma.
   */
  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.status = 'closed';
    this.sessions.set(sessionId, session);
    return true;
  }

  // ── Private action handlers ───────────────────────────────────────────

  private handleConnect(
    payload: Omit<TopologyActionRequest, 'action'>,
    requestedAt: string,
  ): TopologyActionResult {
    // TODO: Look up from/to nodes in the database and update their connection state.
    const fromId = payload.from.id;
    const toId = payload.to?.id ?? 'unknown';

    return topologyActionResultSchema.parse({
      action: 'connect',
      status: 'applied',
      runtimeSupported: true,
      message: `Native adapter: connected ${fromId} → ${toId}`,
      requestedAt,
      appliedAt: new Date().toISOString(),
    });
  }

  private handleDisconnect(
    payload: Omit<TopologyActionRequest, 'action'>,
    requestedAt: string,
  ): TopologyActionResult {
    // TODO: Update connection state in the database.
    const fromId = payload.from.id;
    const toId = payload.to?.id ?? 'unknown';

    return topologyActionResultSchema.parse({
      action: 'disconnect',
      status: 'applied',
      runtimeSupported: true,
      message: `Native adapter: disconnected ${fromId} ↛ ${toId}`,
      requestedAt,
      appliedAt: new Date().toISOString(),
    });
  }

  private handlePause(
    payload: Omit<TopologyActionRequest, 'action'>,
    requestedAt: string,
  ): TopologyActionResult {
    // TODO: Mark affected sessions as 'paused' in the database.
    const fromId = payload.from.id;

    // Pause all sessions associated with this agent/node
    for (const [, session] of this.sessions) {
      if (session.ref.id === fromId && session.status === 'active') {
        session.status = 'paused';
      }
    }

    return topologyActionResultSchema.parse({
      action: 'pause',
      status: 'applied',
      runtimeSupported: true,
      message: `Native adapter: paused sessions for node ${fromId}`,
      requestedAt,
      appliedAt: new Date().toISOString(),
    });
  }

  private handleReactivate(
    payload: Omit<TopologyActionRequest, 'action'>,
    requestedAt: string,
  ): TopologyActionResult {
    // TODO: Resume sessions from 'paused' state in the database.
    const fromId = payload.from.id;

    for (const [, session] of this.sessions) {
      if (session.ref.id === fromId && session.status === 'paused') {
        session.status = 'active';
      }
    }

    return topologyActionResultSchema.parse({
      action: 'reactivate',
      status: 'applied',
      runtimeSupported: true,
      message: `Native adapter: reactivated sessions for node ${fromId}`,
      requestedAt,
      appliedAt: new Date().toISOString(),
    });
  }

  private handleContinue(
    payload: Omit<TopologyActionRequest, 'action'>,
    requestedAt: string,
  ): TopologyActionResult {
    // TODO: Resume a paused flow run in the run-engine.
    const fromId = payload.from.id;

    return topologyActionResultSchema.parse({
      action: 'continue',
      status: 'applied',
      runtimeSupported: true,
      message: `Native adapter: continue signal sent for node ${fromId}`,
      requestedAt,
      appliedAt: new Date().toISOString(),
    });
  }
}
