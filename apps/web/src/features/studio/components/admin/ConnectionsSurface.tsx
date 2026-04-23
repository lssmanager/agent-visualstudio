import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Network, Route, Radio, Anchor, CheckCircle, XCircle, PauseCircle } from 'lucide-react';

import type {
  CanonicalNodeLevel,
  DashboardConnectionsDto,
  ConnectionsMeteringDto,
  ConnectionsRadialDto,
  ConnectionsDependencyGraphDto,
  ConnectionsTopologyDto,
  ConnectionsFlowGraphDto,
  ConnectionsRoutingDecisionFlowDto,
  ConnectionsOrgChartDto,
  ConnectionsHierarchyDto,
} from '../../../../lib/types';
import {
  getConnectionsMetering,
  getConnectionsRadial,
  getConnectionsDependencyGraph,
  getConnectionsTopology,
  getConnectionsFlowGraph,
  getConnectionsRoutingDecisionFlow,
  getConnectionsOrgChart,
  getConnectionsHierarchy,
} from '../../../../lib/api';
import { RadialGauge, TopologyGraph, FlowSankey } from '../../../../components/ui/Charts';
import { AnalyticsStateBoundary } from '../../../analytics/components/AnalyticsStateBoundary';
import { TimeWindowSelector } from '../../../analytics/components/TimeWindowSelector';
import { PlannedVisualQueue } from '../../../analytics/components/PlannedVisualQueue';
import type { AnalyticsWindow } from '../../../analytics/types';

const EDGE_STATE_CONFIG = {
  connected:    { icon: CheckCircle, color: 'var(--tone-success-text, #10b981)', bg: 'var(--tone-success-bg, rgba(16,185,129,0.08))', label: 'Connected' },
  paused:       { icon: PauseCircle, color: 'var(--tone-warning-text, #f59e0b)', bg: 'var(--tone-warning-bg, rgba(245,158,11,0.08))', label: 'Paused' },
  disconnected: { icon: XCircle,     color: 'var(--tone-danger-text, #ef4444)',  bg: 'var(--tone-danger-bg, rgba(239,68,68,0.08))',  label: 'Disconnected' },
} as const;

