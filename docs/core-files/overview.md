# Core Files

## Overview

Each level of the hierarchy (Agency, Department, Workspace, Agent) owns a set of **8 Core Files** — Markdown documents that are compiled into the agent's effective context at runtime.

Lower levels override upper levels at the section level. The compiler merges all 8 files from Agency → Agent before injecting into the LLM context.

## The 8 Core Files

| File | Purpose |
|------|---------|
| `IDENTITY.md` | Name, role, emoji, position in hierarchy |
| `SOUL.md` | Tone, values, personality, ethical limits |
| `AGENTS.md` | Startup rules, operation rules, delegation, error handling |
| `TOOLS.md` | Authorized tools, endpoints; inherited from parent levels |
| `USER.md` | Profile of the person/system the agent assists |
| `MEMORY.md` | Long-term facts, decisions, restrictions; entries editable/deletable |
| `HEARTBEAT.md` | Agent auto-generates cron tasks from SOUL+AGENTS+TOOLS; each shows as an activatable Routine in UI |
| `BOOTSTRAP.md` | One-time initialization script; auto-deletes on completion |

## Compilation Order

1. Load Agency-level versions of all 8 files
2. Deep-merge Department-level overrides (section-level)
3. Deep-merge Workspace-level overrides
4. Deep-merge Agent-level overrides
5. Inject merged context into LLM system prompt before run

## Inheritance Indicators

In the Core Files editor UI, sections show:
- 🔵 **Inherited** — section comes from a parent level unchanged
- 🟡 **Overridden** — section overrides a parent definition
- 🟢 **Own** — section defined only at this level

## BOOTSTRAP.md Lifecycle

`BOOTSTRAP.md` is special: it executes exactly once during agent initialization and then **auto-deletes**. Use it for one-time setup tasks like creating initial memory entries, calling external APIs to fetch initial context, or validating tool availability.

## HEARTBEAT.md Tasks

The agent reads `HEARTBEAT.md` and derives cron-style recurring tasks. Each derived task appears in the UI as an activatable **Routine** with an individual on/off toggle.
