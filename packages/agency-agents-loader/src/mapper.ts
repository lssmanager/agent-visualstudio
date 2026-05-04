import { listDepartments, loadDepartment, readAgentFile } from './loader';
import { parseAgentMarkdown } from './parser';
import type { Agency, DepartmentWorkspace, AgentTemplate } from './types';

function departmentLabel(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Builds the complete Agency catalog from vendor/agency-agents/.
 * Tolerant: failed or empty departments are skipped with a warning.
 */
export function buildAgency(): Agency {
  const departmentNames = listDepartments();
  const departments: DepartmentWorkspace[] = [];

  for (const deptName of departmentNames) {
    let filePaths: string[];
    try {
      filePaths = loadDepartment(deptName);
    } catch (err) {
      console.warn(`[mapper] Skipping "${deptName}":`, (err as Error).message);
      continue;
    }

    const agents: AgentTemplate[] = [];
    for (const filePath of filePaths) {
      const raw = readAgentFile(filePath);
      if (!raw) continue;
      try {
        const template = parseAgentMarkdown(filePath, deptName, raw);
        // Only include agents that have a system prompt (skip empty/broken files)
        if (template.systemPrompt) agents.push(template);
      } catch (err) {
        console.warn(`[mapper] Failed to parse ${filePath}:`, (err as Error).message);
      }
    }

    if (!agents.length) continue;

    departments.push({
      id: deptName,
      label: departmentLabel(deptName),
      agents,
      agentCount: agents.length,
    });
  }

  const totalAgents = departments.reduce((sum, d) => sum + d.agentCount, 0);

  return {
    id: 'agency-agents',
    name: 'Agency Agents Library',
    source: 'vendor/agency-agents',
    departments,
    totalAgents,
  };
}

/** Returns a flat list of all AgentTemplates across all departments. */
export function getAllAgents(): AgentTemplate[] {
  return buildAgency().departments.flatMap((d) => d.agents);
}

/** Finds an agent by its slug (basename of the .md file without extension). */
export function findAgentBySlug(slug: string): AgentTemplate | undefined {
  return getAllAgents().find((a) => a.slug === slug);
}
