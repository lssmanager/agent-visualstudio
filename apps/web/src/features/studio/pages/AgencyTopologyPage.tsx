import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Network,
  PauseCircle,
  PlayCircle,
  PlugZap,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import { getCanonicalStudioState, triggerTopologyAction } from '../../../lib/api';
import type {
  CanonicalStudioStateResponse,
  ConnectionSpec,
  TopologyActionResult,
  TopologyNodeRef,
  TopologyRuntimeAction,
} from '../../../lib/types';
import {
  RuntimeStatusBadge,
  StudioEmptyState,
  StudioHeroSection,
  StudioInspectorCard,
  StudioKpiCard,
  StudioMetricRow,
  StudioPageShell,
  StudioSectionCard,
  StudioTimelineBlock,
} from '../../../components/ui';

const ACTIONS: TopologyRuntimeAction[] = [
  'connect',
  'disconnect',
  'pause',
  'reactivate',
  'redirect',
  'continue',
];

interface TopologyNodeView {
  key: string;
  label: string;
  level: TopologyNodeRef['level'];
  id: string;
  x: number;
  y: number;
}

export default function AgencyTopologyPage() {
  const [canonical, setCanonical] = useState<CanonicalStudioStateResponse | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [fromNode, setFromNode] = useState('');
  const [toNode, setToNode] = useState('');
  const [busyAction, setBusyAction] = useState<TopologyRuntimeAction | null>(null);
  const [result, setResult] = useState<TopologyActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nodes = useMemo(() => buildNodes(canonical), [canonical]);
  const nodeMap = useMemo(
    () => new Map(nodes.map((node) => [node.key, node])),
    [nodes],
  );

  const selectedConnection = useMemo(() => {
    if (!canonical || !selectedConnectionId) return null;
    return canonical.topology.connections.find((connection) => connection.id === selectedConnectionId) ?? null;
  }, [canonical, selectedConnectionId]);

  const nodeOptions = useMemo(() => {
    return nodes.map((node) => ({
      key: node.key,
      label: `${capitalize(node.level)} - ${node.label}`,
    }));
  }, [nodes]);

  const activityTimeline = useMemo(() => {
    if (!canonical) return [];
    return [
      {
        title: `${canonical.topology.connections.length} topology links loaded`,
        description: 'Graph view reflects canonical runtime connection state.',
        meta: `${canonical.topology.supportedActions.length} runtime actions available`,
      },
      {
        title: `${canonical.runtimeControl.sessions.length} runtime sessions observed`,
        description: 'Sessions are projected from gateway capabilities and status inference.',
        meta: `Fail-closed: ${canonical.topology.failClosed ? 'enabled' : 'disabled'}`,
      },
      {
        title: `${canonical.runtimeControl.channelBindings.length} channel bindings`,
        description: 'Bindings control handoff channels between topology levels.',
      },
    ];
  }, [canonical]);

  async function loadCanonical() {
    setError(null);
    try {
      const next = await getCanonicalStudioState();
      setCanonical(next);

      if (!selectedConnectionId && next.topology.connections[0]) {
        setSelectedConnectionId(next.topology.connections[0].id);
      }
      if (!fromNode && next.agency.id) {
        setFromNode(`agency:${next.agency.id}`);
      }
      if (!toNode && next.departments[0]?.id) {
        setToNode(`department:${next.departments[0].id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load topology');
    }
  }

  function parseRef(value: string): TopologyNodeRef {
    const [level, id] = value.split(':');
    if (!level || !id) {
      throw new Error('Invalid topology node reference');
    }
    if (!['agency', 'department', 'workspace', 'agent', 'subagent'].includes(level)) {
      throw new Error(`Unsupported topology node level: ${level}`);
    }
    return { level: level as TopologyNodeRef['level'], id };
  }

  async function runAction(action: TopologyRuntimeAction, connection?: ConnectionSpec) {
    const source = connection ? `${connection.from.level}:${connection.from.id}` : fromNode;
    const target = connection ? `${connection.to.level}:${connection.to.id}` : toNode;

    if (!source) {
      setError('Select source node');
      return;
    }

    setBusyAction(action);
    setError(null);
    setResult(null);

    try {
      const response = await triggerTopologyAction(action, {
        from: parseRef(source),
        to: target ? parseRef(target) : undefined,
      });
      setResult(response);
      await loadCanonical();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Topology action failed');
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    void loadCanonical();
  }, []);

  return (
    <StudioPageShell maxWidth={1440}>
      <StudioHeroSection
        eyebrow="Agency Graph"
        title="Agency Topology"
        description="Graph-first macro surface for runtime routing, link health, and connection controls."
        meta={
          <RuntimeStatusBadge
            status={canonical?.runtime.health.ok ? 'online' : 'degraded'}
            label={canonical?.runtime.health.ok ? 'runtime online' : 'runtime degraded'}
          />
        }
        actions={
          <button type="button" style={buttonStyle()} onClick={() => void loadCanonical()}>
            <RefreshCw size={14} />
            Refresh Topology
          </button>
        }
      />

      <section
        className="studio-responsive-four-col"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        <StudioKpiCard
          label="Connections"
          value={canonical?.topology.connections.length ?? 0}
          helper="Graph links"
          icon={<Network size={16} />}
        />
        <StudioKpiCard
          label="Supported Actions"
          value={canonical?.topology.supportedActions.length ?? 0}
          helper="Runtime capabilities"
          icon={<PlugZap size={16} />}
          tone={(canonical?.topology.supportedActions.length ?? 0) > 0 ? 'success' : 'warning'}
        />
        <StudioKpiCard
          label="Fail Closed"
          value={canonical?.topology.failClosed ? 'On' : 'Off'}
          helper="Topology safety contract"
          tone={canonical?.topology.failClosed ? 'success' : 'warning'}
          icon={<PauseCircle size={16} />}
        />
        <StudioKpiCard
          label="Runtime Sessions"
          value={canonical?.runtimeControl.sessions.length ?? 0}
          helper="Current activity"
          icon={<Activity size={16} />}
        />
      </section>

      <section className="studio-responsive-two-col" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(350px, 1fr)', gap: 14 }}>
        <StudioSectionCard
          title="Topology Surface"
          description="Select links on the graph to inspect state and execute runtime actions."
        >
          {!canonical ? (
            <StudioEmptyState
              title="Loading topology graph"
              description="Fetching canonical agency graph and runtime capabilities."
            />
          ) : (
            <div
              style={{
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-primary)',
                background:
                  'radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--border-primary) 88%, transparent) 1px, transparent 0)',
                backgroundSize: '26px 26px',
                padding: 10,
                minHeight: 480,
              }}
            >
              <svg width="100%" height="460" viewBox="0 0 980 460" role="img" aria-label="Agency topology graph">
                {canonical.topology.connections.map((connection) => {
                  const from = nodeMap.get(`${connection.from.level}:${connection.from.id}`);
                  const to = nodeMap.get(`${connection.to.level}:${connection.to.id}`);
                  if (!from || !to) return null;

                  const selected = selectedConnectionId === connection.id;
                  return (
                    <g key={connection.id}>
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={selected ? 'var(--color-primary)' : connectionStroke(connection.state)}
                        strokeWidth={selected ? 3 : 2}
                        strokeDasharray={connection.state === 'paused' ? '6 4' : undefined}
                        onClick={() => setSelectedConnectionId(connection.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </g>
                  );
                })}

                {nodes.map((node) => (
                  <g key={node.key} transform={`translate(${node.x - 68}, ${node.y - 24})`}>
                    <rect
                      width="136"
                      height="48"
                      rx="10"
                      fill="var(--card-bg)"
                      stroke="var(--border-primary)"
                      strokeWidth="1.2"
                    />
                    <text x="68" y="19" textAnchor="middle" fontSize="10" fill="var(--text-muted)">
                      {node.level.toUpperCase()}
                    </text>
                    <text x="68" y="34" textAnchor="middle" fontSize="12" fill="var(--text-primary)" fontWeight="700">
                      {truncate(node.label, 16)}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </StudioSectionCard>

        <StudioSectionCard title="Connection Inspector" description="Runtime controls for selected or manual source/target links.">
          {canonical ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <StudioInspectorCard title="Selected Link">
                {selectedConnection ? (
                  <>
                    <StudioMetricRow
                      label="From"
                      value={`${selectedConnection.from.level}:${selectedConnection.from.id}`}
                    />
                    <StudioMetricRow
                      label="To"
                      value={`${selectedConnection.to.level}:${selectedConnection.to.id}`}
                    />
                    <StudioMetricRow label="State" value={selectedConnection.state} />
                    <StudioMetricRow label="Direction" value={selectedConnection.direction} />
                  </>
                ) : (
                  <StudioEmptyState
                    title="No link selected"
                    description="Select a connection line from the graph to inspect it."
                  />
                )}
              </StudioInspectorCard>

              <StudioInspectorCard title="Manual Source / Target">
                <div style={{ display: 'grid', gap: 8 }}>
                  <select value={fromNode} onChange={(event) => setFromNode(event.target.value)} style={selectStyle}>
                    <option value="">Select source node</option>
                    {nodeOptions.map((node) => (
                      <option key={node.key} value={node.key}>
                        {node.label}
                      </option>
                    ))}
                  </select>
                  <select value={toNode} onChange={(event) => setToNode(event.target.value)} style={selectStyle}>
                    <option value="">Select target node</option>
                    {nodeOptions.map((node) => (
                      <option key={node.key} value={node.key}>
                        {node.label}
                      </option>
                    ))}
                  </select>
                </div>
              </StudioInspectorCard>

              <StudioInspectorCard title="Connection Actions">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  {ACTIONS.map((action) => {
                    const supported = canonical.topology.supportedActions.includes(action);
                    return (
                      <button
                        key={action}
                        type="button"
                        disabled={!supported || busyAction !== null}
                        onClick={() => void runAction(action, selectedConnection ?? undefined)}
                        style={{
                          ...buttonStyle(),
                          justifyContent: 'center',
                          opacity: !supported || busyAction !== null ? 0.6 : 1,
                          cursor: !supported || busyAction !== null ? 'not-allowed' : 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {iconForAction(action)}
                        {action}
                      </button>
                    );
                  })}
                </div>
              </StudioInspectorCard>

              <StudioInspectorCard title="Last Action Result">
                {!result ? (
                  <StudioEmptyState
                    title="No actions yet"
                    description="Execute a topology action to inspect fail-closed runtime response."
                  />
                ) : (
                  <>
                    <StudioMetricRow label="Action" value={result.action} />
                    <StudioMetricRow label="Status" value={result.status} />
                    <StudioMetricRow label="Message" value={result.message} />
                  </>
                )}
              </StudioInspectorCard>
            </div>
          ) : (
            <StudioEmptyState
              title="Topology unavailable"
              description="Could not load canonical topology for inspection."
            />
          )}
        </StudioSectionCard>
      </section>

      <section className="studio-responsive-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <StudioSectionCard title="Current Activity" description="Runtime sessions and capability matrix summary.">
          {!canonical ? (
            <StudioEmptyState title="No activity loaded" description="Refresh topology to load runtime activity." />
          ) : (
            <StudioInspectorCard title="Runtime Sessions">
              {canonical.runtimeControl.sessions.length === 0 ? (
                <StudioEmptyState
                  title="No runtime sessions"
                  description="Sessions will appear here when orchestration traffic is active."
                />
              ) : (
                canonical.runtimeControl.sessions.slice(0, 8).map((session) => (
                  <StudioMetricRow
                    key={session.ref.id}
                    label={session.ref.id.slice(0, 12)}
                    value={session.status}
                    hint={session.ref.channel || 'no-channel'}
                  />
                ))
              )}
            </StudioInspectorCard>
          )}
        </StudioSectionCard>

        <StudioSectionCard title="Topology Timeline" description="High-level status changes and control-plane posture.">
          {activityTimeline.length > 0 ? (
            <StudioTimelineBlock items={activityTimeline} />
          ) : (
            <StudioEmptyState title="No events yet" description="Timeline appears after topology data is loaded." />
          )}
        </StudioSectionCard>
      </section>

      {result && (
        <div style={result.status === 'applied' ? successBanner : warningBanner}>
          {result.status === 'applied' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {result.action}: {result.status} - {result.message}
        </div>
      )}

      {error && (
        <div style={dangerBanner}>
          <AlertTriangle size={14} />
          {error}
        </div>
      )}
    </StudioPageShell>
  );
}

function buildNodes(canonical: CanonicalStudioStateResponse | null): TopologyNodeView[] {
  if (!canonical) return [];

  const nodes: TopologyNodeView[] = [];

  nodes.push({
    key: `agency:${canonical.agency.id}`,
    label: canonical.agency.name,
    level: 'agency',
    id: canonical.agency.id,
    x: 170,
    y: 230,
  });

  canonical.departments.forEach((department, index) => {
    nodes.push({
      key: `department:${department.id}`,
      label: department.name,
      level: 'department',
      id: department.id,
      x: 470,
      y: 120 + index * 110,
    });
  });

  canonical.workspaces.forEach((workspace, index) => {
    nodes.push({
      key: `workspace:${workspace.id}`,
      label: workspace.name,
      level: 'workspace',
      id: workspace.id,
      x: 790,
      y: 90 + index * 74,
    });
  });

  return nodes;
}

function connectionStroke(state: ConnectionSpec['state']): string {
  if (state === 'connected') return 'var(--color-success)';
  if (state === 'paused') return 'var(--color-warning)';
  return 'var(--text-muted)';
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function iconForAction(action: TopologyRuntimeAction) {
  if (action === 'connect') return <PlugZap size={13} />;
  if (action === 'disconnect') return <Unplug size={13} />;
  if (action === 'pause') return <PauseCircle size={13} />;
  if (action === 'reactivate') return <PlayCircle size={13} />;
  return <Activity size={13} />;
}

function buttonStyle(): CSSProperties {
  return {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-primary)',
    background: 'var(--card-bg)',
    color: 'var(--text-primary)',
    padding: '8px 10px',
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  };
}

const selectStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  padding: '9px 10px',
  fontSize: 13,
};

const successBanner: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--tone-success-border)',
  background: 'var(--tone-success-bg)',
  color: 'var(--tone-success-text)',
  padding: '10px 12px',
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  fontSize: 13,
  fontWeight: 600,
};

const warningBanner: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--tone-warning-border)',
  background: 'var(--tone-warning-bg)',
  color: 'var(--tone-warning-text)',
  padding: '10px 12px',
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  fontSize: 13,
  fontWeight: 600,
};

const dangerBanner: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--tone-danger-border)',
  background: 'var(--tone-danger-bg)',
  color: 'var(--tone-danger-text)',
  padding: '10px 12px',
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  fontSize: 13,
  fontWeight: 600,
};
