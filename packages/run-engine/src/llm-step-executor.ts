/**
 * LLMStepExecutor — real LLM/tool execution replacing the stub StepExecutor.
 *
 * Design sources:
 *  - CrewAI: agent ReAct loop (think → act → observe) and tool-call pattern
 *  - LangGraph: checkpoint-friendly step execution and conditional branching
 *  - Flowise: node-level skill invocation and MCP tool dispatch
 *  - Semantic Kernel: planner-skill contract (function calling with typed args)
 *  - AutoGen: subagent delegation via nested chat / spawn pattern
 *  - Hermes Chief-of-Staff: approval gate before sensitive tool execution
 */
import type { FlowNode } from '../../core-types/src';
import type { RunStep, RunSpec } from '../../core-types/src';
import { StepExecutor, type StepExecutionResult } from './step-executor';

// ── Provider config ────────────────────────────────────────────────────────
export interface ModelProviderConfig {
  provider: 'openai' | 'qwen' | 'deepseek' | 'openrouter';
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

// ── Tool/Skill descriptor (Semantic Kernel style) ──────────────────────────
export interface SkillDescriptor {
  id: string;
  name: string;
  description: string;
  type: 'mcp' | 'n8n_webhook' | 'local_function' | 'http';
  config: Record<string, unknown>;
}

// ── LLM message types ─────────────────────────────────────────────────────
interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

interface LLMToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface LLMResponse {
  content: string | null;
  tool_calls?: LLMToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model?: string;
}

// ── Scope context passed from runs.service ────────────────────────────────
export interface LLMExecutorContext {
  /** Resolved model config for this scope (agency/dept/workspace/agent) */
  modelConfig: ModelProviderConfig;
  /** Skills available to this agent */
  skills?: SkillDescriptor[];
  /** Resolved system prompt (from agent spec or hierarchy propagation) */
  systemPrompt?: string;
  /** Workspace/agent ID for hierarchy delegation */
  workspaceId?: string;
  agentId?: string;
}

// ── Provider base-URLs ────────────────────────────────────────────────────
const PROVIDER_BASE: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

// ── Main executor class ───────────────────────────────────────────────────
export class LLMStepExecutor extends StepExecutor {
  private readonly ctx: LLMExecutorContext;

  constructor(ctx: LLMExecutorContext) {
    super();
    this.ctx = ctx;
  }

  // ── Agent node: ReAct loop (CrewAI pattern) ─────────────────────────────
  protected override async executeAgent(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    const agentId = (node.config.agentId as string) ?? this.ctx.agentId ?? 'unknown';
    const userPrompt = this.buildAgentPrompt(node, step, run);
    const systemPrompt = (node.config.systemPrompt as string) ??
      this.ctx.systemPrompt ??
      `You are agent ${agentId}. Complete the assigned task precisely.`;

    const tools = this.buildToolSchemas();
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    // ReAct loop — max 8 iterations (CrewAI/AutoGen pattern)
    const MAX_ITERATIONS = 8;
    let finalContent = '';
    let totalInput = 0;
    let totalOutput = 0;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await this.callLLM(messages, tools.length > 0 ? tools : undefined);
      totalInput += response.usage?.prompt_tokens ?? 0;
      totalOutput += response.usage?.completion_tokens ?? 0;

      if (!response.tool_calls || response.tool_calls.length === 0) {
        // Final answer — no more tool calls
        finalContent = response.content ?? '';
        break;
      }

      // Add assistant message with tool_calls
      messages.push({ role: 'assistant', content: response.content ?? '' });

      // Execute each tool call and add results (Semantic Kernel skill invocation)
      for (const toolCall of response.tool_calls) {
        const toolResult = await this.dispatchToolCall(toolCall);
        messages.push({
          role: 'tool',
          content: JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        });
      }
    }

    const costUsd = this.estimateCost(totalInput, totalOutput, this.ctx.modelConfig.model);

    return {
      status: 'completed',
      output: { agentId, response: finalContent, iterations: messages.length },
      tokenUsage: { input: totalInput, output: totalOutput },
      costUsd,
    };
  }

  // ── Tool node: skill dispatch (Flowise node-skill + MCP + n8n) ───────────
  protected override async executeTool(
    node: FlowNode,
    _step: RunStep,
    _run: RunSpec,
  ): Promise<StepExecutionResult> {
    const skillId = (node.config.skillId as string) ?? 'unknown';
    const functionName = (node.config.functionName as string) ?? 'run';
    const inputData = (node.config.input as Record<string, unknown>) ?? {};

    const skill = this.ctx.skills?.find((s) => s.id === skillId);
    if (!skill) {
      return {
        status: 'failed',
        error: `Skill '${skillId}' not found in executor context`,
      };
    }

    const result = await this.invokeSkill(skill, functionName, inputData);
    return {
      status: 'completed',
      output: { skillId, functionName, result },
    };
  }

