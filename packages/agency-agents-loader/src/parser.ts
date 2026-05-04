// ─────────────────────────────────────────────────────────────────────────────
// parser.ts — parse a single .md agent file into AgentTemplate
//
// Frontmatter format (real files):
//   ---
//   name: Backend Architect
//   description: Senior backend architect specializing in...
//   color: blue
//   emoji: 🏗️
//   vibe: Designs the systems that hold everything up — databases, APIs, cloud, scale.
//   ---
//   <body = system prompt>
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentTemplate } from './types.js';

/** Matches YAML frontmatter between --- delimiters. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Minimal YAML line parser.
 * Handles scalar strings, inline arrays [a, b], and quoted values.
 * Does NOT support multi-line values — agency-agents doesn't use them.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.trimEnd();
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();

    const unquoted = rawVal.replace(/^["']|["']$/g, '');

    if (rawVal.startsWith('[')) {
      const inner = rawVal.slice(1, rawVal.lastIndexOf(']'));
      result[key] = inner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      result[key] = unquoted;
    }
  }

  return result;
}

/**
 * Derive tags from department name, vibe words, and slug tokens.
 * Produces 3-8 lowercase tags useful for the Library panel search/filter.
 */
function deriveTags(department: string, vibe: string | undefined, slug: string): string[] {
  const tags = new Set<string>();

  tags.add(department.toLowerCase());

  if (vibe) {
    const vibeWords = vibe
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    vibeWords.slice(0, 4).forEach((w) => tags.add(w));
  }

  const slugTokens = slug
    .replace(`${department}-`, '')
    .split('-')
    .filter((w) => w.length > 3);
  slugTokens.slice(0, 3).forEach((w) => tags.add(w));

  return [...tags].slice(0, 8);
}

/**
 * Parse a single .md file from vendor/agency-agents.
 * Returns null if the file has no valid frontmatter.
 */
export function parseAgentFile(filePath: string, department: string): AgentTemplate | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const match = FRONTMATTER_RE.exec(raw);
  if (!match) return null;

  const [, yamlBlock, body] = match;
  const meta = parseSimpleYaml(yamlBlock);
  const slug = path.basename(filePath, '.md');

  const vibe = typeof meta['vibe'] === 'string' ? meta['vibe'] : undefined;
  const color = typeof meta['color'] === 'string' ? meta['color'] : '#6b7280';

  const COLOR_MAP: Record<string, string> = {
    blue: '#2563eb',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#f59e0b',
    purple: '#7c3aed',
    pink: '#ec4899',
    orange: '#ea580c',
    teal: '#0d9488',
    cyan: '#0891b2',
    indigo: '#6366f1',
    gray: '#6b7280',
    slate: '#64748b',
    emerald: '#059669',
    violet: '#8b5cf6',
    amber: '#d97706',
    lime: '#65a30d',
    sky: '#0284c7',
    rose: '#e11d48',
  };

  const resolvedColor =
    color.startsWith('#') ? color : COLOR_MAP[color.toLowerCase()] ?? '#6b7280';

  return {
    id: `${department}/${slug}`,
    slug,
    name: typeof meta['name'] === 'string' ? meta['name'] : slug,
    description: typeof meta['description'] === 'string' ? meta['description'] : '',
    department,
    emoji: typeof meta['emoji'] === 'string' ? meta['emoji'] : '🤖',
    color: resolvedColor,
    vibe,
    tags: deriveTags(department, vibe, slug),
    systemPrompt: body.trim() || undefined,
  };
}
