/**
 * HierarchyStatusService — árbol de estado de un Run con sub-orquestaciones
 *
 * Resuelve: "¿Qué está pasando en este runId, incluyendo sus sub-orquestaciones
 * delegadas?"
 *
 * Relación padre-hijo entre Runs:
 *   - delegateTask() crea sub-Run con metadata.hierarchyRoot = step.nodeId
 *   - El service une padre→hijo buscando Runs donde:
 *       workspaceId = run.workspaceId
 *       metadata->>'hierarchyRoot' = step.nodeId
 *       createdAt >= run.createdAt   (evitar falsos positivos)
 */

import type { PrismaClient, RunStep } from '@prisma/client'

// ── Constantes ────────────────────────────────────────────────────────────────

/**
 * Timeout de delegación — mismo valor que DELEGATION_TIMEOUT_MS en F2a-07.
 * TODO: reemplazar por import desde hierarchy-orchestrator.ts una vez
 * que F2a-07 esté mergeado en main.
 */
const DELEGATION_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutos

/** Profundidad máxima de expansión de sub-runs */
const MAX_DEPTH = 5

// ── Tipos internos ────────────────────────────────────────────────────────────

type RunWithSteps = NonNullable<
  Awaited<ReturnType<PrismaClient['run']['findUnique']>>
> & { steps: RunStep[] }

// ── Tipos públicos ────────────────────────────────────────────────────────────

/**
 * Status de un RunStep en el árbol de estado.
 * Campos mínimos — suficientes para UI y alertas.
 */
export interface StepNode {
  stepId:    string
  nodeId:    string
  nodeType:  string
  status:    string
  index:     number
  input:     unknown
  output:    unknown
  error:     string | null
  startedAt: Date | null
  finishedAt: Date | null

  // Métricas LLM (null si nodeType es 'delegation' o no hay datos)
  model:            string | null
  provider:         string | null
  promptTokens:     number | null
  completionTokens: number | null
  totalTokens:      number | null
  costUsd:          number | null

  // Si nodeType === 'delegation': sub-árbol del Run hijo
  // null si el Run hijo aún no fue creado o no se encontró
  childRun: RunStatusTree | null
}

/**
 * Árbol de estado completo de un Run, incluyendo
 * sub-runs delegados (recursivo, máximo MAX_DEPTH niveles).
 */
export interface RunStatusTree {
  runId:       string
  workspaceId: string
  agentId:     string | null
  status:      string
  inputData:   unknown
  outputData:  unknown
  error:       string | null
  createdAt:   Date
  startedAt:   Date | null
  finishedAt:  Date | null

  steps:       StepNode[]

  // Agregados calculados en el service
  totalSteps:     number
  completedSteps: number
  failedSteps:    number
  runningSteps:   number
  /** Steps de delegación en 'running' que superaron DELEGATION_TIMEOUT_MS */
  blockedSteps:   number
  totalCostUsd:   number
  totalTokens:    number
  durationMs:     number | null
  depth:          number
}

// ── HierarchyStatusService ───────────────────────────────────────────────────

