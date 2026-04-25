import { DeployableArtifact } from '../../../../../packages/core-types/src';
import { compileOpenClawWorkspace } from '../../../../../packages/workspace-engine/src';
import { AgentsRepository } from '../agents/agents.repository';
import { FlowsRepository } from '../flows/flows.repository';
import { PoliciesRepository } from '../policies/policies.repository';
import { ProfilesService } from '../profiles/profiles.service';
import { SkillsRepository } from '../skills/skills.repository';
import { WorkspacesRepository } from './workspaces.repository';

export class WorkspacesCompiler {
  private readonly workspacesRepo = new WorkspacesRepository();
  private readonly agentsRepo = new AgentsRepository();
  private readonly skillsRepo = new SkillsRepository();
  private readonly flowsRepo = new FlowsRepository();
  private readonly policiesRepo = new PoliciesRepository();
  private readonly profilesService = new ProfilesService();

  async compileCurrent(): Promise<{ artifacts: DeployableArtifact[]; diagnostics: string[] }> {
    const workspace = this.workspacesRepo.getCurrent();
    if (!workspace) {
      return { artifacts: [], diagnostics: ['Workspace spec not found'] };
    }

    return compileOpenClawWorkspace({
      workspace,
      agents: await this.agentsRepo.list(),
      skills: await this.skillsRepo.list(),
      flows: await this.flowsRepo.list(),
      profiles: await this.profilesService.getAll(),
      policies: await this.policiesRepo.list(),
    });
  }
}
