import type { FlowNode } from '../../core-types/src';
import type { RunStep, RunSpec, RunStepTokenUsage } from '../../core-types/src';

export interface StepExecutionResult {
  status: 'completed' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  tokenUsage?: RunStepTokenUsage;
  costUsd?: number;
  /** For condition nodes: which branch to take */
  branch?: string;
}

/**
 * Handles execution of individual flow nodes by type.
 * This is the extensibility point where real LLM calls, tool invocations, etc. happen.
 */
export class StepExecutor {
  /**
   * Execute a single node. Override or extend for real integrations.
   */
  async execute(node: FlowNode, step: RunStep, run: RunSpec): Promise<StepExecutionResult> {
    switch (node.type) {
      case 'trigger':
        return this.executeTrigger(node, step, run);
      case 'agent':
        return this.executeAgent(node, step, run);
      case 'tool':
        return this.executeTool(node, step, run);
      case 'condition':
        return this.executeCondition(node, step, run);
      case 'end':
        return this.executeEnd(node, step, run);
      default:
        return this.executeGeneric(node, step, run);
    }
  }

  protected async executeTrigger(_node: FlowNode, _step: RunStep, run: RunSpec): Promise<StepExecutionResult> {
    return {
      status: 'completed',
      output: { triggerType: run.trigger.type, payload: run.trigger.payload },
    };
  }

  protected async executeAgent(node: FlowNode, _step: RunStep, _run: RunSpec): Promise<StepExecutionResult> {
    // Stub: a real implementation would call the gateway SDK to spawn an agent
    const agentId = (node.config.agentId as string) ?? 'unknown';
    return {
      status: 'completed',
      output: { agentId, message: `Agent ${agentId} executed (stub)` },
    };
  }

  protected async executeTool(node: FlowNode, _step: RunStep, _run: RunSpec): Promise<StepExecutionResult> {
    const skillId = (node.config.skillId as string) ?? 'unknown';
    const functionName = (node.config.functionName as string) ?? 'unknown';
    return {
      status: 'completed',
      output: { skillId, functionName, message: `Tool ${skillId}.${functionName} executed (stub)` },
    };
  }

  protected async executeCondition(node: FlowNode, _step: RunStep, _run: RunSpec): Promise<StepExecutionResult> {
    // Stub: evaluate the condition expression and return a branch
    const expression = (node.config.expression as string) ?? 'true';
    const branches = (node.config.branches as string[]) ?? ['true', 'false'];
    return {
      status: 'completed',
      output: { expression, evaluatedBranch: branches[0] },
      branch: branches[0],
    };
  }

  protected async executeEnd(_node: FlowNode, _step: RunStep, _run: RunSpec): Promise<StepExecutionResult> {
    return {
      status: 'completed',
      output: { outcome: 'flow_completed' },
    };
  }

  protected async executeGeneric(node: FlowNode, _step: RunStep, _run: RunSpec): Promise<StepExecutionResult> {
    return {
      status: 'completed',
      output: { nodeType: node.type, message: `Node type '${node.type}' executed (generic stub)` },
    };
  }
}
