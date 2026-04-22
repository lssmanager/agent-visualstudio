import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  FlaskConical,
  GitCompare,
  Lock,
  RadioTower,
} from 'lucide-react';

import type { AgentSpec, DeployPreview, FlowNode, SkillSpec } from '../../../lib/types';

interface PropertiesPanelProps {
  diagnostics: string[];
  deployPreview: DeployPreview | null;
  sessions: unknown[];
  selectedNodeId: string | null;
  selectedNode: FlowNode | null;
  agents: AgentSpec[];
  skills: SkillSpec[];
  runtimeOk: boolean;
}

type InspectorTab = 'selection' | 'runtime' | 'changes';
type DiffStatus = 'added' | 'updated' | 'deleted' | 'unchanged';

const STATUS_STYLE: Record<DiffStatus, { color: string; bg: string; border: string; prefix: string }> = {
  added: {
    color: 'var(--tone-success-text)',
    bg: 'var(--tone-success-bg)',
    border: 'var(--tone-success-border)',
    prefix: '+',
  },
  updated: {
    color: 'var(--tone-warning-text)',
    bg: 'var(--tone-warning-bg)',
    border: 'var(--tone-warning-border)',
    prefix: '~',
  },
  deleted: {
    color: 'var(--tone-danger-text)',
    bg: 'var(--tone-danger-bg)',
    border: 'var(--tone-danger-border)',
    prefix: '-',
  },
  unchanged: {
    color: 'var(--text-muted)',
    bg: 'var(--bg-secondary)',
    border: 'var(--border-primary)',
    prefix: '.',
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function inferNodeLabel(node: FlowNode | null): string | null {
  if (!node) return null;
  const config = asRecord(node.config);
  return config && typeof config.name === 'string' ? config.name : node.id;
}

function inferNodePurpose(config: Record<string, unknown> | null, linkedAgent: AgentSpec | null): string {
  if (config && typeof config.purpose === 'string') return config.purpose;
  if (config && typeof config.description === 'string') return config.description;
  if (linkedAgent?.description) return linkedAgent.description;
  return 'No purpose declared yet.';
}

function InspectorBlock({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section style={blockStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon}
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 900, color: 'var(--text-primary)' }}>{title}</h4>
      </div>
      {children}
    </section>
  );
}

