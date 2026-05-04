import { parseAgentMarkdown } from './parser';
import type { AgencyAgentTemplate, AgentCategory } from './types';

const GITHUB_RAW_BASE =
  'https://raw.githubusercontent.com/msitarzewski/agency-agents/main';
const GITHUB_API_BASE =
  'https://api.github.com/repos/msitarzewski/agency-agents/contents';

export async function loadCategoryAgents(
  category: AgentCategory,
): Promise<AgencyAgentTemplate[]> {
  const res = await fetch(`${GITHUB_API_BASE}/${category}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`agency-agents: failed to list "${category}" — HTTP ${res.status}`);

  const files: Array<{ name: string; download_url: string }> = await res.json();
  const mdFiles = files.filter((f) => f.name.endsWith('.md'));

  return Promise.all(
    mdFiles.map(async (f) => {
      const raw = await fetch(f.download_url).then((r) => r.text());
      return parseAgentMarkdown(raw, f.name.replace(/\.md$/, ''), category);
    }),
  );
}

export async function loadAgentTemplate(
  category: AgentCategory,
  slug: string,
): Promise<AgencyAgentTemplate> {
  const res = await fetch(`${GITHUB_RAW_BASE}/${category}/${slug}.md`);
  if (!res.ok) throw new Error(`agency-agents: "${category}/${slug}" not found — HTTP ${res.status}`);
  return parseAgentMarkdown(await res.text(), slug, category);
}

export async function listAgentsInCategory(
  category: AgentCategory,
): Promise<string[]> {
  const res = await fetch(`${GITHUB_API_BASE}/${category}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return [];
  const files: Array<{ name: string }> = await res.json();
  return files.filter((f) => f.name.endsWith('.md')).map((f) => f.name.replace(/\.md$/, ''));
}
