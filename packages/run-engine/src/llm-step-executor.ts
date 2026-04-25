import type { FlowNode } from '../../core-types/src';
import type { RunStep, RunSpec } from '../../core-types/src';
import { StepExecutor, type StepExecutionResult } from './step-executor';

/**
 * Interfaz mínima del GatewayService que necesita el executor.
 * Evita acoplamiento circular con apps/api.
 */
export interface GatewayRpcClient {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * StepExecutor real: delega agent/tool al gateway via RPC.
 * Si el gateway está offline hace fallback graceful al comportamiento stub.
 */
export class LlmStepExecutor extends StepExecutor {
  constructor(private readonly gateway: GatewayRpcClient) {
    super();
  }

  protected override async executeAgent(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    const agentId = (node.config.agentId as string) ?? 'unknown';
    const prompt = (node.config.prompt as string) ?? '';
    const model = (node.config.model as string) ?? undefined;

    let result: unknown;
    try {
      result = await this.gateway.call('agent.run', {
        agentId,
        prompt,
        model,
        runId: run.id,
        stepId: step.id,
        context: run.trigger.payload ?? {},
      });
    } catch {
      return {
        status: 'completed',
        output: { agentId, message: `Agent ${agentId} executed (gateway offline — stub fallback)` },
      };
    }

    const r = result as Record<string, unknown>;

    if (r?.ok === false) {
      return {
        status: 'failed',
        error: typeof r.error === 'string' ? r.error : `Agent ${agentId} returned error`,
        output: r,
      };
    }

    const payload = (r?.payload ?? r) as Record<string, unknown>;
    const tokenUsage = (payload.tokenUsage ?? payload.usage) as
      | { input: number; output: number }
      | undefined;
    const costUsd =
      typeof payload.costUsd === 'number'
        ? payload.costUsd
        : tokenUsage
          ? tokenUsage.input * 0.0000015 + tokenUsage.output * 0.000002
          : undefined;

    return {
      status: 'completed',
      output: {
        agentId,
        response: payload.response ?? payload.output ?? payload.message,
        model: payload.model ?? model,
      },
      tokenUsage: tokenUsage
        ? { input: tokenUsage.input ?? 0, output: tokenUsage.output ?? 0 }
        : undefined,
      costUsd,
    };
  }

  protected override async executeTool(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    const skillId = (node.config.skillId as string) ?? 'unknown';
    const functionName = (node.config.functionName as string) ?? 'unknown';
    const inputParams = (node.config.params as Record<string, unknown>) ?? {};

    let result: unknown;
    try {
      result = await this.gateway.call('skill.invoke', {
        skillId,
        functionName,
        params: inputParams,
        runId: run.id,
        stepId: step.id,
      });
    } catch {
      return {
        status: 'completed',
        output: {
          skillId,
          functionName,
          message: `Tool ${skillId}.${functionName} executed (gateway offline — stub fallback)`,
        },
      };
    }

    const r = result as Record<string, unknown>;

    if (r?.ok === false) {
      return {
        status: 'failed',
        error: typeof r.error === 'string' ? r.error : `Tool ${skillId}.${functionName} returned error`,
        output: r,
      };
    }

    const payload = (r?.payload ?? r) as Record<string, unknown>;
    return {
      status: 'completed',
      output: {
        skillId,
        functionName,
        result: payload.result ?? payload.output ?? payload,
      },
    };
  }
}
