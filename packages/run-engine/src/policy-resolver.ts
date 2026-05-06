/**
 * policy-resolver.ts
 *
 * Resolves the effective BudgetPolicy and ModelPolicy for a given run
 * context by walking the hierarchy from most-specific to least-specific:
 *
 *   agent → workspace → department → agency
 */

import type { PrismaClient } from '@prisma/client';
import type {
  BudgetPolicySpec,
  ModelPolicySpec,
  EffectivePolicy,
} from '@agent-vs/core-types';

export interface PolicyResolverContext {
  agentId:      string;
  workspaceId:  string;
  departmentId: string;
  agencyId:     string;
}

export class PolicyResolver {
  constructor(private readonly db: PrismaClient) {}

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

  async resolveModel(
    ctx: PolicyResolverContext,
  ): Promise<{ policy: ModelPolicySpec; level: EffectivePolicy['modelResolvedFrom'] } | null> {
    const agent = await this.db.modelPolicy.findFirst({ where: { agentId: ctx.agentId } });
    if (agent) return { policy: toModelSpec(agent), level: 'agent' };

    const ws = await this.db.modelPolicy.findFirst({ where: { workspaceId: ctx.workspaceId } });
    if (ws) return { policy: toModelSpec(ws), level: 'workspace' };

    const dept = await this.db.modelPolicy.findFirst({ where: { departmentId: ctx.departmentId } });
    if (dept) return { policy: toModelSpec(dept), level: 'department' };

    const agency = await this.db.modelPolicy.findFirst({ where: { agencyId: ctx.agencyId } });
    if (agency) return { policy: toModelSpec(agency), level: 'agency' };

    return null;
  }

  async resolveBudget(
    ctx: PolicyResolverContext,
  ): Promise<{ policy: BudgetPolicySpec; level: EffectivePolicy['budgetResolvedFrom'] } | null> {
    const agent = await this.db.budgetPolicy.findFirst({ where: { agentId: ctx.agentId } });
    if (agent) return { policy: toBudgetSpec(agent), level: 'agent' };

    const ws = await this.db.budgetPolicy.findFirst({ where: { workspaceId: ctx.workspaceId } });
    if (ws) return { policy: toBudgetSpec(ws), level: 'workspace' };

    const dept = await this.db.budgetPolicy.findFirst({ where: { departmentId: ctx.departmentId } });
    if (dept) return { policy: toBudgetSpec(dept), level: 'department' };

    const agency = await this.db.budgetPolicy.findFirst({ where: { agencyId: ctx.agencyId } });
    if (agency) return { policy: toBudgetSpec(agency), level: 'agency' };

    return null;
  }
}

export async function resolveModelPolicy(
  db: PrismaClient,
  ctx: PolicyResolverContext,
): Promise<ModelPolicySpec | null> {
  const resolver = new PolicyResolver(db);
  const result   = await resolver.resolveModel(ctx);
  return result?.policy ?? null;
}

export async function resolveBudgetPolicy(
  db: PrismaClient,
  ctx: PolicyResolverContext,
): Promise<BudgetPolicySpec | null> {
  const resolver = new PolicyResolver(db);
  const result   = await resolver.resolveBudget(ctx);
  return result?.policy ?? null;
}

// ─── Prisma row → Spec mappers ────────────────────────────────────────────────
// Prisma returns Decimal for numeric fields — we convert with Number()

type BudgetPolicyRow = {
  id: string;
  limitUsd: { toNumber(): number } | number | null;
  periodDays: { toNumber(): number } | number;
  alertAt: { toNumber(): number } | number;
  agencyId: string | null;
  departmentId: string | null;
  workspaceId: string | null;
  agentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
};

type ModelPolicyRow = {
  id: string;
  primaryModel: string;
  fallbackChain: string[];
  temperature: { toNumber(): number } | number | null;
  maxTokens: { toNumber(): number } | number | null;
  agencyId: string | null;
  departmentId: string | null;
  workspaceId: string | null;
  agentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
};

function toNum(v: { toNumber(): number } | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  return v.toNumber();
}

export function toBudgetSpec(row: BudgetPolicyRow): BudgetPolicySpec {
  return {
    id:           row.id,
    limitUsd:     Number(toNum(row.limitUsd) ?? 0),
    periodDays:   Number(toNum(row.periodDays) ?? 30),
    alertAt:      Number(toNum(row.alertAt) ?? 0.8),
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
    fallbackChain: row.fallbackChain,
    temperature:   toNum(row.temperature),
    maxTokens:     toNum(row.maxTokens) !== null ? Math.round(toNum(row.maxTokens)!) : null,
    agencyId:      row.agencyId,
    departmentId:  row.departmentId,
    workspaceId:   row.workspaceId,
    agentId:       row.agentId,
    createdAt:     row.createdAt.toISOString(),
    updatedAt:     row.updatedAt.toISOString(),
  };
}
