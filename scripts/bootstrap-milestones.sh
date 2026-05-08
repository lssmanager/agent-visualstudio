#!/usr/bin/env bash
# Run this script once to create all GitHub milestones for the project
# Requires: gh CLI authenticated

set -e
OWNER="lssmanager"
REPO="agent-visualstudio"

create_ms() {
  local title="$1" due="$2" desc="$3"
  gh api repos/$OWNER/$REPO/milestones \
    --method POST \
    --field title="$title" \
    --field due_on="${due}T00:00:00Z" \
    --field description="$desc" 2>/dev/null || echo "Milestone '$title' may already exist"
}

create_ms "F0 — Foundation & Infrastructure"   "2026-05-22" "Monorepo, CI/CD, DB schema, Docker Compose, initial ADRs"
create_ms "F1 — Core Runtime"                   "2026-06-05" "Run/RunStep entities, ToolCallRuntime, HITL, checkpointing"
create_ms "F2 — Hierarchy System"               "2026-06-19" "Agency/Department/Workspace/Agent, inheritance, activation states"
create_ms "F3 — Agent System"                   "2026-07-03" "AgentProfile, Core Files compilation, context builder, AgentCard"
create_ms "F4 — Tool Runtime"                   "2026-07-17" "ToolRegistry, ToolGuard, MCP client, tool loop"
create_ms "F5 — Memory & RAG"                   "2026-07-31" "MEMORY.md persistence, episodic memory, embeddings, semantic search"
create_ms "F6 — Multi-Agent Orchestration"      "2026-08-14" "Supervisor, delegation, GroupChat, replanning, semantic router"
create_ms "F7 — Flow Editor"                    "2026-08-28" "Node types, canvas, RunStep mapping, sandbox, versioning"
create_ms "F8 — Channels Gateway"               "2026-09-11" "WebChat, Telegram, WhatsApp, Teams, Discord, routing"
create_ms "F9 — Providers & Models"             "2026-09-25" "LLM registry, auth profiles, fallback chain, 50+ adapters"
create_ms "F10 — Observability & Evals"         "2026-10-09" "OpenTelemetry, Run Debugger, eval engine, regression"
create_ms "F11 — Dashboard & UI"                "2026-10-23" "Analytics panels, hierarchy filter, goals/routines widgets"
create_ms "F12 — Security & Governance"         "2026-11-06" "ToolGuard hardening, prompt injection, output guardrails, audit log"
create_ms "F13 — Templates & Hub"               "2026-11-20" "Templates Hub sync, Tools/Skills Hub, Agent Builder"
create_ms "F14 — Deployment & DevOps"           "2026-12-04" "Docker Compose production, onboarding wizard, env management"
create_ms "F15 — Enterprise Features"           "2026-12-18" "RBAC, budget policies, multi-tenancy, SLA monitoring"
create_ms "F16 — Beta Release"                  "2027-01-08" "E2E validation, benchmarks, public docs, changelog"

echo "\nAll milestones created!"
