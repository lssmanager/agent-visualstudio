/**
 * run-repository.ts — Prisma-backed Run persistence
 */
import type { PrismaClient, Prisma } from '@prisma/client';
import type { RunSpec, RunStepSpec } from '../../core-types/src';

export class RunRepository {
  constructor(private readonly db: PrismaClient) {}

  async createRun(data: {
    workspaceId: string;
    agentId?: string | null;
    sessionId?: string | null;
    channelKind?: string | null;
    trigger?: Record<string, unknown>;
    context?: Record<string, unknown>;
    flowId?: string | null;
  }): Promise<RunSpec> {
    const run = await this.db.run.create({
      data: {
        workspaceId: data.workspaceId,
        agentId:     data.agentId     ?? null,
        sessionId:   data.sessionId   ?? null,
        channelKind: data.channelKind as string ?? null,
        status:      'pending',
        trigger:     (data.trigger  ?? {}) as unknown as Prisma.InputJsonValue,
        context:     (data.context  ?? {}) as unknown as Prisma.InputJsonValue,
        flowId:      data.flowId ?? null,
      },
    });

    return {
      id:          run.id,
      workspaceId: run.workspaceId,
      agentId:     run.agentId ?? undefined,
      status:      run.status as RunSpec['status'],
      trigger:     data.trigger as RunSpec['trigger'],
      steps:       [],
    };
  }

  async getRunById(runId: string): Promise<RunSpec | null> {
    const run = await this.db.run.findUnique({
      where: { id: runId },
      include: { steps: true },
    });
    if (!run) return null;

    return {
      id:          run.id,
      workspaceId: run.workspaceId,
      agentId:     run.agentId ?? undefined,
      status:      run.status as RunSpec['status'],
      trigger:     run.trigger as RunSpec['trigger'],
      steps:       run.steps.map((s) => ({
        id:       s.id,
        runId:    s.runId,
        nodeId:   s.nodeId ?? '',
        nodeType: s.nodeType ?? '',
        agentId:  s.agentId ?? undefined,
        status:   s.status as RunStepSpec['status'],
        input:    s.input  as Record<string, unknown>,
        output:   s.output as Record<string, unknown> | undefined,
      })),
    };
  }

  async updateRunStatus(
    runId: string,
    status: string,
    extra?: Partial<{ startedAt: Date; completedAt: Date; error: string }>,
  ): Promise<void> {
    await this.db.run.update({
      where: { id: runId },
      data:  { status, ...extra },
    });
  }

  async createRunStep(data: {
    runId: string;
    nodeId: string;
    nodeType: string;
    agentId?: string | null;
    input?: Record<string, unknown>;
  }): Promise<RunStepSpec> {
    const step = await this.db.runStep.create({
      data: {
        runId:    data.runId,
        nodeId:   data.nodeId,
        nodeType: data.nodeType,
        agentId:  data.agentId ?? null,
        status:   'pending',
        input:    (data.input ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id:       step.id,
      runId:    step.runId,
      nodeId:   step.nodeId ?? '',
      nodeType: step.nodeType ?? '',
      agentId:  step.agentId ?? undefined,
      status:   step.status as RunStepSpec['status'],
      input:    step.input as Record<string, unknown>,
    };
  }

  async updateRunStepStatus(
    stepId: string,
    status: string,
    extra?: Partial<{
      output: Record<string, unknown>;
      error: string;
      completedAt: Date;
    }>,
  ): Promise<void> {
    const data: Record<string, unknown> = { status };
    if (extra?.output)      data['output']      = extra.output as unknown as Prisma.InputJsonValue;
    if (extra?.error)       data['error']       = extra.error;
    if (extra?.completedAt) data['completedAt'] = extra.completedAt;
    await this.db.runStep.update({ where: { id: stepId }, data });
  }

  async findActiveRunsForAgent(agentId: string): Promise<RunSpec[]> {
    const runs = await this.db.run.findMany({
      where: { agentId, status: { in: ['pending', 'running'] } },
      include: { steps: true },
    });
    return runs.map((run) => ({
      id:          run.id,
      workspaceId: run.workspaceId,
      agentId:     run.agentId ?? undefined,
      status:      run.status as RunSpec['status'],
      trigger:     run.trigger as RunSpec['trigger'],
      steps:       run.steps.map((s) => ({
        id:       s.id,
        runId:    s.runId,
        nodeId:   s.nodeId ?? '',
        nodeType: s.nodeType ?? '',
        agentId:  s.agentId ?? undefined,
        status:   s.status as RunStepSpec['status'],
        input:    s.input  as Record<string, unknown>,
        output:   s.output as Record<string, unknown> | undefined,
      })),
    }));
  }

  async getRunStepById(stepId: string): Promise<RunStepSpec | null> {
    const step = await this.db.runStep.findUnique({ where: { id: stepId } });
    if (!step) return null;
    return {
      id:       step.id,
      runId:    step.runId,
      nodeId:   step.nodeId ?? '',
      nodeType: step.nodeType ?? '',
      agentId:  step.agentId ?? undefined,
      status:   step.status as RunStepSpec['status'],
      input:    step.input  as Record<string, unknown>,
      output:   step.output as Record<string, unknown> | undefined,
    };
  }
}
