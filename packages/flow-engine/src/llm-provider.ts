/**
 * ILLMProvider — provider-agnostic interface for LLM calls.
 *
 * Decouples FlowExecutor / LLMStepExecutor from any specific SDK.
 * Implementations: OpenAILLMProvider (this file), future: AnthropicLLMProvider, etc.
 */
import type { McpToolDefinition } from '../../mcp-server/src/tools.js';

// ── Shared message types ────────────────────────────────────────────────

export type LLMMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
  /** Present only when role === 'tool' */
  toolCallId?: string;
  /** Present only when role === 'assistant' and the message has tool calls */
  toolCalls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    /** JSON-encoded arguments string */
    arguments: string;
  };
}

// ── Provider interface ─────────────────────────────────────────────────────

export interface LLMCallOptions {
  model: string;
  messages: LLMMessage[];
  tools?: McpToolDefinition[];
  /** Max tokens for the completion */
  maxTokens?: number;
  temperature?: number;
  /** If set, force the model to call this specific tool */
  toolChoice?: 'auto' | 'none' | { name: string };
}

export interface LLMTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMCallResult {
  message: LLMMessage;
  usage: LLMTokenUsage;
  /** Raw model string returned by the provider */
  model: string;
  /** Provider-reported finish reason */
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | string;
}

export interface ILLMProvider {
  call(options: LLMCallOptions): Promise<LLMCallResult>;
}

// ── OpenAI implementation ─────────────────────────────────────────────────

export interface OpenAILLMProviderConfig {
  apiKey: string;
  /** Base URL — override for proxies / Azure / OpenRouter */
  baseUrl?: string;
  /** Default model used when LLMCallOptions.model is omitted */
  defaultModel?: string;
  /** Per-provider cost table USD per 1K tokens { model: { input, output } } */
  costPerKTokens?: Record<string, { input: number; output: number }>;
}

/**
 * OpenAI-compatible provider (also works with OpenRouter, Azure, DeepSeek, Qwen)
 * by setting baseUrl in the config.
 * Uses raw fetch — no openai SDK dependency.
 */
export class OpenAILLMProvider implements ILLMProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly costTable: Record<
    string,
    { input: number; output: number }
  >;

  constructor(config: OpenAILLMProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (
      config.baseUrl ?? 'https://api.openai.com/v1'
    ).replace(/\/+$/, '');
    this.defaultModel = config.defaultModel ?? 'gpt-4o-mini';
    this.costTable = config.costPerKTokens ?? DEFAULT_COST_TABLE;
  }

  async call(options: LLMCallOptions): Promise<LLMCallResult> {
    const model = options.model || this.defaultModel;

    // Build tool definitions for the API call
    const tools =
      options.tools && options.tools.length > 0
        ? options.tools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: zodToJsonSchema(t.schema),
            },
          }))
        : undefined;

    const body: Record<string, unknown> = {
      model,
      messages: options.messages.map(serializeMessage),
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.2,
    };
    if (tools) {
      body.tools = tools;
      body.tool_choice =
        options.toolChoice === 'none'
          ? 'none'
          : options.toolChoice && typeof options.toolChoice === 'object'
            ? { type: 'function', function: { name: options.toolChoice.name } }
            : 'auto';
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `LLM provider error ${response.status}: ${text}`,
      );
    }

    const data = (await response.json()) as OpenAIChatCompletion;
    const choice = data.choices[0];
    if (!choice) {
      throw new Error('LLM provider returned no choices');
    }

    const rawMsg = choice.message;
    const message: LLMMessage = {
      role: 'assistant',
      content: rawMsg.content ?? '',
      toolCalls: rawMsg.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: tc.function,
      })),
    };

    const usage: LLMTokenUsage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    };

    return {
      message,
      usage,
      model: data.model ?? model,
      finishReason: choice.finish_reason ?? 'stop',
    };
  }

  /** Estimate cost in USD for a completed call */
  estimateCost(
    model: string,
    usage: LLMTokenUsage,
  ): number {
    const rates = this.costTable[model] ?? this.costTable['default'] ?? {
      input: 0,
      output: 0,
    };
    return (
      (usage.promptTokens / 1000) * rates.input +
      (usage.completionTokens / 1000) * rates.output
    );
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────

function serializeMessage(msg: LLMMessage): unknown {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: msg.toolCallId,
      content: msg.content,
    };
  }
  if (msg.role === 'assistant' && msg.toolCalls?.length) {
    return {
      role: 'assistant',
      content: msg.content || null,
      tool_calls: msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: tc.function,
      })),
    };
  }
  return { role: msg.role, content: msg.content };
}

/**
 * Minimal JSON Schema extraction from a Zod object schema.
 * Good enough for OpenAI function calling — handles string/number/boolean.
 */
function zodToJsonSchema(schema: import('zod').AnyZodObject): unknown {
  try {
    // Attempt to use the schema's .shape to build a basic JSON schema
    const shape = (schema as unknown as { shape?: Record<string, unknown> }).shape ?? {};
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const fs = fieldSchema as unknown as {
        _def?: { typeName?: string; innerType?: { _def?: { typeName?: string } } };
        isOptional?: () => boolean;
      };
      const typeName =
        fs._def?.typeName ??
        fs._def?.innerType?._def?.typeName ??
        'ZodUnknown';

      let jsonType: string;
      switch (typeName) {
        case 'ZodString':
          jsonType = 'string';
          break;
        case 'ZodNumber':
          jsonType = 'number';
          break;
        case 'ZodBoolean':
          jsonType = 'boolean';
          break;
        case 'ZodArray':
          jsonType = 'array';
          break;
        default:
          jsonType = 'string';
      }

      properties[key] = { type: jsonType };
      if (!fs.isOptional?.()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  } catch {
    return { type: 'object', properties: {} };
  }
}

// ── OpenAI API response types (minimal) ───────────────────────────────

interface OpenAIToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface OpenAIChatChoice {
  message: {
    role: string;
    content: string | null;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason: string;
}

interface OpenAIChatCompletion {
  model: string;
  choices: OpenAIChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ── Default cost table (USD / 1K tokens) ────────────────────────────────
// Update as needed — these are approximate 2025 rates.
const DEFAULT_COST_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'o3-mini': { input: 0.0011, output: 0.0044 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-reasoner': { input: 0.00055, output: 0.00219 },
  'qwen-plus': { input: 0.0004, output: 0.0012 },
  'qwen-turbo': { input: 0.00005, output: 0.0002 },
  'default': { input: 0.001, output: 0.002 },
};
