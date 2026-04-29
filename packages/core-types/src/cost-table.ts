/**
 * cost-table.ts
 *
 * Per-model pricing in USD per 1 000 000 tokens (input / output).
 * Prices sourced from provider pricing pages — update as needed.
 *
 * Used by LlmStepExecutor and any analytics queries that need to convert
 * token counts to USD without an external API call.
 *
 * Keys follow the OpenRouter/provider convention: "provider/model-id".
 *
 * ---
 * HOW TO ADD NEW MODELS
 *   1. Obtain prices from the provider's pricing page.
 *   2. Add an entry under the relevant section: `'provider/model-id': { ... }`
 *   3. Run tests: `pnpm --filter core-types test`
 *
 * PRICING NOTE
 *   Values are in USD per ONE MILLION tokens (both input and output).
 *   Example: $0.15/1M input tokens → inputPer1M: 0.15
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
 * Add new models as they are released. The key is the full model string
 * used in ModelPolicy.primaryModel / ModelPolicy.fallbackChain.
 *
 * Sections:
 *   1. OpenAI
 *   2. Anthropic
 *   3. Qwen (ModelStudio / OpenRouter)
 *   4. DeepSeek
 *   5. Mistral            ← Gap 1 (was missing)
 *   6. Groq               ← Gap 2 (was missing)
 *   7. OpenRouter aliases  ← Gap 3 partial (generic aliases)
 */
