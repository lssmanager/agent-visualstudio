/**
 * agent-executor.ts
 *
 * AgentExecutor — NestJS-injectable entry point for flow execution.
 *
 * Architecture (after F1a-02 + F1a-06):
 *   1. FlowExecutor is built with RunRepository (Prisma) — NOT InMemoryRunRepository.
 *   2. flowExec.startRun() is awaited — it creates the single Run in Prisma
 *      and fires graph execution via setImmediate (fire-and-forget internally).
 *   3. runSpec.id === prisma.run.id  (FlowExecutor.startRun returns the DB run spec)
 *   4. We poll runRepo.findRunById() until the Run reaches a terminal state.
 *   5. Final steps are read from Prisma via runRepo.getRunSteps().
 *
 * What this class does NOT do:
 *   - Does NOT call runRepo.createRun() — FlowExecutor.startRun() owns that.
 *   - Does NOT use InMemoryRunRepository.
 *   - Does NOT run a post-sync loop (FlowExecutor.walkGraph already persists each step).
 *   - Does NOT read results from in-memory — Prisma is the source of truth.
 */

import type { PrismaClient } from '@prisma/client'
import type { FlowSpec, RunTrigger } from '../../core-types/src'

import { FlowExecutor }  from './flow-executor'
import { RunRepository } from './run-repository'
import { ApprovalQueue } from './approval-queue'

// ── Public interfaces ────────────────────────────────────────────────────────

export interface AgentExecutorOptions {
  db:             PrismaClient
  maxToolRounds?: number
  /**
   * Maximum wait time for a run to reach a terminal state (ms).
   * Poll interval is 100 ms — Prisma is local, overhead is minimal.
   * Default: 5 minutes.
   */
  timeoutMs?: number
}

export interface ExecuteFlowInput {
  workspaceId:  string
  agentId?:     string
  flow:         FlowSpec
  trigger:      RunTrigger
  sessionId?:   string
  channelKind?: string
}

export interface ExecuteFlowResult {
  runId:       string
  status:      'completed' | 'failed' | 'cancelled'
  outputData?: unknown
  error?:      string
  steps: Array<{
    nodeId:            string
    nodeType:          string
    status:            string
    costUsd?:          number
    promptTokens?:     number
    completionTokens?: number
    model?:            string
    provider?:         string
  }>
}

// ── AgentExecutor ────────────────────────────────────────────────────────────

export class AgentExecutor {
  private readonly runRepo:       RunRepository
  private readonly approvalQueue: ApprovalQueue
  private readonly timeoutMs:     number

  constructor(private readonly opts: AgentExecutorOptions) {
    this.runRepo       = new RunRepository(opts.db)
    this.approvalQueue = new ApprovalQueue()
    this.timeoutMs     = opts.timeoutMs ?? 5 * 60 * 1_000
  }

  async execute(input: ExecuteFlowInput): Promise<ExecuteFlowResult> {
    // ── 1. Build FlowExecutor with RunRepository (Prisma) ────────────────
    //    FlowExecutor.walkGraph() persists each RunStep in real time.
    //    Do NOT pass InMemoryRunRepository here.
    const flowExec = new FlowExecutor({
      workspaceId:   input.workspaceId,
      repository:    this.runRepo,
      approvalQueue: this.approvalQueue,
      db:            this.opts.db,
      maxToolRounds: this.opts.maxToolRounds,
    })

    // ── 2. Start execution — creates the Run in Prisma, fires async walk ──
    //    startRun() is async since F1a-02; we must await it.
    //    runSpec.id === the Prisma Run id — there is exactly one Run row.
    const runSpec = await flowExec.startRun(
      input.flow,
      input.trigger,
      {
        agentId:     input.agentId,
        sessionId:   input.sessionId,
        channelKind: input.channelKind,
      },
    )
    const runId = runSpec.id

    // ── 3. Poll Prisma until terminal state ──────────────────────────────
    const finalRun = await this.waitForCompletion(runId)

    // ── 4. Read persisted RunSteps from Prisma ───────────────────────────
    const dbSteps = await this.runRepo.getRunSteps(runId)

    // ── 5. Build and return result ───────────────────────────────────────
    return {
      runId,
      status:     finalRun.status as ExecuteFlowResult['status'],
      outputData: finalRun.outputData,
      error:      finalRun.error ?? undefined,
      steps:      dbSteps.map((s) => ({
        nodeId:            s.nodeId,
        nodeType:          s.nodeType,
        status:            s.status,
        costUsd:           s.costUsd          ?? undefined,
        promptTokens:      s.promptTokens     ?? undefined,
        completionTokens:  s.completionTokens ?? undefined,
        model:             s.model            ?? undefined,
        provider:          s.provider         ?? undefined,
      })),
    }
  }

  /**
   * Poll prisma.run until a terminal state is reached.
   *
   * Terminal states: completed | failed | cancelled
   * 'paused' (HITL waiting_approval) is NOT terminal — we keep waiting.
   *
   * Poll interval: 100 ms. Deadline: this.timeoutMs from call time.
   *
   * Throws if the run disappears from DB or the deadline is exceeded.
   */
  private async waitForCompletion(
    runId: string,
  ): Promise<{ status: string; outputData: unknown; error: string | null }> {
    const TERMINAL = new Set(['completed', 'failed', 'cancelled'])
    const POLL_MS  = 100
    const deadline = Date.now() + this.timeoutMs

    while (Date.now() < deadline) {
      const run = await this.runRepo.findRunById(runId)

      if (!run) {
        throw new Error(
          `AgentExecutor: run '${runId}' not found in Prisma during polling`,
        )
      }

      if (TERMINAL.has(run.status)) {
        return {
          status:     run.status,
          outputData: run.outputData,
          // prisma.run includes error as a scalar field by default
          error:      (run as Record<string, unknown>)['error'] as string | null ?? null,
        }
      }

      await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS))
    }

    throw new Error(
      `AgentExecutor: run '${runId}' did not reach a terminal state within ${this.timeoutMs}ms`,
    )
  }
}
