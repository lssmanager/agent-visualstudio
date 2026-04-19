import { SkillSpec } from '../../../../../packages/core-types/src';
import { workspaceStore } from '../../config';

export class SkillsRepository {
  list() {
    return workspaceStore.listSkills();
  }

  findById(id: string) {
    return workspaceStore.getSkill(id);
  }

  saveAll(skills: SkillSpec[]) {
    return workspaceStore.saveSkills(skills);
  }
}
