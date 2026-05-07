// ─────────────────────────────────────────────────────────────────────────────
// loader.ts — buildAgency(), getAllAgents(), findAgentBySlug()
//
// VENDOR_PATH resolution:
//   At runtime, __dirname = packages/agency-agents-loader/dist/
//   vendor/agency-agents is at monorepo root, so:
//   __dirname/../../../../vendor/agency-agents
//   = packages/agency-agents-loader/dist → ../../../.. → monorepo root
//
// The cache is module-level (singleton per process).
// Call invalidateCache() in tests or hot-reload scenarios.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseAgentFile } from './parser';
import { DEPARTMENTS_META } from './departments';
import type { Agency, AgentTemplate, DepartmentWorkspace } from './types';

// vendor/agency-agents relative to the compiled dist/ output
const VENDOR_PATH = path.resolve(__dirname, '../../../../vendor/agency-agents');

let _cache: Agency | null = null;

/**
 * Build (or return cached) the full Agency catalog from vendor/agency-agents.
 *
 * Graceful degradation:
 *  - If VENDOR_PATH doesn't exist → returns empty Agency with warning.
 *  - Individual unreadable files → skipped silently.
 *  - Unknown departments → included with generic metadata.
 */
export function buildAgency(): Agency {
  if (_cache) return _cache;

  if (!fs.existsSync(VENDOR_PATH)) {
    console.warn(
      `[agency-agents-loader] vendor/agency-agents not found at ${VENDOR_PATH}.\n` +
        `  Run: git submodule update --init vendor/agency-agents`,
    );
    _cache = {
      id: 'agency-agents',
      name: 'Agency Agents Library',
      source: 'vendor/agency-agents',
      departments: [],
      totalAgents: 0,
    };
    return _cache;
  }

  const departments: DepartmentWorkspace[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(VENDOR_PATH, { withFileTypes: true });
  } catch (err) {
    console.error('[agency-agents-loader] Failed to read vendor path:', err);
    entries = [];
  }

  const SKIP_DIRS = new Set(['examples', 'scripts', '.github']);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const deptId = entry.name;
    const deptMeta = DEPARTMENTS_META[deptId] ?? {
      name: deptId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      color: '#6b7280',
      emoji: '\ud83e\udd16',
    };
    const deptPath = path.join(VENDOR_PATH, deptId);

    let files: string[];
    try {
      files = fs.readdirSync(deptPath).filter((f) => f.endsWith('.md'));
    } catch {
      files = [];
    }

    const agents: AgentTemplate[] = files
      .map((f) => parseAgentFile(path.join(deptPath, f), deptId))
      .filter((a): a is AgentTemplate => a !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    departments.push({
      id: deptId,
      name: deptMeta.name,
      color: deptMeta.color,
      emoji: deptMeta.emoji,
      agents,
      agentCount: agents.length,
    });
  }

  departments.sort((a, b) => a.name.localeCompare(b.name));

  const totalAgents = departments.reduce((sum, d) => sum + d.agents.length, 0);

  console.log(
    `[agency-agents-loader] Loaded ${totalAgents} agents across ${departments.length} departments`,
  );

  _cache = {
    id: 'agency-agents',
    name: 'Agency Agents Library',
    source: 'vendor/agency-agents',
    departments,
    totalAgents,
  };

  return _cache;
}

/** Return flat list of all agents across all departments. */
export function getAllAgents(): AgentTemplate[] {
  return buildAgency().departments.flatMap((d) => d.agents);
}

/** Find a single agent by slug (e.g. "engineering-backend-architect"). */
export function findAgentBySlug(slug: string): AgentTemplate | undefined {
  return getAllAgents().find((a) => a.slug === slug);
}

/** Invalidate the in-memory cache (useful in tests or watch mode). */
export function invalidateCache(): void {
  _cache = null;
}
