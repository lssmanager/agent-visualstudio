import type { PrismaClient } from '@prisma/client'

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Threshold in ms before a queued delegation step is considered blocked.
 * Configurable via env var DELEGATION_TIMEOUT_MS. Default: 30 000 ms (30 s).
 *
 * BUG-FIX: guard against NaN when env var is non-numeric (Number.isFinite check).
 */
const _parsedTimeout = parseInt(process.env['DELEGATION_TIMEOUT_MS'] ?? '', 10)
export const DELEGATION_TIMEOUT_MS = Number.isFinite(_parsedTimeout) ? _parsedTimeout : 30_000

/** Maximum expansion levels for getRunStatus(). listWorkspaceRuns uses expansionDepth=0. */
const MAX_DEPTH = 5

// ── Internal types ─────────────────────────────────────────────────────────

/**
 * Effective status of a node for deriveParentStatus() computation.
 * 'blocked' is virtual — produced by isBlocked(), never persisted in DB.
 *
 * BUG-FIX: 'waiting_approval' with underscore — canonical D-08 enum value.
 * Previous incorrect spelling 'waitingapproval' removed.
 */
type NodeStatus = {
  status:
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'skipped'
    | 'cancelled'
    | 'waiting_approval'
    | 'blocked'
}

/**
 * Shape of a Run loaded with its flow→agent relation for workspaceId resolution.
 *
 * BUG-FIX: Run does NOT have a direct workspaceId field in the canonical schema.
 * workspaceId is resolved via Run → Flow → Agent → Workspace.
 */
type RunWithRelations = {
  id:          string
  flowId:      string
  agencyId:    string | null
  status:      string
  trigger:     unknown
  error:       string | null
  startedAt:   Date | null
  completedAt: Date | null
  metadata:    unknown
  createdAt:   Date
  steps:       RunStepRecord[]
  flow: {
    agent: {
      id:          string
      workspaceId: string
    }
  }
}

type RunStepRecord = {
  id:          string
  runId:       string
  nodeId:      string
  nodeType:    string
  status:      string
  input:       unknown
  output:      unknown
  error:       string | null
  startedAt:   Date | null
  completedAt: Date | null
  createdAt:   Date
  costUsd:     number | null
  tokenUsage?: unknown
}

// ── Public types ───────────────────────────────────────────────────────────

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
  /** Required by isBlocked() — not exposed by all Prisma queries; always present after F0. */
  createdAt: Date

  model:            string | null
  provider:         string | null
  promptTokens:     number | null
  completionTokens: number | null
  totalTokens:      number | null
  costUsd:          number | null

  /**
   * For delegation steps: inherits childRun.derivedStatus when childRun is present.
   * For all other node types: equals status.
   *
   * BUG-FIX (F2a-09): assembleTree() must use effectiveStatus (not status) when
   * building nodeStatuses for deriveParentStatus(), so delegation failures/blocks
   * propagate correctly to the parent Run.
   */
  effectiveStatus: string

  /** For delegation steps: the expanded child RunStatusTree. null otherwise. */
  childRun: RunStatusTree | null
}

export interface RunStatusTree {
  runId:         string
  workspaceId:   string
  agentId:       string | null
  status:        string
  /**
   * Derived status calculated from this Run's steps via deriveParentStatus().
   * May differ from status when the DB value lags behind real state.
   */
  derivedStatus: string
  inputData:     unknown
  outputData:    unknown
  error:         string | null
  createdAt:     Date
  startedAt:     Date | null
  finishedAt:    Date | null

  steps: StepNode[]

  totalSteps:     number
  completedSteps: number
  failedSteps:    number
  runningSteps:   number
  blockedSteps:   number
  totalCostUsd:   number
  totalTokens:    number
  durationMs:     number | null
  /** Depth from root in the delegation tree. Root Run = 0. */
  depth: number
}

// ── Pure exported functions ────────────────────────────────────────────────

/**
 * Returns true when a delegation RunStep has been in 'queued' status
 * (never started) for longer than DELEGATION_TIMEOUT_MS.
 *
 * Reference: D-22e
 * BUG-FIX vs original F2a-08 prompt: checks status==='queued' + startedAt===null
 * (not 'running' + startedAt — that was incorrect).
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
 * Derives the effective status of a parent node from its children.
 * Priority order (D-23f): failed > blocked > running > queued > completed.
 *
 * BUG-FIX: 'waiting_approval' (underscore) used in fallback clause.
 */
