import crypto from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { FlowSpec, FlowNode, FlowEdge } from '../../core-types/src';
import type { RunSpec, RunStep, RunStatus, StepStatus, RunTrigger } from '../../core-types/src';

import { StepExecutor, type StepExecutionResult } from './step-executor';
import { RunRepository } from './run-repository';
import { ApprovalQueue } from './approval-queue';

export interface FlowExecutorOptions {
  workspaceId: string;
  repository: RunRepository;
  approvalQueue: ApprovalQueue;
  /**
   * stepExecutor explícito — usar cuando se quiere control total sobre
   * qué executor se usa (tests, mocks, custom implementations).
   */
  stepExecutor?: StepExecutor;
  /**
   * PrismaClient — si se provee y no hay stepExecutor explícito,
   * FlowExecutor construye automáticamente un StepExecutor con db
   * que delega a LlmStepExecutor para nodos agent/tool.
   */
  db?: PrismaClient;
  maxToolRounds?: number;
}

/**
 * Traverses a FlowSpec graph and executes nodes sequentially.
 * Uses setImmediate-based scheduling to avoid blocking the event loop.
 *
 * Uso mínimo con LLM real:
 *   new FlowExecutor({ workspaceId, repository, approvalQueue, db: prisma })
 *
 * Uso con executor custom (tests):
 *   new FlowExecutor({ workspaceId, repository, approvalQueue, stepExecutor: myExecutor })
 */
export class FlowExecutor {
  private readonly workspaceId: string;
  private readonly repository: RunRepository;
  private readonly stepExecutor: StepExecutor;
  private readonly approvalQueue: ApprovalQueue;

  constructor(options: FlowExecutorOptions) {
    this.workspaceId   = options.workspaceId;
    this.repository    = options.repository;
    this.approvalQueue = options.approvalQueue;

    if (options.stepExecutor) {
      // Executor explícito tiene prioridad
      this.stepExecutor = options.stepExecutor;
    } else if (options.db) {
      // Auto-construir StepExecutor con db → delega a LlmStepExecutor internamente
      this.stepExecutor = new StepExecutor({
        db: options.db,
        maxToolRounds: options.maxToolRounds,
      });
    } else {
      // Sin db y sin executor explícito: StepExecutor vacío
      // executeAgent/executeTool retornarán error descriptivo en lugar de stub
      this.stepExecutor = new StepExecutor();
    }
  }

  /**
   * Start a new run from a flow spec.
   * Returns the RunSpec immediately (queued). Execution proceeds async.
   */
  startRun(flow: FlowSpec, trigger: RunTrigger): RunSpec {
    const run: RunSpec = {
      id: crypto.randomUUID(),
      workspaceId: this.workspaceId,
      flowId: flow.id,
      status: 'queued',
      trigger,
      steps: [],
      startedAt: new Date().toISOString(),
    };

    this.repository.save(run);

    // Schedule async execution
    setImmediate(() => void this.executeRun(run.id, flow));

    return run;
  }

  /**
   * Cancel a running/queued run.
   */
  cancelRun(runId: string): RunSpec | null {
    const run = this.repository.findById(runId);
    if (!run) return null;

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      return run;
    }

    run.status = 'cancelled';
    run.completedAt = new Date().toISOString();

    for (const step of run.steps) {
      if (step.status === 'queued' || step.status === 'running' || step.status === 'waiting_approval') {
        step.status = 'skipped';
        step.completedAt = new Date().toISOString();
      }
    }

