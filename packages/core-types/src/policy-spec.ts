/**
 * policy-spec.ts
 *
 * Typed interfaces for BudgetPolicy and ModelPolicy that mirror the
 * Prisma models. Used throughout the platform so callers never work
 * with raw Prisma types directly.
 *
 * The scope FK fields follow the exactly-one-FK invariant documented
 * in prisma/schema.prisma and enforced by assertExactlyOneScope().
 */

// ─── Legacy policy shape (kept for backward compat with existing callers) ─────

export interface PolicyModelConstraint {
  allow: string[];
  deny?: string[];
}

export interface PolicySpec {
  id: string;
  name: string;
  description?: string;
  toolAllowlist: string[];
  toolDenylist: string[];
  channelRules: Record<string, unknown>;
  sandboxMode?: 'strict' | 'relaxed';
  maxTokensPerTurn?: number;
  modelConstraint?: PolicyModelConstraint;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Budget policy ───────────────────────────────────────────────────────────

export interface BudgetPolicySpec {
  id: string;
  /** Rolling window spend limit in USD */
  limitUsd: number;
  /** Window length in days (default: 30) */
  periodDays: number;
  /** Alert threshold as fraction of limitUsd (default: 0.8 = 80 %) */
  alertAt: number;
  // Scope FKs — exactly one is non-null (DB CHECK + assertExactlyOneScope)
  agencyId:     string | null;
  departmentId: string | null;
  workspaceId:  string | null;
  agentId:      string | null;
  createdAt: string;
  updatedAt: string;
}

export type BudgetPolicyCreateInput = Omit<BudgetPolicySpec, 'id' | 'createdAt' | 'updatedAt'>;

// ─── Model policy ──────────────────────────────────────────────────────────────

export interface ModelPolicySpec {
  id: string;
  /** Primary model identifier, e.g. "openai/gpt-4o" or "qwen/qwen-plus" */
  primaryModel: string;
  /**
   * Ordered list of fallback model identifiers.
   * Index 0 = first attempt after primary fails.
   * Empty array means no explicit fallbacks (capability-based fallbacks
   * from ModelCapabilityRegistry still apply at the executor layer).
   *
   * Example: ["anthropic/claude-3-haiku", "qwen/qwen-plus", "openai/gpt-4o-mini"]
   */
  fallbackChain: string[];
  temperature:  number | null;
  maxTokens:    number | null;
  // Scope FKs — exactly one is non-null (DB CHECK + assertExactlyOneScope)
  agencyId:     string | null;
  departmentId: string | null;
  workspaceId:  string | null;
  agentId:      string | null;
  createdAt: string;
  updatedAt: string;
}

export type ModelPolicyCreateInput = Omit<ModelPolicySpec, 'id' | 'createdAt' | 'updatedAt'>;

// ─── Resolved (effective) policy for a run ────────────────────────────────────────────

/**
 * EffectivePolicy is what PolicyResolver returns after walking the
 * agency → department → workspace → agent chain.
 * Both fields may be null if no policy is configured at any level.
 */
export interface EffectivePolicy {
  budget: BudgetPolicySpec | null;
  model:  ModelPolicySpec  | null;
  /** The scope level from which the budget policy was resolved */
  budgetResolvedFrom: 'agency' | 'department' | 'workspace' | 'agent' | null;
  /** The scope level from which the model policy was resolved */
  modelResolvedFrom:  'agency' | 'department' | 'workspace' | 'agent' | null;
}
