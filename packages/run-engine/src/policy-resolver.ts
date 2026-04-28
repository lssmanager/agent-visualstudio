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
 * Usage:
 *   const resolver = new PolicyResolver(prisma);
 *   const policy   = await resolver.resolve({ agentId: 'abc' });
 *   if (policy.budget && costSoFar >= policy.budget.limitUsd) throw new BudgetExceededError();
 */

import type { PrismaClient } from '@prisma/client';
import type {
  BudgetPolicySpec,
  ModelPolicySpec,
  EffectivePolicy,
} from '@agent-vs/core-types';

// ─── Context passed by FlowExecutor at run time ───────────────────────────────

export interface PolicyResolverContext {
  agentId:      string;
  workspaceId:  string;
  departmentId: string;
  agencyId:     string;
}

// ─── PolicyResolver ───────────────────────────────────────────────────────────

export class PolicyResolver {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Resolve the effective BudgetPolicy and ModelPolicy for a run.
   * Both policies are resolved in parallel per level and short-circuit
   * as soon as a non-null value is found walking down the hierarchy.
   */
  async resolve(ctx: PolicyResolverContext): Promise<EffectivePolicy> {
    const [budget, model] = await Promise.all([
      this.resolveBudget(ctx),
      this.resolveModel(ctx),
    ]);

    return {
      budget: budget?.policy ?? null,
      model:  model?.policy  ?? null,
      budgetResolvedFrom: budget?.level ?? null,
      modelResolvedFrom:  model?.level  ?? null,
    };
  }

  // ─── Budget ────────────────────────────────────────────────────────────────

  private async resolveBudget(
    ctx: PolicyResolverContext,
  ): Promise<{ policy: BudgetPolicySpec; level: EffectivePolicy['budgetResolvedFrom'] } | null> {
    // Agent level
    const agent = await this.db.budgetPolicy.findUnique({ where: { agentId: ctx.agentId } });
    if (agent) return { policy: toBudgetSpec(agent), level: 'agent' };

    // Workspace level
    const ws = await this.db.budgetPolicy.findUnique({ where: { workspaceId: ctx.workspaceId } });
    if (ws) return { policy: toBudgetSpec(ws), level: 'workspace' };

    // Department level
    const dept = await this.db.budgetPolicy.findUnique({ where: { departmentId: ctx.departmentId } });
    if (dept) return { policy: toBudgetSpec(dept), level: 'department' };

    // Agency level
    const agency = await this.db.budgetPolicy.findUnique({ where: { agencyId: ctx.agencyId } });
    if (agency) return { policy: toBudgetSpec(agency), level: 'agency' };

    return null;
  }

  // ─── Model ─────────────────────────────────────────────────────────────────

  private async resolveModel(
    ctx: PolicyResolverContext,
  ): Promise<{ policy: ModelPolicySpec; level: EffectivePolicy['modelResolvedFrom'] } | null> {
    const agent = await this.db.modelPolicy.findUnique({ where: { agentId: ctx.agentId } });
    if (agent) return { policy: toModelSpec(agent), level: 'agent' };

    const ws = await this.db.modelPolicy.findUnique({ where: { workspaceId: ctx.workspaceId } });
    if (ws) return { policy: toModelSpec(ws), level: 'workspace' };

    const dept = await this.db.modelPolicy.findUnique({ where: { departmentId: ctx.departmentId } });
    if (dept) return { policy: toModelSpec(dept), level: 'department' };

    const agency = await this.db.modelPolicy.findUnique({ where: { agencyId: ctx.agencyId } });
    if (agency) return { policy: toModelSpec(agency), level: 'agency' };

    return null;
  }
}

// ─── Prisma → Spec mappers ────────────────────────────────────────────────────
// Prisma returns Date objects; we serialize to ISO strings for the spec layer.

function toBudgetSpec(row: {
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
}): BudgetPolicySpec {
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

function toModelSpec(row: {
  id: string;
  primaryModel: string;
  fallbackModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
  agencyId: string | null;
  departmentId: string | null;
  workspaceId: string | null;
  agentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ModelPolicySpec {
  return {
    id:           row.id,
    primaryModel:  row.primaryModel,
    fallbackModel: row.fallbackModel,
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
