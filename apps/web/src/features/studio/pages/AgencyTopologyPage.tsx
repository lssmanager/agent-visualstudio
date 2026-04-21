import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { getCanonicalStudioState, triggerTopologyAction } from '../../../lib/api';
import { useHierarchy } from '../../../lib/HierarchyContext';
import type {
  CanonicalStudioStateResponse,
  TopologyActionResult,
  TopologyNodeRef,
  TopologyRuntimeAction,
} from '../../../lib/types';
import { AlertTriangle, Network, PlugZap } from 'lucide-react';

const ACTIONS: TopologyRuntimeAction[] = [
  'connect',
  'disconnect',
  'pause',
  'reactivate',
  'redirect',
  'continue',
];

export default function AgencyTopologyPage() {
  const { scope, selectedLineage, selectByEntity, selectNode, tree } = useHierarchy();
  const [canonical, setCanonical] = useState<CanonicalStudioStateResponse | null>(null);
  const [fromNode, setFromNode] = useState<string>('');
  const [toNode, setToNode] = useState<string>('');
  const [busyAction, setBusyAction] = useState<TopologyRuntimeAction | null>(null);
  const [result, setResult] = useState<TopologyActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nodeOptions = useMemo(() => {
    if (!canonical) return [];
    const agencyNodes = [{ key: `agency:${canonical.agency.id}`, label: `Agency - ${canonical.agency.name}` }];
    const departmentNodes = canonical.departments.map((department) => ({
      key: `department:${department.id}`,
      label: `Department - ${department.name}`,
    }));
    const workspaceNodes = canonical.workspaces.map((workspace) => ({
      key: `workspace:${workspace.id}`,
      label: `Workspace - ${workspace.name}`,
    }));
    return [...agencyNodes, ...departmentNodes, ...workspaceNodes];
  }, [canonical]);

  const activeContextSourceNode = useMemo(() => {
    if (scope.workspaceId) return `workspace:${scope.workspaceId}`;
    if (scope.departmentId) return `department:${scope.departmentId}`;
    if (scope.agencyId) return `agency:${scope.agencyId}`;

    const workspaceNode = [...selectedLineage].reverse().find((node) => node.level === 'workspace');
    if (workspaceNode) return `workspace:${workspaceNode.id}`;
    const departmentNode = [...selectedLineage].reverse().find((node) => node.level === 'department');
    if (departmentNode) return `department:${departmentNode.id}`;
    const agencyNode = [...selectedLineage].reverse().find((node) => node.level === 'agency');
    if (agencyNode) return `agency:${agencyNode.id}`;
    return null;
  }, [scope.agencyId, scope.departmentId, scope.workspaceId, selectedLineage]);

  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');
  const hasScopedFilter = Boolean(scope.departmentId || scope.workspaceId || scope.agentId || scope.subagentId);

  function parseRef(value: string): TopologyNodeRef {
    const [level, id] = value.split(':');
    if (!level || !id) {
      throw new Error('Invalid topology node reference');
    }
    if (!['agency', 'department', 'workspace', 'agent', 'subagent'].includes(level)) {
      throw new Error(`Unsupported topology node level: ${level}`);
    }
    return {
      level: level as TopologyNodeRef['level'],
      id,
    };
  }

  async function loadCanonical() {
    setError(null);
    try {
      const next = await getCanonicalStudioState();
      setCanonical(next);
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

  async function runAction(action: TopologyRuntimeAction) {
    if (!fromNode) {
      setError('Select source node');
      return;
    }

    setBusyAction(action);
    setError(null);
    setResult(null);
    try {
      const response = await triggerTopologyAction(action, {
        from: parseRef(fromNode),
        to: toNode ? parseRef(toNode) : undefined,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Topology action failed');
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    void loadCanonical();
  }, []);

  useEffect(() => {
    if (!activeContextSourceNode) return;
    if (!nodeOptions.some((node) => node.key === activeContextSourceNode)) return;
    setFromNode((current) => current || activeContextSourceNode);
  }, [activeContextSourceNode, nodeOptions]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 16 }}>
      {hasScopedFilter && (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                if (activeContextSourceNode && nodeOptions.some((node) => node.key === activeContextSourceNode)) {
                  setFromNode(activeContextSourceNode);
                }
              }}
              style={actionBtnStyle()}
            >
              Use Context as Source
            </button>
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
          </div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Network size={18} />
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Agency Topology</h1>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Runtime controls are fail-closed. Unsupported actions return explicit runtime status.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <select
            value={fromNode}
            onChange={(event) => setFromNode(event.target.value)}
            style={selectStyle}
          >
            <option value="">Select source node</option>
            {nodeOptions.map((node) => (
              <option key={node.key} value={node.key}>
                {node.label}
              </option>
            ))}
          </select>
          <select
            value={toNode}
            onChange={(event) => setToNode(event.target.value)}
            style={selectStyle}
          >
            <option value="">Select target node</option>
            {nodeOptions.map((node) => (
              <option key={node.key} value={node.key}>
                {node.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ACTIONS.map((action) => {
            const supported = canonical?.topology.supportedActions.includes(action) ?? false;
            return (
              <button
                key={action}
                onClick={() => void runAction(action)}
                disabled={busyAction !== null || !supported}
                title={supported ? `Execute ${action}` : 'Unsupported by runtime (fail-closed)'}
                style={{
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-primary)',
                  background: !supported
                    ? 'var(--bg-tertiary)'
                    : busyAction === action
                      ? 'var(--color-primary-soft)'
                      : 'var(--bg-secondary)',
                  color: supported ? 'var(--text-primary)' : 'var(--text-muted)',
                  padding: '8px 12px',
                  cursor: busyAction !== null || !supported ? 'not-allowed' : 'pointer',
                }}
              >
                {action}
              </button>
            );
          })}
        </div>
      </section>

      <section
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-primary)',
          padding: 20,
          display: 'grid',
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Current Topology Graph</h2>
        {canonical?.topology.connections.length ? (
          <div style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
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
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>No topology connections available.</p>
        )}
      </section>

      {result && (
        <div
          style={{
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-primary)',
            background: result.status === 'applied' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.18)',
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <PlugZap size={14} />
          <span>
            {result.action}: {result.status} - {result.message}
          </span>
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

const selectStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  padding: '10px 12px',
};

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

function actionBtnStyle(): CSSProperties {
  return {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-primary)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    padding: '8px 10px',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    cursor: 'pointer',
  };
}
