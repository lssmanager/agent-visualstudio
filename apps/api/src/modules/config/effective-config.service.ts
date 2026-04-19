import { EffectiveConfig } from '../../../../../packages/core-types/src';
import { workspaceStore } from '../../config';
import { ProfilesService } from '../profiles/profiles.service';

const profilesService = new ProfilesService();

export class EffectiveConfigService {
  resolveForWorkspace(): EffectiveConfig | null {
    const workspace = workspaceStore.readWorkspace();
    if (!workspace) return null;

    return {
      workspaceId: workspace.id,
      resolvedModel: workspace.defaultModel ?? 'openai/gpt-5.4-mini',
      resolvedSkills: workspace.skillIds ?? [],
      resolvedPolicies: (workspace.policyRefs ?? []).map((p) => p.id),
      resolvedRoutingRules: workspace.routingRules ?? [],
      source: {
        model: 'workspace',
        skills: 'workspace',
        policies: 'workspace',
      },
    };
  }

  async resolveForAgent(agentId: string): Promise<EffectiveConfig | null> {
    const workspace = workspaceStore.readWorkspace();
    if (!workspace) return null;

    const agent = workspaceStore.getAgent(agentId);
    if (!agent) return null;

    // Load profile defaults if the workspace has a profile
    let profileModel: string | undefined;
    let profileSkills: string[] = [];
    let profilePolicies: string[] = [];

    if (workspace.profileIds?.[0]) {
      try {
        const profiles = await profilesService.getAll();
        const profile = profiles.find((p) => p.id === workspace.profileIds[0]);
        if (profile) {
          profileModel = profile.defaultModel;
          profileSkills = profile.defaultSkills ?? [];
          profilePolicies = profile.defaultPolicies ?? [];
        }
      } catch {
        // profile load failed, skip
      }
    }

    // Merge: agent > profile > workspace (agent wins)
    const resolvedModel = agent.model || profileModel || workspace.defaultModel || 'openai/gpt-5.4-mini';
    const modelSource = agent.model ? 'agent' : profileModel ? 'profile' : 'workspace';

    const resolvedSkills = agent.skillRefs.length > 0 ? agent.skillRefs : profileSkills.length > 0 ? profileSkills : workspace.skillIds ?? [];
    const skillsSource = agent.skillRefs.length > 0 ? 'agent' : profileSkills.length > 0 ? 'profile' : 'workspace';

    const agentPolicies = (agent.policyBindings ?? []).map((p) => p.policyId);
    const resolvedPolicies = agentPolicies.length > 0 ? agentPolicies : profilePolicies.length > 0 ? profilePolicies : (workspace.policyRefs ?? []).map((p) => p.id);
    const policiesSource = agentPolicies.length > 0 ? 'agent' : profilePolicies.length > 0 ? 'profile' : 'workspace';

    return {
      workspaceId: workspace.id,
      agentId,
      resolvedModel,
      resolvedSkills,
      resolvedPolicies,
      resolvedRoutingRules: workspace.routingRules ?? [],
      source: {
        model: modelSource as 'workspace' | 'profile' | 'agent',
        skills: skillsSource as 'workspace' | 'profile' | 'agent',
        policies: policiesSource as 'workspace' | 'profile' | 'agent',
      },
    };
  }
}
