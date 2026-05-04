import yaml from 'js-yaml';
import type { AgencyAgentTemplate, AgentCategory } from './types';

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Parses a raw .md file string into an AgencyAgentTemplate.
 * Handles both YAML frontmatter + markdown body formats.
 */
export function parseAgentMarkdown(
  raw: string,
  slug: string,
  category: AgentCategory,
): AgencyAgentTemplate {
  const match = raw.match(FRONTMATTER_REGEX);

  let meta: Record<string, unknown> = {};
  let body = raw.trim();

  if (match) {
    try {
      meta = (yaml.load(match[1]) as Record<string, unknown>) ?? {};
    } catch {
      meta = {};
    }
    body = match[2].trim();
  }

  const name =
    (meta['name'] as string) ??
    (meta['title'] as string) ??
    slugToTitle(slug);

  const description =
    (meta['description'] as string) ??
    (meta['role'] as string) ??
    body.split('\n')[0].replace(/^#+\s*/, '').trim();

  const tools: string[] = Array.isArray(meta['tools'])
    ? (meta['tools'] as string[])
    : [];

  return {
    slug,
    category,
    name,
    description,
    systemPrompt: body,
    tools,
    meta,
  };
}

function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
