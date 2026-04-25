import { AgentSpec } from '../../../../../packages/core-types/src';
import { agentSpecSchema } from '../../../../../packages/schemas/src';

import { AgentsRepository } from './agents.repository';

export class AgentsService {
  private readonly repository = new AgentsRepository();

  async findAll() {
    return await this.repository.list();
  }

  async findById(id: string) {
    return await this.repository.findById(id);
  }

  async create(agent: AgentSpec) {
    const parsed = agentSpecSchema.parse(agent) as AgentSpec;
    const agents = await this.repository.list();

    if (agents.some((item) => item.id === parsed.id)) {
      throw new Error(`Agent already exists: ${parsed.id}`);
    }

    await this.repository.saveAll([...agents, parsed]);
    return parsed;
  }

  async update(id: string, updates: Partial<AgentSpec>) {
    const agents = await this.repository.list();
    const index = agents.findIndex((agent) => agent.id === id);
    if (index < 0) {
      return null;
    }

    const parsed = agentSpecSchema.parse({ ...agents[index], ...updates, id }) as AgentSpec;
    agents[index] = parsed;
    await this.repository.saveAll(agents);
    return parsed;
  }

  async remove(id: string) {
    const agents = await this.repository.list();
    const next = agents.filter((item) => item.id !== id);
    if (next.length === agents.length) {
      return false;
    }
    await this.repository.saveAll(next);
    return true;
  }
}
