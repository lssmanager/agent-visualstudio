import fs from 'node:fs';
import path from 'node:path';
import { AgentsService } from '../agents/agents.service';
import { FlowsService } from '../flows/flows.service';
import { PoliciesService } from '../policies/policies.service';
import { ProfilesService } from '../profiles/profiles.service';
import { RuntimeAdapter } from '../runtime/runtime-adapter.interface';
import { runtimeAdapterRegistry } from '../runtime/runtime-adapter.registry';
import { SkillsService } from '../skills/skills.service';
import { WorkspacesCompiler } from '../workspaces/workspaces.compiler';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { canonicalStudioStateSchema } from '../../../../../packages/schemas/src';
import { adaptLegacyStudioStateToCanonical } from './studio.adapter';
import type { CanonicalStudioStateDto, LegacyStudioStateDto } from './dto/studio-state.dto';
import { studioConfig } from '../../config';

export class StudioService {
  private readonly workspaces = new WorkspacesService();
  private readonly compiler = new WorkspacesCompiler();
  private readonly agents = new AgentsService();
  private readonly skills = new SkillsService();
  private readonly flows = new FlowsService();
  private readonly policies = new PoliciesService();
  private readonly profiles = new ProfilesService();
  private readonly canonicalStatePath = path.join(
    studioConfig.workspaceRoot,
    '.openclaw-studio',
    'canonical-state.spec.json',
  );

  constructor(
    private readonly runtimeAdapter: RuntimeAdapter = runtimeAdapterRegistry.getActive(),
  ) {}

  async getState(): Promise<LegacyStudioStateDto> {
    const [runtimeSnapshot, profiles, compile] = await Promise.all([
      this.runtimeAdapter.getRuntimeSnapshot(),
      this.profiles.getAll(),
      this.compiler.compileCurrent(),
    ]);

    return {
      workspace: this.workspaces.getCurrent(),
      agents: await this.agents.findAll(),
      skills: await this.skills.findAll(),
      flows: await this.flows.findAll(),
      policies: await this.policies.findAll(),
      profiles,
      compile,
      runtime: {
        health: runtimeSnapshot.health,
        diagnostics: runtimeSnapshot.diagnostics,
        sessions: runtimeSnapshot.sessions,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async getCanonicalState(): Promise<CanonicalStudioStateDto> {
    const legacyState = await this.getState();
    const capabilityMatrix = await this.runtimeAdapter.getCapabilities();
    const canonical = adaptLegacyStudioStateToCanonical(legacyState, {
      capabilityMatrix,
    });
    const parsed = canonicalStudioStateSchema.parse(canonical);
    this.persistCanonicalState(parsed);
    return parsed;
  }

  private persistCanonicalState(canonical: CanonicalStudioStateDto): void {
    const dir = path.dirname(this.canonicalStatePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.canonicalStatePath, JSON.stringify(canonical, null, 2), 'utf-8');
  }
}
