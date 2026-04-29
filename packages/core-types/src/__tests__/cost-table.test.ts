/**
 * cost-table.test.ts
 *
 * Verifies:
 *  1. COST_TABLE presence — all three previously-missing sections exist
 *  2. calculateTokenCost() math is correct
 *  3. DEFAULT_PRICING fallback triggers for unknown models
 *  4. calculateCost() alias is identical to calculateTokenCost()
 *  5. isKnownModel() predicate
 */

import {
  COST_TABLE,
  DEFAULT_PRICING,
  calculateTokenCost,
  calculateCost,
  isKnownModel,
} from '../cost-table';

// ─── 1. Coverage: three gaps are now filled ──────────────────────────────

describe('COST_TABLE coverage', () => {
  // Gap 1 — Mistral
  const MISTRAL_MODELS = [
    'mistral/mistral-large-latest',
    'mistral/mistral-medium-latest',
    'mistral/mistral-small-latest',
    'mistral/open-mistral-7b',
    'mistral/open-mixtral-8x7b',
    'mistral/open-mixtral-8x22b',
    'mistral/codestral-latest',
  ];

  it.each(MISTRAL_MODELS)('has Mistral entry: %s', (model) => {
    expect(COST_TABLE[model]).toBeDefined();
    expect(COST_TABLE[model].inputPer1M).toBeGreaterThan(0);
    expect(COST_TABLE[model].outputPer1M).toBeGreaterThan(0);
  });

  // Gap 2 — Groq
  const GROQ_MODELS = [
    'groq/llama-3.3-70b-versatile',
    'groq/llama-3.1-70b-versatile',
    'groq/llama-3.1-8b-instant',
    'groq/llama-3-70b-8192',
    'groq/llama-3-8b-8192',
    'groq/gemma2-9b-it',
    'groq/mixtral-8x7b-32768',
  ];

  it.each(GROQ_MODELS)('has Groq entry: %s', (model) => {
    expect(COST_TABLE[model]).toBeDefined();
    // Groq pricing is generally lower than OpenAI, sanity-check
    expect(COST_TABLE[model].inputPer1M).toBeLessThan(5);
  });

  // Gap 3 — Recent models (previously missing → fell to DEFAULT_PRICING)
  const RECENT_MODELS = [
    // Anthropic — claude-3-7-sonnet referenced in llm-client tests
    'anthropic/claude-3-7-sonnet-20250219',
    'anthropic/claude-3-7-sonnet-latest',
    'anthropic/claude-3-5-sonnet-20241022',
    'anthropic/claude-opus-4',
    'anthropic/claude-sonnet-4',
    // OpenAI — gpt-4.1 family and new o-series
    'openai/gpt-4.1',
    'openai/gpt-4.1-mini',
    'openai/gpt-4.1-nano',
    'openai/o3',
    'openai/o4-mini',
  ];

  it.each(RECENT_MODELS)('has recent model entry: %s', (model) => {
    expect(COST_TABLE[model]).toBeDefined();
  });
});

// ─── 2. calculateTokenCost() math ──────────────────────────────────────

describe('calculateTokenCost() math', () => {
  it('computes correct cost for gpt-4o', () => {
    // 1500 input @ $2.50/1M + 400 output @ $10.00/1M
    // = 0.00375 + 0.004000 = 0.007750
    const cost = calculateTokenCost('openai/gpt-4o', 1_500, 400);
    expect(cost).toBeCloseTo(0.00775, 6);
  });

  it('computes correct cost for gpt-4o-mini', () => {
    // 10_000 input @ $0.15/1M + 2_000 output @ $0.60/1M
    // = 0.0015 + 0.0012 = 0.0027
    const cost = calculateTokenCost('openai/gpt-4o-mini', 10_000, 2_000);
    expect(cost).toBeCloseTo(0.0027, 6);
  });

  it('computes correct cost for mistral-large-latest', () => {
    // 1_000 input @ $2.00/1M + 500 output @ $6.00/1M
    // = 0.002 + 0.003 = 0.005
    const cost = calculateTokenCost('mistral/mistral-large-latest', 1_000, 500);
    expect(cost).toBeCloseTo(0.005, 6);
  });

  it('computes correct cost for groq llama-3-70b-8192', () => {
    // 2_000 input @ $0.59/1M + 800 output @ $0.79/1M
    // = 0.00118 + 0.000632 = 0.001812
    const cost = calculateTokenCost('groq/llama-3-70b-8192', 2_000, 800);
    expect(cost).toBeCloseTo(0.001812, 6);
  });

  it('returns 0 for zero tokens', () => {
    expect(calculateTokenCost('openai/gpt-4o', 0, 0)).toBe(0);
  });

  it('scales linearly (doubling tokens doubles cost)', () => {
    const base   = calculateTokenCost('openai/gpt-4o', 1_000, 1_000);
    const double = calculateTokenCost('openai/gpt-4o', 2_000, 2_000);
    expect(double).toBeCloseTo(base * 2, 10);
  });
});

// ─── 3. DEFAULT_PRICING fallback ───────────────────────────────────────

describe('DEFAULT_PRICING fallback', () => {
  it('uses DEFAULT_PRICING for unknown models', () => {
    // unknown model → $1.00/$3.00 per 1M
    // 1_000 input + 1_000 output = (1000*1 + 1000*3) / 1e6 = 0.000004
    const cost = calculateTokenCost('totally/unknown-model-xyz', 1_000, 1_000);
    const expected =
      (1_000 * DEFAULT_PRICING.inputPer1M + 1_000 * DEFAULT_PRICING.outputPer1M) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it('DEFAULT_PRICING.inputPer1M > 0 and outputPer1M > 0', () => {
    expect(DEFAULT_PRICING.inputPer1M).toBeGreaterThan(0);
    expect(DEFAULT_PRICING.outputPer1M).toBeGreaterThan(0);
  });
});

// ─── 4. calculateCost() alias ──────────────────────────────────────────

describe('calculateCost() alias', () => {
  it('is identical to calculateTokenCost', () => {
    expect(calculateCost).toBe(calculateTokenCost);
  });

  it('returns the same result for known models', () => {
    const a = calculateCost('openai/gpt-4o', 5_000, 1_000);
    const b = calculateTokenCost('openai/gpt-4o', 5_000, 1_000);
    expect(a).toBe(b);
  });
});

// ─── 5. isKnownModel() ──────────────────────────────────────────────

describe('isKnownModel()', () => {
  it('returns true for known models', () => {
    expect(isKnownModel('openai/gpt-4o')).toBe(true);
    expect(isKnownModel('mistral/mistral-large-latest')).toBe(true);
    expect(isKnownModel('groq/llama-3-70b-8192')).toBe(true);
    expect(isKnownModel('anthropic/claude-3-7-sonnet-20250219')).toBe(true);
  });

  it('returns false for unknown models', () => {
    expect(isKnownModel('totally/unknown-model-xyz')).toBe(false);
    expect(isKnownModel('')).toBe(false);
  });
});
