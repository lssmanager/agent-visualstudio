# ADR-0001: Monorepo Structure with pnpm Workspaces + Turborepo

## Status: Accepted

## Context

agent-visualstudio consists of multiple interconnected packages: a web dashboard, API gateway, core runtime, agent system, channel adapters, provider abstraction, memory system, and shared contracts. These must share types, enforce consistent versioning, and be developed in a unified workflow.

## Decision

Use a **pnpm workspaces + Turborepo** monorepo with the following structure:
- `apps/` — deployable applications (web, api)
- `packages/` — shared libraries (core, runtime, agents, etc.)
- `services/` — standalone microservices (channel-gateway, run-worker)

## Rationale

- pnpm workspaces provide efficient dependency deduplication
- Turborepo provides incremental builds with remote caching
- Single repository enforces contract consistency across packages
- Enables atomic commits that span multiple packages
- Industry standard for TypeScript enterprise monorepos (Vercel, Linear patterns)

## Alternatives Considered

| Alternative | Pros | Cons |
|------------|------|------|
| Separate repos | Independent versioning | Contract drift, painful cross-repo changes |
| Nx | Powerful | Higher complexity, steeper learning curve |
| Lerna | Mature | Slower builds, deprecated patterns |

## Consequences

- All engineers work in a single repository
- CI must support affected-only builds
- Package boundaries must be respected (no circular deps)
