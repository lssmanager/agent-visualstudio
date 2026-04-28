/**
 * cost-table.ts
 *
 * Per-model pricing in USD per 1 000 000 tokens (input / output).
 * Prices sourced from provider pricing pages — update as needed.
 *
 * Used by LlmStepExecutor.calculateCost() and any analytics queries
 * that need to convert token counts to USD without an external API call.
 *
 * Keys follow the OpenRouter/provider convention: "provider/model-id".
 * For models accessed via OpenAI directly, use "openai/model-id".
 */

export interface ModelPricing {
  /** USD per 1 000 000 input tokens */
  inputPer1M:  number;
  /** USD per 1 000 000 output tokens */
  outputPer1M: number;
}

/**
 * COST_TABLE
 *
 * Add new models as needed. The key is the model string used in
 * ModelPolicy.primaryModel / ModelPolicy.fallbackModel.
 */
export const COST_TABLE: Record<string, ModelPricing> = {
  // ── OpenAI ───────────────────────────────────────────────────────────
  'openai/gpt-4o':           { inputPer1M:  2.50, outputPer1M: 10.00 },
  'openai/gpt-4o-mini':      { inputPer1M:  0.15, outputPer1M:  0.60 },
  'openai/gpt-4-turbo':      { inputPer1M: 10.00, outputPer1M: 30.00 },
  'openai/gpt-4':            { inputPer1M: 30.00, outputPer1M: 60.00 },
  'openai/gpt-3.5-turbo':    { inputPer1M:  0.50, outputPer1M:  1.50 },
  'openai/o1':               { inputPer1M: 15.00, outputPer1M: 60.00 },
  'openai/o1-mini':          { inputPer1M:  3.00, outputPer1M: 12.00 },
  'openai/o3-mini':          { inputPer1M:  1.10, outputPer1M:  4.40 },

  // ── Anthropic ────────────────────────────────────────────────────
  'anthropic/claude-3-5-sonnet': { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-5-haiku':  { inputPer1M:  0.80, outputPer1M:  4.00 },
  'anthropic/claude-3-opus':     { inputPer1M: 15.00, outputPer1M: 75.00 },
  'anthropic/claude-3-sonnet':   { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-haiku':    { inputPer1M:  0.25, outputPer1M:  1.25 },

  // ── Qwen (via ModelStudio / OpenRouter) ───────────────────────────
  'qwen/qwen-plus':              { inputPer1M:  0.40, outputPer1M:  1.20 },
  'qwen/qwen-turbo':             { inputPer1M:  0.05, outputPer1M:  0.15 },
  'qwen/qwen-max':               { inputPer1M:  1.60, outputPer1M:  6.40 },
  'qwen/qwen-long':              { inputPer1M:  0.05, outputPer1M:  0.15 },
  'qwen/qwen2.5-72b-instruct':   { inputPer1M:  0.90, outputPer1M:  0.90 },
  'qwen/qwen2.5-7b-instruct':    { inputPer1M:  0.10, outputPer1M:  0.10 },
  'qwen/qwen3-235b-a22b':        { inputPer1M:  0.14, outputPer1M:  0.60 },
  'qwen/qwen3-30b-a3b':          { inputPer1M:  0.07, outputPer1M:  0.28 },

  // ── DeepSeek ────────────────────────────────────────────────────────
  'deepseek/deepseek-chat':      { inputPer1M:  0.27, outputPer1M:  1.10 },
  'deepseek/deepseek-reasoner':  { inputPer1M:  0.55, outputPer1M:  2.19 },
  'deepseek/deepseek-coder':     { inputPer1M:  0.14, outputPer1M:  0.28 },
};

/**
 * Fallback pricing when the model is not in COST_TABLE.
 * Conservative estimate based on mid-tier models.
 */
export const DEFAULT_PRICING: ModelPricing = {
  inputPer1M:  1.00,
  outputPer1M: 3.00,
};

/**
 * Calculate cost in USD from token counts.
 * @param model  Model string key (e.g. 'openai/gpt-4o')
 * @param input  Number of input tokens
 * @param output Number of output tokens
 */
export function calculateTokenCost(
  model: string,
  input: number,
  output: number,
): number {
  const pricing = COST_TABLE[model] ?? DEFAULT_PRICING;
  return (input * pricing.inputPer1M + output * pricing.outputPer1M) / 1_000_000;
}
