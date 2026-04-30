import { PolicySpec } from '../../../../../packages/core-types/src';
import { workspaceStore } from '../../config'; // @deprecated(F0-08) — migrate to PoliciesRepository (Prisma)

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
