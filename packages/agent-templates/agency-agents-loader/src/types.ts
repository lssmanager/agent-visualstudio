/**
 * Raw template shape as stored in msitarzewski/agency-agents.
 * Each .md file has YAML frontmatter + markdown body.
 */
export interface AgencyAgentTemplate {
  /** Unique slug derived from filename, e.g. "backend-architect" */
  slug: string;
  /** Department/category folder, e.g. "engineering" */
  category: AgentCategory;
  /** Human-readable name from frontmatter `name` field */
  name: string;
  /** Short one-line description from frontmatter `description` field */
  description: string;
  /** Full role prompt extracted from markdown body */
  systemPrompt: string;
  /** Optional list of tools/skills declared in frontmatter */
  tools: string[];
  /** Raw frontmatter object for any extra fields */
  meta: Record<string, unknown>;
}

/**
 * Normalized agent node config used in the canvas (React Flow node data).
 * This is the shape that AgentNode components consume.
 */
export interface AgentNodeConfig {
  id: string;
  type: 'agent';
  label: string;
  systemPrompt: string;
  skills: string[];
  category: AgentCategory;
  /** Original template slug for traceability */
  templateSlug: string;
  /** Source repo for attribution */
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
