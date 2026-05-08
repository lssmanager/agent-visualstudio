# agent-visualstudio

> Enterprise hierarchical multi-agent orchestration platform with durable runtime, visual flows, multi-channel communication, RAG, observability and enterprise governance.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)

---

## Vision

`agent-visualstudio` is a production-grade, enterprise-ready platform for designing, deploying and governing hierarchical multi-agent AI systems. Inspired by the best patterns from CrewAI, LangGraph, n8n, Flowise, AutoGen, Semantic Kernel and OpenClaw, it unifies them under a single coherent durable runtime.

---

## Core Architecture

```
Agency
  └── Department
        └── Workspace
              └── Agent
```

Every configuration, model, tool, memory policy, budget, and channel binding flows **down** this hierarchy. Every child can override its parent. Everything is observable, versionable and durable.

---

## Platform Pillars

| Pillar | Description |
|--------|-------------|
| **Durable Runtime** | PostgreSQL-backed run state, checkpointing, retry engine, HITL |
| **Visual Flow Editor** | Node-based workflow designer (n8n/Flowise inspired) |
| **Hierarchical Governance** | Agency → Department → Workspace → Agent inheritance |
| **Multi-Agent Orchestration** | Supervisor, GroupChat, Debate, Routing, Replanning |
| **Channel Gateway** | WhatsApp (Baileys), Telegram (grammY), Discord, Teams, WebChat |
| **LLM Provider Abstraction** | OpenAI, Anthropic, Gemini, OpenRouter, Ollama, Groq + fallback chains |
| **Memory & RAG** | Per-scope vector memory with pluggable backends |
| **Observability** | OpenTelemetry, structured logs, token & cost tracking |
| **Security & Governance** | ToolGuard, prompt injection detection, approval engine, audit logs |
| **Templates Hub** | Reusable agent/workflow templates registry |

---

## Monorepo Structure

```
agent-visualstudio/
├── apps/
│   ├── web/                    # Next.js dashboard + flow editor
│   └── api/                    # NestJS API gateway
├── packages/
│   ├── core/                   # Shared types, contracts, interfaces
│   ├── runtime/                # Durable execution engine
│   ├── agents/                 # Agent lifecycle & registry
│   ├── hierarchy/              # Agency/Department/Workspace system
│   ├── tools/                  # Tool & skill runtime
│   ├── memory/                 # Memory backends & RAG
│   ├── channels/               # Channel adapters
│   ├── providers/              # LLM provider abstraction
│   ├── flows/                  # Flow DSL & execution
│   ├── observability/          # OTel, metrics, tracing
│   └── security/               # ToolGuard, guardrails
├── services/
│   ├── channel-gateway/        # Unified channel ingestion service
│   ├── run-worker/             # Async run processing worker
│   ├── rag-service/            # RAG indexing & retrieval service
│   └── eval-service/           # Evaluation & benchmarking service
├── docs/
├── architecture/
├── roadmap/
├── examples/
└── .github/
```

---

## Core Files System

Every entity in the hierarchy uses **Core Files** (OpenClaw-inspired):

- `AGENTS.md` — Agent roster and capabilities
- `SOUL.md` — Identity, personality, behavioral guidelines
- `TOOLS.md` — Available tools and usage policies
- `MEMORY.md` — Memory strategy and retention rules
- `HEARTBEAT.md` — Routines, health checks, scheduled tasks
- `IDENTITY.md` — Role, scope, authorization level
- `USER.md` — User profile and preferences
- `BOOTSTRAP.md` — Initialization sequence

---

## Getting Started

> Development setup docs coming in Phase F0.

```bash
git clone https://github.com/lssmanager/agent-visualstudio
cd agent-visualstudio
pnpm install
pnpm dev
```

---

## Roadmap

See [roadmap/ROADMAP.md](./roadmap/ROADMAP.md) for the full phased delivery plan.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](./LICENSE).
