import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  applyCoreFiles,
  getBuilderAgentFunction,
  getCanonicalStudioState,
  getVersions,
  previewCoreFiles,
  rollbackCoreFiles,
} from '../../../lib/api';
import { useHierarchy } from '../../../lib/HierarchyContext';
import type {
  AgencyBuilderTab,
  BuilderAgentFunctionOutput,
  CanonicalNodeLevel,
  CanonicalStudioStateResponse,
  CoreFilesPreviewResponse,
  VersionSnapshot,
} from '../../../lib/types';
import { AlertTriangle, Building2, GitBranch, Network, RefreshCw, RotateCcw, Wand2 } from 'lucide-react';

const TAB_LABEL: Record<AgencyBuilderTab, string> = {
  overview: 'Overview',
  topology: 'Topology',
  structure: 'Structure',
  routing: 'Routing & Channels',
  hooks: 'Hooks',
  versions: 'Versions',
  operations: 'Operations',
};

const TAB_VISIBILITY: Record<CanonicalNodeLevel, AgencyBuilderTab[]> = {
  agency: ['overview', 'topology', 'structure', 'routing', 'hooks', 'versions', 'operations'],
  department: ['overview', 'topology', 'structure', 'routing', 'hooks', 'versions', 'operations'],
  workspace: ['overview', 'topology', 'structure', 'routing', 'hooks', 'versions', 'operations'],
  agent: ['overview', 'structure', 'routing', 'hooks', 'versions', 'operations'],
  subagent: ['overview', 'structure', 'hooks', 'versions', 'operations'],
};

function parseTab(value: string | null): AgencyBuilderTab | null {
  if (
    value === 'overview' ||
    value === 'topology' ||
    value === 'structure' ||
    value === 'routing' ||
    value === 'hooks' ||
    value === 'versions' ||
    value === 'operations'
  ) {
    return value;
  }
  return null;
}

