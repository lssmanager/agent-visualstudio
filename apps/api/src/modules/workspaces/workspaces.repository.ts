import { WorkspaceSpec } from '../../../../../packages/core-types/src';
import { workspaceStore } from '../../config'; // @deprecated(F0-08) — migrate to WorkspaceRepository (Prisma)

export class WorkspacesRepository {
  getCurrent() {
    return workspaceStore.readWorkspace();
  }

  save(workspace: WorkspaceSpec): WorkspaceSpec {
    workspaceStore.writeWorkspace(workspace);
    return workspace;
  }
}
