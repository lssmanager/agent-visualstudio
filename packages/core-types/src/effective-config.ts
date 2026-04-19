export type ConfigSource = 'workspace' | 'profile' | 'agent';

export interface EffectiveConfigSources {
  model: ConfigSource;
  skills: ConfigSource;
  policies: ConfigSource;
}

export interface EffectiveConfig {
  workspaceId: string;
  agentId?: string;
  resolvedModel: string;
  resolvedSkills: string[];
  resolvedPolicies: string[];
  resolvedRoutingRules: unknown[];
  source: EffectiveConfigSources;
}
