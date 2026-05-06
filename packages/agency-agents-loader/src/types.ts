// ────────────────────────────────────────────────────────────────────────────────
// types.ts — public interfaces for @agent-visualstudio/agency-agents-loader
//
// Frontmatter real (msitarzewski/agency-agents):
//   name, description, color, emoji, vibe
//   (sin `tags` ni `department` — se derivan en el parser)
// ────────────────────────────────────────────────────────────────────────────────

export interface AgentTemplate {
  /** Composite id: "<department>/<slug>"  e.g. "engineering/engineering-backend-architect" */
  id: string;
  /** Filename without .md extension */
  slug: string;
  /** Human-readable name from frontmatter */
  name: string;
  /** One-line description from frontmatter */
  description: string;
  /** Directory name e.g. "engineering", "marketing", "design" */
  department: string;
  /** Emoji from frontmatter, default 🤖 */
  emoji: string;
  /** Tailwind / hex color token from frontmatter */
  color: string;
  /** One-line personality vibe from frontmatter */
  vibe?: string;
  /**
   * Derived tags: [department, ...vibe words truncated, ...name tokens].
   * The raw files have no `tags` field — we synthesize them for UI filtering.
   */
  tags: string[];
  /** Full body of the .md file (the system prompt) */
  systemPrompt?: string;
}

export interface DepartmentWorkspace {
  /** Directory name */
  id: string;
  /** Human-readable name from DEPARTMENTS_META */
  name: string;
  /** Hex accent color for UI */
  color: string;
  /** Emoji representing the department */
  emoji: string;
  agents: AgentTemplate[];
  /**
   * Convenience alias: display label derived from id.
   * Computed by mapper.ts — equals `name` in most cases.
   */
  label?: string;
  /**
   * Convenience counter: equals agents.length.
   * Provided for backward compatibility with older consumers.
   */
  agentCount?: number;
}

export interface Agency {
  id: string;
  name: string;
  source: string;
  departments: DepartmentWorkspace[];
  totalAgents: number;
}