function MetricRow({ label, value, valueTone = 'default' }: { label: string; value: ReactNode; valueTone?: 'default' | 'success' | 'warning' }) {
  const color =
    valueTone === 'success'
      ? 'var(--tone-success-text)'
      : valueTone === 'warning'
        ? 'var(--tone-warning-text)'
        : 'var(--text-primary)';
  return (
    <div style={metricRowStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <span style={{ color, textAlign: 'right', minWidth: 0, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function SelectionEmptyState({
  runtimeOk,
  diagnosticsCount,
  diffCount,
}: {
  runtimeOk: boolean;
  diagnosticsCount: number;
  diffCount: number;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={emptyStateStyle}>
          <div style={emptyStateIconStyle}>
            <span style={{ fontSize: 18 }}>🖱️</span>
          </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)' }}>No node selected</div>
          <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.45, color: 'var(--text-muted)' }}>
            Click a canvas node to pin this inspector to its contract, runtime context, and deploy impact.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <StatusMiniTile label="Runtime" value={runtimeOk ? 'Online' : 'Degraded'} tone={runtimeOk ? 'success' : 'warning'} />
        <StatusMiniTile label="Diagnostics" value={diagnosticsCount === 0 ? 'Clean' : String(diagnosticsCount)} tone={diagnosticsCount === 0 ? 'success' : 'warning'} />
        <StatusMiniTile label="Diff" value={String(diffCount)} tone={diffCount > 0 ? 'warning' : 'default'} />
      </div>
    </div>
  );
}

function StatusMiniTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneColor =
    tone === 'success'
      ? 'var(--tone-success-text)'
      : tone === 'warning'
        ? 'var(--tone-warning-text)'
        : 'var(--text-primary)';
  const toneBg =
    tone === 'success'
      ? 'var(--tone-success-bg)'
      : tone === 'warning'
        ? 'var(--tone-warning-bg)'
        : 'var(--shell-chip-bg)';
  const toneBorder =
    tone === 'success'
      ? 'var(--tone-success-border)'
      : tone === 'warning'
        ? 'var(--tone-warning-border)'
        : 'var(--shell-chip-border)';
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${toneBorder}`,
        background: toneBg,
        padding: '9px 10px',
        display: 'grid',
        gap: 2,
      }}
    >
      <span style={metricLabelStyle}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: toneColor }}>{value}</span>
    </div>
  );
}

function TagList({
  items,
  emptyLabel,
  tone = 'default',
}: {
  items: string[];
  emptyLabel: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  if (items.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emptyLabel}</div>;
  }

  const toneStyles =
    tone === 'success'
      ? {
          color: 'var(--tone-success-text)',
          background: 'var(--tone-success-bg)',
          border: 'var(--tone-success-border)',
        }
      : tone === 'warning'
        ? {
            color: 'var(--tone-warning-text)',
            background: 'var(--tone-warning-bg)',
            border: 'var(--tone-warning-border)',
          }
        : {
            color: 'var(--text-primary)',
            background: 'var(--bg-secondary)',
            border: 'var(--border-primary)',
          };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            borderRadius: 'var(--radius-full)',
            border: `1px solid ${toneStyles.border}`,
            background: toneStyles.background,
            color: toneStyles.color,
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function PropertiesPanel({
  diagnostics,
  deployPreview,
  sessions,
  selectedNodeId,
  selectedNode,
  agents,
  skills,
  runtimeOk,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>('selection');

  useEffect(() => {
    if (selectedNodeId) {
      setActiveTab('selection');
    }
  }, [selectedNodeId]);

  const config = useMemo(() => asRecord(selectedNode?.config), [selectedNode]);
  const selectedNodeLabel = useMemo(() => inferNodeLabel(selectedNode), [selectedNode]);

  const configuredAgentId = config && typeof config.agentId === 'string' ? config.agentId : null;
  const linkedAgent = useMemo(() => {
    if (!selectedNode) return null;
    if (configuredAgentId) return agents.find((agent) => agent.id === configuredAgentId) ?? null;
    if (selectedNode.type === 'agent' || selectedNode.type === 'subagent') {
      const matchingKind = selectedNode.type === 'subagent' ? 'subagent' : 'agent';
      return agents.find((agent) => agent.kind === matchingKind) ?? null;
    }
    return null;
  }, [agents, configuredAgentId, selectedNode]);

  const declaredSkills = useMemo(() => {
    const refs = toStringArray(config?.skills).concat(toStringArray(config?.skillRefs));
    if (refs.length > 0) return refs;
    return linkedAgent?.skillRefs?.length ? linkedAgent.skillRefs : [];
  }, [config, linkedAgent]);

  const declaredTools = useMemo(() => {
    const refs = toStringArray(config?.tools).concat(toStringArray(config?.toolRefs));
    if (refs.length > 0) return refs;
    return linkedAgent?.permissions?.tools ?? [];
  }, [config, linkedAgent]);

  const knownSkillSet = useMemo(() => new Set(skills.map((skill) => skill.name)), [skills]);
  const coveredSkills = useMemo(
    () => declaredSkills.filter((skill) => knownSkillSet.has(skill)),
    [declaredSkills, knownSkillSet],
  );
  const uncoveredSkills = useMemo(
    () => declaredSkills.filter((skill) => !knownSkillSet.has(skill)),
    [declaredSkills, knownSkillSet],
  );

  const runtimeSessions = useMemo(
    () =>
      sessions.map((session) => asRecord(session)).filter((session): session is Record<string, unknown> => Boolean(session)),
    [sessions],
  );

  const nodeSessionMatches = useMemo(() => {
    if (!selectedNode) return [];
    const nodeLower = selectedNode.id.toLowerCase();
    const linkedAgentId = linkedAgent?.id;

    return runtimeSessions.filter((session) => {
      const nodeId = typeof session.nodeId === 'string' ? session.nodeId.toLowerCase() : '';
      const activeAgentId = typeof session.agentId === 'string' ? session.agentId : null;
      return nodeId === nodeLower || (linkedAgentId ? activeAgentId === linkedAgentId : false);
    });
  }, [linkedAgent?.id, runtimeSessions, selectedNode]);

  const diffStats = useMemo(() => {
    const source = deployPreview?.diff ?? [];
    return {
      total: source.length,
      added: source.filter((entry) => entry.status === 'added').length,
      updated: source.filter((entry) => entry.status === 'updated').length,
      deleted: source.filter((entry) => entry.status === 'deleted').length,
      unchanged: source.filter((entry) => entry.status === 'unchanged').length,
    };
  }, [deployPreview]);

  const selectedNodeDiffEntries = useMemo(() => {
    if (!deployPreview || !selectedNode) return [];
    const candidates = [selectedNode.id, selectedNodeLabel]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    return deployPreview.diff.filter((entry) => candidates.some((candidate) => entry.path.toLowerCase().includes(candidate)));
  }, [deployPreview, selectedNode, selectedNodeLabel]);

  const inputSummary = toStringArray(config?.inputs);
  const outputSummary = toStringArray(config?.outputs);
  const purpose = inferNodePurpose(config, linkedAgent);

  const tabs: Array<{ id: InspectorTab; label: string; count?: string | number }> = [
    { id: 'selection', label: 'Selection', count: selectedNode ? String(selectedNode.type) : undefined },
    { id: 'runtime', label: 'Runtime', count: diagnostics.length + nodeSessionMatches.length },
    { id: 'changes', label: 'Changes', count: selectedNodeDiffEntries.length || diffStats.total },
  ];

  function renderSelectionTab() {
    if (!selectedNode || !selectedNodeId) {
      return <SelectionEmptyState runtimeOk={runtimeOk} diagnosticsCount={diagnostics.length} diffCount={diffStats.total} />;
    }

    return (
      <div style={contentStackStyle}>
        <InspectorBlock title="Node Identity" icon={<span style={{ fontSize: 13, color: 'var(--color-primary)' }}>🖱️</span>}>
          <MetricRow label="Name" value={selectedNodeLabel ?? selectedNode.id} />
          <MetricRow label="Type" value={String(selectedNode.type)} />
          <MetricRow label="Node ID" value={<code style={monoTextStyle}>{selectedNode.id}</code>} />
          <MetricRow label="Linked Agent" value={linkedAgent ? linkedAgent.name : 'None'} />
        </InspectorBlock>

        <InspectorBlock title="Intent + Contract" icon={<Lock size={13} style={{ color: 'var(--color-primary)' }} />}>
          <MetricRow label="Purpose" value={purpose} />
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <div>
              <div style={subLabelStyle}>Inputs</div>
              <TagList items={inputSummary} emptyLabel="No inputs declared" />
            </div>
            <div>
              <div style={subLabelStyle}>Outputs</div>
              <TagList items={outputSummary} emptyLabel="No outputs declared" />
            </div>
          </div>
        </InspectorBlock>

        <InspectorBlock title="Bindings + Capabilities" icon={<RadioTower size={13} style={{ color: 'var(--color-primary)' }} />}>
          <MetricRow label="Model" value={linkedAgent?.model ?? 'Inherited / none'} />
          <MetricRow label="Workspace" value={linkedAgent?.workspaceId ?? 'n/a'} />
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <div>
              <div style={subLabelStyle}>Skills in catalog</div>
              <TagList items={coveredSkills} emptyLabel="No resolved skills" tone={coveredSkills.length > 0 ? 'success' : 'default'} />
            </div>
            {uncoveredSkills.length > 0 ? (
              <div>
                <div style={subLabelStyle}>Unresolved skills</div>
                <TagList items={uncoveredSkills} emptyLabel="All skills resolved" tone="warning" />
              </div>
            ) : null}
            <div>
              <div style={subLabelStyle}>Tools</div>
              <TagList items={declaredTools} emptyLabel="No tools declared" />
            </div>
          </div>
        </InspectorBlock>

        <InspectorBlock title="Config Snapshot" icon={<FileCode2 size={13} style={{ color: 'var(--color-primary)' }} />}>
          <pre style={rawBlockStyle}>{JSON.stringify(selectedNode.config ?? {}, null, 2)}</pre>
        </InspectorBlock>
      </div>
    );
  }

  function renderRuntimeTab() {
    if (!selectedNode || !selectedNodeId) {
      return (
        <SelectionEmptyState runtimeOk={runtimeOk} diagnosticsCount={diagnostics.length} diffCount={diffStats.total} />
      );
    }

    return (
      <div style={contentStackStyle}>
        <InspectorBlock title="Execution Readiness" icon={<FlaskConical size={13} style={{ color: 'var(--color-primary)' }} />}>
          <MetricRow label="Runtime" value={runtimeOk ? 'Online' : 'Offline'} valueTone={runtimeOk ? 'success' : 'warning'} />
          <MetricRow
            label="Diagnostics"
            value={diagnostics.length === 0 ? 'Clean' : `${diagnostics.length} issue${diagnostics.length === 1 ? '' : 's'}`}
            valueTone={diagnostics.length === 0 ? 'success' : 'warning'}
          />
          <MetricRow
            label="Matched Sessions"
            value={String(nodeSessionMatches.length)}
            valueTone={nodeSessionMatches.length > 0 ? 'success' : 'default'}
          />
        </InspectorBlock>

        <InspectorBlock title="Compiler Diagnostics" icon={<AlertTriangle size={13} style={{ color: 'var(--color-primary)' }} />}>
          {diagnostics.length === 0 ? (
            <div style={cleanStateStyle}>
              <CheckCircle2 size={13} />
              No compile diagnostics for the current workspace.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {diagnostics.map((item) => (
                <div key={item} style={warnRowStyle}>
                  <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </InspectorBlock>

        <InspectorBlock title="Runtime Sessions" icon={<RadioTower size={13} style={{ color: 'var(--color-primary)' }} />}>
          {!runtimeOk ? (
            <div style={{ fontSize: 12, color: 'var(--tone-warning-text)' }}>
              Runtime is offline. Session inspection is read-only until the runtime reconnects.
            </div>
          ) : nodeSessionMatches.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              No active session matched this node or its linked agent.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {nodeSessionMatches.slice(0, 6).map((session, index) => {
                const sessionId = typeof session.id === 'string' ? session.id : `session-${index + 1}`;
                const status = typeof session.status === 'string' ? session.status : 'unknown';
                const channel = typeof session.channel === 'string' ? session.channel : 'n/a';
                return (
                  <div key={`${sessionId}-${index}`} style={sessionRowStyle}>
                    <code style={monoTextStyle}>{sessionId.slice(0, 18)}</code>
                    <span style={{ color: 'var(--text-muted)' }}>-</span>
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{status}</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>ch:{channel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </InspectorBlock>
      </div>
    );
  }

  function renderChangesTab() {
    return (
      <div style={contentStackStyle}>
        <InspectorBlock title="Node Impact" icon={<GitCompare size={13} style={{ color: 'var(--color-primary)' }} />}>
          {!deployPreview ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Run Preview Diff from Studio actions to inspect file impact from the current workspace state.
            </div>
          ) : !selectedNode ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Select a node to narrow deploy impact to a specific canvas element.
            </div>
          ) : selectedNodeDiffEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              No diff entries directly reference "{selectedNodeLabel ?? selectedNode.id}".
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {selectedNodeDiffEntries.map((entry) => {
                const style = STATUS_STYLE[entry.status as DiffStatus] ?? STATUS_STYLE.unchanged;
                return (
                  <div key={entry.path} style={{ ...diffRowStyle, color: style.color, background: style.bg, borderColor: style.border }}>
                    <span style={{ width: 12, textAlign: 'center', fontWeight: 900, flexShrink: 0 }}>{style.prefix}</span>
                    <code style={{ ...monoTextStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.path}</code>
                  </div>
                );
              })}
            </div>
          )}
        </InspectorBlock>

        <InspectorBlock title="Deploy Summary" icon={<FileCode2 size={13} style={{ color: 'var(--color-primary)' }} />}>
          <MetricRow label="Total files" value={diffStats.total} />
          <MetricRow label="Added" value={diffStats.added} />
          <MetricRow label="Updated" value={diffStats.updated} />
          <MetricRow label="Deleted" value={diffStats.deleted} />
          <MetricRow label="Unchanged" value={diffStats.unchanged} />
        </InspectorBlock>

        <InspectorBlock title="Preview Diagnostics" icon={<AlertTriangle size={13} style={{ color: 'var(--color-primary)' }} />}>
          {!deployPreview ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Diff preview not loaded yet.</div>
          ) : deployPreview.diagnostics.length === 0 ? (
            <div style={cleanStateStyle}>
              <CheckCircle2 size={13} />
              Preview diagnostics are clean.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {deployPreview.diagnostics.map((item) => (
                <div key={item} style={warnRowStyle}>
                  <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </InspectorBlock>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--shell-panel-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={headerStyle}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={headerKickerStyle}>Studio Inspector</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 900,
                color: selectedNodeLabel ? 'var(--text-primary)' : 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {selectedNodeLabel ?? 'Canvas focus required'}
            </div>
            {selectedNode ? <span style={typeBadgeStyle}>{String(selectedNode.type)}</span> : null}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <StatusMiniTile label="Selection" value={selectedNode ? 'Pinned' : 'Idle'} tone={selectedNode ? 'success' : 'default'} />
          <StatusMiniTile label="Runtime" value={runtimeOk ? 'Online' : 'Degraded'} tone={runtimeOk ? 'success' : 'warning'} />
          <StatusMiniTile label="Preview" value={deployPreview ? `${diffStats.total} files` : 'Not loaded'} tone={deployPreview ? 'default' : 'warning'} />
        </div>
      </div>

      <div style={tabShellStyle}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                border: '1px solid',
                borderColor: isActive ? 'color-mix(in srgb, var(--color-primary) 26%, var(--border-primary))' : 'transparent',
                borderRadius: 12,
                padding: '8px 10px',
                display: 'grid',
                gap: 2,
                textAlign: 'left',
                cursor: 'pointer',
                background: isActive ? 'var(--color-primary-soft)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 900 }}>{tab.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tab.count ?? 'Ready'}</span>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 16px' }}>
        {activeTab === 'selection' && renderSelectionTab()}
        {activeTab === 'runtime' && renderRuntimeTab()}
        {activeTab === 'changes' && renderChangesTab()}
      </div>
    </div>
  );
}

const contentStackStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
};

const blockStyle: CSSProperties = {
  border: '1px solid var(--border-primary)',
  background: 'linear-gradient(180deg, var(--shell-chip-bg), var(--bg-primary, #fff))',
  borderRadius: 14,
  padding: 12,
};

const metricRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  padding: '8px 0',
  borderBottom: '1px solid var(--border-secondary)',
  fontSize: 12,
};

const metricLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  flexShrink: 0,
};

const subLabelStyle: CSSProperties = {
  marginBottom: 6,
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
};

const monoTextStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: 'var(--text-primary)',
};

const rawBlockStyle: CSSProperties = {
  margin: 0,
  borderRadius: 10,
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 10,
  maxHeight: 220,
  overflow: 'auto',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
};

const warnRowStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--tone-warning-text)',
  background: 'var(--tone-warning-bg)',
  borderRadius: 8,
  border: '1px solid var(--tone-warning-border)',
  padding: '6px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const sessionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 8px',
  borderRadius: 8,
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-primary)',
  fontSize: 11,
  color: 'var(--text-primary)',
};

const diffRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 8,
  border: '1px solid var(--border-primary)',
  padding: '7px 8px',
  fontSize: 11,
};

const cleanStateStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--tone-success-text)',
};

const emptyStateStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: '18px 14px',
  borderRadius: 14,
  border: '1px dashed var(--border-primary)',
  background: 'linear-gradient(180deg, var(--shell-chip-bg), color-mix(in srgb, var(--shell-panel-bg) 84%, transparent))',
  textAlign: 'center',
};

const emptyStateIconStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 12,
  background: 'var(--color-primary-soft)',
  border: '1px solid color-mix(in srgb, var(--color-primary) 26%, transparent)',
  display: 'grid',
  placeItems: 'center',
  margin: '0 auto',
  color: 'var(--color-primary)',
};

const headerStyle: CSSProperties = {
  padding: '14px 14px 12px',
  borderBottom: '1px solid var(--border-primary)',
  display: 'grid',
  gap: 12,
  background: 'linear-gradient(180deg, var(--shell-chip-bg), color-mix(in srgb, var(--shell-panel-bg) 96%, transparent))',
  flexShrink: 0,
};

const headerKickerStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 900,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
  color: 'var(--text-muted)',
};

const tabShellStyle: CSSProperties = {
  padding: '8px 14px',
  borderBottom: '1px solid var(--border-secondary)',
  background: 'var(--shell-chip-bg)',
  display: 'flex',
  gap: 6,
};

const typeBadgeStyle: CSSProperties = {
  borderRadius: 999,
  border: '1px solid var(--border-primary)',
  fontSize: 10,
  padding: '3px 8px',
  color: 'var(--text-primary)',
  background: 'var(--bg-secondary)',
  fontWeight: 800,
  textTransform: 'capitalize',
};
