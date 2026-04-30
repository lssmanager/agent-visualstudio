/**
 * build-tool-definitions.ts
 *
 * Converts an array of Skill rows (from Prisma) into the ToolDefinition[]
 * format expected by the OpenAI chat completions API.
 *
 * Mapping rules:
 *  - 1 SkillFunctionSpec  → 1 ToolDefinition
 *  - Skill with N>1 fns   → N ToolDefinitions, name = `${skill.name}__${fn.name}`
 *    (double underscore separator — safe in the OpenAI name pattern)
 *  - Skill with 1 fn      → 1 ToolDefinition, name = skill.name (no suffix)
 *    (preserves the registered name used in LLM tool_calls)
 *  - Skill with 0 fns     → 1 ToolDefinition with permissive schema
 *    (invoker accepts any args; schema is {type:'object',additionalProperties:true})
 *  - name sanitized to ^[a-zA-Z0-9_-]{1,64}$ — OpenAI requirement
 *  - description truncated to MAX_DESC_LEN (1024) — OpenAI 400 guard
 *  - inputSchema mapped to 'parameters'; always a valid JSON Schema object
 *    (fixes: SkillFunctionSpec[] array was previously passed as parameters directly)
 *
 * This is a pure function — no Prisma, no side effects, fully testeable.
 */

import type { ToolDefinition } from './llm-client';

const MAX_TOOL_NAME_LEN = 64;
const MAX_DESC_LEN      = 1024;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Single function spec stored in Skill.functions (JSONB array).
 * Mirrors core-types/src/skill-spec.ts SkillFunctionSpec — copied here
 * to keep build-tool-definitions.ts free of cross-package imports at runtime.
 */
export interface SkillFunctionSpec {
  name:          string;
  description:   string;
  inputSchema?:  Record<string, unknown>;   // JSON Schema of the input args
  outputSchema?: Record<string, unknown>;   // informational only — not sent to LLM
}

/** Minimal shape of a Skill row coming from Prisma (only what we need) */
export interface SkillRow {
  name:        string;
  description: unknown;   // may be null in DB
  functions:   unknown;   // SkillFunctionSpec[] serialized as JSONB
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Converts Skill rows to ToolDefinitions for the OpenAI/Anthropic API.
 *
 * @param skills  Array of Skill rows (from Prisma skillLinks or a mock)
 * @returns       ToolDefinition[] ready to pass to adapter.chat()
 */
export function buildToolDefinitions(skills: SkillRow[]): ToolDefinition[] {
  const result: ToolDefinition[] = [];

  for (const skill of skills) {
    const skillName = sanitizeName(String(skill.name ?? ''));
    if (!skillName) continue;   // empty after sanitize → skip

    const skillDesc = truncate(String(skill.description ?? ''), MAX_DESC_LEN);
    const fns       = parseFunctions(skill.functions);

    if (fns.length === 0) {
      // No declared functions — permissive tool (invoker accepts any args)
      result.push(makeToolDef(
        skillName,
        skillDesc,
        { type: 'object', properties: {}, additionalProperties: true },
      ));
      continue;
    }

    if (fns.length === 1) {
      // Single function → simple name (no suffix) for tool_call compatibility
      result.push(makeToolDef(
        skillName,
        truncate(fns[0].description || skillDesc, MAX_DESC_LEN),
        toParametersSchema(fns[0].inputSchema),
      ));
      continue;
    }

    // Multiple functions → one ToolDefinition per function, compound name
    for (const fn of fns) {
      const toolName = sanitizeName(`${skillName}__${fn.name}`);
      if (!toolName) continue;
      result.push(makeToolDef(
        toolName,
        truncate(fn.description || skillDesc, MAX_DESC_LEN),
        toParametersSchema(fn.inputSchema),
      ));
    }
  }

  return result;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function makeToolDef(
  name:        string,
  description: string,
  parameters:  Record<string, unknown>,
): ToolDefinition {
  return { type: 'function', function: { name, description, parameters } };
}

/**
 * Converts inputSchema (JSON Schema or undefined) to the 'parameters' field.
 * Always returns a valid JSON Schema object — never an array.
 *
 * Handles three cases:
 *  1. Already a valid object schema → use directly
 *  2. Has 'properties' but missing type → inject type:'object'
 *  3. Anything else → wrap in { type:'object', properties:{ input: <schema> } }
 */
function toParametersSchema(
  inputSchema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!inputSchema) {
    return { type: 'object', properties: {}, additionalProperties: true };
  }

  // Case 1: already a well-formed object schema
  if (
    inputSchema['type'] === 'object' &&
    typeof inputSchema['properties'] === 'object' &&
    inputSchema['properties'] !== null
  ) {
    return inputSchema;
  }

  // Case 2: has properties but no type
  if (
    typeof inputSchema['properties'] === 'object' &&
    inputSchema['properties'] !== null
  ) {
    return { type: 'object', ...inputSchema };
  }

  // Case 3: unknown shape — wrap as a single 'input' parameter
  return {
    type:       'object',
    properties: { input: inputSchema },
    required:   ['input'],
  };
}

/**
 * Safely parses the JSONB 'functions' column to SkillFunctionSpec[].
 * Handles: already-parsed array, JSON string, null/undefined.
 * Returns [] on any failure so callers always get an array.
 */
function parseFunctions(raw: unknown): SkillFunctionSpec[] {
  if (raw === null || raw === undefined) return [];

  let arr: unknown = raw;

  // Prisma may return the JSONB as a string in some configurations
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); }
    catch { return []; }
  }

  if (!Array.isArray(arr)) return [];

  return (arr as unknown[]).filter(
    (f): f is SkillFunctionSpec =>
      typeof f === 'object' &&
      f !== null &&
      typeof (f as Record<string, unknown>)['name'] === 'string',
  );
}

/**
 * Sanitizes a string to match OpenAI's ^[a-zA-Z0-9_-]{1,64}$ requirement.
 *
 * Steps:
 *  1. Replace any invalid char with '_'
 *  2. Collapse consecutive underscores into one
 *  3. Trim leading/trailing underscores
 *  4. Truncate to MAX_TOOL_NAME_LEN
 *
 * Returns '' if the result is empty — caller should skip the tool.
 */
function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_TOOL_NAME_LEN);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '\u2026';
}
