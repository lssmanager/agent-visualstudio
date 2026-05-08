# Runtime Documentation

## Overview

The agent-visualstudio runtime is **durable by design**. Every execution unit (Run) and every step within it (RunStep) is persisted to PostgreSQL before execution begins.

## Core Entities

### Run
- Represents a complete agent execution session
- Has a lifecycle: `pending → running → paused → completed | failed`
- Contains a checkpoint (JSON) for resume capability
- Linked to an Agent and a triggering context

### RunStep
- Represents a single atomic action within a Run
- Types: `llm_call`, `tool_call`, `memory_read`, `memory_write`, `approval`, `subagent_dispatch`, `flow_node`
- Each step has input, output, status, and an OTel trace_id

## Checkpointing

Before each RunStep executes:
1. Step is persisted with status `pending`
2. Step begins execution, status → `running`
3. On completion, output is persisted, status → `completed`
4. Run checkpoint updated

On system restart, incomplete steps are detected and retried from checkpoint.

## HITL (Human-in-the-Loop)

HITL approval steps are persisted with status `awaiting_approval`. The system pauses the run until a human approves or rejects via the dashboard API. This state survives restarts.

## Retry Engine

Failed steps are retried with exponential backoff based on step type and error class:
- `LLM_RATE_LIMIT` → retry with backoff + provider fallback
- `TOOL_TIMEOUT` → retry up to N times
- `APPROVAL_TIMEOUT` → escalate or cancel based on policy
