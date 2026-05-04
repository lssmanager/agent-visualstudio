// ─────────────────────────────────────────────────────────────────────────────
// index.ts — public API for @agent-visualstudio/agency-agents-loader
// ─────────────────────────────────────────────────────────────────────────────

export type { AgentTemplate, DepartmentWorkspace, Agency } from './types.js';
export { buildAgency, getAllAgents, findAgentBySlug, invalidateCache } from './loader.js';
export { DEPARTMENTS_META } from './departments.js';
export type { DepartmentMeta } from './departments.js';
