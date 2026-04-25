import { PolicySpec } from '../../../../../packages/core-types/src';
import { policySpecSchema } from '../../../../../packages/schemas/src';

import { PoliciesRepository } from './policies.repository';

export class PoliciesService {
  private readonly repository = new PoliciesRepository();

  async findAll() {
    return await this.repository.list();
  }

  async findById(id: string) {
    return await this.repository.findById(id);
  }

  async create(policy: PolicySpec) {
    const parsed = policySpecSchema.parse(policy) as PolicySpec;
    const current = await this.repository.list();
    if (current.some((item) => item.id === parsed.id)) {
      throw new Error(`Policy already exists: ${parsed.id}`);
    }

    await this.repository.saveAll([...current, parsed]);
    return parsed;
  }

  async update(id: string, updates: Partial<PolicySpec>) {
    const current = await this.repository.list();
    const index = current.findIndex((item) => item.id === id);
    if (index < 0) {
      return null;
    }

    const parsed = policySpecSchema.parse({ ...current[index], ...updates, id }) as PolicySpec;
    current[index] = parsed;
    await this.repository.saveAll(current);
    return parsed;
  }

  async remove(id: string) {
    const current = await this.repository.list();
    const next = current.filter((item) => item.id !== id);
    if (next.length === current.length) {
      return false;
    }

    await this.repository.saveAll(next);
    return true;
  }
}
