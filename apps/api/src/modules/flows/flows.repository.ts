import { FlowSpec } from '../../../../../packages/core-types/src';
import { workspaceStore } from '../../config';

export class FlowsRepository {
  list() {
    return workspaceStore.listFlows();
  }

  findById(id: string) {
    return workspaceStore.getFlow(id);
  }

  saveAll(flows: FlowSpec[]) {
    return workspaceStore.saveFlows(flows);
  }
}
