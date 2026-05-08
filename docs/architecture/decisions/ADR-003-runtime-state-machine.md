# ADR-003: Runtime State Machine Design

**Status:** Accepted  
**Date:** 2026-05-08  
**Deciders:** Core Team

## Context

Agent runs are long-lived, multi-step processes that can pause (HITL approval), fail partially, be retried from a checkpoint, or execute sub-agents. We need a clear state machine to govern Run and RunStep lifecycles and ensure no state can be reached from an invalid predecessor.

## Decision

Implement an explicit finite state machine for both `Run` and `RunStep` with the following states and transitions:

### Run States

```
queued → running → completed
queued → running → failed
queued → running → paused (HITL) → running (resumed)
queued → cancelled
running → cancelled
```

### RunStep States

```
pending → running → completed
pending → running → failed
pending → running → awaiting_approval → completed
pending → running → awaiting_approval → rejected
pending → skipped
```

## Rationale

- Explicit transitions prevent invalid state corruption (e.g., `completed → running`)
- Each transition is an atomic DB write in a Prisma transaction
- State machine is serializable to DB — no in-memory state required
- HITL `awaiting_approval` state survives process restarts

## Consequences

**Easier:** Predictable run behavior, auditable state history, safe restarts.

**Harder:** All state transitions must go through the state machine service — no direct DB writes to status fields.
