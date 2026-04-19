import { AgentSpec } from '../../../../../packages/core-types/src';
import { workspaceStore } from '../../config';

export class AgentsRepository {
  list(): AgentSpec[] {
    return workspaceStore.listAgents();
  }

  findById(id: string): AgentSpec | null {
    return workspaceStore.getAgent(id);
  }

  saveAll(agents: AgentSpec[]): AgentSpec[] {
    return workspaceStore.saveAgents(agents);
  }
}
