/**
 * cost-table.ts
 *
 * Per-model pricing in USD per 1 000 000 tokens (input / output).
 * Prices sourced from provider pricing pages — update as needed.
 *
 * Used by LlmStepExecutor and any analytics queries that need to convert
 * token counts to USD without an external API call.
 *
 * Keys follow the OpenClaw convention: "provider/model-id".
 *
 * ---
 * PRICING NOTE
 *   Values are in USD per ONE MILLION tokens (both input and output).
 *   Example: $0.15/1M input tokens → inputPer1M: 0.15
 *
 * [EST] = estimated / unconfirmed — verify against provider pricing page
 *         before using in billing-critical contexts.
 *
 * Last full review: 2026-04-29
 *
 * Sections:
 *   1.  OpenAI
 *   2.  Anthropic
 *   3.  Google Gemini
 *   4.  xAI (Grok)
 *   5.  DeepSeek
 *   6.  Qwen (Alibaba Model Studio)
 *   7.  Mistral
 *   8.  Groq
 *   9.  Moonshot (Kimi)
 *   10. MiniMax
 *   11. Z.AI (GLM)
 *   12. Together AI
 *   13. Cerebras
 *   14. NVIDIA
 *   15. StepFun
 *   16. Perplexity
 *   17. Xiaomi
 *   18. Volcengine / BytePlus (Doubao)
 *   19. Gateways & subscriptions ($0 — cost absorbed)
 *   20. Local models (always $0)
 */

export interface ModelPricing {
  /** USD per 1 000 000 input tokens */
  inputPer1M:  number;
  /** USD per 1 000 000 output tokens */
  outputPer1M: number;
}

