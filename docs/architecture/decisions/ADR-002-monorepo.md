# ADR-002: Monorepo Structure and Package Boundaries

**Status:** Accepted  
**Date:** 2026-05-08  
**Deciders:** Core Team

## Context

Agent VisualStudio consists of multiple deployable services (api, worker, gateway, scheduler), multiple frontend apps (web, cli), and shared libraries (runtime engine, types, SDK, UI components). We need a development strategy that enables atomic cross-package changes, shared tooling (ESLint, TypeScript configs, test utilities), and independent deployment.

## Decision

Use a **pnpm workspace monorepo** managed by **Turborepo** for task orchestration and caching.

## Package Boundaries

```
packages/types      → Zero-runtime shared types. No dependencies on other packages.
packages/runtime    → Core engine. Depends on types. No UI deps.
packages/sdk        → Public API surface. Depends on types. Minimal deps.
packages/ui-components → React components. Depends on types only.
services/*          → Deployable services. Can depend on packages/*.
apps/*              → End-user apps. Can depend on packages/* and services/* types.
```

## Rationale

- Turborepo remote caching speeds CI dramatically for large changesets
- pnpm workspaces prevent phantom dependency issues
- Package boundaries enforced by ESLint import rules
- Single `pnpm install` at root for contributor onboarding

## Consequences

**Easier:** Atomic refactors across service + package, shared configs, single CI pipeline.

**Harder:** Turborepo config complexity, need strict boundary enforcement to prevent circular deps.
