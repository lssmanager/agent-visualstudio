/**
 * LLMStepExecutor — executes a single FlowNode of type
 * 'agent' | 'subagent' | 'skill' | 'tool'.
 *
 * Responsibilities:
 *   1. Build the message history from the step input + system prompt
 *   2. Resolve which skills/tools to mount (via SkillRegistry + skill-bridge)
 *   3. Run the ToolCallLoop
 *   4. Return a RunStep with tokenUsage + costUsd populated
 */
import type { FlowNode } from '../../core-types/src/flow-spec.js';
import type { RunStep, RunStepTokenUsage } from '../../core-types/src/run-spec.js';
import type { ILLMProvider } from './llm-provider.js';
import { OpenAILLMProvider } from './llm-provider.js';
import { runToolCallLoop } from './tool-call-loop.js';
import type { McpToolDefinition } from '../../mcp-server/src/tools.js';
import { skillsToMcpTools } from '../../mcp-server/src/skill-bridge.js';
import type { SkillSpec } from '../../core-types/src/skill-spec.js';

export interface LLMStepExecutorConfig {
  provider: ILLMProvider;
  /** Default model if node.config.model is not set */
  defaultModel?: string;
  /** Cost estimator — only available on OpenAILLMProvider */
  estimateCost?: (model: string, usage: RunStepTokenUsage) => number;
}

export interface StepExecutionContext {
  runId: string;
  workspaceId: string;
  /** Skills available in this run (already resolved from SkillRegistry) */
  availableSkills: SkillSpec[];
  /** Extra MCP tools injected by the caller (e.g., from McpServer) */
  extraTools?: McpToolDefinition[];
  /** Key-value state propagated between steps */
  state: Record<string, unknown>;
}

export interface StepExecutionResult {
  step: RunStep;
  /** Updated state after the step */
  state: Record<string, unknown>;
}

export class LLMStepExecutor {
  constructor(private readonly config: LLMStepExecutorConfig) {}

  async execute(
    node: FlowNode,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startedAt = new Date().toISOString();
    const stepId = `${context.runId}::${node.id}`;

    const step: RunStep = {
      id: stepId,
      runId: context.runId,
      nodeId: node.id,
      nodeType: node.type,
      status: 'running',
      startedAt,
      input: { ...context.state },
    };

    try {
      const model =
        typeof node.config.model === 'string'
          ? node.config.model
          : this.config.defaultModel ?? 'gpt-4o-mini';

      // Build system prompt
      const systemPrompt =
        typeof node.config.systemPrompt === 'string'
          ? node.config.systemPrompt
          : buildDefaultSystemPrompt(node, context);

      // Build user message from state or explicit input
      const userContent =
        typeof node.config.input === 'string'
          ? interpolate(node.config.input, context.state)
          : JSON.stringify(context.state);

      // Resolve tools: skill-bridge tools + extra tools
      const skillTools: McpToolDefinition[] = skillsToMcpTools(
        context.availableSkills.map((s) => ({
          ...s,
          endpoint:
            typeof (s as unknown as { endpoint?: string }).endpoint === 'string'
              ? (s as unknown as { endpoint: string }).endpoint
              : undefined,
        })),
      );
      const allTools: McpToolDefinition[] = [
        ...skillTools,
        ...(context.extraTools ?? []),
      ];

      const loopResult = await runToolCallLoop({
        provider: this.config.provider,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        tools: allTools,
        maxIterations:
          typeof node.config.maxIterations === 'number'
            ? node.config.maxIterations
            : 12,
        temperature:
          typeof node.config.temperature === 'number'
            ? node.config.temperature
            : undefined,
        maxTokens:
          typeof node.config.maxTokens === 'number'
            ? node.config.maxTokens
            : undefined,
      });

      const tokenUsage: RunStepTokenUsage = {
        input: loopResult.totalUsage.promptTokens,
        output: loopResult.totalUsage.completionTokens,
      };

      const costUsd = this.config.estimateCost
        ? this.config.estimateCost(model, tokenUsage)
        : undefined;

      const output = {
        content: loopResult.finalMessage.content,
        hitMaxIterations: loopResult.hitMaxIterations,
        iterations: loopResult.iterations,
      };

      // Merge output into state
      const outputKey =
        typeof node.config.outputKey === 'string'
          ? node.config.outputKey
          : node.id;
      const nextState = { ...context.state, [outputKey]: output };

      step.status = 'completed';
      step.completedAt = new Date().toISOString();
      step.output = output;
      step.tokenUsage = tokenUsage;
      step.costUsd = costUsd;

      return { step, state: nextState };
    } catch (err) {
      step.status = 'failed';
      step.completedAt = new Date().toISOString();
      step.error = err instanceof Error ? err.message : String(err);
      return { step, state: context.state };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function buildDefaultSystemPrompt(
  node: FlowNode,
  context: StepExecutionContext,
): string {
  return [
    `You are an AI agent executing a flow step.`,
    `Node: ${node.id} (${node.type})`,
    node.label ? `Label: ${node.label}` : '',
    `Workspace: ${context.workspaceId}`,
    `Run: ${context.runId}`,
    `Available state keys: ${Object.keys(context.state).join(', ') || 'none'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Simple {{key}} interpolation from state */
function interpolate(
  template: string,
  state: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = state[key];
    return val === undefined ? `{{${key}}}` : String(val);
  });
}
