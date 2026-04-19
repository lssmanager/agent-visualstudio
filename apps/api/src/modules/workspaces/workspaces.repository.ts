import { WorkspaceSpec } from '../../../../../packages/core-types/src';
import { workspaceStore } from '../../config';

export class WorkspacesRepository {
  getCurrent() {
    return workspaceStore.readWorkspace();
  }

  save(workspace: WorkspaceSpec): WorkspaceSpec {
    workspaceStore.writeWorkspace(workspace);
    return workspace;
  }
}
