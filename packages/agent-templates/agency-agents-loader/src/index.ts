/**
 * @agent-visualstudio/agency-agents-loader
 *
 * Public API for loading, parsing, and mapping agent templates
 * from msitarzewski/agency-agents into canvas-ready AgentNodeConfig objects.
 *
 * Usage:
 *   import { loadAgentTemplate, listAgentsInCategory, mapTemplateToNodeConfig } from '@agent-visualstudio/agency-agents-loader';
 *
 *   const tpl = await loadAgentTemplate('engineering', 'backend-architect');
 *   const node = mapTemplateToNodeConfig(tpl);
 */

export { loadAgentTemplate, loadCategoryAgents, listAgentsInCategory } from './loader';
export { parseAgentMarkdown } from './parser';
export { mapTemplateToNodeConfig, mapTemplatesToNodeConfigs } from './mapper';
export type { AgencyAgentTemplate, AgentNodeConfig, AgentCategory } from './types';
export { AGENT_CATEGORIES } from './types';
