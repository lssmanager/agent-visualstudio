import * as path from 'path';
import matter from 'gray-matter';
import type { AgentTemplate } from './types';

/** Derive a human-readable agent name from the filename or frontmatter. */
function humanName(
  filePath: string,
  department: string,
  frontmatterName?: string,
): string {
  if (frontmatterName?.trim()) return frontmatterName.trim();
  const base = path.basename(filePath, '.md');
  // Strip leading department prefix, e.g. "engineering-backend-architect" -> "backend-architect"
  const withoutPrefix = base.startsWith(`${department}-`)
    ? base.slice(department.length + 1)
    : base;
  return withoutPrefix
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Extract first meaningful paragraph from Markdown body (strips headings, code fences). */
function extractDescription(body: string, maxChars = 200): string {
  const lines = body.split('\n');
  const paragraphLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed && paragraphLines.length === 0) continue;
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('```') ||
      trimmed.startsWith('---')
    )
      continue;
    if (!trimmed && paragraphLines.length > 0) break;
    if (trimmed) paragraphLines.push(trimmed);
  }
  if (!paragraphLines.length) return '';
  const raw = paragraphLines
    .join(' ')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .trim();
  return raw.length > maxChars ? raw.slice(0, maxChars - 1) + '\u2026' : raw;
}

/** Extract suggested tools from frontmatter or body keywords. */
function extractTools(fm: Record<string, unknown>, body: string): string[] {
  if (Array.isArray(fm.tools)) return fm.tools as string[];
  const matches: string[] = [];
  const known = [
    'code_review', 'api_design', 'database_design', 'system_design',
    'testing', 'debugging', 'documentation', 'email', 'calendar',
    'web_search', 'analytics', 'reporting',
  ];
  for (const tool of known) {
    if (body.toLowerCase().includes(tool.replace('_', ' '))) matches.push(tool);
  }
  return matches;
}

/**
 * Parses a raw .md file string into an AgentTemplate.
 * Tolerant: an empty or unparseable file returns a minimal valid object.
 */
export function parseAgentMarkdown(
  filePath: string,
  department: string,
  raw: string,
): AgentTemplate {
  const slug = path.basename(filePath, '.md');
  // Relative path from monorepo root for filePath field
  const relPath = filePath.includes('vendor/')
    ? filePath.slice(filePath.indexOf('vendor/'))
    : filePath;

  if (!raw?.trim()) {
    console.warn(`[parser] Empty file skipped: ${filePath}`);
    return {
      id: slug,
      slug,
      department,
      departmentLabel: department
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      name: humanName(filePath, department),
      description: '',
      systemPrompt: '',
      tools: [],
      tags: [],
      source: 'agency-agents',
      filePath: relPath,
    };
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    console.warn(`[parser] gray-matter failed on ${filePath}:`, (err as Error).message);
    parsed = { data: {}, content: raw } as matter.GrayMatterFile<string>;
  }

  const fm = parsed.data as Record<string, unknown>;
  const body = parsed.content ?? '';

  const description =
    typeof fm.description === 'string' && fm.description.trim()
      ? fm.description.trim().slice(0, 200)
      : extractDescription(body);

  return {
    id: slug,
    slug,
    department,
    departmentLabel:
      typeof fm.department === 'string' && fm.department.trim()
        ? fm.department.trim()
        : department
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
    name: humanName(filePath, department, fm.name as string | undefined),
    description,
    systemPrompt: body.trim(),
    tools: extractTools(fm, body),
    tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
    source: 'agency-agents',
    filePath: relPath,
  };
}
