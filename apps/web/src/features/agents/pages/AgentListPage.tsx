import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudioState } from '../../../lib/StudioStateContext';
import { useHierarchy } from '../../../lib/HierarchyContext';
import { Search, Plus, Users } from 'lucide-react';
import { PageHeader } from '../../../components';
import { AgentCard } from '../../../components/ui/AgentCard';
import { EmptySection } from '../../../components/ui/EmptySection';

export default function AgentListPage() {
  const { state } = useStudioState();
  const { scope, selectedLineage, tree, selectByEntity, selectNode, canonical } = useHierarchy();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const agents = state.agents || [];

  const departmentWorkspaceIds = useMemo(() => {
    if (!scope.departmentId || !canonical) return null;
    return new Set(
      canonical.workspaces
        .filter((workspace) => workspace.departmentId === scope.departmentId)
        .map((workspace) => workspace.id),
    );
  }, [canonical, scope.departmentId]);

  const scopedAgents = useMemo(() => {
    if (scope.subagentId) {
      return agents.filter((agent) => agent.id === scope.subagentId);
    }

    if (scope.agentId) {
      return agents.filter((agent) => agent.id === scope.agentId || agent.parentAgentId === scope.agentId);
    }

    if (scope.workspaceId) {
      return agents.filter((agent) => agent.workspaceId === scope.workspaceId);
    }

    if (scope.departmentId && departmentWorkspaceIds && departmentWorkspaceIds.size > 0) {
      return agents.filter((agent) => departmentWorkspaceIds.has(agent.workspaceId));
    }

    return agents;
  }, [agents, departmentWorkspaceIds, scope.agentId, scope.departmentId, scope.subagentId, scope.workspaceId]);

  const filteredAgents = useMemo(
    () => scopedAgents.filter((a) => a.name?.toLowerCase().includes(searchQuery.toLowerCase())),
    [scopedAgents, searchQuery],
  );

  const hasScopedFilter = Boolean(scope.subagentId || scope.agentId || scope.workspaceId || scope.departmentId);
  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Agents"
        description="Browse, search, and edit your workspace agents."
        icon={Users}
      />

      {hasScopedFilter && (
        <div
          style={{
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--shell-chip-border)',
            background: 'var(--shell-chip-bg)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Active Context
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            style={{
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--shell-chip-border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 8px',
              cursor: 'pointer',
            }}
          >
            Clear Context
          </button>
        </div>
      )}

      {agents.length === 0 ? (
        <EmptySection
          icon={Users}
          title="No agents yet"
          description="Create your first agent to get started."
          ctaLabel="Create Agent"
          onCta={() => navigate('/agents/new')}
        />
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: 34,
                  paddingRight: 12,
                  paddingTop: 10,
                  paddingBottom: 10,
                  fontSize: 'var(--text-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  outline: 'none',
                  transition: 'border-color var(--transition)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--input-focus)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--input-border)'; }}
              />
            </div>
            <button
              onClick={() => navigate('/agents/new')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 500,
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background var(--transition)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-bg)'; }}
            >
              <Plus size={14} />
              New Agent
            </button>
          </div>

          {/* Agent grid */}
          {filteredAgents.length === 0 && searchQuery ? (
            <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              No matches for &quot;{searchQuery}&quot;
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onClick={() => {
                    if (agent.kind === 'subagent') {
                      selectByEntity('subagent', agent.id);
                    } else {
                      selectByEntity('agent', agent.id);
                    }
                    navigate(`/agents/${agent.id}`);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
