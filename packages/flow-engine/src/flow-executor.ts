/**
 * FlowExecutor — orchestrates a CompiledFlow step by step.
 *
 * Responsibilities:
 *   - Topological traversal of nodes following edges
 *   - Delegates 'agent'/'subagent'/'skill'/'tool' nodes to LLMStepExecutor
 *   - Handles 'condition', 'approval', 'end', 'trigger' nodes inline
 *   - Emits RunStep records with tokenUsage + costUsd
 *   - Builds a RunSpec on completion
 */
import type { CompiledFlow } from './flow-compiler.js';
import type { FlowNode } from '../../core-types/src/flow-spec.js';
import type { RunSpec, RunStep, RunTrigger } from '../../core-types/src/run-spec.js';
import type { SkillSpec } from '../../core-types/src/skill-spec.js';
import type { McpToolDefinition } from '../../mcp-server/src/tools.js';
import { LLMStepExecutor, type LLMStepExecutorConfig } from './llm-step-executor.js';

export interface FlowExecutorConfig {
  llmExecutor: LLMStepExecutorConfig;
  /** Max nodes visited before aborting (circuit breaker for infinite loops) */
  maxNodes?: number;
  /** Called after each step completes */
  onStepComplete?: (step: RunStep) => void | Promise<void>;
}

export interface FlowRunOptions {
  runId: string;
  workspaceId: string;
  trigger: RunTrigger;
  /** Skills resolved from SkillRegistry for this run */
  availableSkills?: SkillSpec[];
  /** Extra MCP tools beyond skill-bridge */
  extraTools?: McpToolDefinition[];
  /** Initial state / trigger payload */
  initialState?: Record<string, unknown>;
}

export interface FlowRunResult {
  run: RunSpec;
  /** Final merged state after all steps */
  finalState: Record<string, unknown>;
}

const DEFAULT_MAX_NODES = 100;

export class FlowExecutor {
  private readonly stepExecutor: LLMStepExecutor;

  constructor(private readonly config: FlowExecutorConfig) {
    this.stepExecutor = new LLMStepExecutor(config.llmExecutor);
  }

  async run(
    flow: CompiledFlow,
    options: FlowRunOptions,
  ): Promise<FlowRunResult> {
    const startedAt = new Date().toISOString();
    const steps: RunStep[] = [];
    let state: Record<string, unknown> = {
      ...options.initialState,
      ...(options.trigger.payload ?? {}),
    };

    const nodeMap = new Map<string, (typeof flow.nodes)[number]>(
      flow.nodes.map((n) => [n.id, n]),
    );
    const edgeMap = buildEdgeMap(flow.edges);

    // Find start node: 'trigger' type or first node
    let currentNodeId: string | null =
      flow.nodes.find((n) => n.type === 'trigger')?.id ??
      flow.nodes[0]?.id ??
      null;

    let visitedCount = 0;
    const maxNodes = this.config.maxNodes ?? DEFAULT_MAX_NODES;
    let runStatus: RunSpec['status'] = 'running';
    let runError: string | undefined;

    while (currentNodeId !== null && visitedCount < maxNodes) {
      visitedCount++;
      const node = nodeMap.get(currentNodeId);
      if (!node) break;

      const stepResult = await this.executeNode(node, {
        runId: options.runId,
        workspaceId: options.workspaceId,
        availableSkills: options.availableSkills ?? [],
        extraTools: options.extraTools,
        state,
      });

      steps.push(stepResult.step);
      state = stepResult.state;

      if (this.config.onStepComplete) {
        await this.config.onStepComplete(stepResult.step);
      }

      // Determine next node
      if (
        node.type === 'end' ||
        stepResult.step.status === 'failed'
      ) {
        if (stepResult.step.status === 'failed') {
          runStatus = 'failed';
          runError = stepResult.step.error;
        } else {
          runStatus = 'completed';
        }
        break;
      }

      if (node.type === 'approval') {
        runStatus = 'waiting_approval';
        break;
      }

      currentNodeId = resolveNextNode(
        node,
        stepResult.step,
        edgeMap,
        state,
      );

      if (currentNodeId === null) {
        runStatus = 'completed';
      }
    }

    if (visitedCount >= maxNodes && runStatus === 'running') {
      runStatus = 'failed';
      runError = `Flow aborted: exceeded maxNodes (${maxNodes})`;
    }

    const run: RunSpec = {
      id: options.runId,
      workspaceId: options.workspaceId,
      flowId: flow.id,
      status: runStatus,
      trigger: options.trigger,
      steps,
      startedAt,
      completedAt: new Date().toISOString(),
      error: runError,
    };

    return { run, finalState: state };
  }