export default function AgencyBuilderPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedNode, selectedLineage, scope, selectByEntity, selectNode, tree, setBuilderTab } = useHierarchy();
  const [canonical, setCanonical] = useState<CanonicalStudioStateResponse | null>(null);
  const [builderOutput, setBuilderOutput] = useState<BuilderAgentFunctionOutput | null>(null);
  const [preview, setPreview] = useState<CoreFilesPreviewResponse | null>(null);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');

  const entityLevel = useMemo<CanonicalNodeLevel>(() => {
    if (!selectedNode) return 'agency';
    if (
      selectedNode.level === 'agency' ||
      selectedNode.level === 'department' ||
      selectedNode.level === 'workspace' ||
      selectedNode.level === 'agent' ||
      selectedNode.level === 'subagent'
    ) {
      return selectedNode.level;
    }
    return 'agency';
  }, [selectedNode]);

  const visibleTabs = TAB_VISIBILITY[entityLevel];
  const queryTab = parseTab(searchParams.get('tab'));
  const activeTab = visibleTabs.includes(queryTab ?? 'overview') ? (queryTab as AgencyBuilderTab | null) ?? visibleTabs[0] : visibleTabs[0];

  useEffect(() => {
    if (activeTab !== queryTab) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
    setBuilderTab(activeTab);
  }, [activeTab, queryTab, setBuilderTab, setSearchParams]);

  const scopedCounts = useMemo(() => {
    if (!canonical) {
      return { departments: 0, workspaces: 0, agents: 0, subagents: 0, skills: 0, tools: 0 };
    }

    const allAgents = [...canonical.agents, ...canonical.subagents];
    const selectedEntityId = scope.subagentId ?? scope.agentId;
    const selectedEntity = selectedEntityId ? allAgents.find((agent) => agent.id === selectedEntityId) ?? null : null;

    const scopedWorkspaces = canonical.workspaces.filter((workspace) => {
      if (scope.workspaceId) return workspace.id === scope.workspaceId;
      if (scope.departmentId) return workspace.departmentId === scope.departmentId;
      if (selectedEntity) return workspace.id === selectedEntity.workspaceId;
      return true;
    });

    const workspaceIds = new Set(scopedWorkspaces.map((workspace) => workspace.id));
    const scopedDepartments = canonical.departments.filter((department) =>
      scopedWorkspaces.some((workspace) => workspace.departmentId === department.id),
    );

    const scopedAgents = canonical.agents.filter((agent) => {
      if (scope.agentId) return agent.id === scope.agentId;
      if (scope.subagentId) return false;
      return workspaceIds.has(agent.workspaceId);
    });

    const scopedSubagents = canonical.subagents.filter((subagent) => {
      if (scope.subagentId) return subagent.id === scope.subagentId;
      if (scope.agentId) return subagent.parentAgentId === scope.agentId;
      return workspaceIds.has(subagent.workspaceId);
    });

    return {
      departments: scopedDepartments.length,
      workspaces: scopedWorkspaces.length,
      agents: scopedAgents.length,
      subagents: scopedSubagents.length,
      skills: canonical.catalog.skills.length,
      tools: canonical.catalog.tools.length,
    };
  }, [canonical, scope.agentId, scope.departmentId, scope.subagentId, scope.workspaceId]);

  const builderTarget = useMemo(() => {
    if (!selectedNode) return null;
    if (!['agency', 'department', 'workspace', 'agent', 'subagent'].includes(selectedNode.level)) {
      return null;
    }
    return { level: selectedNode.level as CanonicalNodeLevel, id: selectedNode.id };
  }, [selectedNode]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const canonicalState = await getCanonicalStudioState();
      setCanonical(canonicalState);
      const targetLevel: CanonicalNodeLevel = builderTarget?.level ?? 'agency';
      const targetId = builderTarget?.id ?? canonicalState.agency.id;

      let builder: BuilderAgentFunctionOutput;
      try {
        builder = await getBuilderAgentFunction(targetLevel, targetId);
      } catch {
        builder = await getBuilderAgentFunction('agency', canonicalState.agency.id);
      }

      const [corePreview, snapshots] = await Promise.all([previewCoreFiles(), getVersions()]);

      setBuilderOutput(builder);
      setPreview(corePreview);
      setVersions(snapshots);
      setSelectedSnapshotId((current) => current || snapshots[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Agency Builder');
    } finally {
      setBusy(false);
    }
  }, [builderTarget]);

  async function applyChanges() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await applyCoreFiles({ applyRuntime: true });
      if (!result.ok) {
        throw new Error(`Core files apply failed: ${(result.diagnostics ?? []).join(', ')}`);
      }
      setNotice('Core files applied successfully');
      setPreview(await previewCoreFiles());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply core files');
    } finally {
      setBusy(false);
    }
  }

  async function rollbackSnapshot() {
    if (!selectedSnapshotId) {
      setError('Select a snapshot to rollback');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await rollbackCoreFiles(selectedSnapshotId);
      if (!result.ok) {
        throw new Error(result.error ?? 'Rollback failed');
      }
      setNotice(result.message ?? 'Rollback completed');
      setPreview(await previewCoreFiles());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rollback snapshot');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  if (!scope.agencyId) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 16 }}>
        <section style={panelStyle}>
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Agency Builder</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No agency selected. Create or connect an agency to continue.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 16 }}>
      {(scope.departmentId || scope.workspaceId || scope.agentId || scope.subagentId) && (
        <section style={contextCardStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={contextEyebrowStyle}>Active Context</div>
            <div style={contextValueStyle}>{contextLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (scope.agencyId) {
                selectByEntity('agency', scope.agencyId);
                return;
              }
              if (tree.rootKey) {
                selectNode(tree.rootKey);
              }
            }}
            style={actionBtnStyle()}
          >
            Clear Context
          </button>
        </section>
      )}

      <section style={panelStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={18} />
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Agency Builder</h1>
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                Flowise-first macro surface for structure, topology and operational lifecycle.
              </p>
            </div>
          </div>
          <button onClick={() => void load()} disabled={busy} style={actionBtnStyle()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSearchParams({ tab }, { replace: true })}
              style={{
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
                background: activeTab === tab ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                color: activeTab === tab ? 'var(--color-primary)' : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'overview' && (
        <section style={panelStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
            <Stat label="Departments" value={scopedCounts.departments} />
            <Stat label="Workspaces" value={scopedCounts.workspaces} />
            <Stat label="Agents" value={scopedCounts.agents} />
            <Stat label="Subagents" value={scopedCounts.subagents} />
            <Stat label="Skills" value={scopedCounts.skills} />
            <Stat label="Tools" value={scopedCounts.tools} />
          </div>
        </section>
      )}

      {activeTab === 'structure' && (
        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Structure</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Agency hierarchy, lineage and active selection context.
          </p>
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={() => navigate('/workspace-studio')} style={actionBtnStyle('var(--btn-primary-bg)', 'var(--btn-primary-text)')}>
              Open Workspace Studio
            </button>
          </div>
        </section>
      )}

      {activeTab === 'topology' && (
        <section style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Network size={16} />
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Topology</h2>
          </div>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Runtime links and connection controls are managed from this macro surface.
          </p>
          {canonical?.topology.connections.length ? (
            <div style={{ marginTop: 12, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead style={{ background: 'var(--bg-secondary)' }}>
                  <tr>
                    <th style={thStyle}>From</th>
                    <th style={thStyle}>To</th>
                    <th style={thStyle}>State</th>
                    <th style={thStyle}>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {canonical.topology.connections.map((connection) => (
                    <tr key={connection.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                      <td style={tdStyle}>{connection.from.level}:{connection.from.id}</td>
                      <td style={tdStyle}>{connection.to.level}:{connection.to.id}</td>
                      <td style={tdStyle}>{connection.state}</td>
                      <td style={tdStyle}>{connection.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>No topology links in current context.</p>
          )}
        </section>
      )}

      {activeTab === 'routing' && (
        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Routing & Channels</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Channel bindings and route policies are exposed per active context level.
          </p>
          <pre style={codeBoxStyle}>{JSON.stringify(canonical?.runtimeControl.channelBindings ?? [], null, 2)}</pre>
        </section>
      )}

      {activeTab === 'hooks' && (
        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Hooks</h2>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            Hook orchestration is now contextualized by selected hierarchy level.
          </p>
          <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>Use Entity Editor for detailed hook assignment per level.</div>
        </section>
      )}

      {(activeTab === 'versions' || activeTab === 'operations') && (
        <section style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GitBranch size={16} />
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>{activeTab === 'versions' ? 'Versions' : 'Operations'}</h2>
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => void load()} disabled={busy} style={actionBtnStyle()}>
              Preview
            </button>
            <button onClick={() => void applyChanges()} disabled={busy} style={actionBtnStyle('var(--btn-primary-bg)', 'var(--btn-primary-text)')}>
              Apply
            </button>
            <select
              value={selectedSnapshotId}
              onChange={(event) => setSelectedSnapshotId(event.target.value)}
              style={{
                minWidth: 220,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--input-text)',
                padding: '8px 10px',
              }}
            >
              <option value="">Select rollback snapshot</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label ?? version.id}
                </option>
              ))}
            </select>
            <button onClick={() => void rollbackSnapshot()} disabled={busy || !selectedSnapshotId} style={actionBtnStyle()}>
              <RotateCcw size={14} />
              Rollback
            </button>
          </div>

          <section style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wand2 size={16} />
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)' }}>Builder Agent Function</h3>
            </div>
            {builderOutput ? (
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{builderOutput.whatItDoes}</p>
                <MetaRow label="Inputs" values={builderOutput.inputs} />
                <MetaRow label="Outputs" values={builderOutput.outputs} />
                <MetaRow label="Skills" values={builderOutput.skills} />
                <MetaRow label="Tools" values={builderOutput.tools} />
                <MetaRow label="Collaborators" values={builderOutput.collaborators} />
              </div>
            ) : (
              <p style={{ margin: '8px 0 0', color: 'var(--text-muted)' }}>No builder output available.</p>
            )}
          </section>

          {preview ? (
            <div style={{ marginTop: 12, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead style={{ background: 'var(--bg-secondary)' }}>
                  <tr>
                    <th style={thStyle}>Path</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.diff.map((item) => (
                    <tr key={item.path} style={{ borderTop: '1px solid var(--border-primary)' }}>
                      <td style={tdStyle}>{item.path}</td>
                      <td style={tdStyle}>{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>No diff preview available.</p>
          )}
        </section>
      )}

      {notice && (
        <div style={{ borderRadius: 'var(--radius-md)', background: 'rgba(16,185,129,0.15)', padding: 12, color: 'var(--text-primary)' }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.15)', padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: 20,
  display: 'grid',
  gap: 12,
};

const contextCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
};

const contextEyebrowStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 700,
};

const contextValueStyle: CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-primary)',
        padding: 12,
        background: 'var(--bg-secondary)',
      }}
    >
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function MetaRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>{values.length > 0 ? values.join(', ') : 'None'}</span>
    </div>
  );
}

function actionBtnStyle(bg = 'var(--bg-secondary)', color = 'var(--text-primary)'): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-primary)',
    background: bg,
    color,
    padding: '8px 12px',
    cursor: 'pointer',
  };
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const tdStyle: CSSProperties = {
  padding: '10px 12px',
  color: 'var(--text-primary)',
};

const codeBoxStyle: CSSProperties = {
  marginTop: 12,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 12,
  fontSize: 12,
  color: 'var(--text-muted)',
  maxHeight: 320,
  overflow: 'auto',
};
