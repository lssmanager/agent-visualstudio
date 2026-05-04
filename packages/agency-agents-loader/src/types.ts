export interface AgencyAgentTemplate {
  slug: string;
  category: AgentCategory;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  meta: Record<string, unknown>;
}

export interface AgentNodeConfig {
  id: string;
  type: 'agent';
  label: string;
  systemPrompt: string;
  skills: string[];
  category: AgentCategory;
  templateSlug: string;
  source: 'agency-agents';
}

export const AGENT_CATEGORIES = [
  'engineering',
  'design',
  'product',
  'marketing',
  'sales',
  'finance',
  'testing',
  'strategy',
  'support',
  'project-management',
  'integrations',
  'game-development',
  'specialized',
] as const;

export type AgentCategory = typeof AGENT_CATEGORIES[number];
