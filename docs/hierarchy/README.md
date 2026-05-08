# Hierarchy System

## Model

```
Agency
  └── Department
        └── Workspace
              └── Agent
```

## Inheritance

Every child entity inherits configuration from its parent and may override any property. Resolution order:

```
Agent (highest priority)
  > Workspace
    > Department
      > Agency
        > System defaults (lowest priority)
```

## Inherited Properties

| Property | Description |
|----------|-------------|
| `system_prompt` | Base prompt injected into every agent context |
| `model_config` | LLM provider, model name, parameters |
| `fallback_chain` | Ordered list of fallback providers |
| `tool_policies` | Which tools are allowed/denied |
| `memory_strategy` | Memory backend and retention rules |
| `budget_config` | Token and cost limits |
| `channel_bindings` | Which channels are active |
| `context_window` | Max context size policy |
| `security_policies` | HITL requirements, guardrails |

## Core Files per Level

Each level of the hierarchy can have its own Core Files:

- Agency: `SOUL.md`, `TOOLS.md`, `MEMORY.md`, `IDENTITY.md`
- Department: Same files, override Agency defaults
- Workspace: Same files, override Department defaults
- Agent: Same files, highest specificity
