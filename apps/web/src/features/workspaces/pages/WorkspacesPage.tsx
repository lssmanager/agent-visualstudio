import { useState } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';

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
      <PageHeader
        title="Workspaces"
        icon={Package}
        description="Create and manage workspaces. Each workspace is an independent configuration of agents, skills, and flows."
      />

      {/* Workspaces Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.length > 0 && workspaces.map((ws) => (
          <Card key={ws.id} className="transition-shadow" clickable>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{ws.name}</h3>
                <p className="text-xs font-mono mt-1" style={{ color: 'var(--text-muted)' }}>{ws.slug}</p>
              </div>
              <button
                onClick={handleDeleteClick}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--tone-danger-bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-error)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                title="Delete workspace"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Workspace metadata */}
            <div className="space-y-2 text-sm mb-4">
              {ws.defaultModel && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Model:</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-primary)' }}>{ws.defaultModel}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Agents:</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{state.agents?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Skills:</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{state.skills?.length ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Flows:</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{state.flows?.length ?? 0}</span>
              </div>
            </div>

            {/* Active indicator */}
            <div
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: 'var(--tone-success-bg)', color: 'var(--color-success)' }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-success)' }} />
              Active
            </div>
          </Card>
        ))}

        {/* New Workspace Card */}
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="rounded-lg p-6 transition-colors flex flex-col items-center justify-center h-full cursor-pointer"
          style={{
            background: 'var(--card-bg)',
            border: '2px dashed var(--border-primary)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-soft)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--card-bg)'; }}
        >
          <Plus size={32} className="mb-2" style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Create Workspace</span>
        </button>
      </div>

      {/* Editor Section */}
      {showEditor && (
        <Card>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>New Workspace</h2>
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
          <Card>
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Workspace Details</h3>
            <WorkspaceList current={state.workspace} />
          </Card>

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
          <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Deployment Preview</h3>
          <WorkspaceFileTree preview={preview} />
        </Card>
      )}

      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