export class HierarchyStatusService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── API pública ──────────────────────────────────────────────────────

  /**
   * Devuelve el árbol de estado completo de un Run.
   *
   * - Carga el Run con sus RunSteps desde Prisma
   * - Para cada RunStep con nodeType 'delegation': expande el
   *   Run hijo recursivamente (hasta MAX_DEPTH niveles)
   * - Calcula agregados: costo total, tokens, steps bloqueados
   *
   * @param runId  ID del Run a consultar
   * @returns      RunStatusTree completo, o null si no existe
   */
  async getRunStatus(runId: string): Promise<RunStatusTree | null> {
    return this.buildTree(runId, 0)
  }

  /**
   * Lista los Runs de un workspace con sus métricas básicas.
   * NO expande sub-runs (depth 0) — para listados de UI.
   *
   * @param workspaceId ID del workspace
   * @param opts        Filtros opcionales
   */
  async listWorkspaceRuns(
    workspaceId: string,
    opts: {
      status?: string
      limit?:  number
      offset?: number
    } = {},
  ): Promise<RunStatusTree[]> {
    const runs = await this.prisma.run.findMany({
      where: {
        workspaceId,
        ...(opts.status ? { status: opts.status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
      include: { steps: { orderBy: { index: 'asc' } } },
    })

    return Promise.all(
      runs.map((run) => this.assembleTree(run as RunWithSteps, run.steps as RunStep[], 0))
    )
  }

  // ── Construcción del árbol ───────────────────────────────────────────

  /**
   * Carga un Run desde BD y construye su árbol recursivamente.
   * Punto único de entrada recursiva.
   */
  private async buildTree(
    runId: string,
    depth: number,
  ): Promise<RunStatusTree | null> {
    if (depth > MAX_DEPTH) return null

    const run = await this.prisma.run.findUnique({
      where:   { id: runId },
      include: { steps: { orderBy: { index: 'asc' } } },
    })
    if (!run) return null

    return this.assembleTree(run as RunWithSteps, run.steps as RunStep[], depth)
  }

  /**
   * Ensambla RunStatusTree dado un Run y sus steps ya cargados.
   * Expande steps de delegación buscando el Run hijo.
   *
   * Separado de buildTree para poder ser llamado desde listWorkspaceRuns
   * sin una query adicional.
   */
  private async assembleTree(
    run:   RunWithSteps,
    steps: RunStep[],
    depth: number,
  ): Promise<RunStatusTree> {
    // Construir StepNodes expandiendo delegaciones
    const stepNodes: StepNode[] = await Promise.all(
      steps.map((step) =>
        this.buildStepNode(step, run.workspaceId, run.createdAt, depth)
      )
    )

    // Calcular agregados (por nivel — no suma steps de sub-runs)
    const agg = this.aggregate(stepNodes)

    return {
      runId:       run.id,
      workspaceId: run.workspaceId,
      agentId:     run.agentId   ?? null,
      status:      run.status,
      inputData:   run.inputData,
      outputData:  (run as any).outputData ?? null,
      error:       run.error     ?? null,
      createdAt:   run.createdAt,
      startedAt:   run.startedAt ?? null,
      finishedAt:  (run as any).completedAt ?? null,
      steps:       stepNodes,
      ...agg,
      durationMs:  run.startedAt
        ? (((run as any).completedAt ?? new Date()).getTime() - run.startedAt.getTime())
        : null,
      depth,
    }
  }

  /**
   * Construye un StepNode.
   * Si nodeType === 'delegation': busca el Run hijo y lo expande.
   */
  private async buildStepNode(
    step:            RunStep,
    workspaceId:     string,
    parentCreatedAt: Date,
    depth:           number,
  ): Promise<StepNode> {
    let childRun: RunStatusTree | null = null

    if (step.nodeType === 'delegation' && depth < MAX_DEPTH) {
      childRun = await this.findAndExpandChildRun(
        step.nodeId,
        workspaceId,
        parentCreatedAt,
        depth + 1,
      )
    }

    return {
      stepId:    step.id,
      nodeId:    step.nodeId,
      nodeType:  step.nodeType,
      status:    step.status,
      index:     step.index,
      input:     step.input,
      output:    step.output,
      error:     step.error              ?? null,
      startedAt: step.startedAt          ?? null,
      finishedAt: (step as any).completedAt ?? null,
      model:            (step as any).model            ?? null,
      provider:         (step as any).provider         ?? null,
      promptTokens:     (step as any).promptTokens     ?? null,
      completionTokens: (step as any).completionTokens ?? null,
      totalTokens:      (step as any).totalTokens      ?? null,
      costUsd:          (step as any).costUsd          ?? null,
      childRun,
    }
  }

  /**
   * Busca el Run hijo de un step de delegación por:
   *   workspaceId = workspaceId del padre
   *   metadata->>'hierarchyRoot' = nodeId del step
   *   createdAt >= parentCreatedAt  (evitar falsos positivos históricos)
   *
   * Toma el Run más antiguo que cumpla la condición (el primero creado).
   * Fail-open: si la query JSONB falla, devuelve null — sin romper el padre.
   */
  private async findAndExpandChildRun(
    nodeId:          string,
    workspaceId:     string,
    parentCreatedAt: Date,
    depth:           number,
  ): Promise<RunStatusTree | null> {
    try {
      const childRun = await this.prisma.run.findFirst({
        where: {
          workspaceId,
          createdAt: { gte: parentCreatedAt },
          metadata:  { path: ['hierarchyRoot'], equals: nodeId },
        },
        orderBy: { createdAt: 'asc' },
        include: { steps: { orderBy: { index: 'asc' } } },
      })

      if (!childRun) return null

      return this.assembleTree(childRun as RunWithSteps, childRun.steps as RunStep[], depth)
    } catch {
      // Fail-open: si la query JSONB falla (schema sin soporte),
      // el árbol se sirve sin el sub-run — nunca rompe la respuesta del padre.
      return null
    }
  }

  // ── Cálculo de agregados ─────────────────────────────────────────────

  /**
   * Calcula totales a partir de los StepNodes ya construidos.
   * totalSteps es POR NIVEL — no suma los steps de los sub-runs.
   * Los costos SÍ se acumulan recursivamente desde childRun.
   */
  private aggregate(steps: StepNode[]): {
    totalSteps:     number
    completedSteps: number
    failedSteps:    number
    runningSteps:   number
    blockedSteps:   number
    totalCostUsd:   number
    totalTokens:    number
  } {
    let totalSteps     = 0
    let completedSteps = 0
    let failedSteps    = 0
    let runningSteps   = 0
    let blockedSteps   = 0
    let totalCostUsd   = 0
    let totalTokens    = 0

    for (const step of steps) {
      totalSteps++

      if (step.status === 'completed') completedSteps++
      if (step.status === 'failed')    failedSteps++
      if (step.status === 'running')   runningSteps++

      // Step bloqueado: delegación running que superó el timeout
      if (
        step.nodeType  === 'delegation' &&
        step.status    === 'running'    &&
        step.startedAt !== null         &&
        Date.now() - step.startedAt.getTime() > DELEGATION_TIMEOUT_MS
      ) {
        blockedSteps++
      }

      // Acumular costos del step propio
      totalCostUsd += step.costUsd    ?? 0
      totalTokens  += step.totalTokens ?? 0

      // Acumular costos del sub-run (si existe)
      // totalSteps NO se suma — es por nivel
      if (step.childRun) {
        totalCostUsd += step.childRun.totalCostUsd
        totalTokens  += step.childRun.totalTokens
      }
    }

    return {
      totalSteps,
      completedSteps,
      failedSteps,
      runningSteps,
      blockedSteps,
      totalCostUsd,
      totalTokens,
    }
  }
}
