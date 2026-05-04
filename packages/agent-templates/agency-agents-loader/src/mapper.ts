import type { AgencyAgentTemplate, AgentNodeConfig } from './types';

/**
 * Converts a parsed AgencyAgentTemplate into the AgentNodeConfig
 * shape expected by React Flow canvas nodes.
 *
 * The canvas node does NOT get a new type — it reuses the existing
 * 'agent' node type. Only its `data` payload changes.
 */
export function mapTemplateToNodeConfig(
  template: AgencyAgentTemplate,
): AgentNodeConfig {
  return {
    id: `template-${template.category}-${template.slug}`,
    type: 'agent',
    label: template.name,
    systemPrompt: template.systemPrompt,
    skills: template.tools,
    category: template.category,
    templateSlug: template.slug,
    source: 'agency-agents',
  };
}

/**
 * Batch mapper — converts an array of templates in one call.
 */
export function mapTemplatesToNodeConfigs(
  templates: AgencyAgentTemplate[],
): AgentNodeConfig[] {
  return templates.map(mapTemplateToNodeConfig);
}
