/**
 * create-n8n-workflow.tool.ts
 *
 * Tool definition para AgentBuilder: `create_n8n_workflow`
 *
 * Permite al AgentBuilder generar un workflow n8n real a partir de una
 * descripción en lenguaje natural. Internamente llama a
 * N8nStudioHelper.createWorkflowFromDescription().
 *
 * JSON Schema compatible con OpenAI function calling / tool_calls.
 *
 * Issue: #77 (F4b-02)
 * Depende de: #76 (F4b-01) — N8nStudioHelper
 */

import type { N8nStudioHelper, CreateWorkflowFromDescriptionResult } from '../n8n-studio-helper';

// ─── JSON Schema de la tool ───────────────────────────────────────────────────

export const CREATE_N8N_WORKFLOW_TOOL = {
  type: 'function' as const,
  function: {
    name: 'create_n8n_workflow',
    description:
      'Generates and registers a real n8n workflow from a natural language description. ' +
      'Uses an LLM to produce the node/connection spec, creates the workflow in n8n, ' +
      'and registers it as a Skill of type n8n_webhook in the database. ' +
      'Returns the skillId and webhookUrl so the workflow can immediately be assigned to an agent.',
    parameters: {
      type: 'object',
      required: ['description', 'connectionId', 'agentId', 'workspaceId', 'departmentId', 'agencyId'],
      additionalProperties: false,
      properties: {
        description: {
          type: 'string',
          minLength: 10,
          maxLength: 2000,
          description:
            'Natural language description of the desired workflow. ' +
            'Be specific about triggers (webhook, schedule), actions (send email, HTTP call), ' +
            'and any conditions. Example: ' +
            '"Create a workflow that sends an email when a lead arrives via webhook, ' +
            'then posts a summary to a Slack channel."',
        },
        connectionId: {
          type: 'string',
          description:
            'ID of the N8nConnection record in Prisma to use for creating the workflow. ' +
            'Use list_n8n_workflows to see available connections first.',
        },
        agentId: {
          type: 'string',
          description:
            'ID of the agent requesting the workflow creation. ' +
            'Used to resolve the ModelPolicy (cascada agent→workspace→dept→agency).',
        },
        workspaceId: {
          type: 'string',
          description: 'Workspace ID of the requesting agent. Required for ModelPolicy resolution.',
        },
        departmentId: {
          type: 'string',
          description: 'Department ID of the requesting agent. Required for ModelPolicy resolution.',
        },
        agencyId: {
          type: 'string',
          description: 'Agency ID of the requesting agent. Required for ModelPolicy resolution.',
        },
        activate: {
          type: 'boolean',
          default: false,
          description:
            'If true, the workflow is activated in n8n immediately after creation. ' +
            'Default is false (workflow created in inactive state).',
        },
      },
    },
  },
} as const;

// ─── Handler ──────────────────────────────────────────────────────────────────

export interface CreateN8nWorkflowArgs {
  description:  string;
  connectionId: string;
  agentId:      string;
  workspaceId:  string;
  departmentId: string;
  agencyId:     string;
  activate?:    boolean;
}

/**
 * Ejecuta la tool create_n8n_workflow.
 *
 * Retorna un objeto serializable que el LLM puede leer como tool result.
 */
export async function handleCreateN8nWorkflow(
  args: CreateN8nWorkflowArgs,
  helper: N8nStudioHelper,
): Promise<{
  success:       boolean;
  skillId:       string;
  n8nWorkflowId: string;
  name:          string;
  webhookUrl:    string | undefined;
  active:        boolean;
  nodesCount:    number;
  error?:        string;
}> {
  try {
    const result: CreateWorkflowFromDescriptionResult =
      await helper.createWorkflowFromDescription({
        description:  args.description,
        connectionId: args.connectionId,
        agentId:      args.agentId,
        workspaceId:  args.workspaceId,
        departmentId: args.departmentId,
        agencyId:     args.agencyId,
        activate:     args.activate ?? false,
      });

    return {
      success:       true,
      skillId:       result.skillId,
      n8nWorkflowId: result.n8nWorkflowId,
      name:          result.name,
      webhookUrl:    result.webhookUrl,
      active:        result.active,
      nodesCount:    result.generatedSpec.nodes.length,
    };
  } catch (err: unknown) {
    return {
      success:       false,
      skillId:       '',
      n8nWorkflowId: '',
      name:          '',
      webhookUrl:    undefined,
      active:        false,
      nodesCount:    0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
