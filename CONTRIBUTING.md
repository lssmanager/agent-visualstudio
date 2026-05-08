# Contributing to agent-visualstudio

Thank you for your interest in contributing! This document outlines the standards and process for contributions.

## Development Philosophy

- **Hierarchy-first**: All features must respect the Agency → Department → Workspace → Agent inheritance model
- **Durable by default**: No critical state lives only in memory
- **Observable always**: Every action must emit traces, logs, and metrics
- **Typed contracts**: All cross-package communication uses typed interfaces from `@agent-vs/core`

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Local Setup

```bash
git clone https://github.com/lssmanager/agent-visualstudio
cd agent-visualstudio
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:migrate
pnpm dev
```

## Branch Naming

```
feat/<milestone>/<short-description>
fix/<issue-number>-<short-description>
chore/<description>
refactor/<area>/<description>
docs/<description>
```

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(runtime): add durable checkpointing for RunStep
fix(channels): resolve Telegram grammY reconnection race
chore(deps): bump prisma to 5.14
docs(architecture): document hierarchy inheritance model
```

## Pull Request Process

1. Open an issue first for significant changes
2. Branch from `main`
3. Write tests for all new behavior
4. Ensure `pnpm lint` and `pnpm test` pass
5. Reference the issue with `Closes #<issue>`
6. Request review from CODEOWNERS

## Code Standards

- TypeScript strict mode — no `any`
- ESLint + Prettier enforced
- Unit tests required for all business logic
- Integration tests for all runtime paths
- No hardcoded provider names or credentials
- All tools must pass ToolGuard validation

## Architecture Decisions

Document significant decisions in `architecture/decisions/ADR-XXXX.md` using the ADR format.

## Security

See [SECURITY.md](./SECURITY.md) for vulnerability reporting.
