# Architecture Overview

## System Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                          Web Dashboard                          │
│              (Next.js, Flow Editor, Run Inspector)              │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ REST / WebSocket
┌─────────────────────────────────▼───────────────────────────────┐
│                           API Gateway                           │
│                  (NestJS, Auth, Rate Limiting)                   │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │          │
┌──────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼──────────┐
│ Hierarchy│ │Runtime │ │Agents  │ │Channels│ │ Observability│
│ Service  │ │Engine  │ │Service │ │Gateway │ │ Service      │
└──────────┘ └───┬────┘ └────────┘ └────────┘ └──────────────┘
                 │
┌────────────────▼────────────────────────────────────────────────┐
│                     Persistence Layer                           │
│              PostgreSQL (Prisma) + Redis + pgvector             │
└─────────────────────────────────────────────────────────────────┘
```

## Hierarchy Inheritance Model

```
Agency
  ├── system_prompt
  ├── model_config       ← fallback chain
  ├── tool_policies
  ├── memory_strategy
  ├── budget_config
  └── channel_bindings
        └── Department   (inherits + overrides Agency)
              └── Workspace (inherits + overrides Department)
                    └── Agent (inherits + overrides Workspace)
```

Inheritance resolution order: **Agent > Workspace > Department > Agency > System defaults**

## Core Files Compilation

At runtime boot, the system compiles Core Files for each entity:
1. Load Agency-level SOUL.md, TOOLS.md, MEMORY.md
2. Merge Department-level overrides
3. Merge Workspace-level overrides  
4. Apply Agent-level specifics
5. Produce compiled `AgentContext` object
6. Cache result in Redis with hierarchy version hash

## Durable Runtime

```
Run
  ├── id: uuid
  ├── status: pending | running | paused | completed | failed
  ├── checkpoint: JSON
  └── RunSteps[]
        ├── type: llm_call | tool_call | memory_read | approval | ...
        ├── status: pending | running | completed | failed
        ├── input: JSON
        ├── output: JSON
        └── trace_id: string
```

All state is persisted to PostgreSQL before execution. Redis is used for active run coordination and pub/sub.

## Tool Execution Pipeline

```
Agent decides to call tool
  → ToolCallRuntime receives request
  → ToolGuard validates permissions
  → ToolGuard checks injection patterns
  → Budget check
  → HITL gate (if required)
  → Tool executor
  → Output validator
  → Emit OTel span
  → Persist RunStep
  → Return to agent
```

## Multi-Agent Routing

```
Message arrives
  → Semantic embedding
  → Capability matching against Agent Cards
  → Hierarchy permission check
  → Budget check
  → Route to target agent
  → Supervisor monitors execution
  → Result aggregation
```
