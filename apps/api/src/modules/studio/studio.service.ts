import { AgentsService } from '../agents/agents.service';
import { FlowsService } from '../flows/flows.service';
import { GatewayService } from '../gateway/gateway.service';
import { PoliciesService } from '../policies/policies.service';
import { ProfilesService } from '../profiles/profiles.service';
import { SkillsService } from '../skills/skills.service';
import { WorkspacesCompiler } from '../workspaces/workspaces.compiler';
import { WorkspacesService } from '../workspaces/workspaces.service';

export class StudioService {
  private readonly workspaces = new WorkspacesService();
  private readonly compiler = new WorkspacesCompiler();
  private readonly agents = new AgentsService();
  private readonly skills = new SkillsService();
  private readonly flows = new FlowsService();
  private readonly policies = new PoliciesService();
  private readonly profiles = new ProfilesService();
  private readonly gateway = new GatewayService();

  async getState() {
    const [health, diagnostics, sessions, profiles, compile] = await Promise.all([
      this.gateway.health(),
      this.gateway.diagnostics(),
      this.gateway.listSessions(),
      this.profiles.getAll(),
      this.compiler.compileCurrent(),
    ]);

    return {
      workspace: this.workspaces.getCurrent(),
      agents: this.agents.findAll(),
      skills: this.skills.findAll(),
      flows: this.flows.findAll(),
      policies: this.policies.findAll(),
      profiles,
      compile,
      runtime: {
        health,
        diagnostics,
        sessions,
      },
      generatedAt: new Date().toISOString(),
    };
  }
}
