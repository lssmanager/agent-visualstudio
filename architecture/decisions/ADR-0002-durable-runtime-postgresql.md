# ADR-0002: Durable Runtime State in PostgreSQL via Prisma

## Status: Accepted

## Context

Agent runs can be long-lived, involve human-in-the-loop steps, and must survive system restarts. Pure in-memory execution is insufficient for enterprise reliability.

## Decision

All Run and RunStep state is persisted to **PostgreSQL** using **Prisma ORM** before any execution begins. Redis is used for active coordination and pub/sub only.

## Rationale

- PostgreSQL is ACID-compliant, ensuring run state consistency
- Prisma provides type-safe schema management with migrations
- Checkpointing enables resume-from-failure without full replay
- Enables HITL approvals that survive restarts (approval state is persisted)
- Enables run history, auditing, and analytics

## Alternatives Considered

| Alternative | Pros | Cons |
|------------|------|------|
| In-memory only | Fast | Not durable, no HITL survival |
| Redis only | Fast | Not ACID, not queryable for analytics |
| Event sourcing (Kafka) | Full auditability | Complex, over-engineered for initial phases |

## Consequences

- Every deployment requires PostgreSQL
- Schema changes require Prisma migrations
- Run state is queryable for dashboards and observability
- RunStep granularity must be carefully designed to avoid write amplification
