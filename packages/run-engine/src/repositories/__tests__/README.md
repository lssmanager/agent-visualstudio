# Repository Integration Tests — F0-10

These tests use a **real PostgreSQL database** via a custom Jest test environment.
They are integration tests, not unit tests — they verify that Prisma queries,
constraints, and cascade behaviors work as specified in the F0 schema.

## Setup

1. **Create a test database** (one-time):
   ```bash
   psql -U postgres -c "CREATE DATABASE avs_test;"
   ```

2. **Set env var** in `packages/run-engine/.env.test`:
   ```env
   DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/avs_test
   ```

3. **Install deps** (if not already):
   ```bash
   pnpm add -D jest-environment-node @types/pg pg ts-jest
   ```

4. **Run tests**:
   ```bash
   # From monorepo root
   pnpm --filter run-engine test

   # Or directly
   cd packages/run-engine
   npx jest
   ```

## Architecture

```
__tests__/
├── setup/
│   ├── prisma-test-env.ts   ← Custom Jest environment (isolated schema per worker)
│   ├── global-setup.ts      ← Verify DB connection before test run
│   └── global-teardown.ts   ← Drop all test_worker_* schemas
├── helpers/
│   └── fixtures.ts          ← Typed factory helpers (Agency → Agent chain)
├── agency.repository.test.ts
├── department.repository.test.ts
├── workspace.repository.test.ts
├── agent.repository.test.ts
├── run.repository.test.ts
├── run-step.repository.test.ts
└── conversation-message.repository.test.ts
```

## Isolation Strategy

- Each Jest **worker** gets its own PostgreSQL schema (`test_worker_0`, `test_worker_1`, …).
- Migrations run against the worker's schema via `prisma migrate deploy`.
- Between tests, `TRUNCATE ... CASCADE` resets data without destroying the schema (fast).
- Schemas are dropped in `globalTeardown`.

## What Each Test File Covers

| File | Repository | Key invariants tested |
|---|---|---|
| `agency.repository.test.ts` | AgencyRepository | CRUD, unique slug, pagination |
| `department.repository.test.ts` | DepartmentRepository | C-20 one-orchestrator-per-agency |
| `workspace.repository.test.ts` | WorkspaceRepository | C-20 one-orchestrator-per-dept, cascade delete |
| `agent.repository.test.ts` | AgentRepository | C-20 one-orchestrator-per-workspace, cascade |
| `run.repository.test.ts` | RunRepository | Status transitions, listByAgency filter |
| `run-step.repository.test.ts` | RunStepRepository | bulkCreate, status, retryCount, cascade |
| `conversation-message.repository.test.ts` | ConversationMessageRepository | Append-only (D-11), cursor pagination, token count |
