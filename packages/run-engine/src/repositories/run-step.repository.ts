/**
 * RunStepRepository — Prisma implementation (split, F0-05)
 *
 * Responsabilidad única: CRUD sobre la tabla `RunStep`.
 * Los métodos del Run padre viven en RunRepository.
 *
 * Checkpointing por RunStep:
 *   - `upsert()` — idempotente para retry seguro (crea si no existe).
 *   - `create()` — uso directo cuando no se necesita idempotencia.
 *   - `complete()` / `fail()` / `skip()` — transiciones de estado atómicas.
 *
 * Convenciones:
 *   - Clase stateless; PrismaClient inyectado en constructor.
 */

import type { PrismaClient, RunStepStatus } from '@prisma/client'

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateStepInput {
  runId:     string
  nodeId:    string
  nodeType:  string
  index:     number
  input?:    Record<string, unknown>
}

export interface CompleteStepInput {
  stepId:            string
  output:            unknown
  model?:            string
  provider?:         string
  promptTokens?:     number
  completionTokens?: number
  totalTokens?:      number
  costUsd?:          number
}

export interface FailStepInput {
  stepId: string
  error:  string
}

export interface FindStepsOptions {
  status?: RunStepStatus
  limit?:  number
  offset?: number
}

// ── Repository ────────────────────────────────────────────────────────────────

export class RunStepRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Write ─────────────────────────────────────────────────────────────

  /**
   * Crea un RunStep en estado 'running'.
   * Uso directo sin necesidad de idempotencia.
   */
  async create(input: CreateStepInput) {
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
   * Idempotente: intenta crear; si ya existe un step con el mismo
   * (runId, nodeId, index) lo devuelve sin modificar.
   * Seguro para retries del orquestador.
   */
  async upsert(input: CreateStepInput) {
    // Buscamos primero por combinación lógica (no hay compound unique en el schema)
    const existing = await this.prisma.runStep.findFirst({
      where: { runId: input.runId, nodeId: input.nodeId, index: input.index },
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

  /** Marca el step como completado con métricas de LLM opcionales. */
  async complete(input: CompleteStepInput) {
    return this.prisma.runStep.update({
      where: { id: input.stepId },
      data: {
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

  async fail(input: FailStepInput) {
    return this.prisma.runStep.update({
      where: { id: input.stepId },
      data:  { status: 'failed', error: input.error, completedAt: new Date() },
    })
  }

  async skip(stepId: string) {
    return this.prisma.runStep.update({
      where: { id: stepId },
      data:  { status: 'skipped', completedAt: new Date() },
    })
  }

  async setStatus(stepId: string, status: RunStepStatus) {
    return this.prisma.runStep.update({
      where: { id: stepId },
      data:  { status },
    })
  }

  // ── Read ──────────────────────────────────────────────────────────────

  async findById(stepId: string) {
    return this.prisma.runStep.findUnique({ where: { id: stepId } })
  }

  /** Todos los steps de un Run, ordenados por index. */
  async findByRun(runId: string, opts: FindStepsOptions = {}) {
    return this.prisma.runStep.findMany({
      where: {
        runId,
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { index: 'asc' },
      take:    opts.limit  ?? 200,
      skip:    opts.offset ?? 0,
    })
  }

  /** Steps en estado 'running' de todos los runs de un agente. */
  async findRunningByAgent(agentId: string) {
    return this.prisma.runStep.findMany({
      where:   { run: { agentId }, status: 'running' },
      include: { run: true },
      orderBy: { startedAt: 'asc' },
    })
  }

  async count(runId: string, status?: RunStepStatus) {
    return this.prisma.runStep.count({
      where: { runId, ...(status ? { status } : {}) },
    })
  }
}
