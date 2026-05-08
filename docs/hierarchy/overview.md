# Hierarchy Model

## Overview

Agent VisualStudio organizes all agents and configuration in a strict 4-level hierarchy:

```
Agency
└── Department (1..N per Agency)
    └── Workspace (1..N per Department)
        └── Agent (1..N per Workspace)
```

## Configuration Inheritance

Configuration flows **downward**. At every level you can set: LLM model, fallback chain, model policy, budget policy, tool list, Core Files. When resolving effective configuration for an Agent, the system traverses:

```
Agency config
  ← overridden by Department config
    ← overridden by Workspace config
      ← overridden by Agent config
```

The **most specific** (Agent-level) always wins.

## Activation States

Each node has one of three activation states:

| State | Behavior |
|-------|----------|
| **Active** | Fully operational |
| **Paused** | No new runs started; existing runs complete |
| **Archived** | Read-only; no runs; cannot be re-activated |

Deactivating (pausing or archiving) a parent **cascades** to all descendants.

## Agency

- Top-level container for an organization or tenant
- Defines global LLM + fallback chain (inherited by all descendants)
- Sets global budget policies
- Owns the root `MEMORY.md` and shared tool registry

## Department

- Functional grouping (e.g., Engineering, Sales, Support)
- Can override LLM model and fallback for all agents in the department
- Scopes memory and tools to functional area

## Workspace

- Operational unit that owns flows, runs, and agents
- Primary unit of budget allocation and observability
- Can bind channels and configure channel routing

## Agent

- Leaf executor in the hierarchy
- Resolves its effective config from the full chain
- Has a unique AgentCard (capability descriptor)
- Bound to specific channels it listens/responds on
