import type { AgencyAgentTemplate, AgentNodeConfig } from './types';

export function mapTemplateToNodeConfig(template: AgencyAgentTemplate): AgentNodeConfig {
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

export function mapTemplatesToNodeConfigs(templates: AgencyAgentTemplate[]): AgentNodeConfig[] {
  return templates.map(mapTemplateToNodeConfig);
}
