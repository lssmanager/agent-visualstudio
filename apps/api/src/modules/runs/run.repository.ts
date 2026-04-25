/**
 * run.repository.ts — Prisma (nuevo, reemplaza workspaceStore JSON para runs)
 *
 * Cubre operaciones de Run y RunStep incluyendo campos durable-execution:
 *   checkpointData, checkpointSeq, interruptReason, resumePayload, durableState
 *
 * Inspirado en patrones de LangGraph (checkpoints) + AutoGen (durable execution).
 */

import type { RunSpec, RunStep } from '../../../../../packages/core-types/src';
import { prisma } from '../core/db/prisma.service';
// import type { Prisma } from '../../../../../../../../packages/db/generated/client';
// Commented out: Path does not exist. Using type-only import from @prisma/client instead.
import type { Prisma } from '@prisma/client';

// ── Helpers ───────────────────────────────────────────────────────────────

function stepPrismaToSpec(
  row: any,
): RunStep {
  return {
    id:          row.id,
    runId:       row.runId,
    nodeId:      row.nodeId,
    nodeType:    row.nodeType,
    status:      row.status as RunStep['status'],
    agentId:     row.agentId ?? undefined,
    input:       (row.input as any) ?? undefined,
    output:      (row.output as any) ?? undefined,
    error:       row.error ?? undefined,
    retryCount:  row.retryCount,
    tokenUsage:  { input: row.tokenInput, output: row.tokenOutput },
    costUsd:     row.costUsd,
    startedAt:   row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

function runPrismaToSpec(
  row: any,
): RunSpec {
  return {
    id:          row.id,
    workspaceId: row.workspaceId,
    flowId:      row.flowId,
    status:      row.status as RunSpec['status'],
    trigger:     (row.trigger as any) ?? { type: 'manual' },
    steps:       row.steps.map(stepPrismaToSpec),
    error:       row.error ?? undefined,
    metadata:    (row.metadata as any) ?? undefined,
    startedAt:   row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

// ── Repository ────────────────────────────────────────────────────────────

export class RunRepository {
  // ── Runs ────────────────────────────────────────────────

  async create(run: RunSpec): Promise<RunSpec> {
    const row = await prisma.run.create({
      data: {
        id:          run.id,
        workspaceId: run.workspaceId,
        flowId:      run.flowId,
        status:      run.status,
        trigger:     run.trigger as any,
        metadata:    (run.metadata as any) ?? {},
        startedAt:   new Date(run.startedAt),
      },
      include: { steps: true },
    });
    return runPrismaToSpec(row);
  }

  async findById(id: string): Promise<RunSpec | null> {
    const row = await prisma.run.findUnique({
      where:   { id },
      include: { steps: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? runPrismaToSpec(row) : null;
  }

  async listByFlow(flowId: string): Promise<RunSpec[]> {
    const rows = await prisma.run.findMany({
      where:   { flowId },
      include: { steps: true },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map(runPrismaToSpec);
  }

  async listByWorkspace(workspaceId: string): Promise<RunSpec[]> {
    const rows = await prisma.run.findMany({
      where:   { workspaceId },
      include: { steps: true },
      orderBy: { startedAt: 'desc' },
      take:    100, // paginación básica
    });
    return rows.map(runPrismaToSpec);
  }

  async updateStatus(
    id: string,
    status: RunSpec['status'],
    extra?: { error?: string; completedAt?: Date },
  ): Promise<void> {
    await prisma.run.update({
      where: { id },
      data:  {
        status,
        error:       extra?.error ?? undefined,
        completedAt: extra?.completedAt ?? undefined,
      },
    });
  }

  // ── RunSteps ─────────────────────────────────────────────

  async createStep(
    step: RunStep & {
      checkpointData?: unknown;
      checkpointSeq?: number;
      interruptReason?: string;
      resumePayload?: unknown;
      durableState?: string;
    },
  ): Promise<RunStep> {
    const row = await prisma.runStep.create({
      data: {
        id:              step.id,
        runId:           step.runId,
        nodeId:          step.nodeId,
        nodeType:        step.nodeType,
        status:          step.status,
        agentId:         step.agentId ?? null,
        input:           (step.input as any) ?? {},
        output:          (step.output as any) ?? {},
        error:           step.error ?? null,
        retryCount:      step.retryCount ?? 0,
        tokenInput:      step.tokenUsage?.input ?? 0,
        tokenOutput:     step.tokenUsage?.output ?? 0,
        costUsd:         step.costUsd ?? 0,
        startedAt:       step.startedAt ? new Date(step.startedAt) : null,
        completedAt:     step.completedAt ? new Date(step.completedAt) : null,
        // Durable execution
        checkpointData:  (step.checkpointData as any) ?? null,
        checkpointSeq:   step.checkpointSeq ?? 0,
        interruptReason: step.interruptReason ?? null,
        resumePayload:   (step.resumePayload as any) ?? null,
        durableState:    step.durableState ?? 'none',
      },
    });
    return stepPrismaToSpec(row);
  }

  async updateStep(
    id: string,
    patch: Partial<{
      status: RunStep['status'];
      output: Record<string, unknown>;
      error: string;
      completedAt: Date;
      tokenUsage: { input: number; output: number };
      costUsd: number;
      retryCount: number;
      // Durable execution
      checkpointData: unknown;
      checkpointSeq: number;
      interruptReason: string;
      resumePayload: unknown;
      durableState: string;
    }>,
  ): Promise<void> {
    await prisma.runStep.update({
      where: { id },
      data: {
        ...(patch.status       !== undefined && { status:          patch.status }),
        ...(patch.output       !== undefined && { output:          patch.output as any }),
        ...(patch.error        !== undefined && { error:           patch.error }),
        ...(patch.completedAt  !== undefined && { completedAt:     patch.completedAt }),
        ...(patch.tokenUsage   !== undefined && {
          tokenInput:  patch.tokenUsage.input,
          tokenOutput: patch.tokenUsage.output,
        }),
        ...(patch.costUsd      !== undefined && { costUsd:         patch.costUsd }),
        ...(patch.retryCount   !== undefined && { retryCount:      patch.retryCount }),
        // Durable
        ...(patch.checkpointData  !== undefined && { checkpointData:  patch.checkpointData as any }),
        ...(patch.checkpointSeq   !== undefined && { checkpointSeq:   patch.checkpointSeq }),
        ...(patch.interruptReason !== undefined && { interruptReason: patch.interruptReason }),
        ...(patch.resumePayload   !== undefined && { resumePayload:   patch.resumePayload as any }),
        ...(patch.durableState    !== undefined && { durableState:    patch.durableState }),
      },
    });
  }

  /** Checkpoint de durable execution — guarda estado intermedio del step */
  async checkpoint(
    stepId: string,
    seq: number,
    data: unknown,
  ): Promise<void> {
    await prisma.runStep.update({
      where: { id: stepId },
      data:  { checkpointData: data as any, checkpointSeq: seq },
    });
  }

  /** Marcar step como interrumpido esperando aprobación humana u otro trigger */
  async interrupt(
    stepId: string,
    reason: string,
    payload?: unknown,
  ): Promise<void> {
    await prisma.runStep.update({
      where: { id: stepId },
      data:  {
        status:          'waiting_approval',
        interruptReason: reason,
        resumePayload:   (payload as any) ?? null,
        durableState:    'paused',
      },
    });
  }

  /** Reanudar step pausado inyectando resumePayload */
  async resume(
    stepId: string,
    payload: unknown,
  ): Promise<void> {
    await prisma.runStep.update({
      where: { id: stepId },
      data:  {
        status:        'running',
        resumePayload: payload as any,
        durableState:  'resuming',
      },
    });
  }
}
