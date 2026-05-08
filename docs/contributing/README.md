# Contributing Guide

See the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full guide.

## Quick Reference

### Branch Strategy

```
main          ← production releases
develop       ← integration branch
feat/*        ← feature branches
fix/*         ← bug fix branches
chore/*       ← maintenance
```

### PR Checklist

1. Reference an issue
2. TypeScript strict mode — no `any`
3. Tests written and passing
4. OTel spans added for new execution paths
5. ToolGuard validation for new tools
6. ADR created for significant architectural decisions

### Package Boundaries

- `@agent-vs/core` — no business logic, no side effects
- `@agent-vs/runtime` — no HTTP, no UI
- `@agent-vs/agents` — no direct DB access (use runtime)
- `apps/web` — no business logic (use packages)
- `apps/api` — thin controller layer only

### Testing Strategy

| Layer | Test Type | Tool |
|-------|-----------|------|
| Packages | Unit | Vitest |
| Runtime | Integration | Vitest + testcontainers |
| API | E2E | Supertest |
| UI | Component | Testing Library |
| Flows | E2E | Playwright |
