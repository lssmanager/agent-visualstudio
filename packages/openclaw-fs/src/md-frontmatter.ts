/**
 * Parse a markdown file with optional YAML frontmatter.
 *
 * Format:
 * ```
 * ---
 * key: value
 * ---
 * # Heading
 * Body content...
 * ```
 */
export interface ParsedMarkdownFile<T = Record<string, unknown>> {
  frontmatter: T;
  body: string;
}

export function parseMarkdownWithFrontmatter<T = Record<string, unknown>>(
  content: string,
): ParsedMarkdownFile<T> {
  const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(fmRegex);

  if (!match) {
    return { frontmatter: {} as T, body: content };
  }

  // Lazy-load yaml-utils to avoid circular deps at module level
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseYaml } = require('./yaml-utils') as { parseYaml: <U>(s: string) => U };
  return {
    frontmatter: parseYaml<T>(match[1]),
    body: match[2].trim(),
  };
}

export function buildMarkdownWithFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { dumpYaml } = require('./yaml-utils') as { dumpYaml: (v: unknown) => string };
  return `---\n${dumpYaml(frontmatter).trim()}\n---\n\n${body}\n`;
}
