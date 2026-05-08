# agent-visualstudio Roadmap

## Philosophy

Delivery is organized in 17 phases (F0–F16). Each phase is a GitHub Milestone with clear technical objectives, acceptance criteria, and dependencies. No phase begins until its dependencies are complete and their acceptance criteria are verified.

---

## Phase Summary

| Phase | Name | Dependencies | Status |
|-------|------|-------------|--------|
| F0 | Foundation & Infrastructure | — | 🔵 Planning |
| F1 | Core Runtime | F0 | 🔵 Planning |
| F2 | Hierarchy System | F1 | 🔵 Planning |
| F3 | Agent System | F2 | 🔵 Planning |
| F4 | Tool Runtime | F3 | 🔵 Planning |
| F5 | Memory & RAG | F3, F4 | 🔵 Planning |
| F6 | Multi-Agent Orchestration | F3, F4 | 🔵 Planning |
| F7 | Flow Editor | F6 | 🔵 Planning |
| F8 | Channels Gateway | F3, F4 | 🔵 Planning |
| F9 | Providers & Models | F1 | 🔵 Planning |
| F10 | Observability & Evals | F1 | 🔵 Planning |
| F11 | Dashboard & UI | F2, F7, F10 | 🔵 Planning |
| F12 | Security & Governance | F4, F8 | 🔵 Planning |
| F13 | Templates & Hub | F3, F6, F7 | 🔵 Planning |
| F14 | Deployment & DevOps | F10, F12 | 🔵 Planning |
| F15 | Enterprise Features | F12, F13, F14 | 🔵 Planning |
| F16 | Beta Release | F15 | 🔵 Planning |

---

## Dependency Graph

```
F0 (Foundation)
  └── F1 (Core Runtime)
        ├── F2 (Hierarchy)
        │     ├── F3 (Agents)
        │     │     ├── F4 (Tools)
        │     │     │     ├── F5 (Memory & RAG)
        │     │     │     ├── F6 (Multi-Agent)
        │     │     │     │     └── F7 (Flow Editor)
        │     │     │     └── F8 (Channels)
        │     │     └── F12 (Security)
        │     └── F11 (Dashboard)
        ├── F9 (Providers)
        └── F10 (Observability)
              └── F11 (Dashboard)
                    └── F13 (Templates)
                          └── F15 (Enterprise)
                                └── F16 (Beta)
```

---

## Critical Path

F0 → F1 → F2 → F3 → F4 → F6 → F7 → F13 → F15 → F16

---

## Detailed Phase Objectives

### F0 — Foundation & Infrastructure
Monorepo setup, CI/CD pipelines, database schema, Docker environment, shared contracts package, developer experience tooling.

### F1 — Core Runtime
Durable execution engine: Run, RunStep persistence, event sourcing, checkpointing, retry engine, HITL approval system, ToolCallRuntime.

### F2 — Hierarchy System
Agency, Department, Workspace, Agent entities with full configuration inheritance, Core Files compilation, override resolution.

### F3 — Agent System
Agent lifecycle, registry, Agent Cards, capability declarations, routing foundation, prompt compilation from hierarchy.

### F4 — Tool Runtime
Tool & Skill definitions (markdown format), ToolGuard, permission validation, execution sandbox, tool registry hub.

### F5 — Memory & RAG
Per-scope vector memory, pluggable backends (pgvector, Pinecone, Qdrant), RAG retrieval pipelines, memory policies.

### F6 — Multi-Agent Orchestration
Supervisor pattern, GroupChat, Debate protocol, semantic routing, delegation, replanning engine, agent-to-agent messaging.

### F7 — Flow Editor
Visual node editor, Flow DSL, execution mapping, persistence, versioning, runtime inspector.

### F8 — Channels Gateway
WhatsApp (Baileys), Telegram (grammY), Discord, Teams (Bot Framework), WebChat adapters, unified gateway, routing, health management.

### F9 — Providers & Models
Provider abstraction layer, auth profiles, fallback chains, key rotation, budget enforcement, usage tracking.

### F10 — Observability & Evals
OpenTelemetry integration, structured logging, token/cost tracking, run timeline UI, evaluation framework.

### F11 — Dashboard & UI
Full web dashboard: hierarchy explorer, run inspector, flow editor integration, channel management, provider management.

### F12 — Security & Governance
ToolGuard hardening, prompt injection detection, output validation, audit logging, approval workflows, RBAC.

### F13 — Templates & Hub
Agent/workflow template registry, marketplace UI, import/export, versioning, community templates.

### F14 — Deployment & DevOps
Docker Compose production, Kubernetes Helm charts, health endpoints, secret management, backup/restore.

### F15 — Enterprise Features
Multi-tenancy, SSO/SAML, budget governance, SLA tracking, compliance reports, enterprise API.

### F16 — Beta Release
Public beta, documentation complete, example library, community onboarding, feedback loop.
