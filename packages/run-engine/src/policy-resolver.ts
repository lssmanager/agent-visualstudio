/**
 * policy-resolver.ts
 *
 * Resolves the effective BudgetPolicy and ModelPolicy for a given run
 * context by walking the hierarchy from most-specific to least-specific:
 *
 *   agent → workspace → department → agency
 *
 * The first non-null policy found at any level wins. Both policies are
 * resolved independently, so a run can inherit its budget from the
 * workspace and its model config from the department.
 *
 * ## Exported API
 *
 * ### Class (for DI / testing)
 *   const resolver = new PolicyResolver(prisma);
 *   const policy   = await resolver.resolve({ agentId, workspaceId, departmentId, agencyId });
 *
 * ### Standalone helpers (for llm-step-executor and other callers)
 *   const model  = await resolveModelPolicy(prisma, ctx);   // ModelPolicySpec | null
 *   const budget = await resolveBudgetPolicy(prisma, ctx);  // BudgetPolicySpec | null
 */

import type { PrismaClient } from '@prisma/client';
import type {
  BudgetPolicySpec,
  ModelPolicySpec,
  EffectivePolicy,
} from '@agent-vs/core-types';

// ─── Context ─────────────────────────────────────────────────────────────────

export interface PolicyResolverContext {
  agentId:      string;
  workspaceId:  string;
  departmentId: string;
  agencyId:     string;
}

// ─── PolicyResolver class ─────────────────────────────────────────────────────

export class PolicyResolver {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Resolve both BudgetPolicy and ModelPolicy in parallel.
   * Each is resolved independently — they can come from different hierarchy levels.
   */
  async resolve(ctx: PolicyResolverContext): Promise<EffectivePolicy> {
    const [budget, model] = await Promise.all([
      this.resolveBudget(ctx),
      this.resolveModel(ctx),
    ]);

    return {
      budget:              budget?.policy ?? null,
      model:               model?.policy  ?? null,
      budgetResolvedFrom:  budget?.level  ?? null,
      modelResolvedFrom:   model?.level   ?? null,
    };
  }

  // ─── ModelPolicy cascade ──────────────────────────────────────────────────
  //
  // IMPORTANT: agentId / departmentId / agencyId are NOT @unique in the schema
  // (only workspaceId is). Use findFirst() for those levels; findUnique() only
  // for workspaceId where the unique constraint exists.

  async resolveModel(
    ctx: PolicyResolverContext,
  ): Promise<{ policy: ModelPolicySpec; level: EffectivePolicy['modelResolvedFrom'] } | null> {
    const agent = await this.db.modelPolicy.findFirst({ where: { agentId: ctx.agentId } });
    if (agent) return { policy: toModelSpec(agent), level: 'agent' };

    const ws = await this.db.modelPolicy.findUnique({ where: { workspaceId: ctx.workspaceId } });
    if (ws) return { policy: toModelSpec(ws), level: 'workspace' };

    const dept = await this.db.modelPolicy.findFirst({ where: { departmentId: ctx.departmentId } });
    if (dept) return { policy: toModelSpec(dept), level: 'department' };

    const agency = await this.db.modelPolicy.findFirst({ where: { agencyId: ctx.agencyId } });
    if (agency) return { policy: toModelSpec(agency), level: 'agency' };

    return null;
  }

  // ─── BudgetPolicy cascade ─────────────────────────────────────────────────
  //
  // Same rule: agentId / departmentId / agencyId → findFirst.
  // workspaceId is @unique → findUnique is valid.

  async resolveBudget(
    ctx: PolicyResolverContext,
  ): Promise<{ policy: BudgetPolicySpec; level: EffectivePolicy['budgetResolvedFrom'] } | null> {
    const agent = await this.db.budgetPolicy.findFirst({ where: { agentId: ctx.agentId } });
    if (agent) return { policy: toBudgetSpec(agent), level: 'agent' };

    const ws = await this.db.budgetPolicy.findUnique({ where: { workspaceId: ctx.workspaceId } });
    if (ws) return { policy: toBudgetSpec(ws), level: 'workspace' };

    const dept = await this.db.budgetPolicy.findFirst({ where: { departmentId: ctx.departmentId } });
    if (dept) return { policy: toBudgetSpec(dept), level: 'department' };

    const agency = await this.db.budgetPolicy.findFirst({ where: { agencyId: ctx.agencyId } });
    if (agency) return { policy: toBudgetSpec(agency), level: 'agency' };

    return null;
  }
}

// ─── Standalone helpers (used by llm-step-executor and other callers) ─────────

/**
 * Resolve the effective ModelPolicy for an agent run context.
 * Returns null if no policy is configured at any hierarchy level.
 *
 * Cascade order: agent → workspace → department → agency
 *
 * @example
 *   const modelPolicy = await resolveModelPolicy(prisma, {
 *     agentId, workspaceId, departmentId, agencyId,
 *   });
 *   const primaryModel = modelPolicy?.primaryModel ?? DEFAULT_MODEL;
 */
export async function resolveModelPolicy(
  db: PrismaClient,
  ctx: PolicyResolverContext,
): Promise<ModelPolicySpec | null> {
  const resolver = new PolicyResolver(db);
  const result   = await resolver.resolveModel(ctx);
  return result?.policy ?? null;
}

/**
 * Resolve the effective BudgetPolicy for an agent run context.
 * Returns null if no policy is configured at any hierarchy level.
 *
 * Cascade order: agent → workspace → department → agency
 */
export async function resolveBudgetPolicy(
  db: PrismaClient,
  ctx: PolicyResolverContext,
): Promise<BudgetPolicySpec | null> {
  const resolver = new PolicyResolver(db);
  const result   = await resolver.resolveBudget(ctx);
  return result?.policy ?? null;
}

// ─── Prisma row → Spec mappers ────────────────────────────────────────────────

type BudgetPolicyRow = {
  id: string;
  limitUsd: number;
  periodDays: number;
  alertAt: number;
  agencyId: string | null;
  departmentId: string | null;
  workspaceId: string | null;
  agentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ModelPolicyRow = {
  id: string;
  primaryModel: string;
  fallbackModel: string | null;  // added schema v12 — single fallback slot
  fallbackChain: string[];
  temperature: number | null;
  maxTokens: number | null;
  agencyId: string | null;
  departmentId: string | null;
  workspaceId: string | null;
  agentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toBudgetSpec(row: BudgetPolicyRow): BudgetPolicySpec {
  return {
    id:           row.id,
    limitUsd:     row.limitUsd,
    periodDays:   row.periodDays,
    alertAt:      row.alertAt,
    agencyId:     row.agencyId,
    departmentId: row.departmentId,
    workspaceId:  row.workspaceId,
    agentId:      row.agentId,
    createdAt:    row.createdAt.toISOString(),
    updatedAt:    row.updatedAt.toISOString(),
  };
}

export function toModelSpec(row: ModelPolicyRow): ModelPolicySpec {
  return {
    id:            row.id,
    primaryModel:  row.primaryModel,
    fallbackModel: row.fallbackModel ?? null,
    fallbackChain: row.fallbackChain,
    temperature:   row.temperature,
    maxTokens:     row.maxTokens,
    agencyId:      row.agencyId,
    departmentId:  row.departmentId,
    workspaceId:   row.workspaceId,
    agentId:       row.agentId,
    createdAt:     row.createdAt.toISOString(),
    updatedAt:     row.updatedAt.toISOString(),
  };
}
