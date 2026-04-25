import { SkillSpec } from '../../../../../packages/core-types/src';
import { skillSpecSchema } from '../../../../../packages/schemas/src';

import { SkillsRepository } from './skills.repository';

export class SkillsService {
  private readonly repository = new SkillsRepository();

  async findAll() {
    return await this.repository.list();
  }

  async findById(id: string) {
    return await this.repository.findById(id);
  }

  async create(skill: SkillSpec) {
    const parsed = skillSpecSchema.parse(skill) as SkillSpec;
    const skills = await this.repository.list();

    if (skills.some((item) => item.id === parsed.id)) {
      throw new Error(`Skill already exists: ${parsed.id}`);
    }

    await this.repository.saveAll([...skills, parsed]);
    return parsed;
  }

  async update(id: string, updates: Partial<SkillSpec>) {
    const current = await this.repository.list();
    const index = current.findIndex((item) => item.id === id);
    if (index < 0) {
      return null;
    }

    const parsed = skillSpecSchema.parse({ ...current[index], ...updates, id }) as SkillSpec;
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
