import { compileFlows } from '../../../../../packages/flow-engine/src';
import { FlowSpec } from '../../../../../packages/core-types/src';
import { flowSpecSchema } from '../../../../../packages/schemas/src';

import { FlowsRepository } from './flows.repository';

export class FlowsService {
  private readonly repository = new FlowsRepository();

  async findAll() {
    return await this.repository.list();
  }

  async findById(id: string) {
    return await this.repository.findById(id);
  }

  async create(flow: FlowSpec) {
    const parsed = flowSpecSchema.parse(flow) as FlowSpec;
    const items = await this.repository.list();
    if (items.some((item) => item.id === parsed.id)) {
      throw new Error(`Flow already exists: ${parsed.id}`);
    }
    await this.repository.saveAll([...items, parsed]);
    return parsed;
  }

  async update(id: string, updates: Partial<FlowSpec>) {
    const items = await this.repository.list();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) {
      return null;
    }

    const parsed = flowSpecSchema.parse({ ...items[index], ...updates, id }) as FlowSpec;
    items[index] = parsed;
    await this.repository.saveAll(items);
    return parsed;
  }

  async remove(id: string) {
    const items = await this.repository.list();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) {
      return false;
    }
    await this.repository.saveAll(next);
    return true;
  }

  async compile() {
    return compileFlows(await this.repository.list());
  }
}
