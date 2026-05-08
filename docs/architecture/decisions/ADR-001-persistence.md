# ADR-001: Database Persistence Strategy

**Status:** Accepted  
**Date:** 2026-05-08  
**Deciders:** Core Team

## Context

Agent VisualStudio must support durable multi-step runs that survive process restarts, HITL approval pauses (potentially hours long), and horizontal scaling of the worker service. We need a persistence layer that supports complex relational queries (hierarchy traversal, run aggregation), ACID transactions (state transitions), and row-level security (multi-tenancy).

## Decision

Use **PostgreSQL 15** as the primary persistence store, accessed via **Prisma ORM** with TypeScript type safety.

## Rationale

- ACID transactions for atomic state transitions (Run.status changes)
- Row-level security (RLS) for Agency-scoped multi-tenancy
- JSONB columns for flexible step I/O without sacrificing queryability
- Prisma provides type-safe client + migration tooling in a monorepo context
- pgvector extension enables in-database semantic search for RAG/memory
- Single store simplifies operational complexity vs. polyglot persistence

## Consequences

**Easier:** ACID guarantees for run state, strong typing via Prisma, single backup target, RLS for tenancy.

**Harder:** Schema migrations require careful zero-downtime planning. High-throughput event streams (telemetry) may need offloading to ClickHouse in future.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| MongoDB | Flexible schema, easy JSONB-style docs | No ACID across collections, no RLS, harder migrations |
| MySQL | Familiar, widely hosted | No RLS, weaker JSONB support, no pgvector |
| SQLite | Zero setup | Not suitable for multi-process worker scaling |
| Planetscale | Managed, branching | No RLS, Vitess limits transactions |
