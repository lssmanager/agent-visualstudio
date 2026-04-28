/**
 * policy-scope.ts
 *
 * Discriminated union for the four scope levels that BudgetPolicy and
 * ModelPolicy can belong to, plus a runtime guard that enforces the
 * "exactly-one-FK" invariant BEFORE the row reaches Prisma.
 *
 * The same invariant is also enforced at the DB layer via a raw CHECK
 * constraint — see the header comment in prisma/schema.prisma and the
 * instructions in prisma/migrations/README.md.
 */

export type PolicyScopeLevel = 'agency' | 'department' | 'workspace' | 'agent';

export type PolicyScope =
  | { type: 'agency';     agencyId: string }
  | { type: 'department'; departmentId: string }
  | { type: 'workspace';  workspaceId: string }
  | { type: 'agent';      agentId: string };

/**
 * Input shape mirrors what Prisma accepts for create/update on
 * BudgetPolicy and ModelPolicy — all FKs optional/nullable.
 */
export interface PolicyScopeInput {
  agencyId?:     string | null;
  departmentId?: string | null;
  workspaceId?:  string | null;
  agentId?:      string | null;
}

/**
 * assertExactlyOneScope
 *
 * Validates that exactly one FK is provided and returns a typed
 * PolicyScope discriminated union. Throws a descriptive error if
 * zero or more than one FK is set — the error message is safe to
 * surface in API responses (no secret values are leaked).
 *
 * @example
 * const scope = assertExactlyOneScope({ agentId: 'abc' });
 * // scope: { type: 'agent', agentId: 'abc' }
 *
 * @example
 * const scope = assertExactlyOneScope({ agencyId: 'x', departmentId: 'y' });
 * // throws: PolicyScopeError: Policy must have exactly one scope FK set, got 2 (agencyId, departmentId)
 */
export function assertExactlyOneScope(input: PolicyScopeInput): PolicyScope {
  const candidates: PolicyScope[] = [
    input.agencyId     ? { type: 'agency',     agencyId: input.agencyId }         : null,
    input.departmentId ? { type: 'department', departmentId: input.departmentId } : null,
    input.workspaceId  ? { type: 'workspace',  workspaceId: input.workspaceId }   : null,
    input.agentId      ? { type: 'agent',      agentId: input.agentId }           : null,
  ].filter((x): x is PolicyScope => x !== null);

  if (candidates.length === 0) {
    throw new PolicyScopeError(
      'Policy must have exactly one scope FK set, got 0. ' +
      'Provide one of: agencyId | departmentId | workspaceId | agentId',
    );
  }

  if (candidates.length > 1) {
    const names = candidates.map(c => `${c.type}Id`).join(', ');
    throw new PolicyScopeError(
      `Policy must have exactly one scope FK set, got ${candidates.length} (${names})`,
    );
  }

  return candidates[0];
}

/**
 * Converts a PolicyScope back to a Prisma-compatible FK object.
 * All other FKs are explicitly null so Prisma clears stale values.
 */
export function scopeToFKs(scope: PolicyScope): Required<PolicyScopeInput> {
  return {
    agencyId:     scope.type === 'agency'     ? scope.agencyId     : null,
    departmentId: scope.type === 'department' ? scope.departmentId : null,
    workspaceId:  scope.type === 'workspace'  ? scope.workspaceId  : null,
    agentId:      scope.type === 'agent'      ? scope.agentId      : null,
  };
}

export class PolicyScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyScopeError';
  }
}
