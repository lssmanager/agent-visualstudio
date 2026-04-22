import {
  ConnectionSpec,
  RuntimeCapabilityMatrix,
  SessionState,
  TopologyActionRequest,
  TopologyActionResult,
  TopologyLinkState,
} from '../../../../../../packages/core-types/src';
import { topologyActionResultSchema } from '../../../../../../packages/schemas/src';
import { GatewayService } from '../../gateway/gateway.service';
import { RuntimeAdapter, RuntimeSnapshot } from '../runtime-adapter.interface';

const RUNTIME_METHOD_BY_ACTION: Record<TopologyActionRequest['action'], string> = {
  connect: 'topology.connect',
  disconnect: 'topology.disconnect',
  pause: 'topology.pause',
  reactivate: 'topology.reactivate',
  redirect: 'topology.redirect',
  continue: 'topology.continue',
};

type GatewayLike = Pick<
  GatewayService,
  | 'health'
  | 'diagnostics'
  | 'listSessions'
  | 'getRuntimeCapabilityMatrix'
  | 'inspectSessions'
  | 'inspectChannels'
  | 'call'
>;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const toHealthSnapshot = (value: unknown): RuntimeSnapshot['health'] => {
  const record = asRecord(value);
  if (!record) {
    return { ok: false, status: 'invalid_response' };
  }

  const snapshot: RuntimeSnapshot['health'] = {
    ok: typeof record.ok === 'boolean' ? record.ok : false,
  };

  for (const [key, entry] of Object.entries(record)) {
    snapshot[key] = entry;
  }

  return snapshot;
};

const toDiagnosticsSnapshot = (value: unknown): RuntimeSnapshot['diagnostics'] => {
  return asRecord(value) ?? { ok: false, diagnostics: null };
};

const toSessionsSnapshot = (value: unknown): RuntimeSnapshot['sessions'] => {
  const record = asRecord(value);
  if (!record) {
    return { ok: false, payload: [] };
  }

  return {
    ...record,
    ok: typeof record.ok === 'boolean' ? record.ok : false,
    payload: Array.isArray(record.payload) ? record.payload : [],
  };
};

const isOkResult = (value: unknown): value is { ok: boolean } => {
  const record = asRecord(value);
  return Boolean(record && typeof record.ok === 'boolean' && record.ok);
};

export class OpenClawRuntimeAdapter implements RuntimeAdapter {
  readonly name = 'openclaw';

  constructor(private readonly gateway: GatewayLike = new GatewayService()) {}

  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    const [health, diagnostics, sessions] = await Promise.all([
      this.gateway.health(),
      this.gateway.diagnostics(),
      this.gateway.listSessions(),
    ]);

    return {
      health: toHealthSnapshot(health),
      diagnostics: toDiagnosticsSnapshot(diagnostics),
      sessions: toSessionsSnapshot(sessions),
    };
  }

  async getCapabilities(): Promise<RuntimeCapabilityMatrix> {
    return this.gateway.getRuntimeCapabilityMatrix();
  }

  async inspectSessions(): Promise<SessionState[]> {
    return this.gateway.inspectSessions();
  }

  async inspectChannels(): Promise<Array<{ channel: string; sessions: number; activeSessions: number }>> {
    return this.gateway.inspectChannels();
  }

  async inspectTopologyLinks(connections: ConnectionSpec[]): Promise<TopologyLinkState[]> {
    const capabilities = await this.getCapabilities();
    const runtimeSupported = Object.values(capabilities.topology).some(Boolean);
    const observedAt = new Date().toISOString();
    return connections.map((connection) => ({
      linkId: connection.id,
      runtimeState: connection.state,
      runtimeSupported,
      lastObservedAt: observedAt,
    }));
  }

  async executeTopologyAction(
    action: TopologyActionRequest['action'],
    payload: Omit<TopologyActionRequest, 'action'>,
  ): Promise<TopologyActionResult> {
    const requestedAt = new Date().toISOString();
    const capabilities = await this.getCapabilities();
    const isSupported = capabilities.topology[action];

    if (!isSupported) {
      return topologyActionResultSchema.parse({
        action,
        status: 'unsupported_by_runtime',
        runtimeSupported: false,
        message: `Topology action "${action}" is unsupported by runtime`,
        requestedAt,
        errorCode: 'UNSUPPORTED_BY_RUNTIME',
      });
    }

    const runtimeMethod = RUNTIME_METHOD_BY_ACTION[action];
    const runtimeResult = await this.gateway.call(runtimeMethod, {
      from: payload.from,
      to: payload.to,
      reason: payload.reason,
      metadata: payload.metadata,
    });

    if (!isOkResult(runtimeResult)) {
      // Try to extract a reason from the runtime response
      const runtimeRecord = asRecord(runtimeResult);
      const runtimeMessage =
        typeof runtimeRecord?.message === 'string' ? runtimeRecord.message
        : typeof runtimeRecord?.reason === 'string' ? runtimeRecord.reason
        : typeof runtimeRecord?.error === 'string' ? runtimeRecord.error
        : null;

      return topologyActionResultSchema.parse({
        action,
        status: 'rejected',
        runtimeSupported: true,
        message: runtimeMessage
          ? `Runtime rejected action "${action}": ${runtimeMessage}`
          : `Runtime rejected topology action "${action}"`,
        requestedAt,
        errorCode: typeof runtimeRecord?.code === 'string' ? runtimeRecord.code : 'RUNTIME_REJECTED',
      });
    }

    return topologyActionResultSchema.parse({
      action,
      status: 'applied',
      runtimeSupported: true,
      message: `Topology action "${action}" applied successfully`,
      requestedAt,
      appliedAt: new Date().toISOString(),
    });
  }
}
