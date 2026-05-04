import { parseAgentMarkdown } from './parser';
import type { AgencyAgentTemplate, AgentCategory, AGENT_CATEGORIES } from './types';

const GITHUB_RAW_BASE =
  'https://raw.githubusercontent.com/msitarzewski/agency-agents/main';

const GITHUB_API_BASE =
  'https://api.github.com/repos/msitarzewski/agency-agents/contents';

/**
 * Fetches all .md files for a given category from the agency-agents repo.
 * Uses GitHub Contents API to list files, then fetches each raw file.
 */
export async function loadCategoryAgents(
  category: AgentCategory,
): Promise<AgencyAgentTemplate[]> {
  const listUrl = `${GITHUB_API_BASE}/${category}`;

  const res = await fetch(listUrl, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!res.ok) {
    throw new Error(
      `agency-agents: failed to list category "${category}" — HTTP ${res.status}`,
    );
  }

  const files: Array<{ name: string; download_url: string }> = await res.json();
  const mdFiles = files.filter((f) => f.name.endsWith('.md'));

  const templates = await Promise.all(
    mdFiles.map(async (f) => {
      const raw = await fetch(f.download_url).then((r) => r.text());
      const slug = f.name.replace(/\.md$/, '');
      return parseAgentMarkdown(raw, slug, category);
    }),
  );

  return templates;
}

/**
 * Loads a single agent template by category + slug.
 */
export async function loadAgentTemplate(
  category: AgentCategory,
  slug: string,
): Promise<AgencyAgentTemplate> {
  const url = `${GITHUB_RAW_BASE}/${category}/${slug}.md`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `agency-agents: template "${category}/${slug}" not found — HTTP ${res.status}`,
    );
  }

  const raw = await res.text();
  return parseAgentMarkdown(raw, slug, category);
}

/**
 * Lists available slugs in a category without loading full content.
 * Lightweight call for building the Agent Library panel sidebar.
 */
export async function listAgentsInCategory(
  category: AgentCategory,
): Promise<string[]> {
  const res = await fetch(`${GITHUB_API_BASE}/${category}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!res.ok) return [];

  const files: Array<{ name: string }> = await res.json();
  return files
    .filter((f) => f.name.endsWith('.md'))
    .map((f) => f.name.replace(/\.md$/, ''));
}
