/**
 * tools/index.ts
 *
 * Punto de entrada del directorio de tools del AgentBuilder (F4b).
 *
 * Exporta:
 *   - Las definiciones de tool (JSON Schema compatible con OpenAI tool_calls)
 *   - Los handlers correspondientes
 *
 * Uso desde BuilderAgentService:
 *
 *   import { BUILDER_AGENT_TOOLS, dispatchToolCall } from './tools';
 *
 *   // Para pasar al LLM:
 *   const response = await llmClient.chat({ tools: BUILDER_AGENT_TOOLS, ... });
 *
 *   // Para ejecutar el tool_call devuelto:
 *   const result = await dispatchToolCall(toolCall, { helper, prisma, propagateUp });
 */

export { CREATE_N8N_WORKFLOW_TOOL, handleCreateN8nWorkflow } from './create-n8n-workflow.tool';
export type { CreateN8nWorkflowArgs } from './create-n8n-workflow.tool';

export { LIST_N8N_WORKFLOWS_TOOL, handleListN8nWorkflows } from './list-n8n-workflows.tool';
export type { ListN8nWorkflowsArgs, N8nWorkflowSkillItem } from './list-n8n-workflows.tool';

export { ASSIGN_SKILL_TO_AGENT_TOOL, handleAssignSkillToAgent } from './assign-skill-to-agent.tool';
export type { AssignSkillToAgentArgs } from './assign-skill-to-agent.tool';

import { CREATE_N8N_WORKFLOW_TOOL }   from './create-n8n-workflow.tool';
import { LIST_N8N_WORKFLOWS_TOOL }    from './list-n8n-workflows.tool';
import { ASSIGN_SKILL_TO_AGENT_TOOL } from './assign-skill-to-agent.tool';

import type { N8nStudioHelper }    from '../n8n-studio-helper';
import type { PrismaClient }       from '@prisma/client';

// ─── Array de tools para pasar directamente al LLM ───────────────────────────

/** Todas las tool definitions del AgentBuilder, listas para el array `tools` del LLM. */
export const BUILDER_AGENT_TOOLS = [
  CREATE_N8N_WORKFLOW_TOOL,
  LIST_N8N_WORKFLOWS_TOOL,
  ASSIGN_SKILL_TO_AGENT_TOOL,
] as const;

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export interface DispatchToolCallDeps {
  helper:      N8nStudioHelper;
  prisma:      PrismaClient;
  propagateUp?: (agentId: string) => Promise<void>;
}

/**
 * Despacha un tool_call del LLM al handler correcto.
 *
 * @param toolCall  - El objeto tool_call devuelto por el LLM
 * @param deps      - Dependencias necesarias por los handlers
 * @returns         - Resultado serializable como tool result
 */
export async function dispatchToolCall(
  toolCall: { function: { name: string; arguments: string } },
  deps: DispatchToolCallDeps,
): Promise<unknown> {
  const { name, arguments: argsJson } = toolCall.function;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let args: any;
  try {
    args = JSON.parse(argsJson);
  } catch {
    throw new Error(`[dispatchToolCall] Invalid JSON arguments for tool '${name}': ${argsJson.slice(0, 100)}`);
  }

  switch (name) {
    case 'create_n8n_workflow':  {
      const { handleCreateN8nWorkflow }  = await import('./create-n8n-workflow.tool');
      return handleCreateN8nWorkflow(args, deps.helper);
    }
    case 'list_n8n_workflows': {
      const { handleListN8nWorkflows }   = await import('./list-n8n-workflows.tool');
      return handleListN8nWorkflows(args, deps.prisma);
    }
    case 'assign_skill_to_agent': {
      const { handleAssignSkillToAgent } = await import('./assign-skill-to-agent.tool');
      return handleAssignSkillToAgent(args, deps.prisma, deps.propagateUp);
    }
    default:
      throw new Error(`[dispatchToolCall] Unknown tool: '${name}'`);
  }
}
