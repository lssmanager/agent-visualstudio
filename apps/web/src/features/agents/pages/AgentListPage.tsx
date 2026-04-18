import { useState, useMemo } from 'react';
import { useStudioState } from '../../../lib/StudioStateContext';
import { AgentSpec } from '../../../lib/types';
import { AgentEditorForm } from '../components/AgentEditorForm';
import { Search, Plus, Users } from 'lucide-react';
import { PageHeader, Badge, Toast } from '../../../components';
import { AgentCard } from '../../../components/ui/AgentCard';

export default function AgentListPage() {
  const { state, refresh } = useStudioState();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]         = useState('');
  const [creating, setCreating]               = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const agents = state.agents || [];

  const filteredAgents = useMemo(
    () => agents.filter((a) => a.name?.toLowerCase().includes(searchQuery.toLowerCase())),
    [agents, searchQuery],
  );

  const selectedAgent = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : agents[0];

  /* ── No agents state ──────────────────────────────── */
  if (agents.length === 0 && !creating) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Agents"
          description="Browse, search, and edit your workspace agents."
          icon={Users}
        />

        <div
          className="rounded-xl border p-16 flex flex-col items-center justify-center text-center gap-4"
          style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
        >
          <Users size={48} style={{ color: 'var(--text-muted)' }} />
          <div>
            <p className="text-base font-heading font-semibold" style={{ color: 'var(--text-primary)' }}>
              No agents yet
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Create your first agent to get started.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--color-primary)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary)'; }}
          >
            <Plus size={16} />
            Create Agent
          </button>
        </div>

        {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Agents"
        description="Browse, search, and edit your workspace agents."
        icon={Users}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 items-start">

        {/* ── Left: Agent grid ──────────────────────── */}
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search agents…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border focus:outline-none transition"
                style={{
                  background:  'var(--input-bg)',
                  borderColor: 'var(--input-border)',
                  color:       'var(--input-text)',
                }}
              />
            </div>
            <button
              onClick={() => { setCreating(true); setSelectedAgentId(null); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0 transition-colors"
              style={{ background: 'var(--color-primary)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary)'; }}
            >
              <Plus size={14} />
              New
            </button>
          </div>

          {/* Cards */}
          {filteredAgents.length === 0 && searchQuery ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
              No matches for "{searchQuery}"
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  selected={!creating && (selectedAgentId === agent.id || (!selectedAgentId && agent === agents[0]))}
                  onClick={() => { setSelectedAgentId(agent.id); setCreating(false); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Editor panel ───────────────────── */}
        <div>
          {creating ? (
            <div
              className="rounded-xl border overflow-hidden"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
              <div
                className="flex items-center gap-3 px-6 py-4 border-b"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <h3
                  className="text-base font-heading font-semibold flex-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  New Agent
                </h3>
                <button
                  onClick={() => setCreating(false)}
                  className="text-xs transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
              <div className="p-6">
                <AgentEditorForm
                  workspaceId={state.workspace?.id ?? ''}
                  skills={state.skills || []}
                  onSaved={async (saved: AgentSpec) => {
                    await refresh();
                    setSelectedAgentId(saved.id);
                    setCreating(false);
                    setToast({ type: 'success', message: `Agent "${saved.name}" created successfully` });
                  }}
                  onError={(err) => setToast({ type: 'error', message: err.message })}
                />
              </div>
            </div>
          ) : selectedAgent ? (
            <div
              className="rounded-xl border overflow-hidden"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
              {/* Header */}
              <div
                className="flex items-center gap-3 px-6 py-4 border-b"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <h3
                  className="text-base font-heading font-semibold flex-1"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {selectedAgent.name}
                </h3>
                <Badge variant={selectedAgent.isEnabled ? 'success' : 'default'}>
                  {selectedAgent.isEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>

              {/* Metadata strip */}
              {(selectedAgent.role || selectedAgent.model || selectedAgent.tags?.length > 0) && (
                <div
                  className="px-6 py-3 border-b"
                  style={{ borderColor: 'var(--border-secondary)', background: 'var(--bg-tertiary)' }}
                >
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {selectedAgent.role && (
                      <>
                        <dt style={{ color: 'var(--text-muted)' }}>Role</dt>
                        <dd className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedAgent.role}</dd>
                      </>
                    )}
                    {selectedAgent.model && (
                      <>
                        <dt style={{ color: 'var(--text-muted)' }}>Model</dt>
                        <dd className="font-mono text-xs self-center" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedAgent.model}</dd>
                      </>
                    )}
                    {selectedAgent.tags?.length > 0 && (
                      <>
                        <dt style={{ color: 'var(--text-muted)' }}>Tags</dt>
                        <dd className="flex gap-1 flex-wrap">
                          {selectedAgent.tags.map((tag: string) => (
                            <Badge key={tag} variant="default">{tag}</Badge>
                          ))}
                        </dd>
                      </>
                    )}
                  </dl>
                </div>
              )}

              <div className="p-6">
                <AgentEditorForm
                  workspaceId={state.workspace?.id || ''}
                  agent={selectedAgent}
                  skills={state.skills || []}
                  onSaved={async (saved: AgentSpec) => {
                    await refresh();
                    setToast({ type: 'success', message: `Agent "${saved.name}" saved successfully` });
                  }}
                  onError={(err) => setToast({ type: 'error', message: err.message })}
                />
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl border flex items-center justify-center h-64"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select an agent to edit</p>
            </div>
          )}
        </div>
      </div>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
