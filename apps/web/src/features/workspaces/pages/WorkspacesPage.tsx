import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { applyDeploy, getDeployPreview } from '../../../lib/api';
import { useStudioState } from '../../../lib/StudioStateContext';
import { DeployPreview, WorkspaceSpec } from '../../../lib/types';
import { WorkspaceDeployPanel } from '../components/WorkspaceDeployPanel';
import { WorkspaceEditor } from '../components/WorkspaceEditor';
import { WorkspaceFileTree } from '../components/WorkspaceFileTree';
import { WorkspaceList } from '../components/WorkspaceList';
import { PageHeader, Card, Toast } from '../../../components';

export default function WorkspacesPage() {
  const { state, refresh } = useStudioState();
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  async function handlePreview() {
    try {
      const result = await getDeployPreview();
      setPreview(result);
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load preview' });
    }
  }

  async function handleDeploy() {
    try {
      await applyDeploy({ applyRuntime: true });
      await refresh();
      setPreview(await getDeployPreview());
      setToast({ type: 'success', message: 'Deployment applied successfully' });
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Deployment failed' });
    }
  }

  const workspaces: WorkspaceSpec[] = state.workspace ? [state.workspace] : [];

  function handleDeleteClick() {
    setToast({ type: 'info', message: 'Workspace deletion is not available in this version.' });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Workspaces"
        description="Create and manage workspaces. Each workspace is an independent configuration of agents, skills, and flows."
      />

      {/* Workspaces Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.length > 0 && workspaces.map((ws) => (
          <Card key={ws.id} className="hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{ws.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">{ws.slug}</p>
              </div>
              <button
                onClick={handleDeleteClick}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors text-slate-400 hover:text-red-600"
                title="Delete workspace"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Workspace metadata */}
            <div className="space-y-2 text-sm mb-4">
              {ws.defaultModel && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Model:</span>
                  <span className="text-slate-900 font-mono text-xs">{ws.defaultModel}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Agents:</span>
                <span className="text-slate-900 font-medium">{state.agents?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Skills:</span>
                <span className="text-slate-900 font-medium">{state.skills?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Flows:</span>
                <span className="text-slate-900 font-medium">{state.flows?.length ?? 0}</span>
              </div>
            </div>

            {/* Active indicator */}
            <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-medium">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Active
            </div>
          </Card>
        ))}

        {/* New Workspace Card */}
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="bg-white rounded-lg border-2 border-dashed border-slate-300 p-6 hover:border-blue-400 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center h-full cursor-pointer"
        >
          <Plus size={32} className="text-slate-400 mb-2" />
          <span className="text-sm font-medium text-slate-600">Create Workspace</span>
        </button>
      </div>

      {/* Editor Section */}
      {showEditor && (
        <Card>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">New Workspace</h2>
          <WorkspaceEditor
            profiles={state.profiles}
            onCreated={async () => {
              await refresh();
              setShowEditor(false);
            }}
          />
        </Card>
      )}

      {/* Current Workspace Info & Deployment */}
      {state.workspace && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Workspace Details */}
          <Card>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Workspace Details</h3>
            <WorkspaceList current={state.workspace} />
          </Card>

          {/* Deployment */}
          <div className="space-y-4">
            <Card>
              <WorkspaceDeployPanel
                onPreview={handlePreview}
                onDeploy={handleDeploy}
              />
            </Card>
          </div>
        </div>
      )}

      {/* File Tree & Preview */}
      {preview && (
        <Card>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Deployment Preview</h3>
          <WorkspaceFileTree preview={preview} />
        </Card>
      )}

      {/* Toast */}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
