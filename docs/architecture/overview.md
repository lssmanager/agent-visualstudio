# Architecture Overview

## System Diagram

Agent VisualStudio is composed of four primary service layers communicating over internal APIs and a shared PostgreSQL database.

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                  │
│  Zone A: Nav │ Zone B: Tree │ Zone C: Workspace │ Zone D │
└──────────────────────────┬──────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────┐
│                     API Service (Fastify)                │
│  Hierarchy CRUD │ Run API │ Flow API │ Channel API       │
└────────┬────────────────────────────┬────────────────────┘
         │                            │
┌────────▼────────┐         ┌─────────▼──────────┐
│  Worker Service │         │  Gateway Service   │
│  (BullMQ)       │         │  (Channel Router)  │
│  Run execution  │         │  WebChat │ Telegram │
│  Tool loops     │         │  WhatsApp│ Teams    │
│  HITL resume    │         │  Discord │          │
└────────┬────────┘         └─────────┬──────────┘
         │                            │
┌────────▼────────────────────────────▼──────────┐
│            PostgreSQL (Prisma ORM)              │
│  Agency │ Department │ Workspace │ Agent        │
│  Run │ RunStep │ Flow │ Memory │ AuditLog       │
└─────────────────────────────────────────────────┘
```

## Layer Definitions

### Hierarchy Layer
Four-level tree: Agency → Department → Workspace → Agent. Configuration inherits downward; the most specific level wins.

### Runtime Layer
Durable Run/RunStep engine persisted in PostgreSQL. Every state transition is atomic. Runs survive restarts via checkpointing.

### Tool Layer
ToolGuard validates every tool call. ToolRegistry maps tool names to implementations. MCP client enables external tool servers.

### Memory Layer
Episodic memory per agent stored as structured MEMORY.md entries. RAG uses vector embeddings for semantic retrieval.

### Channel Layer
Gateway routes inbound messages to the correct agent via channel bindings. Each adapter handles protocol-specific auth and reconnection.

### Provider Layer
50+ LLM adapters organized in 7 tiers. Model resolution follows the hierarchy. Fallback chains execute on quota/rate-limit errors.

## Architecture Decision Records

- [ADR-001: Database Persistence Strategy](decisions/ADR-001-persistence.md)
- [ADR-002: Monorepo Structure](decisions/ADR-002-monorepo.md)
- [ADR-003: Runtime State Machine](decisions/ADR-003-runtime-state-machine.md)
