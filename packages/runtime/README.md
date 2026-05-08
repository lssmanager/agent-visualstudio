# @agent-vs/runtime

Durable execution engine for agent-visualstudio.

## Responsibilities

- Run lifecycle management
- RunStep persistence and state machine
- Checkpointing engine
- Retry engine with exponential backoff
- HITL (Human-in-the-Loop) approval system
- ToolCallRuntime (shared tool execution coordinator)
- Event emission for observability

## Key Classes

- `RunStateRepository` — PostgreSQL-backed run persistence
- `RunStepExecutor` — Individual step execution with checkpointing
- `CheckpointEngine` — Serialize/deserialize run state
- `RetryEngine` — Retry policies per error class
- `HITLManager` — Approval request lifecycle
- `ToolCallRuntime` — Single shared tool execution runtime