export const COST_TABLE: Readonly<Record<string, ModelPricing>> = {

  // ─── 1. OpenAI ─────────────────────────────────────────────────
  //  Prices: https://openai.com/api/pricing/
  'openai/gpt-4.1':            { inputPer1M:  2.00, outputPer1M:  8.00 },  // GPT-4.1 (2026)
  'openai/gpt-4.1-mini':       { inputPer1M:  0.40, outputPer1M:  1.60 },  // GPT-4.1 mini
  'openai/gpt-4.1-nano':       { inputPer1M:  0.10, outputPer1M:  0.40 },  // GPT-4.1 nano
  'openai/gpt-4o':             { inputPer1M:  2.50, outputPer1M: 10.00 },
  'openai/gpt-4o-mini':        { inputPer1M:  0.15, outputPer1M:  0.60 },
  'openai/gpt-4-turbo':        { inputPer1M: 10.00, outputPer1M: 30.00 },
  'openai/gpt-4':              { inputPer1M: 30.00, outputPer1M: 60.00 },
  'openai/gpt-3.5-turbo':      { inputPer1M:  0.50, outputPer1M:  1.50 },
  'openai/o1':                 { inputPer1M: 15.00, outputPer1M: 60.00 },
  'openai/o1-mini':            { inputPer1M:  3.00, outputPer1M: 12.00 },
  'openai/o3':                 { inputPer1M: 10.00, outputPer1M: 40.00 },  // o3 (2025)
  'openai/o3-mini':            { inputPer1M:  1.10, outputPer1M:  4.40 },
  'openai/o4-mini':            { inputPer1M:  1.10, outputPer1M:  4.40 },  // o4-mini (2026)
  'openai/o4-mini-high':       { inputPer1M:  1.10, outputPer1M:  4.40 },

  // ─── 2. Anthropic ─────────────────────────────────────────────
  //  Prices: https://www.anthropic.com/pricing#api
  //  Gap 3a: claude-3-7-sonnet-20250219 was missing (ref in llm-client tests)
  'anthropic/claude-opus-4':                  { inputPer1M: 15.00, outputPer1M: 75.00 },  // Claude 4 Opus (2026)
  'anthropic/claude-sonnet-4':                { inputPer1M:  3.00, outputPer1M: 15.00 },  // Claude 4 Sonnet (2026)
  'anthropic/claude-3-7-sonnet-20250219':     { inputPer1M:  3.00, outputPer1M: 15.00 },  // ← was missing
  'anthropic/claude-3-7-sonnet-latest':       { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-5-sonnet-20241022':     { inputPer1M:  3.00, outputPer1M: 15.00 },  // ← was missing
  'anthropic/claude-3-5-sonnet':             { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-5-haiku':              { inputPer1M:  0.80, outputPer1M:  4.00 },
  'anthropic/claude-3-5-haiku-20241022':     { inputPer1M:  0.80, outputPer1M:  4.00 },
  'anthropic/claude-3-opus':                 { inputPer1M: 15.00, outputPer1M: 75.00 },
  'anthropic/claude-3-sonnet':               { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-haiku':               { inputPer1M:  0.25, outputPer1M:  1.25 },

  // ─── 3. Qwen (ModelStudio / Alibaba Cloud) ─────────────────────
  //  Prices: https://www.alibabacloud.com/help/en/model-studio/developer-reference/pricing
  'qwen/qwen-plus':              { inputPer1M:  0.40, outputPer1M:  1.20 },
  'qwen/qwen-turbo':             { inputPer1M:  0.05, outputPer1M:  0.15 },
  'qwen/qwen-max':               { inputPer1M:  1.60, outputPer1M:  6.40 },
  'qwen/qwen-long':              { inputPer1M:  0.05, outputPer1M:  0.15 },
  'qwen/qwen2.5-72b-instruct':   { inputPer1M:  0.90, outputPer1M:  0.90 },
  'qwen/qwen2.5-7b-instruct':    { inputPer1M:  0.10, outputPer1M:  0.10 },
  'qwen/qwen3-235b-a22b':        { inputPer1M:  0.14, outputPer1M:  0.60 },
  'qwen/qwen3-30b-a3b':          { inputPer1M:  0.07, outputPer1M:  0.28 },
  'qwen/qwen3-8b':               { inputPer1M:  0.05, outputPer1M:  0.20 },

  // ─── 4. DeepSeek ───────────────────────────────────────────────
  //  Prices: https://api-docs.deepseek.com/quick_start/pricing
  'deepseek/deepseek-chat':      { inputPer1M:  0.27, outputPer1M:  1.10 },
  'deepseek/deepseek-reasoner':  { inputPer1M:  0.55, outputPer1M:  2.19 },
  'deepseek/deepseek-coder':     { inputPer1M:  0.14, outputPer1M:  0.28 },
  'deepseek/deepseek-v3':        { inputPer1M:  0.27, outputPer1M:  1.10 },
  'deepseek/deepseek-r1':        { inputPer1M:  0.55, outputPer1M:  2.19 },

  // ─── 5. Mistral ───────────────────────────────────────────────
  //  Prices: https://mistral.ai/technology/#pricing
  //  ← GAP 1: was completely missing
  'mistral/mistral-large-latest':   { inputPer1M:  2.00, outputPer1M:  6.00 },
  'mistral/mistral-large-2411':     { inputPer1M:  2.00, outputPer1M:  6.00 },
  'mistral/mistral-medium-latest':  { inputPer1M:  2.70, outputPer1M:  8.10 },
  'mistral/mistral-small-latest':   { inputPer1M:  0.20, outputPer1M:  0.60 },
  'mistral/mistral-small-2409':     { inputPer1M:  0.20, outputPer1M:  0.60 },
  'mistral/open-mistral-7b':        { inputPer1M:  0.25, outputPer1M:  0.25 },
  'mistral/open-mixtral-8x7b':      { inputPer1M:  0.70, outputPer1M:  0.70 },
  'mistral/open-mixtral-8x22b':     { inputPer1M:  2.00, outputPer1M:  6.00 },
  'mistral/codestral-latest':       { inputPer1M:  1.00, outputPer1M:  3.00 },
  'mistral/codestral-2501':         { inputPer1M:  1.00, outputPer1M:  3.00 },
  'mistral/ministral-3b-latest':    { inputPer1M:  0.04, outputPer1M:  0.04 },
  'mistral/ministral-8b-latest':    { inputPer1M:  0.10, outputPer1M:  0.10 },
  'mistral/pixtral-12b-2409':       { inputPer1M:  0.15, outputPer1M:  0.15 },
  'mistral/pixtral-large-latest':   { inputPer1M:  2.00, outputPer1M:  6.00 },

  // ─── 6. Groq ─────────────────────────────────────────────────
  //  Prices: https://groq.com/pricing/
  //  ← GAP 2: was completely missing
  //  Groq charges for tokens processed, not separately input/output for most models.
  //  Using symmetric pricing (same inputPer1M === outputPer1M) where provider
  //  publishes a single per-token price. Asymmetric models listed explicitly.
  'groq/llama-3.3-70b-versatile':        { inputPer1M:  0.59, outputPer1M:  0.79 },
  'groq/llama-3.1-405b-reasoning':       { inputPer1M:  2.70, outputPer1M:  2.70 }, // preview
  'groq/llama-3.1-70b-versatile':        { inputPer1M:  0.59, outputPer1M:  0.79 },
  'groq/llama-3.1-8b-instant':           { inputPer1M:  0.05, outputPer1M:  0.08 },
  'groq/llama-3-70b-8192':              { inputPer1M:  0.59, outputPer1M:  0.79 },
  'groq/llama-3-8b-8192':               { inputPer1M:  0.05, outputPer1M:  0.08 },
  'groq/llama-guard-3-8b':              { inputPer1M:  0.20, outputPer1M:  0.20 },
  'groq/llama3-groq-70b-8192-tool-use-preview': { inputPer1M: 0.89, outputPer1M: 0.89 },
  'groq/llama3-groq-8b-8192-tool-use-preview':  { inputPer1M: 0.19, outputPer1M: 0.19 },
  'groq/gemma2-9b-it':                  { inputPer1M:  0.20, outputPer1M:  0.20 },
  'groq/gemma-7b-it':                   { inputPer1M:  0.07, outputPer1M:  0.07 },
  'groq/mixtral-8x7b-32768':            { inputPer1M:  0.24, outputPer1M:  0.24 },
  'groq/whisper-large-v3':              { inputPer1M:  0.00, outputPer1M:  0.00 }, // audio, priced per second
  'groq/whisper-large-v3-turbo':        { inputPer1M:  0.00, outputPer1M:  0.00 },

  // ─── 7. OpenRouter generic aliases ──────────────────────────────
  //  OpenRouter re-routes "auto" to the cheapest capable model.
  //  We conservatively price these at mid-tier.
  'openrouter/auto':                    { inputPer1M:  1.00, outputPer1M:  3.00 },

} as const;

/**
 * Fallback pricing used when the model is NOT in COST_TABLE.
 * Conservative estimate based on mid-tier model pricing.
 *
 * If you see many WARN logs about unknown models hitting DEFAULT_PRICING,
 * add those models to COST_TABLE.
 */
export const DEFAULT_PRICING: ModelPricing = {
  inputPer1M:  1.00,
  outputPer1M: 3.00,
};

/**
 * Calculate cost in USD from raw token counts.
 *
 * Falls back to DEFAULT_PRICING for unknown models and logs a warning
 * in development so engineers know to add the model to COST_TABLE.
 *
 * @param model   Full model id e.g. 'openai/gpt-4o', 'mistral/mistral-large-latest'
 * @param input   Number of input (prompt) tokens consumed
 * @param output  Number of output (completion) tokens generated
 * @returns       Cost in USD (e.g. 0.00125)
 *
 * @example
 *   const cost = calculateTokenCost('openai/gpt-4o', 1500, 400);
 *   // 1500 * 2.50/1e6 + 400 * 10.00/1e6 = 0.003750 + 0.004000 = 0.007750
 */
export function calculateTokenCost(
  model: string,
  input: number,
  output: number,
): number {
  const pricing = COST_TABLE[model];
  if (!pricing) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[cost-table] Unknown model '${model}' — using DEFAULT_PRICING ($${DEFAULT_PRICING.inputPer1M}/$${DEFAULT_PRICING.outputPer1M} per 1M). Add it to COST_TABLE.`,
      );
    }
  }
  const p = pricing ?? DEFAULT_PRICING;
  return (input * p.inputPer1M + output * p.outputPer1M) / 1_000_000;
}

/**
 * Alias kept for backward-compat with any code using `calculateCost()`.
 * Prefer `calculateTokenCost()` for new code.
 * @deprecated use calculateTokenCost()
 */
export const calculateCost = calculateTokenCost;

/**
 * Return true if the model has an explicit entry in COST_TABLE.
 * Useful for analytics checks and tests.
 */
export function isKnownModel(model: string): boolean {
  return model in COST_TABLE;
}
