// ────────────────────────────────────────────────────────────────────────────────
// index.ts — public API for @agent-visualstudio/agency-agents-loader
// ────────────────────────────────────────────────────────────────────────────────

export type { AgentTemplate, DepartmentWorkspace, Agency } from './types';
export { buildAgency, getAllAgents, findAgentBySlug, invalidateCache } from './loader';
export { DEPARTMENTS_META } from './departments';
export type { DepartmentMeta } from './departments';
