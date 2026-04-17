import { useState, useMemo } from 'react';
import { useStudioState } from '../../../lib/StudioStateContext';
import { AgentEditorForm } from '../components/AgentEditorForm';
import { Search, Plus } from 'lucide-react';

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
      <div className="flex flex-col items-center justify-center py-24">
        <div className="text-center">
          <div className="text-5xl mb-4">🤖</div>
          <h3 className="text-lg font-semibold text-slate-900">No Agents</h3>
          <p className="text-sm text-slate-600 mt-2">
            Create your first agent to get started.
          </p>
          <button className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={18} />
            Create Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Left: Agent List */}
      <div className="md:col-span-1">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Agents</h3>

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
            {filteredAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                  selectedAgentId === agent.id
                    ? 'bg-blue-50 border border-blue-200 text-blue-900 font-medium'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="font-medium">{agent.name}</div>
                <div className="text-xs text-slate-500">{agent.id}</div>
              </button>
            ))}
          </div>

          {/* Add Agent button */}
          <button className="w-full mt-4 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
            <Plus size={16} />
            New Agent
          </button>
        </div>
      </div>

      {/* Right: Agent Editor */}
      <div className="md:col-span-3">
        {selectedAgent ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">
              Edit Agent: {selectedAgent.name}
            </h3>
            <AgentEditorForm
              workspaceId={state.workspace?.id || ''}
              agent={selectedAgent}
              skills={state.skills || []}
              onSaved={() => {
                // Could show success toast here
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 bg-white rounded-lg border border-slate-200">
            <p className="text-slate-600">Select an agent to edit</p>
          </div>
        )}
      </div>
    </div>
  );
}