    this.repository.save(run);
    return run;
  }

  private async executeRun(runId: string, flow: FlowSpec): Promise<void> {
    const run = this.repository.findById(runId);
    if (!run || run.status === 'cancelled') return;

    run.status = 'running';
    this.repository.save(run);

    try {
      const startNode = this.findStartNode(flow);
      if (!startNode) {
        run.status = 'failed';
        run.error = 'No trigger or start node found in flow';
        run.completedAt = new Date().toISOString();
        this.repository.save(run);
        return;
      }

      await this.walkGraph(run, flow, startNode.id);

      const freshRun = this.repository.findById(runId)!;
      if (freshRun.status === 'cancelled') return;

      if (freshRun.status !== 'waiting_approval') {
        const hasFailed = freshRun.steps.some((s) => s.status === 'failed');
        freshRun.status = hasFailed ? 'failed' : 'completed';
        freshRun.completedAt = new Date().toISOString();
        if (hasFailed) {
          const failedStep = freshRun.steps.find((s) => s.status === 'failed');
          freshRun.error = failedStep?.error ?? 'Step failed';
        }
        this.repository.save(freshRun);
      }
    } catch (err) {
      const freshRun = this.repository.findById(runId);
      if (freshRun && freshRun.status !== 'cancelled') {
        freshRun.status = 'failed';
        freshRun.error = err instanceof Error ? err.message : String(err);
        freshRun.completedAt = new Date().toISOString();
        this.repository.save(freshRun);
      }
    }
  }

  private async walkGraph(run: RunSpec, flow: FlowSpec, currentNodeId: string): Promise<void> {
    const visited = new Set<string>();

    let nodeId: string | null = currentNodeId;
    while (nodeId) {
      const freshRun = this.repository.findById(run.id);
      if (!freshRun || freshRun.status === 'cancelled') return;

      if (visited.has(nodeId)) break;
      visited.add(nodeId);

      const node = flow.nodes.find((n) => n.id === nodeId);
      if (!node) break;

      const step: RunStep = {
        id: crypto.randomUUID(),
        runId: run.id,
        nodeId: node.id,
        nodeType: node.type,
        status: 'queued',
        startedAt: new Date().toISOString(),
        retryCount: 0,
      };
      freshRun.steps.push(step);
      this.repository.save(freshRun);

      if (node.type === 'approval') {
        step.status = 'waiting_approval';
        freshRun.status = 'waiting_approval';
        this.repository.save(freshRun);
        this.approvalQueue.enqueue(freshRun.id, step.id);
        return;
      }

      step.status = 'running';
      this.repository.save(freshRun);

      await new Promise<void>((resolve) => setImmediate(resolve));

      const result = await this.stepExecutor.execute(node, step, freshRun);

      step.status = result.status;
      step.output = result.output;
      step.error = result.error;
      step.tokenUsage = result.tokenUsage;
      step.costUsd = result.costUsd;
      step.completedAt = new Date().toISOString();
      this.repository.save(freshRun);

      if (result.status === 'failed') break;
      if (node.type === 'end') break;

      nodeId = this.resolveNextNode(flow, node, result);
    }
  }

  private findStartNode(flow: FlowSpec): FlowNode | undefined {
    const trigger = flow.nodes.find((n) => n.type === 'trigger');
    if (trigger) return trigger;
    const targets = new Set(flow.edges.map((e) => e.to));
    const roots = flow.nodes.filter((n) => !targets.has(n.id));
    return roots[0] ?? flow.nodes[0];
  }

  private resolveNextNode(flow: FlowSpec, currentNode: FlowNode, result: StepExecutionResult): string | null {
    const outEdges = flow.edges.filter((e) => e.from === currentNode.id);
    if (outEdges.length === 0) return null;

    if (currentNode.type === 'condition' && outEdges.length > 1) {
      const outcomeEdge = outEdges.find((e) => e.condition === result.branch);
      if (outcomeEdge) return outcomeEdge.to;
      const defaultEdge = outEdges.find((e) => !e.condition) ?? outEdges[0];
      return defaultEdge.to;
    }

    return outEdges[0].to;
  }

  /**
   * Resume a run that was paused for approval.
   */
  async resumeAfterApproval(
    runId: string,
    stepId: string,
    approved: boolean,
    reason?: string,
  ): Promise<RunSpec | null> {
    const run = this.repository.findById(runId);
    if (!run) return null;

    const step = run.steps.find((s) => s.id === stepId);
    if (!step || step.status !== 'waiting_approval') return run;

    if (!approved) {
      step.status = 'failed';
      step.error = reason ?? 'Rejected';
      step.completedAt = new Date().toISOString();
      run.status = 'failed';
      run.error = `Approval rejected: ${reason ?? 'No reason'}`;
      run.completedAt = new Date().toISOString();
      this.repository.save(run);
      return run;
    }

    step.status = 'completed';
    step.completedAt = new Date().toISOString();
    run.status = 'running';
    this.repository.save(run);
    this.approvalQueue.dequeue(runId, stepId);

    return run;
  }
}