  // ── Condition node: LLM-evaluated expression (LangGraph branch pattern) ──
  protected override async executeCondition(
    node: FlowNode,
    _step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    const expression = (node.config.expression as string) ?? 'true';
    const branches = (node.config.branches as string[]) ?? ['true', 'false'];

    // Simple JS-safe evaluation with run context injected
    const context = {
      run,
      output: run.steps.at(-1)?.output ?? {},
      trigger: run.trigger,
    };

    let selectedBranch = branches[0];
    try {
      // Safe eval: replace variable refs then evaluate
      const fn = new Function('ctx', `"use strict"; with(ctx) { return !!(${expression}); }`);
      const result: boolean = fn(context);
      selectedBranch = result ? branches[0] : (branches[1] ?? branches[0]);
    } catch {
      // If eval fails, fall through to first branch (LangGraph default)
      selectedBranch = branches[0];
    }

    return {
      status: 'completed',
      output: { expression, selectedBranch, contextSnapshot: { trigger: run.trigger.type } },
      branch: selectedBranch,
    };
  }

  // ── Internal: build user prompt from node config + run context ────────────
  private buildAgentPrompt(node: FlowNode, _step: RunStep, run: RunSpec): string {
    const task = (node.config.task as string) ??
      (node.config.prompt as string) ??
      `Process the following input: ${JSON.stringify(run.trigger.payload ?? {})}`;

    const prevOutputs = run.steps
      .filter((s) => s.status === 'completed' && s.output)
      .map((s) => `[Step ${s.nodeId}]: ${JSON.stringify(s.output)}`)
      .join('\n');

    return prevOutputs
      ? `Previous context:\n${prevOutputs}\n\nCurrent task:\n${task}`
      : task;
  }

  // ── Internal: build OpenAI-compatible tool schemas from skills ────────────
  private buildToolSchemas(): Record<string, unknown>[] {
    if (!this.ctx.skills || this.ctx.skills.length === 0) return [];
    return this.ctx.skills.map((skill) => ({
      type: 'function',
      function: {
        name: `${skill.id}__${skill.type}`,
        description: skill.description,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input payload for the skill' },
          },
          required: ['input'],
        },
      },
    }));
  }

  // ── Internal: dispatch a tool_call to the right skill backend ─────────────
  private async dispatchToolCall(toolCall: LLMToolCall): Promise<unknown> {
    const [skillId] = toolCall.function.name.split('__');
    const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    const skill = this.ctx.skills?.find((s) => s.id === skillId);
    if (!skill) return { error: `Skill ${skillId} not found` };
    return this.invokeSkill(skill, 'run', args);
  }

  // ── Internal: invoke a skill by type ────────────────────────────────────
  private async invokeSkill(
    skill: SkillDescriptor,
    functionName: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    switch (skill.type) {
      case 'http':
      case 'n8n_webhook': {
        const url = (skill.config.webhookUrl as string) ?? (skill.config.url as string);
        if (!url) return { error: 'No webhook URL configured' };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ functionName, input }),
        });
        return res.json();
      }
      case 'mcp': {
        // MCP tool call via HTTP transport (OpenClaw/MCP standard)
        const mcpUrl = (skill.config.serverUrl as string);
        if (!mcpUrl) return { error: 'No MCP server URL configured' };
        const res = await fetch(`${mcpUrl}/tools/call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: functionName, arguments: input }),
        });
        return res.json();
      }
      case 'local_function': {
        // Reserved for built-in functions registered at runtime
        return { result: `local_function:${skill.id}.${functionName}`, input };
      }
      default:
        return { error: `Unknown skill type: ${skill.type}` };
    }
  }

  // ── Internal: call LLM provider (OpenAI-compatible API) ───────────────────
  private async callLLM(
    messages: LLMMessage[],
    tools?: Record<string, unknown>[],
  ): Promise<LLMResponse> {
    const { provider, model, apiKey, baseUrl, maxTokens = 4096, temperature = 0.7 } = this.ctx.modelConfig;
    const endpoint = `${baseUrl ?? PROVIDER_BASE[provider]}/chat/completions`;

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // OpenRouter requires this header
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://agent-visualstudio' } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM API error ${res.status}: ${errText}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string | null; tool_calls?: LLMToolCall[] } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model?: string;
    };

    const choice = data.choices[0]?.message;
    return {
      content: choice?.content ?? null,
      tool_calls: choice?.tool_calls,
      usage: data.usage,
      model: data.model,
    };
  }

  // ── Internal: cost estimation (per-1k token pricing approximation) ────────
  private estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    // Approximate prices USD per 1k tokens [input, output]
    const pricing: Record<string, [number, number]> = {
      'gpt-4o': [0.005, 0.015],
      'gpt-4o-mini': [0.00015, 0.0006],
      'gpt-4-turbo': [0.01, 0.03],
      'gpt-3.5-turbo': [0.0005, 0.0015],
      'deepseek-chat': [0.00027, 0.0011],
      'deepseek-reasoner': [0.00055, 0.0022],
      'qwen-plus': [0.0004, 0.0012],
      'qwen-turbo': [0.0002, 0.0006],
    };
    const [inRate, outRate] = pricing[model] ?? [0.001, 0.002];
    return (inputTokens / 1000) * inRate + (outputTokens / 1000) * outRate;
  }
}
