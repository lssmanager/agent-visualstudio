# Architecture Documentation

This directory contains architectural documentation for agent-visualstudio.

## Contents

- [Overview](../../architecture/overview.md) — System layers, hierarchy model, runtime design
- [ADR-0001](../../architecture/decisions/ADR-0001-monorepo-structure.md) — Monorepo structure decision
- [ADR-0002](../../architecture/decisions/ADR-0002-durable-runtime-postgresql.md) — Durable runtime decision

## Key Concepts

### Hierarchy Inheritance
All configuration flows from Agency → Department → Workspace → Agent. See [hierarchy docs](../hierarchy/README.md).

### Core Files
Every entity uses a set of markdown-based Core Files that define identity, tools, memory, and behavior. See [core-files docs](../core-files/README.md).

### Durable Runtime
No run state lives only in memory. Every run and step is persisted with full checkpointing. See [runtime docs](../runtime/README.md).
