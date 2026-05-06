/**
 * agent-builder.ts — builds AgentWithRelations from Prisma rows
 * Patched: null guards on ws.department and Decimal→number casts.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

export type AgentWithRelations = Awaited<ReturnType<AgentBuilder['buildAgent']>>;

export class AgentBuilder {
  constructor(private readonly db: PrismaClient) {}

  async buildAgent(agentId: string) {
    const agent = await this.db.agent.findUnique({
      where: { id: agentId },
      include: {
        workspace: {
          include: {
            department: {
              include: { agency: true },
            },
          },
        },
        subagents: {
          include: { subagent: true },
        },
        skillLinks: {
          include: { skill: true },
        },
        modelPolicy:  true,
        budgetPolicy: true,
      },
    });

    if (!agent) return null;

    // Normalize nullable fields to avoid downstream type errors
    const ws = agent.workspace;
    const dept = ws?.department ?? null;
    const agency = dept?.agency ?? null;

    return {
      ...agent,
      workspace: ws
        ? {
            ...ws,
            departmentId: ws.departmentId ?? undefined,
            department: dept
              ? {
                  ...dept,
                  agencyId: dept.agencyId ?? undefined,
                  agency: agency ?? undefined,
                }
              : null,
          }
        : null,
    };
  }

  async buildAgentContext(
    agentId: string,
  ): Promise<{
    agentId: string;
    workspaceId: string;
    departmentId: string;
    agencyId: string;
  } | null> {
    const agent = await this.db.agent.findUnique({
      where: { id: agentId },
      include: {
        workspace: {
          include: { department: { include: { agency: true } } },
        },
      },
    });

    if (!agent) return null;

    const workspaceId  = agent.workspaceId ?? '';
    const departmentId = agent.workspace?.departmentId ?? '';
    const agencyId     = agent.workspace?.department?.agencyId ?? '';

    return { agentId, workspaceId, departmentId, agencyId };
  }
}
