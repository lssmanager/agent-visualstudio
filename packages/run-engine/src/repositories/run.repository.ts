/**
 * RunRepository — Prisma implementation (split, F0-05)
 *
 * Responsabilidad única: CRUD sobre la tabla `Run` + helper de Approval.
 * Los métodos de RunStep viven en RunStepRepository.
 *
 * Convenciones:
 *   - Clase stateless; PrismaClient inyectado en constructor.
 *   - Todos los métodos son async y devuelven el registro actualizado/creado.
 *   - No hace cache en memoria.
 *
 * Nota de compatibilidad:
 *   El archivo legacy `src/run-repository.ts` continúa exportando una clase
 *   combinada (Run + RunStep) para los consumidores internos existentes
 *   (FlowExecutor, HierarchyOrchestrator). Nuevo código debe usar esta clase.
 */

import type { PrismaClient, RunStatus } from '@prisma/client'

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateRunInput {
  workspaceId:  string
  agentId?:     string
  flowId?:      string
  sessionId?:   string
  channelKind?: string
  inputData?:   Record<string, unknown>
  metadata?:    Record<string, unknown>
}

export interface FindRunsOptions {
  status?:  RunStatus
  agentId?: string
  limit?:   number
  offset?:  number
}

export interface CreateApprovalInput {
  workspaceId:  string
  agentId?:     string
  runId:        string
  stepId:       string
  title:        string
  description?: string
  payload:      Record<string, unknown>
  expiresAt?:   Date
}

// ── Repository ────────────────────────────────────────────────────────────────

export class RunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write ─────────────────────────────────────────────────────────────

  async create(input: CreateRunInput) {
    return this.prisma.run.create({
      data: {
        workspaceId: input.workspaceId,
        agentId:     input.agentId,
        flowId:      input.flowId,
        sessionId:   input.sessionId,
        channelKind: input.channelKind,
        inputData:   (input.inputData ?? {}) as never,
        metadata:    (input.metadata  ?? {}) as never,
        status:      'pending',
      },
    })
  }

  async start(runId: string) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status: 'running', startedAt: new Date() },
    })
  }

  async complete(runId: string, outputData: unknown) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  {
        status:      'completed',
        outputData:  outputData as never,
        completedAt: new Date(),
      },
    })
  }

  async fail(runId: string, error: string) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status: 'failed', error, completedAt: new Date() },
    })
  }

  async pause(runId: string) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status: 'paused' },
    })
  }

  async cancel(runId: string) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status: 'cancelled', completedAt: new Date() },
    })
  }

  async setStatus(runId: string, status: RunStatus) {
    return this.prisma.run.update({
      where: { id: runId },
      data:  { status },
    })
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Devuelve el Run con sus steps ordenados por index. */
  async findById(id: string, includeSteps = false) {
    return this.prisma.run.findUnique({
      where:   { id },
      include: includeSteps
        ? { steps: { orderBy: { index: 'asc' } } }
        : undefined,
    })
  }

  async findByWorkspace(workspaceId: string, opts: FindRunsOptions = {}) {
    return this.prisma.run.findMany({
      where: {
        workspaceId,
        ...(opts.status  ? { status:  opts.status  } : {}),
        ...(opts.agentId ? { agentId: opts.agentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
    })
  }

  async findActiveByWorkspace(workspaceId: string) {
    return this.prisma.run.findMany({
      where:   { workspaceId, status: { in: ['pending', 'running', 'paused'] } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async count(workspaceId: string, status?: RunStatus) {
    return this.prisma.run.count({
      where: { workspaceId, ...(status ? { status } : {}) },
    })
  }

  // ── Approval helper ──────────────────────────────────────────────────────

  /**
   * Crea un Approval vinculado a un Run + RunStep.
   * El Run permanece en estado 'paused' hasta que el Approval se resuelva.
   */
  async createApproval(params: CreateApprovalInput) {
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
   * Polling hasta que el Approval cambia de estado.
   * Intervalo: 2 s. Timeout configurable (default 15 min).
   */
  async waitForApproval(
    approvalId: string,
    timeoutMs = 15 * 60 * 1_000,
  ): Promise<'approved' | 'rejected' | 'expired' | 'timeout'> {
    const deadline = Date.now() + timeoutMs
    const POLL_MS  = 2_000

    while (Date.now() < deadline) {
      const approval = await this.prisma.approval.findUnique({ where: { id: approvalId } })
      if (!approval) return 'expired'
      if (approval.status !== 'pending')
        return approval.status as 'approved' | 'rejected' | 'expired'
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
    return 'timeout'
  }
}
