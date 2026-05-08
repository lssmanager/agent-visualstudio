# Roadmap: Phases F0–F16

## Overview

Agent VisualStudio is built in 17 strictly ordered phases. Each phase produces a merged PR with a verifiable checkpoint before the next phase begins.

---

## F0 — Foundation & Infrastructure
**Goal:** Monorepo, CI/CD, DB schema, base Docker Compose, initial ADRs

- Initialize monorepo with Turborepo + pnpm workspaces
- Define base TypeScript config, ESLint, Prettier shared packages
- PostgreSQL schema v1: Agency, Department, Workspace, Agent, Run, RunStep
- Prisma setup with migrations, seed script and reset command
- Docker Compose base: api, db, worker, redis, ui
- GitHub Actions: CI pipeline (lint + typecheck + test on PR)
- ADR-001, ADR-002, ADR-003

---

## F1 — Core Runtime
**Goal:** Run/RunStep entities, ToolCallRuntime, HITL, checkpointing, durable state

- Run entity with state machine
- RunStep entity with type enum and I/O persistence
- ToolCallRuntime: unified tool loop
- HITL approval with DB persistence
- Checkpoint service
- Fallback chain executor

---

## F2 — Hierarchy System
**Goal:** Agency/Department/Workspace/Agent entities, inheritance, activation states, Core Files

---

## F3 — Agent System
**Goal:** AgentProfile, Core Files compilation, context builder, AgentCard

---

## F4 — Tool Runtime
**Goal:** ToolRegistry, ToolGuard, MCP client, tool loop, retry engine

---

## F5 — Memory & RAG
**Goal:** MEMORY.md persistence, episodic memory, chunking, embeddings, semantic search

---

## F6 — Multi-Agent Orchestration
**Goal:** Supervisor, delegation, GroupChat, replanning, routing by embeddings

---

## F7 — Flow Editor
**Goal:** Node types, canvas, RunStep mapping, visual execution, sandbox, versioning

---

## F8 — Channels Gateway
**Goal:** WebChat (default), Telegram, WhatsApp, Teams, Discord, routing, bindings

---

## F9 — Providers & Models
**Goal:** LLM registry, auth profiles, fallback chain, model resolution, cost tracking, 50+ provider adapters

---

## F10 — Observability & Evals
**Goal:** OpenTelemetry spans, structured logs, Visual Run Debugger, eval engine, regression

---

## F11 — Dashboard & UI
**Goal:** Analytics panels, drag-and-drop layout, hierarchical filter, goals/routines widgets

---

## F12 — Security & Governance
**Goal:** ToolGuard hardening, prompt injection detection, output guardrails, audit log

---

## F13 — Templates & Hub
**Goal:** Templates Hub sync (agency-agents repo), Tools/Skills Hub, Agent Builder full

---

## F14 — Deployment & DevOps
**Goal:** Docker Compose production, onboarding wizard, env management, upgrade path

---

## F15 — Enterprise Features
**Goal:** Budget policies, RBAC, multi-tenancy hardening, SLA monitoring, compliance logs

---

## F16 — Beta Release
**Goal:** End-to-end validation, performance benchmarks, public docs, changelog
