import { useEffect, useState } from 'react';

import { applyDeploy, getDeployPreview, getStudioState } from '../../../lib/api';
import { DeployPreview, ProfileSpec, WorkspaceSpec } from '../../../lib/types';
import { WorkspaceDeployPanel } from '../components/WorkspaceDeployPanel';
import { WorkspaceEditor } from '../components/WorkspaceEditor';
import { WorkspaceFileTree } from '../components/WorkspaceFileTree';
import { WorkspaceList } from '../components/WorkspaceList';

export function WorkspacesPage() {
  const [workspace, setWorkspace] = useState<WorkspaceSpec | null>(null);
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [profiles, setProfiles] = useState<ProfileSpec[]>([]);

  useEffect(() => {
    getStudioState().then((state) => {
      setProfiles(state.profiles);
      // Optionally set current workspace
      if (state.workspace) {
        setWorkspace(state.workspace);
      }
    });
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      <WorkspaceList current={workspace} />
      <WorkspaceEditor profiles={profiles} onCreated={(result) => setWorkspace(result.workspaceSpec)} />
      <WorkspaceFileTree preview={preview} />
      <WorkspaceDeployPanel
        onPreview={() => void getDeployPreview().then(setPreview)}
        onDeploy={() => void applyDeploy({ applyRuntime: true })}
      />
    </div>
  );
}
