import * as fs from 'fs';
import * as path from 'path';

// Resolved path: packages/agency-agents-loader/src/ -> monorepo root -> vendor/agency-agents
export const SUBMODULE_PATH = path.resolve(__dirname, '../../../vendor/agency-agents');

const NON_DEPARTMENT_DIRS = new Set(['examples', 'scripts', '.git', 'node_modules', '.github']);

/**
 * Returns sorted list of department folder names found in vendor/agency-agents/,
 * excluding non-department directories (examples, scripts, .git, etc.).
 */
export function listDepartments(): string[] {
  if (!fs.existsSync(SUBMODULE_PATH)) {
    throw new Error(
      `[agency-agents-loader] Submodule not found at: ${SUBMODULE_PATH}\n` +
        'Run: git submodule update --init --recursive',
    );
  }
  return fs
    .readdirSync(SUBMODULE_PATH, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !NON_DEPARTMENT_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Returns sorted list of absolute .md file paths within a department folder.
 */
export function loadDepartment(department: string): string[] {
  const deptPath = path.join(SUBMODULE_PATH, department);
  if (!fs.existsSync(deptPath)) {
    throw new Error(`[agency-agents-loader] Department not found: ${department}`);
  }
  return fs
    .readdirSync(deptPath, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(deptPath, e.name))
    .sort();
}

/**
 * Reads a .md file as UTF-8 string.
 * Returns empty string and logs a warning if the file cannot be read.
 */
export function readAgentFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(
      `[agency-agents-loader] Could not read: ${filePath}`,
      (err as Error).message,
    );
    return '';
  }
}
