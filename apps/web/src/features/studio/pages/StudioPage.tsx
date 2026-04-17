import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { applyDeploy, getDeployPreview } from '../../../lib/api';
import { useStudioState } from '../../../lib/StudioStateContext';
import { usePreferences } from '../../../lib/usePreferences';
import { AgentSpec, DeployPreview } from '../../../lib/types';
import { StudioCanvas } from '../components/StudioCanvas';
import { StudioInspector } from '../components/StudioInspector';
import { StudioSidebar } from '../components/StudioSidebar';
import { StudioToolbar } from '../components/StudioToolbar';
import { EmptyState, Toast } from '../../../components';
import { Cpu } from 'lucide-react';

export default function StudioPage() {
  const { state, refresh } = useStudioState();
  const { selectedAgentId, setSelectedAgentId } = usePreferences();
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Initialize selectedAgentId from preferences or first agent
  const [agentId, setAgentId] = useState<string | null>(selectedAgentId || state.agents[0]?.id || null);

  // Update preferences when agent changes
  useEffect(() => {
    if (agentId) {
      setSelectedAgentId(agentId);
    }
  }, [agentId, setSelectedAgentId]);

  const selectedAgent = state.agents.find((a) => a.id === agentId) || state.agents[0];

  async function load() {
    setBusy(true);
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function previewDiff() {
    try {
      setPreview(await getDeployPreview());
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load preview' });
    }
  }

  async function deploy() {
    setBusy(true);
    try {
      await applyDeploy({ applyRuntime: true });
      await refresh();
      setPreview(await getDeployPreview());
      setToast({ type: 'success', message: 'Deployment applied successfully' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Deployment failed' });
    } finally {
      setBusy(false);
    }
  }

  const workspaceId = state.workspace?.id;

  if (!workspaceId) {
    return (
      <EmptyState
        icon={Cpu}
        title="No Workspace"
        description="Create a workspace first to use the Studio."
      />
    );
  }

  if (state.agents.length === 0) {
    return (
      <EmptyState
        icon={Cpu}
        title="No Agents"
        description="Create your first agent in the workspace to start editing."
      >
        <Link
          to="/agents"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Go to Agents
        </Link>
      </EmptyState>
    );
  }

  return (
    <div>
      <StudioToolbar onRefresh={load} onPreview={previewDiff} onApply={deploy} isBusy={busy} />

      {/* Agent Selector */}
      <div className="px-4 py-3 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Current Agent:</span>
            <select
              value={agentId || ''}
              onChange={(e) => setAgentId(e.target.value)}
              className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {state.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.id})
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              {selectedAgent?.description}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[250px_1fr_360px] gap-4 p-4">
        <StudioSidebar
          workspaceName={state.workspace?.name}
          agentsCount={state.agents.length}
          flowsCount={state.flows.length}
          skillsCount={state.skills.length}
        />
        {selectedAgent ? (
          <StudioCanvas
            workspaceId={workspaceId}
            agents={[selectedAgent]}
            flows={state.flows}
            skills={state.skills}
            onAgentSaved={(agent: AgentSpec) => {
              void refresh();
            }}
          />
        ) : (
          <div className="rounded border border-slate-200 bg-white p-4 flex items-center justify-center">
            <p className="text-slate-600">Select an agent to edit</p>
          </div>
        )}
        <StudioInspector
          diagnostics={state.compile.diagnostics}
          deployPreview={preview}
          sessions={state.runtime.sessions.payload ?? []}
        />
      </div>

      {/* Toast */}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
