/**
 * agent.hooks.ts
 *
 * Lifecycle hooks que se llaman desde los route handlers de agentes
 * después de crear o actualizar un agente.
 *
 * afterAgentWrite(): dispara ProfilePropagatorService.propagate() en
 * background (fire-and-forget). No bloquea la respuesta HTTP.
 *
 * Uso en el handler:
 *
 *   // POST /agents
 *   const agent = await prisma.agent.create({ data: ... })
 *   afterAgentWrite(prisma, agent.id, { role: agent.role, goal: agent.goal })
 *   return res.json(agent)
 *
 *   // PATCH /agents/:id
 *   const agent = await prisma.agent.update({ where: { id }, data: ... })
 *   afterAgentWrite(prisma, agent.id, { role: agent.role, goal: agent.goal })
 *   return res.json(agent)
 *
 * Por qué fire-and-forget:
 *   - propagate() es idempotente y seguro de reintentar.
 *   - El AgentProfile es un cache del state del agente — si falla, se
 *     puede reconstruir en el siguiente update o al ejecutar el agente.
 *   - No queremos bloquear la respuesta HTTP por una operación de cache.
 */

import type { PrismaClient } from '@prisma/client';

export interface AgentWriteContext {
  /** Rol del agente — se incluye en el system prompt generado */
  role?: string | null;
  /** Goal del agente */
  goal?: string | null;
  /** System prompt explícito — si se provee, se usa directamente */
  systemPrompt?: string | null;
  /** Persona JSON del agente */
  persona?: Record<string, unknown> | null;
  /** Knowledge base entries */
  knowledgeBase?: Array<{ type: 'url' | 'text' | 'file'; label: string; value: string }> | null;
  /** Formato de respuesta */
  responseFormat?: 'json' | 'markdown' | 'plain' | null;
}

/**
 * Dispara ProfilePropagatorService.propagate() en background.
 *
 * @param prisma   PrismaClient compartido con el handler
 * @param agentId  ID del agente recién creado o actualizado
 * @param ctx      Campos relevantes del agente para el perfil
 */
export function afterAgentWrite(
  prisma:  PrismaClient,
  agentId: string,
  ctx:     AgentWriteContext = {},
): void {
  // Usamos setImmediate para no bloquear el event loop del handler
  setImmediate(() => {
    propagateProfile(prisma, agentId, ctx).catch((err: unknown) => {
      // Log sin lanzar — el perfil es un cache, no estado crítico
      console.error(
        `[agent.hooks] ProfilePropagatorService.propagate() failed for agent ${agentId}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  });
}

async function propagateProfile(
  prisma:  PrismaClient,
  agentId: string,
  ctx:     AgentWriteContext,
): Promise<void> {
  // Lazy require para no crear dependencia circular en el grafo de módulos
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ProfilePropagatorService } = require('../../../../packages/profile-engine/src/index') as {
    ProfilePropagatorService: new (prisma: PrismaClient) => {
      propagate(
        agentId: string,
        input: {
          systemPrompt?:  string | null;
          persona?:       Record<string, unknown> | null;
          knowledgeBase?: Array<{ type: string; label: string; value: string }> | null;
          responseFormat?: string | null;
        },
      ): Promise<unknown>;
    };
  };

  const service = new ProfilePropagatorService(prisma);
  await service.propagate(agentId, {
    systemPrompt:   ctx.systemPrompt   ?? undefined,
    persona:        ctx.persona        ?? undefined,
    knowledgeBase:  ctx.knowledgeBase  ?? undefined,
    responseFormat: ctx.responseFormat ?? undefined,
  });
}
