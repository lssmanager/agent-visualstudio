# Runtime Overview

## Core Concepts

The runtime is the heart of Agent VisualStudio. It executes agent runs with full durability — every state transition persists to PostgreSQL.

## Run

A `Run` represents one complete agent invocation. Fields:

- `runId` — unique identifier
- `workspaceId` / `agentId` — owning context
- `originator` — channel + user that started the run
- `status` — `queued | running | paused | completed | failed | cancelled`
- `steps` — ordered list of `RunStep` records
- `costs` — token + USD totals
- `createdAt`, `updatedAt`, `completedAt`
- `errors` — structured error list
- `approvals` — HITL approval records

## RunStep

A `RunStep` is one observable unit of work within a run. Types:

| Type | Description |
|------|-------------|
| `llm_call` | LLM inference call with prompt/response |
| `tool_call` | Tool execution via ToolGuard |
| `rag_retrieval` | Semantic search + context injection |
| `approval_pause` | HITL wait for human decision |
| `subagent_delegation` | Delegate subtask to child agent |
| `state_transition` | Run/step state change event |

## Tool Loop

The `ToolCallRuntime` executes iterative rounds:

1. LLM produces response (possibly with tool call requests)
2. For each tool call: ToolGuard validates → execute → observe result
3. Observations injected back into context
4. LLM produces next response
5. Repeat until no tool calls or loop limit reached

Loop detection prevents infinite cycles. Cost tracking stops loops at budget limit.

## HITL (Human-in-the-Loop)

When an agent requires human approval:
1. Run transitions to `paused`, step to `awaiting_approval`
2. Approval record persisted to DB with all context
3. Process can restart — approval survives restart
4. On human decision: run resumes from the approval step

## Checkpointing

Every run is resumable from its last stable `RunStep`. The checkpoint service:
- Saves full run context at each step boundary
- On restart: loads last checkpoint and resumes
- Prevents re-executing completed steps
