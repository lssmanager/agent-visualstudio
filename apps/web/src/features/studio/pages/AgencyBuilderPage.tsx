import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyCoreFiles,
  getBuilderAgentFunction,
  getCanonicalStudioState,
  getVersions,
  previewCoreFiles,
  rollbackCoreFiles,
} from '../../../lib/api';
import type {
  BuilderAgentFunctionOutput,
  CanonicalStudioStateResponse,
  CanonicalNodeLevel,
  CoreFilesPreviewResponse,
  VersionSnapshot,
} from '../../../lib/types';
import { AlertTriangle, Building2, RefreshCw, RotateCcw, Wand2 } from 'lucide-react';
import { useHierarchy } from '../../../lib/HierarchyContext';

export default function AgencyBuilderPage() {
  const { selectedNode, selectedLineage, scope, selectByEntity, selectNode, tree } = useHierarchy();
  const [canonical, setCanonical] = useState<CanonicalStudioStateResponse | null>(null);
  const [builderOutput, setBuilderOutput] = useState<BuilderAgentFunctionOutput | null>(null);
  const [preview, setPreview] = useState<CoreFilesPreviewResponse | null>(null);
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');

  const scopedCounts = useMemo(() => {
    if (!canonical) {
      return {
        departments: 0,
        workspaces: 0,
        agents: 0,
        subagents: 0,
        skills: 0,
        tools: 0,
      };
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
    return {
      level: selectedNode.level as CanonicalNodeLevel,
      id: selectedNode.id,
    };
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

      const [corePreview, snapshots] = await Promise.all([
        previewCoreFiles(),
        getVersions(),
      ]);

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

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 16 }}>
      {(scope.departmentId || scope.workspaceId || scope.agentId || scope.subagentId) && (
        <section
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-primary)',
            background: 'var(--bg-primary)',
            padding: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Active Context
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contextLabel}
            </div>
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

      <section
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-primary)',
          padding: 20,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Building2 size={18} />
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Agency Builder</h1>
              <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                Setup Helper for Agency/Department/Workspace with canonical model.
              </p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            disabled={busy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              padding: '8px 12px',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
          <Stat label="Departments" value={scopedCounts.departments} />
          <Stat label="Workspaces" value={scopedCounts.workspaces} />
          <Stat label="Agents" value={scopedCounts.agents} />
          <Stat label="Subagents" value={scopedCounts.subagents} />
          <Stat label="Skills" value={scopedCounts.skills} />
          <Stat label="Tools" value={scopedCounts.tools} />
        </div>
      </section>

      <section
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-primary)',
          padding: 20,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wand2 size={16} />
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Builder Agent Function {builderTarget ? `(context: ${builderTarget.level})` : ''}</h2>
        </div>
        {builderOutput ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{builderOutput.whatItDoes}</p>
            <MetaRow label="Inputs" values={builderOutput.inputs} />
            <MetaRow label="Outputs" values={builderOutput.outputs} />
            <MetaRow label="Skills" values={builderOutput.skills} />
            <MetaRow label="Tools" values={builderOutput.tools} />
            <MetaRow label="Collaborators" values={builderOutput.collaborators} />
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No builder output available.</p>
        )}
      </section>

      <section
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-primary)',
          padding: 20,
          display: 'grid',
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Core Files Diff / Apply / Rollback</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => void load()}
            disabled={busy}
            style={actionBtnStyle()}
          >
            Preview
          </button>
          <button
            onClick={() => void applyChanges()}
            disabled={busy}
            style={actionBtnStyle('var(--btn-primary-bg)', 'var(--btn-primary-text)')}
          >
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
          <button
            onClick={() => void rollbackSnapshot()}
            disabled={busy || !selectedSnapshotId}
            style={actionBtnStyle('var(--bg-secondary)', 'var(--text-primary)')}
          >
            <RotateCcw size={14} />
            Rollback
          </button>
        </div>

        {preview ? (
          <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
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
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No diff preview available.</p>
        )}
      </section>

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
      <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
        {values.length > 0 ? values.join(', ') : 'None'}
      </span>
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
