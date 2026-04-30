/**
 * RunRepository — Prisma implementation
 *
 * Reemplaza la implementación basada en archivos JSON por Prisma + PostgreSQL.
 * Mantiene la misma interfaz pública para que FlowExecutor y HierarchyOrchestrator
 * no necesiten cambios en sus imports.
 *
 * Checkpointing por RunStep:
 *   - upsertStep(): crea o devuelve existente por (runId, nodeId, index) — idempotente
 *   - createStep(): crea directamente sin check de existencia (uso primario en FlowExecutor)
 *   - completeStep() / failStep(): transición de estado atómica con timestamps
 *
 * La clase es stateless — no mantiene cache en memoria.
 * El singleton de Prisma lo provee lib/prisma.ts del API.
 */

import type { PrismaClient, RunStatus, RunStepStatus } from '@prisma/client'

// ── DTOs públicos ───────────────────────────────────────────────────────────────────────────────────

export interface CreateRunInput {
  workspaceId: string
  agentId?:    string
  flowId?:     string
  sessionId?:  string
  channelKind?: string
  inputData?:  Record<string, unknown>
  metadata?:   Record<string, unknown>
}

export interface UpsertStepInput {
  runId:    string
  nodeId:   string
  nodeType: string
  index:    number
  input?:   Record<string, unknown>
}

export interface CompleteStepInput {
  stepId:           string
  output:           unknown
  model?:           string
  provider?:        string
  promptTokens?:    number
  completionTokens?: number
  totalTokens?:     number
  costUsd?:         number
}

export interface FailStepInput {
  stepId: string
  error:  string
}

// ── Repository ───────────────────────────────────────────────────────────────────────────────────

