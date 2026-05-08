# 🤖 Agent VisualStudio

[![CI](https://github.com/lssmanager/agent-visualstudio/actions/workflows/ci.yml/badge.svg)](https://github.com/lssmanager/agent-visualstudio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-monorepo-orange)](https://pnpm.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)

> Enterprise hierarchical multi-agent orchestration platform with durable runtime, visual flows, multi-channel communication, RAG, observability and enterprise governance.

---

## 🏗️ Architecture Overview

Agent VisualStudio organizes AI agents in a strict **4-level hierarchy**:

```
Agency
└── Department
    └── Workspace
        └── Agent
```

Configuration (prompts, tools, models, memory, policies, channels, budget) **flows downward** — lower levels inherit and can override. Every agent resolves its effective configuration from most-specific to least-specific.

### Core Layers

| Layer | Description |
|-------|-------------|
| **Runtime** | Durable Run/RunStep engine, HITL, checkpointing, fallback chain |
| **Hierarchy** | Agency → Department → Workspace → Agent inheritance |
| **Core Files** | 8 `.md` files compiled at runtime into agent context |
| **Flow Editor** | Visual node-based execution editor with sandbox + versioning |
| **Channels Gateway** | WebChat, Telegram, WhatsApp, Teams, Discord |
| **Providers** | 50+ LLM adapters across 7 tiers with fallback chains |
| **Memory & RAG** | Episodic memory, semantic search, context compression |
| **Observability** | OpenTelemetry spans, Visual Run Debugger, eval engine |
| **Security** | ToolGuard, prompt injection detection, output guardrails, audit log |

---

## 🚀 Quickstart

```bash
# Prerequisites: Node 20+, pnpm 9+, Docker
git clone https://github.com/lssmanager/agent-visualstudio.git
cd agent-visualstudio
pnpm install
cp .env.example .env
docker compose up -d db redis
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Monorepo Structure

```
agent-visualstudio/
├── apps/
│   ├── web/          # Next.js frontend
│   └── cli/          # CLI tooling
├── services/
│   ├── api/          # REST + WebSocket API
│   ├── worker/       # Background job processor
│   ├── gateway/      # Channel gateway
│   └── scheduler/    # Cron / routine scheduler
├── packages/
│   ├── runtime/      # Core run engine
│   ├── sdk/          # TypeScript SDK
│   ├── types/        # Shared types
│   └── ui-components/# Shared UI components
├── docs/             # Documentation
├── architecture/     # Diagrams + ADRs
├── roadmap/          # Phase planning
└── examples/         # Example agents and flows
```

---

## 📚 Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [Hierarchy Model](docs/hierarchy/overview.md)
- [Core Files](docs/core-files/overview.md)
- [Runtime](docs/runtime/overview.md)
- [Channels](docs/channels/overview.md)
- [Providers](docs/providers/overview.md)
- [Roadmap](docs/roadmap/phases.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

---

## 🗺️ Roadmap

See [docs/roadmap/phases.md](docs/roadmap/phases.md) for the full F0–F16 phase plan.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, PR format, commit conventions, and dev setup.

---

## 🔒 Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and disclosure policy.

---

## 📄 License

[MIT](LICENSE) © 2026 Agent VisualStudio Contributors
