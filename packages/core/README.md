# @agent-vs/core

Shared types, interfaces, and contracts for the agent-visualstudio platform.

This package is the **single source of truth** for all cross-package TypeScript interfaces.

## Contents

- `types/` — Core domain types (Run, RunStep, Agent, Hierarchy, etc.)
- `interfaces/` — Service interfaces (ILLMProvider, IToolExecutor, IMemoryBackend, etc.)
- `schemas/` — Zod schemas for runtime validation
- `errors/` — Typed error classes
- `constants/` — Platform-wide constants

## Rules

- No business logic in this package
- No external dependencies except `zod`
- All types exported from `index.ts`
- Any breaking change requires a major version bump
