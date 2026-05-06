/**
 * skill-bridge.ts
 * Converts SkillSpec[] from @lssmanager/skill-registry into McpToolDefinition[]
 * so that flow-engine can mount registered skills as MCP tools at runtime.
 *
 * Usage:
 *   import { skillsToMcpTools } from '@lssmanager/mcp-server/skill-bridge';
 *   const tools = skillsToMcpTools(registry.list());
 *   server.addTools(tools);
 */
import { z } from 'zod';
import type { McpToolDefinition } from './tools';
import { formatErrorResponse, formatTextResponse } from './format';

/** Minimal SkillSpec shape needed by the bridge — avoids circular dep */
export interface BridgedSkillSpec {
  id: string;
  name: string;
  description: string;
  category: string;
  functions: Array<{
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
  }>;
  /** Optional HTTP endpoint if the skill is a REST/webhook adapter */
  endpoint?: string;
}

/**
 * Converts a single SkillSpec function into an MCP tool.
 * The tool name follows the pattern: `skill__{skillId}__{functionName}`
 * to avoid collisions with core lss* tools.
 */
function skillFunctionToMcpTool(
  skill: BridgedSkillSpec,
  fn: BridgedSkillSpec['functions'][number],
): McpToolDefinition {
  const toolName = `skill__${skill.id}__${fn.name}`;

  // Build a permissive Zod schema from the inputSchema JSON Schema if present,
  // otherwise fall back to passthrough record.
  const schema: z.AnyZodObject = fn.inputSchema
    ? buildZodFromJsonSchema(fn.inputSchema)
    : z.object({}).passthrough();

  return {
    name: toolName,
    description: `[${skill.category}] ${fn.description}`,
    schema,
    execute: async (input) => {
      try {
        if (!skill.endpoint) {
          throw new Error(
            `Skill "${skill.id}" has no endpoint configured. ` +
              `Mount a concrete executor before calling this tool.`,
          );
        }
        const response = await fetch(skill.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ function: fn.name, input }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `Skill endpoint ${skill.endpoint} returned ${response.status}: ${text}`,
          );
        }
        const result: unknown = await response.json();
        return formatTextResponse(result);
      } catch (error) {
        return formatErrorResponse(error);
      }
    },
  };
}

/**
 * Naively maps a JSON Schema object to a Zod schema.
 * Handles the common case (flat object with string/number/boolean/array props).
 * Complex nested schemas fall back to z.object({}).passthrough().
 */
function buildZodFromJsonSchema(
  jsonSchema: Record<string, unknown>,
): z.AnyZodObject {
  if (jsonSchema.type !== 'object' || !jsonSchema.properties) {
    return z.object({}).passthrough();
  }

  const props = jsonSchema.properties as Record<string, { type?: string; description?: string }>;
  const required = Array.isArray(jsonSchema.required)
    ? (jsonSchema.required as string[])
    : [];

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(props)) {
    let fieldSchema: z.ZodTypeAny;
    switch (prop.type) {
      case 'string':
        fieldSchema = z.string();
        break;
      case 'number':
      case 'integer':
        fieldSchema = z.number();
        break;
      case 'boolean':
        fieldSchema = z.boolean();
        break;
      case 'array':
        fieldSchema = z.array(z.unknown());
        break;
      default:
        fieldSchema = z.unknown();
    }
    if (!required.includes(key)) {
      fieldSchema = fieldSchema.optional();
    }
    shape[key] = fieldSchema;
  }

  return z.object(shape);
}

/**
 * Convert an array of BridgedSkillSpec into McpToolDefinition[].
 * Each function in each skill becomes one MCP tool.
 */
export function skillsToMcpTools(
  skills: BridgedSkillSpec[],
): McpToolDefinition[] {
  return skills.flatMap((skill) =>
    skill.functions.map((fn) => skillFunctionToMcpTool(skill, fn)),
  );
}
