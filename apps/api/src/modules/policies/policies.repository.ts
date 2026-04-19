import { PolicySpec } from '../../../../../packages/core-types/src';
import { workspaceStore } from '../../config';

export class PoliciesRepository {
  list() {
    return workspaceStore.listPolicies();
  }

  findById(id: string) {
    return workspaceStore.getPolicy(id);
  }

  saveAll(items: PolicySpec[]) {
    return workspaceStore.savePolicies(items);
  }
}