  private async executeNode(
    node: FlowNode,
    context: {
      runId: string;
      workspaceId: string;
      availableSkills: SkillSpec[];
      extraTools?: McpToolDefinition[];
      state: Record<string, unknown>;
    },
  ): Promise<{ step: RunStep; state: Record<string, unknown> }> {
    const stepBase: Omit<RunStep, 'status' | 'completedAt' | 'output' | 'error'> = {
      id: `${context.runId}::${node.id}`,
      runId: context.runId,
      nodeId: node.id,
      nodeType: node.type,
      startedAt: new Date().toISOString(),
      input: { ...context.state },
    };

    switch (node.type) {
      case 'trigger': {
        // Trigger node just passes state through
        return {
          step: {
            ...stepBase,
            status: 'completed',
            completedAt: new Date().toISOString(),
            output: context.state,
          },
          state: context.state,
        };
      }

      case 'agent':
      case 'subagent':
      case 'skill':
      case 'tool': {
        // Delegate to LLMStepExecutor.
        // StepExecutionResult = { step, state, resolvedModel } — destructure to
        // return only { step, state } and satisfy executeNode's narrower return type.
        const { step, state } = await this.stepExecutor.execute(
          {
            id: node.id,
            type: node.type,
            label: typeof node.config.label === 'string'
              ? node.config.label
              : undefined,
            config: node.config,
          },
          {
            runId: context.runId,
            workspaceId: context.workspaceId,
            availableSkills: context.availableSkills,
            extraTools: context.extraTools,
            state: context.state,
          },
        );
        return { step, state };
      }

      case 'condition': {
        // Condition nodes don't execute — routing is handled by resolveNextNode
        return {
          step: {
            ...stepBase,
            status: 'completed',
            completedAt: new Date().toISOString(),
            output: { evaluated: true },
          },
          state: context.state,
        };
      }

      case 'approval': {
        // Approval gate suspends execution — maps to 'paused' in RunStep status.
        return {
          step: {
            ...stepBase,
            status: 'paused',
            completedAt: new Date().toISOString(),
            output: { pendingApproval: true },
          },
          state: context.state,
        };
      }

      case 'end': {
        return {
          step: {
            ...stepBase,
            status: 'completed',
            completedAt: new Date().toISOString(),
            output: { final: true },
          },
          state: context.state,
        };
      }

      default: {
        // Unknown node type — treat as a flow error (not a silent skip).
        return {
          step: {
            ...stepBase,
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: `Unknown node type: ${(node as FlowNode).type}`,
            output: {},
          },
          state: context.state,
        };
      }
    }
  }
}

// ── Graph helpers ─────────────────────────────────────────────────────────

type EdgeMap = Map<string, Array<{ to: string; condition?: string }>>;

function buildEdgeMap(
  edges: CompiledFlow['edges'],
): EdgeMap {
  const map: EdgeMap = new Map();
  for (const edge of edges) {
    const list = map.get(edge.from) ?? [];
    list.push({ to: edge.to, condition: edge.condition });
    map.set(edge.from, list);
  }
  return map;
}

/**
 * Resolve the next node to execute.
 * - If there's only one outgoing edge with no condition, follow it.
 * - If there are conditional edges, evaluate them against the current state.
 * - Falls back to the first unconditional edge.
 */
function resolveNextNode(
  node: CompiledFlow['nodes'][number],
  step: RunStep,
  edgeMap: EdgeMap,
  state: Record<string, unknown>,
): string | null {
  const outgoing = edgeMap.get(node.id) ?? [];
  if (outgoing.length === 0) return null;
  if (outgoing.length === 1 && !outgoing[0].condition) {
    return outgoing[0].to;
  }

  // Try conditional edges first
  for (const edge of outgoing) {
    if (!edge.condition) continue;
    if (evaluateCondition(edge.condition, state, step)) {
      return edge.to;
    }
  }

  // Fall back to first unconditional edge
  const unconditional = outgoing.find((e) => !e.condition);
  return unconditional?.to ?? null;
}

/**
 * Minimal condition evaluator.
 * Supports expressions like:
 *   - "state.approved === true"
 *   - "state.score > 0.8"
 *   - "step.status === 'failed'"
 *
 * Uses Function constructor — safe enough for server-side flow execution
 * where flow definitions are trusted operator input.
 */
function evaluateCondition(
  condition: string,
  state: Record<string, unknown>,
  step: RunStep,
): boolean {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('state', 'step', `return !!(${condition});`);
    return fn(state, step) as boolean;
  } catch {
    return false;
  }
}
