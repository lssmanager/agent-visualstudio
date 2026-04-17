import { useState, useMemo } from 'react';
import { useStudioState } from '../../../lib/StudioStateContext';
import { AgentEditorForm } from '../components/AgentEditorForm';
import { Search, Plus, Users, Circle } from 'lucide-react';
import { PageHeader, EmptyState, Card, Badge } from '../../../components';

export default function AgentListPage() {
  const { state } = useStudioState();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const agents = state.agents || [];

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) =>
      agent.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [agents, searchQuery]);

  const selectedAgent = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : agents[0];

  if (agents.length === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Agents"
          description="Browse, search, and edit your workspace agents."
          icon={Users}
        />
        <EmptyState
          icon={Users}
          title="No Agents"
          description="Create your first agent to get started."
        >
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            <Plus size={18} />
            Create Agent
          </button>
        </EmptyState>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left: Agent List */}
        <div className="md:col-span-1">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">All Agents</h3>

            {/* Search */}
            <div className="mb-4 relative">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Agent List */}
            <div className="space-y-2">
              {filteredAgents.map((agent) => {
                const a = agent as any;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      (selectedAgentId === agent.id || (!selectedAgentId && agent === agents[0]))
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 w-full">
                      <Circle
                        size={8}
                        className={`mt-1.5 flex-shrink-0 ${
                          a.isEnabled
                            ? 'fill-emerald-500 text-emerald-500'
                            : 'fill-slate-300 text-slate-300'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-medium truncate ${
                              (selectedAgentId === agent.id || (!selectedAgentId && agent === agents[0]))
                                ? 'text-blue-900'
                                : 'text-slate-900'
                            }`}
                          >
                            {agent.name}
                          </span>
                          {a.executionMode && (
                            <Badge variant={a.executionMode === 'proactive' ? 'warning' : 'info'}>
                              {a.executionMode}
                            </Badge>
                          )}
                        </div>
                        {a.role && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">{a.role}</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Add Agent button */}
            <button className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
              <Plus size={16} />
              New Agent
            </button>
          </Card>
        </div>

        {/* Right: Agent Editor */}
        <div className="md:col-span-3">
          {selectedAgent ? (
            <Card>
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-lg font-semibold text-slate-900 flex-1">
                  {selectedAgent.name}
                </h3>
                <Badge variant={(selectedAgent as any).isEnabled ? 'success' : 'default'}>
                  {(selectedAgent as any).isEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>

              {/* Metadata strip */}
              {((selectedAgent as any).role || (selectedAgent as any).model || (selectedAgent as any).tags?.length > 0) && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-6 p-4 bg-slate-50 rounded-lg border border-slate-100">
                  {(selectedAgent as any).role && (
                    <>
                      <dt className="text-slate-500">Role</dt>
                      <dd className="font-medium text-slate-900">{(selectedAgent as any).role}</dd>
                    </>
                  )}
                  {(selectedAgent as any).model && (
                    <>
                      <dt className="text-slate-500">Model</dt>
                      <dd className="font-mono text-xs text-slate-900 self-center">{(selectedAgent as any).model}</dd>
                    </>
                  )}
                  {(selectedAgent as any).tags?.length > 0 && (
                    <>
                      <dt className="text-slate-500">Tags</dt>
                      <dd className="flex gap-1 flex-wrap">
                        {(selectedAgent as any).tags.map((tag: string) => (
                          <span
                            key={tag}
                            className="bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </dd>
                    </>
                  )}
                </dl>
              )}

              <AgentEditorForm
                workspaceId={state.workspace?.id || ''}
                agent={selectedAgent}
                skills={state.skills || []}
                onSaved={() => {
                  // Could show success toast here
                }}
              />
            </Card>
          ) : (
            <Card className="flex items-center justify-center h-64">
              <p className="text-slate-600">Select an agent to edit</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
