export type AgentVisibility = 'private' | 'workspace' | 'public';
export type AgentExecutionMode = 'direct' | 'orchestrated' | 'handoff';
export type AgentKind = 'agent' | 'subagent' | 'orchestrator';

export interface AgentTrigger {
  type: 'event' | 'schedule' | 'manual' | 'webhook';
  config?: Record<string, unknown>;
}

export interface AgentPermission {
  tools?: string[];
  channels?: string[];
  models?: string[];
  maxTokensPerTurn?: number;
}

export interface AgentHandoffRule {
  id: string;
  targetAgentId: string;
  when: string;
  description?: string;
  priority?: number;
}

export interface AgentChannelBinding {
  id: string;
  channel: string;
  route: string;
  enabled: boolean;
}

export interface AgentPolicyBinding {
  policyId: string;
  mode: 'enforce' | 'warn';
}

export interface AgentSpec {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  description: string;
  instructions: string;
  model: string;
  skillRefs: string[];
  tags: string[];
  visibility: AgentVisibility;
  executionMode: AgentExecutionMode;
  kind?: AgentKind;
  parentAgentId?: string;
  context?: string[];
  triggers?: AgentTrigger[];
  permissions?: AgentPermission;
  handoffRules: AgentHandoffRule[];
  channelBindings: AgentChannelBinding[];
  policyBindings?: AgentPolicyBinding[];
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}
