# GitHub Milestones — AGENT VISUAL STUDIO

> Crea estos milestones en GitHub → **Issues → Milestones → New milestone**.  
> Cada milestone agrupa los issues de una fase del [plan maestro](../docs/plan-master.md).

---

## Lista de milestones

| Nombre | Due date | Descripción |
|--------|----------|-------------|
| `F0 — Cimientos de datos` | 2026-05-03 | Schema Prisma canónico, migraciones, repositorios base, seed, tests. |
| `F1a — Ejecución LLM real` | 2026-05-12 | LLMStepExecutor real, resolveModelPolicy, AgentExecutor, FlowExecutor integrado. |
| `F1b — Skills reales (MCP + N8N)` | 2026-05-19 | executeTool n8n/mcp, buildToolDefinitions, N8nService, SkillRepository. |
| `F2a — Orquestación jerárquica real` | 2026-05-26 | HierarchyOrchestrator BD-backed, HierarchyStatusService, endpoints /status. |
| `F2b — Propagación automática de perfiles` | 2026-05-24 | propagateUp(), generateOrchestratorPrompt(), hooks AgentRepository. |
| `F3a — Gateway WebChat + Telegram` | 2026-06-02 | NestJS gateway, IChannelAdapter, WebChatAdapter, TelegramAdapter, SessionManager. |
| `F3b — Security layer` | 2026-06-04 | JWT Logto, Helmet, CORS, rate limiting, AES-256-GCM, AuditEvent. |
| `F4a — Integración N8N completa` | 2026-06-09 | N8nService completo, WebhookAdapter, N8nWorkflowNode canvas. |
| `F4b — N8N Studio Helper` | 2026-06-16 | N8nStudioHelper, tools create/list/assign, test prompt→Skill. |
| `F5 — Canales adicionales` | 2026-06-30 | WhatsAppAdapter, SlackAdapter, DiscordAdapter, UI canales. |
| `F6 — Frontend Canvas / Ops / Config` | 2026-07-15 | Canvas nodes, Operations timeline, Configuration surfaces. |

---

## Labels recomendados

Crea estos labels en GitHub → **Issues → Labels → New label**:

```
phase:F0        #0052cc
phase:F1a       #0052cc
phase:F1b       #0052cc
phase:F2a       #0052cc
phase:F2b       #0052cc
phase:F3a       #0052cc
phase:F3b       #0052cc
phase:F4a       #0052cc
phase:F4b       #0052cc
phase:F5        #0052cc
phase:F6        #0052cc

priority:blocker   #d73a4a
priority:urgent    #e4e669
priority:required  #0075ca
priority:optional  #cfd3d7
priority:normal    #ffffff

area:backend    #bfd4f2
area:frontend   #c5def5
area:infra      #f9d0c4
area:testing    #c2e0c6
area:security   #e99695
```

---

## GitHub Project (Timeline / Roadmap)

1. Crear **Project v2** en el repo u organización.
2. Agregar campo `Phase` (text): F0, F1a, F1b, …
3. Agregar campo `Start date` (date).
4. Agregar campo `Target date` (date).
5. Importar todos los issues.
6. Cambiar vista a **Roadmap / Timeline** para ver barras por issue.

Los issues con `Start date` / `Target date` rellenados forman el pseudo-Gantt.  
Ver el Gantt estático en Mermaid: [plan-gantt.md](../docs/plan-gantt.md).