export class RunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Run CRUD ────────────────────────────────────────────────────────────────

  async createRun(input: CreateRunInput) {
    return this.prisma.run.create({
      data: {
        workspaceId: input.workspaceId,
        agentId:     input.agentId,
        flowId:      input.flowId,
        sessionId:   input.sessionId,
        channelKind: input.channelKind,
        inputData:   input.inputData  ?? {},
        metadata:    input.metadata   ?? {},
        status:      'pending',
      },
    })
  }

  async startRun(runId: string) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status: 'running', startedAt: new Date() },
    })
  }

  async completeRun(runId: string, outputData: unknown) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  {
        status:      'completed',
        outputData:  outputData as never,
        completedAt: new Date(),
      },
    })
  }

  async failRun(runId: string, error: string) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  {
        status:      'failed',
        error,
        completedAt: new Date(),
      },
    })
  }

  async pauseRun(runId: string) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status: 'paused' },
    })
  }

  async cancelRun(runId: string) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status: 'cancelled', completedAt: new Date() },
    })
  }

  async setRunStatus(runId: string, status: RunStatus) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status },
    })
  }

  async findRunById(id: string) {
    return this.prisma.run.findUnique({
      where:   { id },
      include: { steps: { orderBy: { index: 'asc' } } },
    })
  }

  async findRunsByWorkspace(
    workspaceId: string,
    opts: { status?: RunStatus; limit?: number; offset?: number } = {},
  ) {
    return this.prisma.run.findMany({
      where:   { workspaceId, ...(opts.status ? { status: opts.status } : {}) },
      orderBy: { createdAt: 'desc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
      include: { steps: false },
    })
  }

  // ── RunStep (checkpoints) ─────────────────────────────────────────────────────

  /**
   * Returns the existing RunStep for (runId, nodeId, index) if it already exists,
   * otherwise creates a new one in status 'running'.
   *
   * Idempotent: safe to call multiple times for the same step (e.g. on retry).
   * Replaces the previous `id: 'non-existent'` upsert hack.
   */
  async upsertStep(input: UpsertStepInput) {
    const existing = await this.prisma.runStep.findFirst({
      where: {
        runId:  input.runId,
        nodeId: input.nodeId,
        index:  input.index,
      },
    })
    if (existing) return existing

    return this.prisma.runStep.create({
      data: {
        runId:     input.runId,
        nodeId:    input.nodeId,
        nodeType:  input.nodeType,
        index:     input.index,
        input:     (input.input ?? {}) as never,
        status:    'running',
        startedAt: new Date(),
      },
    })
  }

  /**
   * Creates a RunStep directly (no existence check).
   * Primary method used by FlowExecutor.walkGraph().
   * Prefer this over upsertStep when you know the step is new.
   */
  async createStep(input: UpsertStepInput) {
    return this.prisma.runStep.create({
      data: {
        runId:     input.runId,
        nodeId:    input.nodeId,
        nodeType:  input.nodeType,
        index:     input.index,
        input:     (input.input ?? {}) as never,
        status:    'running',
        startedAt: new Date(),
      },
    })
  }

  async completeStep(input: CompleteStepInput) {
    return this.prisma.runStep.update({
      where: { id: input.stepId },
      data:  {
        status:           'completed',
        output:           input.output as never,
        model:            input.model,
        provider:         input.provider,
        promptTokens:     input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens:      input.totalTokens,
        costUsd:          input.costUsd,
        completedAt:      new Date(),
      },
    })
  }

  async failStep(input: FailStepInput) {
    return this.prisma.runStep.update({
      where: { id: input.stepId },
      data:  {
        status:      'failed',
        error:       input.error,
        completedAt: new Date(),
      },
    })
  }

  async skipStep(stepId: string) {
    return this.prisma.runStep.update({
      where: { id: stepId },
      data:  { status: 'skipped', completedAt: new Date() },
    })
  }

  async getRunSteps(runId: string) {
    return this.prisma.runStep.findMany({
      where:   { runId },
      orderBy: { index: 'asc' },
    })
  }

  async getStepById(stepId: string) {
    return this.prisma.runStep.findUnique({ where: { id: stepId } })
  }

  /**
   * Alias semántico de getStepById — usado por HierarchyOrchestrator.getStepStatus().
   * READ-ONLY: no modifica el step.
   */
  async findStep(stepId: string) {
    return this.prisma.runStep.findUnique({ where: { id: stepId } })
  }

  /**
   * Exposes the PrismaClient for sub-orchestrators created by delegateTask().
   * Required by F2a-03: HierarchyOrchestrator needs to pass the same client
   * to child orchestrators without breaking the repository abstraction.
   */
  getPrisma(): PrismaClient {
    return this.prisma
  }

  // ── Approval helper ─────────────────────────────────────────────────────────────

  /**
   * Creates an Approval linked to a Run + RunStep.
   * Used by HierarchyOrchestrator when hitl=true on a node.
   */
  async createApproval(params: {
    workspaceId: string
    agentId?:    string
    runId:       string
    stepId:      string
    title:       string
    description?: string
    payload:     Record<string, unknown>
    expiresAt?:  Date
  }) {
    return this.prisma.approval.create({
      data: {
        workspaceId: params.workspaceId,
        agentId:     params.agentId,
        runId:       params.runId,
        stepId:      params.stepId,
        title:       params.title,
        description: params.description,
        payload:     params.payload,
        expiresAt:   params.expiresAt,
        status:      'pending',
      },
    })
  }

  /**
   * Active polling until an Approval changes status.
   * Uses a 2s interval and a configurable timeout.
   */
  async waitForApproval(
    approvalId: string,
    timeoutMs = 15 * 60 * 1000, // 15 min default
  ): Promise<'approved' | 'rejected' | 'expired' | 'timeout'> {
    const deadline = Date.now() + timeoutMs
    const POLL_MS  = 2_000

    while (Date.now() < deadline) {
      const approval = await this.prisma.approval.findUnique({ where: { id: approvalId } })
      if (!approval) return 'expired'
      if (approval.status !== 'pending') return approval.status as 'approved' | 'rejected' | 'expired'
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    return 'timeout'
  }
}
