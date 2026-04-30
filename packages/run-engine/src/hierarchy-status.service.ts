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
 *
 * F2a-09 añade:
 *   - isBlocked(): función pura, detecta step 'queued' expirado (D-22e)
 *   - deriveParentStatus(): función pura, regla de prioridad D-23f
 *   - derivedStatus en RunStatusTree (calculado, no persistido en BD)
 *   - effectiveStatus en StepNode (hereda derivedStatus del childRun)
 */

import type { PrismaClient, RunStep } from '@prisma/client'

// ── Constantes ────────────────────────────────────────────────────────────

/**
 * Timeout de delegación — D-22e: 30 segundos por defecto, configurable por env.
 * TODO: cuando F2a-07 esté en main, reemplazar por import de DELEGATION_TIMEOUT_MS
 *       desde hierarchy-orchestrator.ts.
 */
const DELEGATION_TIMEOUT_MS = parseInt(
  process.env['DELEGATION_TIMEOUT_MS'] ?? '30000',
  10,
)

/** Profundidad máxima de expansión de sub-runs */
const MAX_DEPTH = 5

// ── Tipos internos ────────────────────────────────────────────────────────────

type RunWithSteps = NonNullable<
  Awaited<ReturnType<PrismaClient['run']['findUnique']>>
> & { steps: RunStep[] }

/**
 * Status efectivo de un nodo para el cálculo de deriveParentStatus.
 * 'blocked' es virtual: no existe en BD, lo produce isBlocked().
 */
type NodeStatus = {
  status:
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'cancelled'
    | 'waitingapproval'
    | 'blocked'   // virtual — producido por isBlocked()
}

// ── Funciones puras exportadas ─────────────────────────────────────────────

/**
 * Determina si un RunStep de delegación está bloqueado.
 *
 * Un step está bloqueado cuando (D-22e):
 *   - Está en 'queued' (nunca llegó a 'running')
 *   - startedAt es null (confirma que nunca arranó)
 *   - Lleva más de DELEGATION_TIMEOUT_MS desde createdAt sin iniciar
 *
 * 'blocked' es un status VIRTUAL — no existe en BD.
 * Lo consume deriveParentStatus() para calcular el status del padre.
 *
 * @param step  Campos mínimos necesarios para la evaluación
 * @returns     true si el step está bloqueado
 */
export function isBlocked(step: {
  status:    string
  startedAt: Date | null
  createdAt: Date
}): boolean {
  return (
    step.status    === 'queued' &&
    step.startedAt === null     &&
    Date.now() - step.createdAt.getTime() > DELEGATION_TIMEOUT_MS
  )
}

/**
 * Deriva el status de un nodo padre a partir de los status de sus hijos.
 * Aplica la regla de prioridad D-23f.
 *
 * Orden de prioridad (el primero que se cumple gana):
 *   1. failed   ← cualquier hijo fallido
 *   2. blocked  ← cualquier hijo bloqueado (status virtual)
 *   3. running  ← cualquier hijo en ejecución
 *   4. queued   ← cualquier hijo encolado
 *   5. completed ← todos los hijos terminados (completed | skipped | cancelled)
 *   6. running  ← fallback (waitingapproval u otro estado activo no previsto)
 *
 * Los llamadores deben mapear cada hijo a NodeStatus ANTES de llamar
 * esta función, aplicando isBlocked() para producir el status virtual
 * 'blocked' cuando corresponda.
 *
 * @param children  Array de NodeStatus de los steps/runs hijos.
 *                  Array vacío → devuelve 'completed' (nada que esperar).
 * @returns         Status derivado del padre.
 */
export function deriveParentStatus(children: NodeStatus[]): string {
  if (children.length === 0) return 'completed'

  if (children.some((c) => c.status === 'failed'))  return 'failed'
  if (children.some((c) => c.status === 'blocked')) return 'blocked'
  if (children.some((c) => c.status === 'running')) return 'running'
  if (children.some((c) => c.status === 'queued'))  return 'queued'

  const terminalStatuses = new Set(['completed', 'skipped', 'cancelled'])
  if (children.every((c) => terminalStatuses.has(c.status))) return 'completed'

  // waitingapproval u otro estado activo no previsto → activo en espera
  return 'running'
}

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
  createdAt: Date   // necesario para isBlocked()

  // Métricas LLM (null si nodeType es 'delegation' o no hay datos)
  model:            string | null
  provider:         string | null
  promptTokens:     number | null
  completionTokens: number | null
  totalTokens:      number | null
  costUsd:          number | null

  /**
   * Para steps de delegación: hereda el derivedStatus del childRun si existe.
   * Para otros tipos: igual que status.
   * Usa este campo en la UI para mostrar el estado real al usuario.
   */
  effectiveStatus: string

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
  status:        string   // status real en BD — NO se modifica
  derivedStatus: string   // calculado por deriveParentStatus()
                           // puede diferir de status si BD está desactualizada
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
  /** Steps de delegación en 'queued' (sin startedAt) que superaron DELEGATION_TIMEOUT_MS */
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
   * - Calcula derivedStatus con deriveParentStatus()
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
   * Calcula derivedStatus mediante deriveParentStatus().
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

    // Mapear steps a NodeStatus para derivación (isBlocked() produce 'blocked' virtual)
    const nodeStatuses: NodeStatus[] = stepNodes.map((step) => ({
      status: isBlocked({
        status:    step.status,
        startedAt: step.startedAt,
        createdAt: step.createdAt,
      })
        ? 'blocked'
        : (step.status as NodeStatus['status']),
    }))

    const derivedStatus = deriveParentStatus(nodeStatuses)

    // Calcular agregados por nivel
    const agg = this.aggregate(stepNodes)

    return {
      runId:         run.id,
      workspaceId:   run.workspaceId,
      agentId:       run.agentId   ?? null,
      status:        run.status,       // valor real en BD
      derivedStatus,                   // valor calculado
      inputData:     run.inputData,
      outputData:    (run as any).outputData ?? null,
      error:         run.error     ?? null,
      createdAt:     run.createdAt,
      startedAt:     run.startedAt ?? null,
      finishedAt:    (run as any).completedAt ?? null,
      steps:         stepNodes,
      ...agg,
      durationMs:    run.startedAt
        ? (((run as any).completedAt ?? new Date()).getTime() - run.startedAt.getTime())
        : null,
      depth,
    }
  }

  /**
   * Construye un StepNode.
   * Si nodeType === 'delegation': busca el Run hijo y lo expande.
   * Calcula effectiveStatus: hereda derivedStatus del childRun si existe.
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

    // effectiveStatus: para delegaciones, hereda derivedStatus del hijo
    const effectiveStatus =
      step.nodeType === 'delegation' && childRun !== null
        ? childRun.derivedStatus
        : step.status

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
      createdAt:  step.createdAt,
      model:            (step as any).model            ?? null,
      provider:         (step as any).provider         ?? null,
      promptTokens:     (step as any).promptTokens     ?? null,
      completionTokens: (step as any).completionTokens ?? null,
      totalTokens:      (step as any).totalTokens      ?? null,
      costUsd:          (step as any).costUsd          ?? null,
      effectiveStatus,
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
   *
   * blockedSteps (D-22e): delegation step en 'queued' sin startedAt
   * que lleva más de DELEGATION_TIMEOUT_MS desde createdAt.
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

      // Step bloqueado (D-22e): delegación en 'queued' que nunca arranó
      if (
        step.nodeType  === 'delegation' &&
        isBlocked({
          status:    step.status,
          startedAt: step.startedAt,
          createdAt: step.createdAt,
        })
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