export function ConnectionsSurface({ data }: { data: DashboardConnectionsDto }) {
  const { totalEdges, connectedEdges, pausedEdges, disconnectedEdges } = data.dependencySummary;
  const connPct = totalEdges > 0 ? Math.round((connectedEdges / totalEdges) * 100) : 0;
  const level = data.scope.level as CanonicalNodeLevel;
  const id = data.scope.id;
  const [window, setWindow] = useState<AnalyticsWindow>('24H');

  const [metering, setMetering] = useState<ConnectionsMeteringDto | null>(null);
  const [radial, setRadial] = useState<ConnectionsRadialDto | null>(null);
  const [depGraph, setDepGraph] = useState<ConnectionsDependencyGraphDto | null>(null);
  const [topology, setTopology] = useState<ConnectionsTopologyDto | null>(null);
  const [flowGraph, setFlowGraph] = useState<ConnectionsFlowGraphDto | null>(null);
  const [routingFlow, setRoutingFlow] = useState<ConnectionsRoutingDecisionFlowDto | null>(null);
  const [orgChart, setOrgChart] = useState<ConnectionsOrgChartDto | null>(null);
  const [hierarchySunburst, setHierarchySunburst] = useState<ConnectionsHierarchyDto | null>(null);
  const [hierarchyTreemap, setHierarchyTreemap] = useState<ConnectionsHierarchyDto | null>(null);

  useEffect(() => {
    void getConnectionsMetering(level, id, window).then(setMetering).catch(() => null);
    void getConnectionsRadial(level, id, window).then(setRadial).catch(() => null);
    void getConnectionsDependencyGraph(level, id, window).then(setDepGraph).catch(() => null);
    void getConnectionsTopology(level, id, window).then(setTopology).catch(() => null);
    void getConnectionsFlowGraph(level, id, window).then(setFlowGraph).catch(() => null);
    void getConnectionsRoutingDecisionFlow(level, id, window).then(setRoutingFlow).catch(() => null);
    void getConnectionsOrgChart(level, id, window).then(setOrgChart).catch(() => null);
    void getConnectionsHierarchy(level, id, 'sunburst', window).then(setHierarchySunburst).catch(() => null);
    void getConnectionsHierarchy(level, id, 'treemap', window).then(setHierarchyTreemap).catch(() => null);
  }, [level, id, window]);

  return (
    <section style={panelStyle}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Connections</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Network size={12} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {data.nodes.length} nodes · {totalEdges} edges
          </span>
        </div>
      </div>
      <TimeWindowSelector value={window} onChange={setWindow} />

      {/* ── Lane Summary ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
        <LaneCard icon={<Network size={13} />} title="Edges"    value={totalEdges}                                    detail={`${connectedEdges} connected`}       tone={disconnectedEdges > 0 ? 'danger' : pausedEdges > 0 ? 'warning' : 'success'} />
        <LaneCard icon={<Route size={13} />}   title="Routing"  value={data.routingRules.length}                      detail="rules defined"                       tone="default" />
        <LaneCard icon={<Radio size={13} />}   title="Channels" value={data.channelBindings.filter((b) => b.enabled).length} detail={`${data.channelBindings.length} total`} tone="default" />
        <LaneCard icon={<Anchor size={13} />}  title="Hooks"    value={data.hookBindings.filter((b) => b.enabled).length}   detail={`${data.hookBindings.length} total`}    tone={data.hookBindings.filter((b) => b.enabled).length === 0 ? 'warning' : 'default'} />
      </div>

      {/* ── Metering radial gauges ────────────────────────────────── */}
      {metering && (
        <AnalyticsStateBoundary state={metering.state ?? 'ready'} title="Connections metering">
        <div style={sectionCard}>
          <div style={cardLabel}>Health Meters</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginTop: 12 }}>
            <RadialGauge
              value={metering.meters.supportedEdges.pct}
              size={64}
              color="var(--color-primary)"
              label="Supported edges"
            />
            <RadialGauge
              value={metering.meters.hookCoverage.pct}
              size={64}
              color="var(--tone-success-text, #10b981)"
              label="Hook coverage"
            />
            <RadialGauge
              value={metering.meters.routingStability.pct}
              size={64}
              color="#8b5cf6"
              label="Routing stability"
            />
            <RadialGauge
              value={metering.meters.handoffPressure.pct}
              size={64}
              color={metering.meters.handoffPressure.pct > 75 ? 'var(--tone-warning-text, #f59e0b)' : 'var(--tone-success-text, #10b981)'}
              label="Handoff pressure"
            />
          </div>
        </div>
        </AnalyticsStateBoundary>
      )}

      {/* ── Radial summary ─────────────────────────────────────────── */}
      {radial && (
        <AnalyticsStateBoundary state={radial.state ?? 'ready'} title="Connections radial">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <RadialSummaryCard
            title="Edges"
            total={radial.edges.total}
            items={[
              { label: 'Connected',    value: radial.edges.connected,    color: 'var(--tone-success-text, #10b981)' },
              { label: 'Paused',       value: radial.edges.paused,       color: 'var(--tone-warning-text, #f59e0b)' },
              { label: 'Disconnected', value: radial.edges.disconnected, color: 'var(--tone-danger-text, #ef4444)' },
            ]}
          />
          <RadialSummaryCard
            title="Hooks"
            total={radial.hooks.total}
            items={[
              { label: 'Enabled',  value: radial.hooks.enabled,                    color: 'var(--tone-success-text, #10b981)' },
              { label: 'Disabled', value: radial.hooks.total - radial.hooks.enabled, color: 'var(--text-muted)' },
            ]}
          />
          <RadialSummaryCard
            title="Channels"
            total={radial.channels.total}
            items={[
              { label: 'Enabled',  value: radial.channels.enabled,                       color: 'var(--color-primary)' },
              { label: 'Disabled', value: radial.channels.total - radial.channels.enabled, color: 'var(--text-muted)' },
            ]}
          />
        </div>
        </AnalyticsStateBoundary>
      )}

      {/* ── Edge connectivity meter ───────────────────────────────── */}
      {!metering && (
        <div style={sectionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={cardLabel}>Edge Connectivity</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: connPct > 80 ? 'var(--tone-success-text, #10b981)' : connPct > 50 ? 'var(--tone-warning-text, #f59e0b)' : 'var(--tone-danger-text, #ef4444)' }}>
              {connPct}%
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--border-primary)', overflow: 'hidden', display: 'flex' }}>
            {connectedEdges > 0 && <div style={{ height: '100%', width: `${connPct}%`, background: 'var(--tone-success-text, #10b981)', transition: 'width 0.4s' }} />}
            {pausedEdges > 0 && <div style={{ height: '100%', width: `${totalEdges > 0 ? Math.round((pausedEdges / totalEdges) * 100) : 0}%`, background: 'var(--tone-warning-text, #f59e0b)' }} />}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <Legend color="var(--tone-success-text, #10b981)" label={`${connectedEdges} connected`} />
            {pausedEdges > 0 && <Legend color="var(--tone-warning-text, #f59e0b)" label={`${pausedEdges} paused`} />}
            {disconnectedEdges > 0 && <Legend color="var(--tone-danger-text, #ef4444)" label={`${disconnectedEdges} disconnected`} />}
          </div>
        </div>
      )}

      {/* ── Topology graph ────────────────────────────────────────── */}
      {topology && topology.nodes.length > 0 && (
        <AnalyticsStateBoundary state={topology.state ?? 'ready'} title="Topology graph">
        <div style={sectionCard}>
          <div style={cardLabel}>Topology</div>
          <div style={{ marginTop: 8 }}>
            <TopologyGraph nodes={topology.nodes} edges={topology.edges} height={220} />
          </div>
        </div>
        </AnalyticsStateBoundary>
      )}

      {/* ── Dependency graph ──────────────────────────────────────── */}
      {depGraph && depGraph.nodes.length > 1 && !topology?.nodes.length && (
        <AnalyticsStateBoundary state={depGraph.state ?? 'ready'} title="Dependency graph">
        <div style={sectionCard}>
          <div style={cardLabel}>Dependency Graph</div>
          <div style={{ marginTop: 8 }}>
            <TopologyGraph nodes={depGraph.nodes} edges={depGraph.edges} height={200} />
          </div>
        </div>
        </AnalyticsStateBoundary>
      )}

      {/* ── Flow graph (Sankey) ───────────────────────────────────── */}
      {flowGraph && flowGraph.links.length > 0 && (
        <AnalyticsStateBoundary state={flowGraph.state ?? 'ready'} title="Flow graph">
        <div style={sectionCard}>
          <div style={cardLabel}>Agent Flow</div>
          <div style={{ marginTop: 8 }}>
            <FlowSankey nodes={flowGraph.nodes} links={flowGraph.links} height={160} />
          </div>
        </div>
        </AnalyticsStateBoundary>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={sectionCard}>
          <div style={cardLabel}>Routing Decision Flow (P1)</div>
          {routingFlow ? (
            <AnalyticsStateBoundary state={routingFlow.state ?? 'ready'} title="Routing decision flow">
              <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                {routingFlow.steps.map((step) => (
                  <div key={step.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-primary)' }}>{step.label}</span>
                    <span style={{ color: step.outcome === 'critical' ? 'var(--tone-danger-text, #ef4444)' : step.outcome === 'warning' ? 'var(--tone-warning-text, #f59e0b)' : 'var(--tone-success-text, #10b981)' }}>
                      {step.volume}
                    </span>
                  </div>
                ))}
              </div>
            </AnalyticsStateBoundary>
          ) : <AnalyticsStateBoundary state="planned_not_operational" title="Routing decision flow" />}
        </div>

        <div style={sectionCard}>
          <div style={cardLabel}>Org Chart (P1)</div>
          {orgChart ? (
            <AnalyticsStateBoundary state={orgChart.state ?? 'ready'} title="Org chart">
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {orgChart.nodes.slice(0, 10).map((node) => (
                  <div key={node.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ color: 'var(--text-primary)' }}>{node.level}: {node.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{node.activity}</span>
                  </div>
                ))}
              </div>
            </AnalyticsStateBoundary>
          ) : <AnalyticsStateBoundary state="planned_not_operational" title="Org chart" />}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={sectionCard}>
          <div style={cardLabel}>Hierarchy Sunburst (P1)</div>
          {hierarchySunburst ? (
            <AnalyticsStateBoundary state={hierarchySunburst.state ?? 'ready'} title="Hierarchy sunburst">
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {hierarchySunburst.nodes.slice(0, 8).map((node) => (
                  <div key={node.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ color: 'var(--text-primary)' }}>{node.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{node.value}</span>
                  </div>
                ))}
              </div>
            </AnalyticsStateBoundary>
          ) : <AnalyticsStateBoundary state="planned_not_operational" title="Hierarchy sunburst" />}
        </div>

        <div style={sectionCard}>
          <div style={cardLabel}>Hierarchy Treemap (P1)</div>
          {hierarchyTreemap ? (
            <AnalyticsStateBoundary state={hierarchyTreemap.state ?? 'ready'} title="Hierarchy treemap">
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {hierarchyTreemap.nodes.slice(0, 8).map((node) => (
                  <div key={node.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ color: 'var(--text-primary)' }}>{node.label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{node.value}</span>
                  </div>
                ))}
              </div>
            </AnalyticsStateBoundary>
          ) : <AnalyticsStateBoundary state="planned_not_operational" title="Hierarchy treemap" />}
        </div>
      </div>

      {/* ── Edge list ──────────────────────────────────────────────── */}
      {data.edges.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={sectionLabel}>Topology Edges</div>
          {data.edges.slice(0, 6).map((edge) => {
            const cfg = EDGE_STATE_CONFIG[edge.state] ?? EDGE_STATE_CONFIG.disconnected;
            const StateIcon = cfg.icon;
            return (
              <div key={edge.id} style={{ ...edgeRow, background: cfg.bg }}>
                <StateIcon size={12} style={{ color: cfg.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={levelChip}>{edge.from.level}</span>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{edge.from.id}</code>
                    {' → '}
                    <span style={levelChip}>{edge.to.level}</span>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{edge.to.id}</code>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>
                  {edge.direction === 'bidirectional' && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>⇄</span>}
                </div>
              </div>
            );
          })}
          {data.edges.length > 6 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              +{data.edges.length - 6} more edges
            </div>
          )}
        </div>
      )}

      {/* ── Routing rules ──────────────────────────────────────────── */}
      {data.routingRules.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={sectionLabel}>Routing Rules</div>
          {data.routingRules.slice(0, 5).map((rule) => (
            <div key={rule.id} style={ruleRow}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 16, flexShrink: 0, fontWeight: 700 }}>{rule.priority}</span>
              <span style={{ fontSize: 11, flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {rule.from} → {rule.to}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {rule.when}
              </span>
            </div>
          ))}
          {data.routingRules.length > 5 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>+{data.routingRules.length - 5} more rules</div>
          )}
        </div>
      )}

      {/* ── Channel bindings ───────────────────────────────────────── */}
      {data.channelBindings.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={sectionLabel}>Channel Bindings</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {data.channelBindings.map((b) => (
              <span key={b.id} style={{ ...channelChip, background: b.enabled ? 'var(--color-primary-soft)' : 'var(--bg-tertiary)', color: b.enabled ? 'var(--color-primary)' : 'var(--text-muted)', border: `1px solid ${b.enabled ? 'var(--color-primary)' : 'var(--border-primary)'}` }}>
                {b.channel}{!b.enabled && ' (off)'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────── */}
      {data.edges.length === 0 && data.routingRules.length === 0 && !topology?.nodes.length && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
          No topology connections in this scope.
        </div>
      )}

      <PlannedVisualQueue
        title="P2 Refinements"
        items={[
          { id: 'cn-p2-1', label: 'Edge Reliability Confidence Map', note: 'Needs historical edge success/failure rollups by link.' },
          { id: 'cn-p2-2', label: 'Hook Blast-Radius Overlay', note: 'Needs dependency impact index for hook-trigger cascades.' },
          { id: 'cn-p2-3', label: 'Routing Drift Detector', note: 'Needs baseline-vs-current routing decision snapshots.' },
        ]}
      />
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type Tone = 'default' | 'success' | 'warning' | 'danger';

function toneColor(tone: Tone) {
  switch (tone) {
    case 'success': return 'var(--tone-success-text, #10b981)';
    case 'warning': return 'var(--tone-warning-text, #f59e0b)';
    case 'danger':  return 'var(--tone-danger-text, #ef4444)';
    default:        return 'var(--text-primary)';
  }
}

function LaneCard({ icon, title, value, detail, tone }: { icon: ReactNode; title: string; value: number; detail: string; tone: Tone }) {
  const color = toneColor(tone);
  return (
    <div style={laneCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
        {icon}
        <span style={cardLabel}>{title}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{detail}</div>
    </div>
  );
}

function RadialSummaryCard({ title, total, items }: { title: string; total: number; items: Array<{ label: string; value: number; color: string }> }) {
  return (
    <div style={sectionCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={cardLabel}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{total}</span>
      </div>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.map((item) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={item.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{item.label}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: item.color }}>{item.value}</span>
              </div>
              <div style={{ height: 3, background: 'var(--border-primary)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: item.color, borderRadius: 99 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: 16,
  display: 'grid',
  gap: 14,
};

const sectionCard: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 12,
};

const laneCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: '10px 12px',
};

const edgeRow: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  padding: '7px 10px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const ruleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  borderBottom: '1px solid var(--border-primary)',
};

const cardLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
};

const sectionLabel: CSSProperties = { ...cardLabel };

const levelChip: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  borderRadius: 3,
  padding: '1px 4px',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-muted)',
  marginRight: 3,
  textTransform: 'uppercase',
};

const channelChip: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 999,
  padding: '2px 8px',
};