export const COST_TABLE: Readonly<Record<string, ModelPricing>> = {

  // ─── 1. OpenAI ─────────────────────────────────────────────────────────────
  // https://openai.com/api/pricing/
  'openai/gpt-5.5':            { inputPer1M:  5.00, outputPer1M: 20.00 },  // [EST]
  'openai/gpt-5.4-mini':       { inputPer1M:  0.40, outputPer1M:  1.60 },  // [EST]
  'openai/gpt-4.1':            { inputPer1M:  2.00, outputPer1M:  8.00 },
  'openai/gpt-4.1-mini':       { inputPer1M:  0.40, outputPer1M:  1.60 },
  'openai/gpt-4.1-nano':       { inputPer1M:  0.10, outputPer1M:  0.40 },
  'openai/gpt-4o':             { inputPer1M:  2.50, outputPer1M: 10.00 },
  'openai/gpt-4o-mini':        { inputPer1M:  0.15, outputPer1M:  0.60 },
  'openai/gpt-4-turbo':        { inputPer1M: 10.00, outputPer1M: 30.00 },
  'openai/gpt-4':              { inputPer1M: 30.00, outputPer1M: 60.00 },
  'openai/gpt-3.5-turbo':      { inputPer1M:  0.50, outputPer1M:  1.50 },
  'openai/o4-mini':            { inputPer1M:  1.10, outputPer1M:  4.40 },
  'openai/o4-mini-high':       { inputPer1M:  1.10, outputPer1M:  4.40 },
  'openai/o3':                 { inputPer1M: 10.00, outputPer1M: 40.00 },
  'openai/o3-mini':            { inputPer1M:  1.10, outputPer1M:  4.40 },
  'openai/o1':                 { inputPer1M: 15.00, outputPer1M: 60.00 },
  'openai/o1-mini':            { inputPer1M:  3.00, outputPer1M: 12.00 },

  // ─── 2. Anthropic ──────────────────────────────────────────────────────────
  // https://www.anthropic.com/pricing
  'anthropic/claude-opus-4-7':            { inputPer1M: 15.00, outputPer1M: 75.00 },  // [EST]
  'anthropic/claude-opus-4-6':            { inputPer1M: 15.00, outputPer1M: 75.00 },
  'anthropic/claude-opus-4':              { inputPer1M: 15.00, outputPer1M: 75.00 },
  'anthropic/claude-sonnet-4':            { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-7-sonnet-20250219': { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-7-sonnet-latest':   { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-5-sonnet-20241022': { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-5-sonnet':          { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-5-haiku-20241022':  { inputPer1M:  0.80, outputPer1M:  4.00 },
  'anthropic/claude-3-5-haiku':           { inputPer1M:  0.80, outputPer1M:  4.00 },
  'anthropic/claude-3-opus':              { inputPer1M: 15.00, outputPer1M: 75.00 },
  'anthropic/claude-3-sonnet':            { inputPer1M:  3.00, outputPer1M: 15.00 },
  'anthropic/claude-3-haiku':             { inputPer1M:  0.25, outputPer1M:  1.25 },
  // Kimi compat also exposes claude models
  'kimi/kimi-code':                        { inputPer1M:  3.00, outputPer1M: 15.00 },  // [EST]

  // ─── 3. Google Gemini ──────────────────────────────────────────────────────
  // https://ai.google.dev/pricing
  'google/gemini-3.1-pro-preview':         { inputPer1M:  2.50, outputPer1M: 10.00 },  // [EST]
  'google/gemini-3.1-pro':                 { inputPer1M:  2.50, outputPer1M: 10.00 },  // alias
  'google/gemini-3.1-flash-preview':       { inputPer1M:  0.15, outputPer1M:  0.60 },  // [EST]
  'google/gemini-3-flash-preview':         { inputPer1M:  0.15, outputPer1M:  0.60 },  // [EST]
  'google/gemini-2.5-pro':                 { inputPer1M:  1.25, outputPer1M: 10.00 },
  'google/gemini-2.5-flash':               { inputPer1M:  0.15, outputPer1M:  0.60 },
  'google/gemini-2.0-flash':               { inputPer1M:  0.10, outputPer1M:  0.40 },
  'google/gemini-1.5-pro':                 { inputPer1M:  1.25, outputPer1M:  5.00 },
  'google/gemini-1.5-flash':               { inputPer1M:  0.075,outputPer1M:  0.30 },
  // Vertex AI — same prices
  'google-vertex/gemini-3.1-pro-preview':  { inputPer1M:  2.50, outputPer1M: 10.00 },  // [EST]
  'google-vertex/gemini-2.5-pro':          { inputPer1M:  1.25, outputPer1M: 10.00 },
  // Gemini CLI (free OAuth tier)
  'google-gemini-cli/gemini-3-flash-preview': { inputPer1M: 0.00, outputPer1M: 0.00 },
  'google-gemini-cli/gemini-2.5-flash':    { inputPer1M:  0.00, outputPer1M:  0.00 },

  // ─── 4. xAI (Grok) ─────────────────────────────────────────────────────────
  // https://x.ai/api
  'xai/grok-4':                { inputPer1M:  3.00, outputPer1M: 15.00 },  // [EST]
  'xai/grok-4-0709':           { inputPer1M:  3.00, outputPer1M: 15.00 },  // [EST]
  'xai/grok-4-fast':           { inputPer1M:  5.00, outputPer1M: 25.00 },  // [EST]
  'xai/grok-3':                { inputPer1M:  3.00, outputPer1M: 15.00 },
  'xai/grok-3-mini':           { inputPer1M:  0.30, outputPer1M:  0.50 },
  'xai/grok-3-fast':           { inputPer1M:  5.00, outputPer1M: 25.00 },  // [EST]
  'xai/grok-2':                { inputPer1M:  2.00, outputPer1M: 10.00 },
  'xai/grok-beta':             { inputPer1M:  5.00, outputPer1M: 15.00 },

  // ─── 5. DeepSeek ───────────────────────────────────────────────────────────
  // https://api-docs.deepseek.com/quick_start/pricing
  'deepseek/deepseek-v4-flash': { inputPer1M:  0.14, outputPer1M:  0.28 },  // [EST]
  'deepseek/deepseek-chat':     { inputPer1M:  0.27, outputPer1M:  1.10 },
  'deepseek/deepseek-reasoner': { inputPer1M:  0.55, outputPer1M:  2.19 },
  'deepseek/deepseek-v3':       { inputPer1M:  0.27, outputPer1M:  1.10 },
  'deepseek/deepseek-r1':       { inputPer1M:  0.55, outputPer1M:  2.19 },
  'deepseek/deepseek-coder':    { inputPer1M:  0.14, outputPer1M:  0.28 },

  // ─── 6. Qwen (Alibaba Model Studio) ────────────────────────────────────────
  // https://www.alibabacloud.com/help/en/model-studio/developer-reference/pricing
  'qwen/qwen3.5-plus':          { inputPer1M:  0.40, outputPer1M:  1.20 },  // [EST]
  'qwen/qwen3-235b-a22b':       { inputPer1M:  0.14, outputPer1M:  0.60 },
  'qwen/qwen3-30b-a3b':         { inputPer1M:  0.07, outputPer1M:  0.28 },
  'qwen/qwen3-8b':              { inputPer1M:  0.05, outputPer1M:  0.20 },
  'qwen/qwen-max':              { inputPer1M:  1.60, outputPer1M:  6.40 },
  'qwen/qwen-plus':             { inputPer1M:  0.40, outputPer1M:  1.20 },
  'qwen/qwen-turbo':            { inputPer1M:  0.05, outputPer1M:  0.15 },
  'qwen/qwen-long':             { inputPer1M:  0.05, outputPer1M:  0.15 },
  'qwen/qwen2.5-72b-instruct':  { inputPer1M:  0.90, outputPer1M:  0.90 },
  'qwen/qwen2.5-7b-instruct':   { inputPer1M:  0.10, outputPer1M:  0.10 },

  // ─── 7. Mistral ─────────────────────────────────────────────────────────────
  // https://mistral.ai/technology/#pricing
  'mistral/mistral-large-latest':   { inputPer1M:  2.00, outputPer1M:  6.00 },
  'mistral/mistral-large-2411':     { inputPer1M:  2.00, outputPer1M:  6.00 },
  'mistral/mistral-medium-latest':  { inputPer1M:  2.70, outputPer1M:  8.10 },
  'mistral/mistral-small-latest':   { inputPer1M:  0.20, outputPer1M:  0.60 },
  'mistral/mistral-small-2409':     { inputPer1M:  0.20, outputPer1M:  0.60 },
  'mistral/codestral-latest':       { inputPer1M:  1.00, outputPer1M:  3.00 },
  'mistral/codestral-2501':         { inputPer1M:  1.00, outputPer1M:  3.00 },
  'mistral/ministral-3b-latest':    { inputPer1M:  0.04, outputPer1M:  0.04 },
  'mistral/ministral-8b-latest':    { inputPer1M:  0.10, outputPer1M:  0.10 },
  'mistral/open-mistral-7b':        { inputPer1M:  0.25, outputPer1M:  0.25 },
  'mistral/open-mixtral-8x7b':      { inputPer1M:  0.70, outputPer1M:  0.70 },
  'mistral/open-mixtral-8x22b':     { inputPer1M:  2.00, outputPer1M:  6.00 },
  'mistral/pixtral-12b-2409':       { inputPer1M:  0.15, outputPer1M:  0.15 },
  'mistral/pixtral-large-latest':   { inputPer1M:  2.00, outputPer1M:  6.00 },

  // ─── 8. Groq ────────────────────────────────────────────────────────────────
  // https://groq.com/pricing/
  'groq/llama-3.3-70b-versatile':   { inputPer1M:  0.59, outputPer1M:  0.79 },
  'groq/llama-3.1-70b-versatile':   { inputPer1M:  0.59, outputPer1M:  0.79 },
  'groq/llama-3.1-8b-instant':      { inputPer1M:  0.05, outputPer1M:  0.08 },
  'groq/llama-3-70b-8192':          { inputPer1M:  0.59, outputPer1M:  0.79 },
  'groq/llama-3-8b-8192':           { inputPer1M:  0.05, outputPer1M:  0.08 },
  'groq/llama-4-scout-17b-16e':     { inputPer1M:  0.11, outputPer1M:  0.34 },
  'groq/gemma2-9b-it':              { inputPer1M:  0.20, outputPer1M:  0.20 },
  'groq/gemma-7b-it':               { inputPer1M:  0.07, outputPer1M:  0.07 },
  'groq/mixtral-8x7b-32768':        { inputPer1M:  0.24, outputPer1M:  0.24 },
  'groq/whisper-large-v3':          { inputPer1M:  0.00, outputPer1M:  0.00 },  // audio, priced per second
  'groq/whisper-large-v3-turbo':    { inputPer1M:  0.00, outputPer1M:  0.00 },

  // ─── 9. Moonshot (Kimi) ─────────────────────────────────────────────────────
  // https://platform.moonshot.ai/docs/pricing
  'moonshot/kimi-k2.6':              { inputPer1M:  0.60, outputPer1M:  2.50 },  // [EST]
  'moonshot/kimi-k2.5':              { inputPer1M:  0.60, outputPer1M:  2.50 },
  'moonshot/kimi-k2-thinking':       { inputPer1M:  1.00, outputPer1M:  5.00 },  // [EST]
  'moonshot/kimi-k2-thinking-turbo': { inputPer1M:  0.80, outputPer1M:  3.00 },  // [EST]
  'moonshot/kimi-k2-turbo':          { inputPer1M:  0.30, outputPer1M:  1.00 },  // [EST]
  'moonshot/moonshot-v1-8k':         { inputPer1M:  0.12, outputPer1M:  0.12 },
  'moonshot/moonshot-v1-32k':        { inputPer1M:  0.24, outputPer1M:  0.24 },
  'moonshot/moonshot-v1-128k':       { inputPer1M:  0.80, outputPer1M:  0.80 },

  // ─── 10. MiniMax ────────────────────────────────────────────────────────────
  'minimax/MiniMax-M2.7':                  { inputPer1M:  0.80, outputPer1M:  3.00 },  // [EST]
  'minimax-portal/MiniMax-M2.7':           { inputPer1M:  0.80, outputPer1M:  3.00 },  // [EST]
  'minimax/MiniMax-Text-01':               { inputPer1M:  0.20, outputPer1M:  1.10 },
  'synthetic/hf:MiniMaxAI/MiniMax-M2.5':  { inputPer1M:  0.60, outputPer1M:  2.50 },  // [EST]

  // ─── 11. Z.AI (GLM) ─────────────────────────────────────────────────────────
  'zai/glm-5.1':          { inputPer1M:  0.50, outputPer1M:  2.00 },  // [EST]
  'zai/glm-4.7':          { inputPer1M:  0.40, outputPer1M:  0.40 },  // [EST]
  'zai/glm-4':            { inputPer1M:  0.10, outputPer1M:  0.10 },
  // GLM via Cerebras inference
  'cerebras/zai-glm-4.7': { inputPer1M:  0.40, outputPer1M:  0.40 },  // [EST]

  // ─── 12. Together AI ────────────────────────────────────────────────────────
  'together/moonshotai/Kimi-K2.5':                               { inputPer1M:  0.88, outputPer1M:  0.88 },
  'together/meta-llama/Llama-3.3-70B-Instruct-Turbo':           { inputPer1M:  0.88, outputPer1M:  0.88 },
  'together/meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo':       { inputPer1M:  0.18, outputPer1M:  0.18 },
  'together/meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo':     { inputPer1M:  3.50, outputPer1M:  3.50 },
  'together/deepseek-ai/DeepSeek-R1':                            { inputPer1M:  3.00, outputPer1M:  7.00 },
  'together/Qwen/Qwen2.5-72B-Instruct-Turbo':                   { inputPer1M:  1.20, outputPer1M:  1.20 },

  // ─── 13. Cerebras ───────────────────────────────────────────────────────────
  'cerebras/llama3.1-8b':          { inputPer1M:  0.10, outputPer1M:  0.10 },
  'cerebras/llama3.3-70b':         { inputPer1M:  0.85, outputPer1M:  1.20 },
  'cerebras/llama-4-scout-17b-16e':{ inputPer1M:  0.40, outputPer1M:  0.40 },

  // ─── 14. NVIDIA ─────────────────────────────────────────────────────────────
  // NVIDIA uses format nvidia/<vendor>/<model>
  'nvidia/moonshotai/kimi-k2.5':                       { inputPer1M:  0.60, outputPer1M:  2.50 },  // [EST]
  'nvidia/nvidia/nemotron-3-super-120b-a12b':          { inputPer1M:  0.40, outputPer1M:  0.40 },  // [EST]
  'nvidia/meta/llama-3.3-70b-instruct':                { inputPer1M:  0.77, outputPer1M:  0.77 },
  'nvidia/mistralai/mistral-large-2-instruct':         { inputPer1M:  2.00, outputPer1M:  6.00 },

  // ─── 15. StepFun ────────────────────────────────────────────────────────────
  'stepfun/step-3.5-flash':         { inputPer1M:  0.10, outputPer1M:  0.40 },  // [EST]
  'stepfun-plan/step-3.5-flash':    { inputPer1M:  0.10, outputPer1M:  0.40 },  // [EST]
  'stepfun/step-2-16k':             { inputPer1M:  0.38, outputPer1M:  1.50 },
  'stepfun/step-1v-32k':            { inputPer1M:  0.38, outputPer1M:  1.50 },

  // ─── 16. Perplexity ─────────────────────────────────────────────────────────
  // https://docs.perplexity.ai/guides/pricing
  'perplexity/sonar':               { inputPer1M:  1.00, outputPer1M:  1.00 },
  'perplexity/sonar-pro':           { inputPer1M:  3.00, outputPer1M: 15.00 },
  'perplexity/sonar-reasoning':     { inputPer1M:  1.00, outputPer1M:  5.00 },
  'perplexity/sonar-reasoning-pro': { inputPer1M:  2.00, outputPer1M: 10.00 },

  // ─── 17. Xiaomi ─────────────────────────────────────────────────────────────
  'xiaomi/mimo-v2-flash':           { inputPer1M:  0.20, outputPer1M:  0.60 },  // [EST]
  'xiaomi/mimo-v2-pro':             { inputPer1M:  0.60, outputPer1M:  2.00 },  // [EST]

  // ─── 18. Volcengine / BytePlus (Doubao) ─────────────────────────────────────
  'volcengine/doubao-seed-1-8-251228':   { inputPer1M:  0.10, outputPer1M:  0.30 },  // [EST]
  'volcengine/doubao-pro-32k':           { inputPer1M:  0.80, outputPer1M:  2.00 },
  'volcengine/doubao-lite-32k':          { inputPer1M:  0.10, outputPer1M:  0.10 },
  'volcengine-plan/ark-code-latest':     { inputPer1M:  0.10, outputPer1M:  0.30 },  // [EST]
  'byteplus/doubao-pro-32k':             { inputPer1M:  0.80, outputPer1M:  2.00 },
  'byteplus-plan/ark-code-latest':       { inputPer1M:  0.10, outputPer1M:  0.30 },  // [EST]

  // ─── 19. Gateways & subscriptions ($0 — cost absorbed upstream) ─────────────
  // Gateways don't generate direct per-token cost in this system.
  // Subscription providers bill at plan level, not per token.
  'openrouter/auto':                { inputPer1M:  1.00, outputPer1M:  3.00 },  // proxy estimate
  'kilocode/kilo/auto':             { inputPer1M:  1.00, outputPer1M:  3.00 },  // proxy estimate
  'opencode/claude-opus-4-6':       { inputPer1M:  0.00, outputPer1M:  0.00 },  // subscription
  'opencode/claude-sonnet-4':       { inputPer1M:  0.00, outputPer1M:  0.00 },  // subscription
  'opencode-go/kimi-k2.6':          { inputPer1M:  0.00, outputPer1M:  0.00 },  // subscription
  'openai-codex/gpt-5.5':           { inputPer1M:  0.00, outputPer1M:  0.00 },  // Codex OAuth
  'openai-codex/gpt-4.1':           { inputPer1M:  0.00, outputPer1M:  0.00 },  // Codex OAuth
  'github-copilot/gpt-4.1':         { inputPer1M:  0.00, outputPer1M:  0.00 },  // subscription
  'github-copilot/claude-sonnet-4': { inputPer1M:  0.00, outputPer1M:  0.00 },  // subscription

  // ─── 20. Local models (always $0) ───────────────────────────────────────────
  // calculateTokenCost() short-circuits on LOCAL_PREFIXES before reaching here.
  // These entries exist as documentation; they should never be reached.
  // Add dynamic entries via the LOCAL_PREFIXES early-return in calculateTokenCost().

} as const;

/**
 * Fallback pricing used when the model is NOT in COST_TABLE.
 * Conservative estimate based on mid-tier model pricing.
 *
 * If you see WARN logs about unknown models hitting DEFAULT_PRICING,
 * add those models to COST_TABLE.
 */
export const DEFAULT_PRICING: ModelPricing = {
  inputPer1M:  1.00,
  outputPer1M: 3.00,
};

/**
 * Provider prefixes that map to local inference engines.
 * These always have $0 cost regardless of model name.
 */
const LOCAL_PREFIXES = new Set([
  'ollama',
  'lmstudio',
  'vllm',
  'sglang',
]);

/**
 * Calculate cost in USD from raw token counts.
 *
 * Short-circuits to $0 for local inference providers.
 * Falls back to DEFAULT_PRICING for unknown models and logs a warning
 * in development so engineers know to add the model to COST_TABLE.
 *
 * @param model   Full model id e.g. 'openai/gpt-4o', 'mistral/mistral-large-latest'
 * @param input   Number of input (prompt) tokens consumed
 * @param output  Number of output (completion) tokens generated
 * @returns       Cost in USD (e.g. 0.00125)
 *
 * @example
 *   calculateTokenCost('openai/gpt-4o', 1500, 400)
 *   // 1500 * 2.50/1e6 + 400 * 10.00/1e6 = 0.003750 + 0.004000 = 0.007750
 *
 *   calculateTokenCost('ollama/llama3.3', 1_000_000, 1_000_000)
 *   // → 0  (local provider, always free)
 */
export function calculateTokenCost(
  model: string,
  input: number,
  output: number,
): number {
  // Local providers are always free
  const prefix = model.includes('/')
    ? model.split('/')[0].toLowerCase()
    : model.toLowerCase();
  if (LOCAL_PREFIXES.has(prefix)) return 0;

  const pricing = COST_TABLE[model];
  if (!pricing) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn(
        `[cost-table] Unknown model '${model}' — using DEFAULT_PRICING ` +
        `($${DEFAULT_PRICING.inputPer1M}/$${DEFAULT_PRICING.outputPer1M} per 1M). ` +
        `Add it to COST_TABLE.`,
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
