# Contributing to Agent VisualStudio

Thank you for contributing! This document covers branch naming, PR format, commit conventions, and dev setup.

---

## 🌿 Branch Naming

```
<type>/<milestone>/<short-description>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`, `security`

**Examples:**
```
feat/f1/run-entity-schema
fix/f0/ci-pipeline-typecheck
docs/f0/adr-001-persistence
chore/f0/monorepo-setup
```

---

## 📝 Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(scope): <description>

[optional body]

[optional footer: Closes #N, Depends on #N]
```

**Examples:**
```
feat(runtime): add Run entity with state machine
fix(runtime): prevent infinite tool loop on missing response
docs(hierarchy): add Agency→Workspace inheritance diagram
chore(ci): add lint step to CI workflow
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `security`, `revert`

---

## 🔀 Pull Request Format

All PRs must use the PR template (`.github/PULL_REQUEST_TEMPLATE.md`).

**Required before merge:**
- ✅ All CI checks pass (lint, typecheck, tests)
- ✅ At least one CODEOWNER review approved
- ✅ Issue linked in PR body (`Closes #N`)
- ✅ Milestone set
- ✅ Labels applied
- ✅ No `console.log` or debug artifacts

---

## 🛠️ Dev Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose
- PostgreSQL 15 (or use Docker)

### Initial Setup

```bash
git clone https://github.com/lssmanager/agent-visualstudio.git
cd agent-visualstudio
pnpm install
cp .env.example .env
# Edit .env with your database and provider credentials
docker compose up -d db redis
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### Useful Commands

```bash
pnpm dev          # Start all services in dev mode (Turborepo)
pnpm build        # Build all packages + apps
pnpm lint         # Run ESLint across monorepo
pnpm typecheck    # Run tsc --noEmit across all packages
pnpm test         # Run all tests
pnpm db:migrate   # Run Prisma migrations
pnpm db:seed      # Seed database with sample data
pnpm db:reset     # Reset and re-seed database
pnpm db:studio    # Open Prisma Studio
```

### Package Structure

```
packages/types      → shared TypeScript types (no runtime deps)
packages/runtime    → core run engine, tool loop, HITL
packages/sdk        → public SDK for external integrations
packages/ui-components → shared React components
services/api        → REST + WebSocket API server (Fastify)
services/worker     → Bull/BullMQ background jobs
services/gateway    → channel gateway (WebChat, Telegram, etc.)
services/scheduler  → cron + routine scheduler
apps/web            → Next.js frontend
apps/cli            → CLI tooling
```

---

## 🏷️ Labels

Apply at minimum:
- One `type:*` label
- One `area:*` label
- One `priority:*` label
- The milestone label corresponding to the phase

---

## 📐 Architecture Decision Records (ADRs)

For significant architectural decisions, create an ADR in `architecture/decisions/`.

Template: `ADR-NNN-short-title.md`

See existing ADRs in [architecture/decisions/](architecture/decisions/).