export function deriveParentStatus(children: NodeStatus[]): string {
  if (children.length === 0) return 'completed'

  if (children.some((c) => c.status === 'failed'))  return 'failed'
  if (children.some((c) => c.status === 'blocked')) return 'blocked'
  if (children.some((c) => c.status === 'running')) return 'running'
  if (children.some((c) => c.status === 'queued'))  return 'queued'
  if (
    children.every(
      (c) =>
        c.status === 'completed' ||
        c.status === 'skipped'   ||
        c.status === 'cancelled',
    )
  ) return 'completed'

  // waiting_approval or unrecognised combination → still active
  return 'running'
}

// ── Service class ──────────────────────────────────────────────────────────

export class HierarchyStatusService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns the full hierarchical status tree for a runId,
   * expanding delegation steps recursively up to MAX_DEPTH levels.
   * Returns null if the runId does not exist in DB.
   */
  async getRunStatus(runId: string): Promise<RunStatusTree | null> {
    return this.buildTree(runId, MAX_DEPTH, 0)
  }

  /**
   * Lists Runs for a workspace with flat step metrics.
   * Does NOT expand delegation sub-runs (expansionDepth = 0).
   *
   * BUG-FIX (listWorkspaceRuns depth): passes expansionDepth=0 which prevents
   * buildStepNode from fetching any child runs — no unintended recursion.
   *
   * BUG-FIX (workspaceId): filters via flow→agent→workspaceId relation,
   * not a missing direct Run.workspaceId field.
   */
  async listWorkspaceRuns(
    workspaceId: string,
    opts: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<RunStatusTree[]> {
    const runs = await (this.prisma.run as any).findMany({
      where: {
        flow: { agent: { workspaceId } },
        ...(opts.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
      include: {
        steps: { orderBy: { createdAt: 'asc' } },
        flow:  { include: { agent: { select: { id: true, workspaceId: true } } } },
      },
    })

    return Promise.all(
      (runs as RunWithRelations[]).map((run) =>
        // expansionDepth=0 → no child run expansion (list view only)
        this.assembleTree(run, run.steps, 0, 0),
      ),
    )
  }

  // ── Tree construction ─────────────────────────────────────────────────────

  /**
   * Loads a Run from DB and builds its status tree.
   *
   * @param expansionDepth  Remaining expansion levels (0 = no expansion).
   * @param nodeDepth       Display depth from root for RunStatusTree.depth.
   */
  private async buildTree(
    runId:          string,
    expansionDepth: number,
    nodeDepth:      number,
  ): Promise<RunStatusTree | null> {
    if (expansionDepth < 0) return null

    const run = await (this.prisma.run as any).findUnique({
      where:   { id: runId },
      include: {
        steps: { orderBy: { createdAt: 'asc' } },
        flow:  { include: { agent: { select: { id: true, workspaceId: true } } } },
      },
    })

    if (!run) return null

    return this.assembleTree(run as RunWithRelations, run.steps, expansionDepth, nodeDepth)
  }

  /**
   * Assembles a RunStatusTree from an already-loaded RunWithRelations.
   *
   * BUG-FIX (depth semantics): expansionDepth=0 → buildStepNode will NOT expand
   * any delegation steps. Only expansionDepth > 0 triggers child run fetching,
   * and passes expansionDepth-1 to the next level.
   *
   * BUG-FIX (derivedStatus): nodeStatuses mapping uses step.effectiveStatus,
   * not step.status, so delegation failures propagate to parent correctly.
   */
  private async assembleTree(
    run:            RunWithRelations,
    steps:          RunStepRecord[],
    expansionDepth: number,
    nodeDepth:      number,
  ): Promise<RunStatusTree> {
    const workspaceId = run.flow.agent.workspaceId

    const stepNodes: StepNode[] = await Promise.all(
      steps.map((step, idx) =>
        this.buildStepNode(step, idx, workspaceId, run.createdAt, expansionDepth, nodeDepth),
      ),
    )

    // BUG-FIX: use step.effectiveStatus (not step.status) so delegation blocks/failures
    // are honoured when deriving parent status (D-23f).
    const nodeStatuses: NodeStatus[] = stepNodes.map((step) => ({
      status: isBlocked({
        status:    step.effectiveStatus,
        startedAt: step.startedAt,
        createdAt: step.createdAt,
      })
        ? 'blocked'
        : (step.effectiveStatus as NodeStatus['status']),
    }))

    const derivedStatus = deriveParentStatus(nodeStatuses)
    const agg           = this.aggregate(stepNodes)

    return {
      runId:        run.id,
      workspaceId,
      agentId:      run.flow?.agent?.id ?? null,
      status:       run.status,
      derivedStatus,
      inputData:    run.trigger ?? null,
      outputData:   null,
      error:        run.error ?? null,
      createdAt:    run.createdAt,
      startedAt:    run.startedAt  ?? null,
      finishedAt:   run.completedAt ?? null,
      steps:        stepNodes,
      ...agg,
      durationMs: run.startedAt
        ? (run.completedAt ?? new Date()).getTime() - run.startedAt.getTime()
        : null,
      depth: nodeDepth,
    }
  }

  /**
   * Builds a StepNode.
   *
   * BUG-FIX (depth semantics): only expands delegation when expansionDepth > 0.
   * Passes expansionDepth-1 to the child so the budget decrements each level.
   * When expansionDepth === 0, childRun is always null — no DB queries.
   */
  private async buildStepNode(
    step:            RunStepRecord,
    fallbackIndex:   number,
    workspaceId:     string,
    parentCreatedAt: Date,
    expansionDepth:  number,
    nodeDepth:       number,
  ): Promise<StepNode> {
    let childRun: RunStatusTree | null = null

    // expansionDepth > 0 required — depth=0 means "list view, no expansion"
    if (step.nodeType === 'delegation' && expansionDepth > 0) {
      childRun = await this.findAndExpandChildRun(
        step.nodeId,
        step.runId,
        step.id,
        workspaceId,
        parentCreatedAt,
        expansionDepth - 1,  // decrement: child has one less level to expand
        nodeDepth + 1,        // increment: display depth increases
      )
    }

    const effectiveStatus =
      step.nodeType === 'delegation' && childRun !== null
        ? childRun.derivedStatus
        : step.status

    // tokenUsage is a Json field; extract LLM metrics from it
    const tu = step.tokenUsage as Record<string, unknown> | null | undefined

    return {
      stepId:    step.id,
      nodeId:    step.nodeId,
      nodeType:  step.nodeType,
      status:    step.status,
      index:     fallbackIndex,
      input:     step.input   ?? null,
      output:    step.output  ?? null,
      error:     step.error   ?? null,
      startedAt: step.startedAt  ?? null,
      finishedAt: step.completedAt ?? null,
      createdAt: step.createdAt,
      model:            (tu?.['model']            as string  | null) ?? null,
      provider:         (tu?.['provider']         as string  | null) ?? null,
      promptTokens:     (tu?.['promptTokens']     as number  | null) ?? null,
      completionTokens: (tu?.['completionTokens'] as number  | null) ?? null,
      totalTokens:      (tu?.['totalTokens']      as number  | null) ?? null,
      costUsd:          step.costUsd ?? null,
      effectiveStatus,
      childRun,
    }
  }

  /**
   * Finds the child Run of a delegation step by matching
   * Run.metadata.hierarchyRoot === nodeId plus parentRunId/parentStepId
   * within the same workspace.
   *
   * BUG-FIX (workspaceId): filters via flow→agent→workspaceId relation;
   * Run has no direct workspaceId field in the canonical Prisma schema.
   *
   * Fail-open: returns null without throwing on any DB/JSONB error.
   */
  private async findAndExpandChildRun(
    nodeId:          string,
    parentRunId:     string,
    parentStepId:    string,
    workspaceId:     string,
    parentCreatedAt: Date,
    expansionDepth:  number,
    nodeDepth:       number,
  ): Promise<RunStatusTree | null> {
    try {
      const childRun = await (this.prisma.run as any).findFirst({
        where: {
          createdAt: { gte: parentCreatedAt },
          flow:      { agent: { workspaceId } },
          AND: [
            { metadata: { path: ['hierarchyRoot'], equals: nodeId } },
            { metadata: { path: ['parentRunId'], equals: parentRunId } },
            { metadata: { path: ['parentStepId'], equals: parentStepId } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          steps: { orderBy: { createdAt: 'asc' } },
          flow:  { include: { agent: { select: { id: true, workspaceId: true } } } },
        },
      })

      if (!childRun) return null

      return this.assembleTree(
        childRun as RunWithRelations,
        childRun.steps,
        expansionDepth,
        nodeDepth,
      )
    } catch {
      // Fail-open: parent tree serves even when child lookup fails
      return null
    }
  }

  // ── Aggregation ───────────────────────────────────────────────────────────

  /**
   * Computes step-level aggregates for ONE level of the tree.
   * totalSteps counts only the direct steps of this Run (not child Run steps).
   * totalCostUsd and totalTokens DO include child Run aggregates (recursive cost).
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
      if (
        step.nodeType === 'delegation' &&
        isBlocked({ status: step.status, startedAt: step.startedAt, createdAt: step.createdAt })
      ) blockedSteps++

      totalCostUsd += step.costUsd     ?? 0
      totalTokens  += step.totalTokens ?? 0

      // Include child run aggregates in cost/token totals
      if (step.childRun) {
        totalCostUsd += step.childRun.totalCostUsd
        totalTokens  += step.childRun.totalTokens
      }
    }

    return { totalSteps, completedSteps, failedSteps, runningSteps, blockedSteps, totalCostUsd, totalTokens }
  }
}
