/**
 * assign-skill-to-agent.tool.ts
 *
 * Tool definition para AgentBuilder: `assign_skill_to_agent`
 *
 * Registra un AgentSkill (relación Agent ↔ Skill) en Prisma y dispara
 * ProfilePropagatorService.propagateUp() para regenerar el system prompt
 * del orquestador del nivel.
 *
 * Issue: #79 (F4b-04)
 * Depende de: #50 (F2b-04 — hook AgentRepository), #76 (F4b-01)
 */

import type { PrismaClient } from '@prisma/client';

// ─── JSON Schema de la tool ───────────────────────────────────────────────────

export const ASSIGN_SKILL_TO_AGENT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'assign_skill_to_agent',
    description:
      'Assigns an existing Skill (e.g., an n8n workflow registered as n8n_webhook) to an agent. ' +
      'Creates an AgentSkill record in the database and triggers profile propagation so that ' +
      'the orchestrator at the agent\'s level has its system prompt regenerated with the new capability. ' +
      'Use list_n8n_workflows to find the skillId first.',
    parameters: {
      type: 'object',
      required: ['agentId', 'skillId'],
      additionalProperties: false,
      properties: {
        agentId: {
          type: 'string',
          description: 'ID of the agent to assign the skill to.',
        },
        skillId: {
          type: 'string',
          description:
            'ID of the Skill to assign. Use list_n8n_workflows to discover available skillIds.',
        },
        config: {
          type: 'object',
          additionalProperties: true,
          description:
            'Optional per-agent configuration for this skill assignment. ' +
            'E.g., { "webhookPath": "/lead-handler", "credentials": {} }',
        },
      },
    },
  },
} as const;

// ─── Handler ──────────────────────────────────────────────────────────────────

export interface AssignSkillToAgentArgs {
  agentId:  string;
  skillId:  string;
  config?:  Record<string, unknown>;
}

/**
 * Tipos mínimos para acceso a Prisma sin tener el schema completo importado
 * en tiempo de compilación de este archivo.
 */
type PrismaLike = {
  agentSkill: {
    upsert: (args: {
      where: { agentId_skillId: { agentId: string; skillId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<{ id: string; agentId: string; skillId: string }>;
  };
  agent: {
    findUnique: (args: {
      where: { id: string };
      select: { workspaceId: boolean; departmentId: boolean; agencyId: boolean };
    }) => Promise<{ workspaceId: string; departmentId: string; agencyId: string } | null>;
  };
};

/**
 * Ejecuta la tool assign_skill_to_agent.
 *
 * 1. Upsert AgentSkill en Prisma
 * 2. Dispara propagateUp() via evento en proceso o llamada directa
 *    (si ProfilePropagatorService está disponible en el contenedor NestJS)
 */
export async function handleAssignSkillToAgent(
  args: AssignSkillToAgentArgs,
  prisma: PrismaClient,
  propagateUp?: (agentId: string) => Promise<void>,
): Promise<{
  success:      boolean;
  agentSkillId: string;
  agentId:      string;
  skillId:      string;
  propagated:   boolean;
  error?:       string;
}> {
  try {
    const db = prisma as unknown as PrismaLike;

    // ── Paso 1: Upsert AgentSkill ────────────────────────────────────────────
    const agentSkill = await db.agentSkill.upsert({
      where:  { agentId_skillId: { agentId: args.agentId, skillId: args.skillId } },
      create: {
        agentId: args.agentId,
        skillId: args.skillId,
        config:  args.config ?? {},
      },
      update: {
        config: args.config ?? {},
      },
    });

    // ── Paso 2: Disparar propagateUp() si está disponible ───────────────────
    //
    // ProfilePropagatorService.propagateUp() regenera el system prompt del
    // orquestador del nivel del agente (D-24f).
    // Si no está disponible (ej. en tests), se registra como no propagado.
    let propagated = false;
    if (typeof propagateUp === 'function') {
      try {
        await propagateUp(args.agentId);
        propagated = true;
      } catch (propagateErr: unknown) {
        // No es fatal — el AgentSkill ya fue creado. Log para auditoría.
        console.warn(
          `[assign_skill_to_agent] propagateUp failed for agent ${args.agentId}:`,
          propagateErr instanceof Error ? propagateErr.message : String(propagateErr),
        );
      }
    }

    return {
      success:      true,
      agentSkillId: agentSkill.id,
      agentId:      agentSkill.agentId,
      skillId:      agentSkill.skillId,
      propagated,
    };
  } catch (err: unknown) {
    return {
      success:      false,
      agentSkillId: '',
      agentId:      args.agentId,
      skillId:      args.skillId,
      propagated:   false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
