/**
 * ToolCallLoop — agentic loop that:
 * 1. Calls the LLM with the current message history + available tools
 * 2. Executes tool calls returned by the model
 * 3. Appends tool results to the history
 * 4. Repeats until the model returns a final text response or maxIterations is reached
 */
import type { ILLMProvider, LLMMessage, LLMCallOptions, LLMCallResult } from './llm-provider';
import type { McpToolDefinition } from '../../mcp-server/src/tools';

export interface ToolCallLoopOptions {
  provider: ILLMProvider;
  model: string;
  messages: LLMMessage[];
  tools: McpToolDefinition[];
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  /** Called after each iteration for observability */
  onIteration?: (iteration: number, result: LLMCallResult) => void;
}

export interface ToolCallLoopResult {
  /** Final assistant message (no more tool calls) */
  finalMessage: LLMMessage;
  /** Full message history including tool calls and results */
  messages: LLMMessage[];
  /** Aggregated token usage across all iterations */
  totalUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  iterations: number;
  /** True if loop stopped because maxIterations was reached */
  hitMaxIterations: boolean;
}

const DEFAULT_MAX_ITERATIONS = 12;

export async function runToolCallLoop(
  options: ToolCallLoopOptions,
): Promise<ToolCallLoopResult> {
  const {
    provider,
    model,
    tools,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    temperature,
    maxTokens,
    onIteration,
  } = options;

  const messages: LLMMessage[] = [...options.messages];
  const toolMap = new Map<string, McpToolDefinition>(
    tools.map((t) => [t.name, t]),
  );

  const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let iterations = 0;
  let hitMaxIterations = false;

  while (iterations < maxIterations) {
    iterations++;

    const callOptions: LLMCallOptions = {
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature,
      maxTokens,
    };

    const result = await provider.call(callOptions);
    onIteration?.(iterations, result);

    // Accumulate token usage
    totalUsage.promptTokens += result.usage.promptTokens;
    totalUsage.completionTokens += result.usage.completionTokens;
    totalUsage.totalTokens += result.usage.totalTokens;

    messages.push(result.message);

    // If the model returned no tool calls, we're done
    if (
      result.finishReason !== 'tool_calls' ||
      !result.message.toolCalls?.length
    ) {
      return {
        finalMessage: result.message,
        messages,
        totalUsage,
        iterations,
        hitMaxIterations: false,
      };
    }

    // Execute each tool call in parallel
    const toolResults = await Promise.all(
      result.message.toolCalls.map(async (tc) => {
        const tool = toolMap.get(tc.function.name);
        let content: string;
        if (!tool) {
          content = JSON.stringify({
            error: `Unknown tool: ${tc.function.name}`,
          });
        } else {
          try {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments) as Record<
                string,
                unknown
              >;
            } catch {
              // malformed JSON — pass empty args
            }
            const toolResult = await tool.execute(args);
            content = toolResult.content.map((c) => c.text).join('\n');
          } catch (err) {
            content = JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        return {
          role: 'tool' as const,
          toolCallId: tc.id,
          content,
        };
      }),
    );

    messages.push(...toolResults);
  }

  // maxIterations reached — return last assistant message
  hitMaxIterations = true;
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');

  return {
    finalMessage: lastAssistant ?? {
      role: 'assistant',
      content: '[max iterations reached without final response]',
    },
    messages,
    totalUsage,
    iterations,
    hitMaxIterations,
  };
}
