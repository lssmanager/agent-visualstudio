/**
 * list-n8n-workflows.tool.ts
 *
 * Tool definition para AgentBuilder: `list_n8n_workflows`
 *
 * Lista los workflows n8n registrados como Skills (type='n8n_webhook')
 * en Prisma. Permite al AgentBuilder conocer qué workflows están
 * disponibles para asignar a un agente via assign_skill_to_agent.
 *
 * Issue: #78 (F4b-03)
 * Depende de: #76 (F4b-01)
 */

import type { PrismaClient } from '@prisma/client';

// ─── JSON Schema de la tool ───────────────────────────────────────────────────

export const LIST_N8N_WORKFLOWS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'list_n8n_workflows',
    description:
      'Lists all n8n workflows registered as Skills (type=n8n_webhook) in the database. ' +
      'Use this to discover available workflows before assigning one to an agent. ' +
      'Optionally filter by connectionId to see only workflows from a specific n8n instance.',
    parameters: {
      type: 'object',
      required: [],
      additionalProperties: false,
      properties: {
        connectionId: {
          type: 'string',
          description:
            'Optional. Filter results to only workflows from this N8nConnection. ' +
            'Skill names follow the pattern n8n:{connectionId}:{workflowId}.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum number of workflows to return. Default: 20.',
        },
      },
    },
  },
} as const;

// ─── Handler ──────────────────────────────────────────────────────────────────

export interface ListN8nWorkflowsArgs {
  connectionId?: string;
  limit?:        number;
}

export interface N8nWorkflowSkillItem {
  skillId:      string;
  skillName:    string;
  n8nWorkflowId: string;
  connectionId: string;
  webhookUrl:   string | null;
}

/**
 * Ejecuta la tool list_n8n_workflows.
 *
 * Lee Skills de type='n8n_webhook' desde Prisma.
 * El nombre canónico del skill es: 'n8n:{connectionId}:{n8nWorkflowId}'
 */
export async function handleListN8nWorkflows(
  args: ListN8nWorkflowsArgs,
  prisma: PrismaClient,
): Promise<{
  success: boolean;
  workflows: N8nWorkflowSkillItem[];
  total:   number;
  error?:  string;
}> {
  try {
    // Construimos el filtro de nombre si se proporciona connectionId
    const nameFilter = args.connectionId
      ? { startsWith: `n8n:${args.connectionId}:` }
      : { startsWith: 'n8n:' };

    const skills = await (prisma as unknown as {
      skill: {
        findMany: (args: {
          where: { type: string; name: Record<string, string> };
          take: number;
          orderBy: { createdAt: string };
          select: { id: true; name: true; config: true };
        }) => Promise<Array<{ id: string; name: string; config: unknown }>>;
      };
    }).skill.findMany({
      where: {
        type: 'n8n_webhook',
        name: nameFilter,
      },
      take:    args.limit ?? 20,
      orderBy: { createdAt: 'desc' },
      select:  { id: true, name: true, config: true },
    });

    const workflows: N8nWorkflowSkillItem[] = skills.map((skill) => {
      // Parsear nombre canónico: 'n8n:{connectionId}:{n8nWorkflowId}'
      const parts = skill.name.split(':');
      const connectionId  = parts[1] ?? '';
      const n8nWorkflowId = parts.slice(2).join(':'); // por si el id tiene ':'

      const config = (skill.config ?? {}) as Record<string, unknown>;

      return {
        skillId:       skill.id,
        skillName:     skill.name,
        n8nWorkflowId,
        connectionId,
        webhookUrl:    (config['webhookUrl'] as string | null | undefined) ?? null,
      };
    });

    return {
      success:   true,
      workflows,
      total:     workflows.length,
    };
  } catch (err: unknown) {
    return {
      success:   false,
      workflows: [],
      total:     0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
