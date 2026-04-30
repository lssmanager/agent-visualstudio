# AGENT VISUAL STUDIO — Plan Maestro de Issues

> Un issue por tarea. Un milestone por fase.  
> Ver el Gantt: [plan-gantt.md](./plan-gantt.md)

---

## Convención de títulos y labels

| Campo | Formato |
|-------|---------|
| Título | `[F0-01] Crear schema Prisma canónico` |
| Labels | `phase:F0`, `priority:blocker`, `area:backend` |
| Milestone | `F0 — Cimientos de datos` |
| Depends-on | Mencionar `#<número-issue>` en el cuerpo del issue |

### Labels sugeridos

| Label | Descripción |
|-------|-------------|
| `phase:F0` … `phase:F6` | Fase del plan |
| `priority:blocker` | Bloquea el milestone; no se cierra sin esto |
| `priority:urgent` | Alta prioridad, no bloquea milestone directamente |
| `priority:required` | Requerido para cerrar el milestone |
| `priority:optional` | Mejora, puede diferirse |
| `area:backend` | Módulo API / packages |
| `area:frontend` | Apps web / canvas / UI |
| `area:infra` | Docker, CI, seed, migrations |
| `area:testing` | Tests E2E, unit, integration |
| `area:security` | Middleware, crypto, audit |

---

## FASE 0 — CIMIENTOS DE DATOS
**Milestone:** `F0 — Cimientos de datos`  
**Duración:** 3 días (2026-05-01 → 2026-05-03)  
**Criterio de cierre:** F0-01 → F0-10 completadas, seed ejecutable, todos los tests verdes.

- [ ] **F0-01** · Crear `prisma/schema.prisma` canónico (sección 2.2)
  - Módulo: `prisma/schema.prisma`
  - Labels: `phase:F0`, `priority:blocker`, `area:infra`
  - Depende de: —
- [ ] **F0-02** · Ejecutar `prisma migrate dev --name init`
  - Módulo: `prisma/migrations/`
  - Labels: `phase:F0`, `priority:blocker`, `area:infra`
  - Depende de: F0-01
- [ ] **F0-03** · Partial unique indexes via raw SQL (nota C-20)
  - Módulo: `prisma/migrations/init/migration.sql`
  - Labels: `phase:F0`, `priority:blocker`, `area:infra`
  - Depende de: F0-02
- [ ] **F0-04** · Repos Agency / Department / Workspace / Agent
  - Módulo: `packages/run-engine/src/repositories/`
  - Labels: `phase:F0`, `priority:blocker`, `area:backend`
  - Depende de: F0-02
- [ ] **F0-05** · RunRepository y RunStepRepository con Prisma
  - Módulo: `packages/run-engine/src/repositories/`
  - Labels: `phase:F0`, `priority:blocker`, `area:backend`
  - Depende de: F0-02
- [ ] **F0-06** · ConversationMessageRepository (append-only)
  - Módulo: `packages/run-engine/src/repositories/`
  - Labels: `phase:F0`, `priority:blocker`, `area:backend`
  - Depende de: F0-02
- [ ] **F0-07** · Migrar `dashboard.service.ts` de `workspaceStore` a Prisma
  - Módulo: `apps/api/src/modules/dashboard/dashboard.service.ts`
  - Labels: `phase:F0`, `priority:blocker`, `area:backend`
  - Depende de: F0-04, F0-05, F0-06
- [ ] **F0-08** · Marcar `workspaceStore` como `@deprecated` en todos los imports
  - Módulo: `packages/storage/`
  - Labels: `phase:F0`, `priority:urgent`, `area:backend`
  - Depende de: F0-07
- [ ] **F0-09** · Seed mínimo (1 Agency, 1 Dept, 1 Workspace, 1 Agent orchestrator)
  - Módulo: `prisma/seed.ts`
  - Labels: `phase:F0`, `priority:urgent`, `area:infra`
  - Depende de: F0-02
- [ ] **F0-10** · Tests de repositorios con Prisma Test Environment
  - Módulo: `packages/run-engine/src/repositories/_tests_/`
  - Labels: `phase:F0`, `priority:required`, `area:testing`
  - Depende de: F0-04, F0-05, F0-06

---

## FASE 1a — EJECUCIÓN LLM REAL
**Milestone:** `F1a — Ejecución LLM real`  
**Duración:** 1 semana (2026-05-06 → 2026-05-12)  
**Criterio de cierre:** Test E2E `Run→GPT-4o→RunStep.status=completed` pasa.  
**Depende de:** Milestone F0.

- [ ] **F1a-01** · Implementar `LLMStepExecutor.executeAgent()` real
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1a`, `priority:blocker`, `area:backend`
  - Depende de: F0-10
- [ ] **F1a-02** · Implementar `resolveModelPolicy()` (cascada agent→ws→dept→agency)
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1a`, `priority:blocker`, `area:backend`
  - Depende de: F1a-01
- [ ] **F1a-03** · Implementar `buildLLMClient()` con provider map
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1a`, `priority:blocker`, `area:backend`
  - Depende de: F1a-01
- [ ] **F1a-04** · Implementar `calculateCost()` con tabla de precios por modelo
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1a`, `priority:urgent`, `area:backend`
  - Depende de: F1a-03
- [ ] **F1a-05** · Crear `AgentExecutor` intermedio (romper dependencia circular)
  - Módulo: `packages/run-engine/src/agent-executor.service.ts`
  - Labels: `phase:F1a`, `priority:blocker`, `area:backend`
  - Depende de: F0-10
- [ ] **F1a-06** · Implementar `AgentExecutor.execute()` (RunStep running/completed/failed)
  - Módulo: `packages/run-engine/src/agent-executor.service.ts`
  - Labels: `phase:F1a`, `priority:blocker`, `area:backend`
  - Depende de: F1a-05
- [ ] **F1a-07** · Implementar `executeCondition()` con evaluación segura
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1a`, `priority:urgent`, `area:backend`
  - Depende de: F1a-01
- [ ] **F1a-08** · Conectar `FlowExecutor` al nuevo `LLMStepExecutor` real
  - Módulo: `packages/run-engine/src/flow-executor.ts`
  - Labels: `phase:F1a`, `priority:blocker`, `area:backend`
  - Depende de: F1a-01, F1a-05, F1a-06
- [ ] **F1a-09** · Test E2E: crear Run → ejecutar con GPT-4o → verificar `RunStep.status=completed`
  - Módulo: `packages/run-engine/src/_tests_/e2e/`
  - Labels: `phase:F1a`, `priority:required`, `area:testing`
  - Depende de: F1a-01…F1a-08

---

## FASE 1b — SKILLS REALES (MCP + N8N)
**Milestone:** `F1b — Skills reales (MCP + N8N)`  
**Duración:** 1 semana (2026-05-13 → 2026-05-19)  
**Criterio de cierre:** Test E2E skill `n8n_webhook` ejecuta tool call y retorna resultado real.  
**Depende de:** Milestone F1a.

- [ ] **F1b-01** · Implementar `executeTool()` para `type: n8n_webhook`
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1b`, `priority:blocker`, `area:backend`
  - Depende de: F1a-01, F1a-03
- [ ] **F1b-02** · Implementar `executeTool()` para `type: mcp` (`invokeMcp` real)
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1b`, `priority:blocker`, `area:backend`
  - Depende de: F1a-01, F1a-03
- [ ] **F1b-03** · Implementar `buildToolDefinitions()` (Skill[] → OpenAI tool format)
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1b`, `priority:blocker`, `area:backend`
  - Depende de: F1b-01, F1b-02
- [ ] **F1b-04** · Implementar `executeToolCalls()` (despacho de tool_calls)
  - Módulo: `packages/run-engine/src/llm-step-executor.ts`
  - Labels: `phase:F1b`, `priority:blocker`, `area:backend`
  - Depende de: F1b-03
- [ ] **F1b-05** · Implementar `N8nService.triggerWorkflow()` con manejo error/timeout
  - Módulo: `packages/n8n-service/src/n8n.service.ts`
  - Labels: `phase:F1b`, `priority:blocker`, `area:backend`
  - Depende de: F0-10
- [ ] **F1b-06** · Implementar `N8nService.syncWorkflows()`
  - Módulo: `packages/n8n-service/src/n8n.service.ts`
  - Labels: `phase:F1b`, `priority:urgent`, `area:backend`
  - Depende de: F1b-05
- [ ] **F1b-07** · Implementar `N8nService.getWorkflowsAsSkills()`
  - Módulo: `packages/n8n-service/src/n8n.service.ts`
  - Labels: `phase:F1b`, `priority:urgent`, `area:backend`
  - Depende de: F1b-06
- [ ] **F1b-08** · Implementar `SkillRepository` CRUD
  - Módulo: `packages/run-engine/src/repositories/skill.repository.ts`
  - Labels: `phase:F1b`, `priority:urgent`, `area:backend`
  - Depende de: F0-10
- [ ] **F1b-09** · Test E2E: agente con skill `n8n_webhook` ejecuta tool call y recibe resultado real
  - Módulo: `packages/run-engine/src/_tests_/e2e/`
  - Labels: `phase:F1b`, `priority:required`, `area:testing`
  - Depende de: F1b-01…F1b-08

---

## FASE 2a — ORQUESTACIÓN JERÁRQUICA REAL
**Milestone:** `F2a — Orquestación jerárquica real`  
**Duración:** 1 semana (2026-05-20 → 2026-05-26)  
**Criterio de cierre:** Test E2E Agency→Dept→Workspace→Agent (4 RunSteps en BD).  
**Depende de:** Milestone F1b.

- [ ] **F2a-01** · Reescribir `HierarchyOrchestrator.delegate()` (crea RunStep en BD)
  - Módulo: `packages/hierarchy/src/hierarchy-orchestrator.service.ts`
  - Labels: `phase:F2a`, `priority:blocker`, `area:backend`
  - Depende de: F0-05, F1a-05, F1a-06
- [ ] **F2a-02** · Implementar `getStepStatus()` (lee `RunStep.status` desde BD)
  - Módulo: `packages/hierarchy/src/hierarchy-orchestrator.service.ts`
  - Labels: `phase:F2a`, `priority:blocker`, `area:backend`
  - Depende de: F2a-01
- [ ] **F2a-03** · Implementar `routeTask()` (specialist local vs nivel inferior)
  - Módulo: `packages/hierarchy/src/hierarchy-orchestrator.service.ts`
  - Labels: `phase:F2a`, `priority:blocker`, `area:backend`
  - Depende de: F2a-01
- [ ] **F2a-04** · Implementar `findSpecialistWithCapability()` usando `profileJson`
  - Módulo: `packages/hierarchy/src/hierarchy-orchestrator.service.ts`
  - Labels: `phase:F2a`, `priority:blocker`, `area:backend`
  - Depende de: F2a-03
- [ ] **F2a-05** · Implementar `decomposeTask()` (LLM emite bloques DELEGATE)
  - Módulo: `packages/hierarchy/src/hierarchy-orchestrator.service.ts`
  - Labels: `phase:F2a`, `priority:blocker`, `area:backend`
  - Depende de: F1a-01, F2a-03
- [ ] **F2a-06** · Implementar `consolidateResults()` (`Promise.allSettled` de subtareas)
  - Módulo: `packages/hierarchy/src/hierarchy-orchestrator.service.ts`
  - Labels: `phase:F2a`, `priority:blocker`, `area:backend`
  - Depende de: F2a-05
- [ ] **F2a-07** · Implementar `isBlocked()` con `DELEGATION_TIMEOUT_MS`
  - Módulo: `packages/hierarchy/src/hierarchy-orchestrator.service.ts`
  - Labels: `phase:F2a`, `priority:urgent`, `area:backend`
  - Depende de: F2a-02
- [ ] **F2a-08** · Crear `HierarchyStatusService` (árbol de estado por `runId`)
  - Módulo: `packages/run-engine/src/hierarchy-status.service.ts`
  - Labels: `phase:F2a`, `priority:blocker`, `area:backend`
  - Depende de: F0-05
- [ ] **F2a-09** · Implementar `deriveParentStatus()` (propagación estado hacia arriba)
  - Módulo: `packages/run-engine/src/hierarchy-status.service.ts`
  - Labels: `phase:F2a`, `priority:blocker`, `area:backend`
  - Depende de: F2a-08
- [ ] **F2a-10** · Implementar `StatusChangeEvent` (emitir en cada transición `RunStep`)
  - Módulo: `packages/run-engine/src/events/status-change.event.ts`
  - Labels: `phase:F2a`, `priority:urgent`, `area:backend`
  - Depende de: F2a-08, F2a-09
- [ ] **F2a-11** · Endpoints `GET /api/runs/:id/status` y `/blocked`
  - Módulo: `apps/api/src/modules/runs/runs.controller.ts`
  - Labels: `phase:F2a`, `priority:urgent`, `area:backend`
  - Depende de: F2a-08…F2a-10
- [ ] **F2a-12** · Test E2E: Agency→Dept→Workspace→Agent (4 RunSteps en BD)
  - Módulo: `packages/hierarchy/src/_tests_/e2e/`
  - Labels: `phase:F2a`, `priority:required`, `area:testing`
  - Depende de: F2a-01…F2a-11

---

## FASE 2b — PROPAGACIÓN AUTOMÁTICA DE PERFILES
**Milestone:** `F2b — Propagación automática de perfiles`  
**Duración:** 3 días (puede correr en paralelo con F2a)  
**Criterio de cierre:** Test: agregar Agent specialist → system prompts actualizados en Workspace/Dept/Agency.  
**Depende de:** F0-04.

- [ ] **F2b-01** · Corregir `ProfilePropagatorService.propagateUp()` (solo orchestrators)
  - Módulo: `packages/hierarchy/src/profile-propagator.service.ts`
  - Labels: `phase:F2b`, `priority:blocker`, `area:backend`
  - Depende de: F0-04
- [ ] **F2b-02** · Implementar `findOrchestrator(workspace/department/agency)` en repos
  - Módulo: `packages/run-engine/src/repositories/`
  - Labels: `phase:F2b`, `priority:blocker`, `area:backend`
  - Depende de: F0-04
- [ ] **F2b-03** · Implementar `generateOrchestratorPrompt()` basado en capacidades de hijos
  - Módulo: `packages/hierarchy/src/profile-propagator.service.ts`
  - Labels: `phase:F2b`, `priority:blocker`, `area:backend`
  - Depende de: F2b-01, F2b-02
- [ ] **F2b-04** · Hook `AgentRepository.create/delete` → trigger `propagateUp()`
  - Módulo: `packages/run-engine/src/repositories/agent.repository.ts`
  - Labels: `phase:F2b`, `priority:blocker`, `area:backend`
  - Depende de: F2b-01…F2b-03
- [ ] **F2b-05** · Test: agregar Agent specialist → system prompts actualizados
  - Módulo: `packages/hierarchy/src/_tests_/`
  - Labels: `phase:F2b`, `priority:required`, `area:testing`
  - Depende de: F2b-01…F2b-04

---

## FASE 3a — GATEWAY NATIVO: WEBCHAT + TELEGRAM
**Milestone:** `F3a — Gateway WebChat + Telegram`  
**Duración:** 1 semana (2026-05-27 → 2026-06-02)  
**Criterio de cierre:** Test E2E mensaje Telegram → GatewaySession → AgentExecutor → respuesta.  
**Depende de:** F2a + F2b completadas.

- [ ] **F3a-01** · Crear `apps/gateway` como proceso NestJS separado
  - Módulo: `apps/gateway/`
  - Labels: `phase:F3a`, `priority:blocker`, `area:infra`
  - Depende de: F2a-12, F2b-05
- [ ] **F3a-02** · Implementar `IChannelAdapter` (`IncomingMessage`/`OutgoingMessage`)
  - Módulo: `apps/gateway/src/channels/channel-adapter.interface.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`
  - Depende de: F3a-01
- [ ] **F3a-03** · Implementar `WebChatAdapter` (WebSocket con ws)
  - Módulo: `apps/gateway/src/channels/webchat.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`
  - Depende de: F3a-02
- [ ] **F3a-04** · Implementar `TelegramAdapter` (grammY SDK)
  - Módulo: `apps/gateway/src/channels/telegram.adapter.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`
  - Depende de: F3a-02
- [ ] **F3a-05** · Implementar `SessionManager` (`GatewaySession` por canal+externalUserId)
  - Módulo: `apps/gateway/src/session/session-manager.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`
  - Depende de: F0-06, F3a-01
- [ ] **F3a-06** · Implementar `AgentResolver` (`ChannelBinding` → scope → agentId)
  - Módulo: `apps/gateway/src/agent-resolver.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`
  - Depende de: F0-04, F3a-01
- [ ] **F3a-07** · Implementar `MessageDispatcher` (llama AgentExecutor con historial)
  - Módulo: `apps/gateway/src/message-dispatcher.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`
  - Depende de: F1a-05, F1a-06, F3a-05, F3a-06
- [ ] **F3a-08** · Implementar `ChannelRouter` (registro adapters y routing entrante)
  - Módulo: `apps/gateway/src/channel-router.service.ts`
  - Labels: `phase:F3a`, `priority:blocker`, `area:backend`
  - Depende de: F3a-02, F3a-07
- [ ] **F3a-09** · WebSocket endpoint `status-stream` para runs
  - Módulo: `apps/gateway/src/runs/status-stream.gateway.ts`
  - Labels: `phase:F3a`, `priority:urgent`, `area:backend`
  - Depende de: F2a-08, F2a-10
- [ ] **F3a-10** · Test E2E: mensaje Telegram → GatewaySession → AgentExecutor → respuesta
  - Módulo: `apps/gateway/src/_tests_/e2e/`
  - Labels: `phase:F3a`, `priority:required`, `area:testing`
  - Depende de: F3a-03…F3a-09

---

## FASE 3b — SECURITY LAYER
**Milestone:** `F3b — Security layer`  
**Duración:** 3 días (paralelo con inicio F4a; bloquea producción)  
**Criterio de cierre:** JWT activo, AES-256-GCM activo, audit log activo.  
**Depende de:** F3a-01.

- [ ] **F3b-01** · Middleware Logto JWT validation
  - Módulo: `apps/gateway/src/middleware/logto-auth.middleware.ts`
  - Labels: `phase:F3b`, `priority:blocker`, `area:security`
  - Depende de: F3a-01
- [ ] **F3b-02** · Helmet con CSP + HSTS
  - Módulo: `apps/gateway/src/middleware/security.middleware.ts`
  - Labels: `phase:F3b`, `priority:blocker`, `area:security`
  - Depende de: F3a-01
- [ ] **F3b-03** · CORS con `ALLOWED_ORIGINS` whitelist
  - Módulo: `apps/gateway/src/middleware/security.middleware.ts`
  - Labels: `phase:F3b`, `priority:blocker`, `area:security`
  - Depende de: F3a-01
- [ ] **F3b-04** · Rate limiting por canal+externalUserId (60 req/min)
  - Módulo: `apps/gateway/src/middleware/security.middleware.ts`
  - Labels: `phase:F3b`, `priority:blocker`, `area:security`
  - Depende de: F3a-01
- [ ] **F3b-05** · AES-256-GCM encrypt/decrypt para `ChannelConfig.secretsEncrypted`
  - Módulo: `packages/utils/src/crypto.ts`
  - Labels: `phase:F3b`, `priority:blocker`, `area:security`
  - Depende de: F0-10
- [ ] **F3b-06** · AES-256-GCM para `N8nConnection.apiKeyEncrypted`
  - Módulo: `packages/utils/src/crypto.ts`
  - Labels: `phase:F3b`, `priority:blocker`, `area:security`
  - Depende de: F3b-05
- [ ] **F3b-07** · AuditEvent logger (`run.started`, `run.completed`, `channel.message`, `agent.created`)
  - Módulo: `apps/api/src/modules/audit/audit.service.ts`
  - Labels: `phase:F3b`, `priority:urgent`, `area:security`
  - Depende de: F0-10, F2a-08

---

## FASE 4a — INTEGRACIÓN N8N COMPLETA
**Milestone:** `F4a — Integración N8N completa`  
**Duración:** 1 semana (2026-06-03 → 2026-06-09)  
**Criterio de cierre:** Test E2E Flow con nodo `n8n_webhook` ejecuta workflow real y recibe respuesta.  
**Depende de:** F3b.

- [ ] **F4a-01** · `N8nService` completo (`syncWorkflows`, `triggerWorkflow`, `createWorkflow`)
  - Módulo: `packages/n8n-service/src/n8n.service.ts`
  - Labels: `phase:F4a`, `priority:blocker`, `area:backend`
  - Depende de: F1b-05…F1b-07
- [ ] **F4a-02** · CRUD `N8nConnection` en API REST
  - Módulo: `apps/api/src/modules/n8n/n8n-connections.controller.ts`
  - Labels: `phase:F4a`, `priority:blocker`, `area:backend`
  - Depende de: F4a-01
- [ ] **F4a-03** · `WebhookAdapter` para triggers n8n → agentes
  - Módulo: `apps/gateway/src/channels/webhook.adapter.ts`
  - Labels: `phase:F4a`, `priority:blocker`, `area:backend`
  - Depende de: F3a-01, F4a-01
- [ ] **F4a-04** · Nodo `N8nWorkflowNode` en canvas React Flow
  - Módulo: `apps/web/src/modules/studio/flows/nodes/N8nWorkflowNode.tsx`
  - Labels: `phase:F4a`, `priority:blocker`, `area:frontend`
  - Depende de: F6-01
- [ ] **F4a-05** · Panel de propiedades para nodo n8n (selector workflow + input mapping)
  - Módulo: `apps/web/src/modules/studio/flows/panels/N8nNodePanel.tsx`
  - Labels: `phase:F4a`, `priority:urgent`, `area:frontend`
  - Depende de: F4a-04
- [ ] **F4a-06** · Sincronización automática de workflows al guardar `N8nConnection`
  - Módulo: `apps/api/src/modules/n8n/n8n.service.ts`
  - Labels: `phase:F4a`, `priority:urgent`, `area:backend`
  - Depende de: F4a-01, F4a-02
- [ ] **F4a-07** · Test E2E: Flow con nodo `n8n_webhook` ejecuta workflow real y recibe respuesta
  - Módulo: `packages/n8n-service/src/_tests_/e2e/`
  - Labels: `phase:F4a`, `priority:required`, `area:testing`
  - Depende de: F4a-01…F4a-06

---

## FASE 4b — N8N STUDIO HELPER (AGENTBUILDER)
**Milestone:** `F4b — N8N Studio Helper`  
**Duración:** 1 semana (2026-06-10 → 2026-06-16)  
**Criterio de cierre:** Test prompt "crea workflow…" → Skill registrada en BD.  
**Depende de:** F4a.

- [ ] **F4b-01** · `N8nStudioHelper.createWorkflowFromDescription()` (genera spec + registra Skill)
  - Módulo: `apps/api/src/modules/builder-agent/n8n-studio-helper.ts`
  - Labels: `phase:F4b`, `priority:blocker`, `area:backend`
  - Depende de: F4a-01, F4a-07
- [ ] **F4b-02** · Tool `create_n8n_workflow` con JSON Schema
  - Módulo: `apps/api/src/modules/builder-agent/tools/`
  - Labels: `phase:F4b`, `priority:blocker`, `area:backend`
  - Depende de: F4b-01
- [ ] **F4b-03** · Tool `list_n8n_workflows`
  - Módulo: `apps/api/src/modules/builder-agent/tools/`
  - Labels: `phase:F4b`, `priority:urgent`, `area:backend`
  - Depende de: F4b-01
- [ ] **F4b-04** · Tool `assign_skill_to_agent` (registra `AgentSkill` + trigger propagate)
  - Módulo: `apps/api/src/modules/builder-agent/tools/`
  - Labels: `phase:F4b`, `priority:urgent`, `area:backend`
  - Depende de: F2b-04, F4b-01
- [ ] **F4b-05** · Test: prompt "crea workflow…" → Skill en BD
  - Módulo: `apps/api/src/modules/builder-agent/_tests_/`
  - Labels: `phase:F4b`, `priority:required`, `area:testing`
  - Depende de: F4b-01…F4b-04

---

## FASE 5 — CANALES ADICIONALES
**Milestone:** `F5 — Canales adicionales`  
**Duración:** 2 semanas (2026-06-17 → 2026-06-30)  
**Criterio de cierre:** Test E2E WhatsApp → GatewaySession → agente → respuesta.  
**Depende de:** F3a + F3b completadas.

- [ ] **F5-01** · Implementar `WhatsAppAdapter` (Baileys)
  - Módulo: `apps/gateway/src/channels/whatsapp.adapter.ts`
  - Labels: `phase:F5`, `priority:blocker`, `area:backend`
  - Depende de: F3a-01, F3b-02…F3b-04
- [ ] **F5-02** · Reconexión automática y session persistence en BD para WhatsApp
  - Módulo: `apps/gateway/src/channels/whatsapp.adapter.ts`
  - Labels: `phase:F5`, `priority:urgent`, `area:backend`
  - Depende de: F5-01
- [ ] **F5-03** · Implementar `SlackAdapter` (Slack Bolt)
  - Módulo: `apps/gateway/src/channels/slack.adapter.ts`
  - Labels: `phase:F5`, `priority:urgent`, `area:backend`
  - Depende de: F3a-02
- [ ] **F5-04** · Implementar `DiscordAdapter` (discord.js)
  - Módulo: `apps/gateway/src/channels/discord.adapter.ts`
  - Labels: `phase:F5`, `priority:optional`, `area:backend`
  - Depende de: F3a-02
- [ ] **F5-05** · UI de gestión de canales en Configuration Surface
  - Módulo: `apps/web/src/modules/studio/configuration/channels/`
  - Labels: `phase:F5`, `priority:blocker`, `area:frontend`
  - Depende de: F6-11…F6-13
- [ ] **F5-06** · Test E2E: mensaje WhatsApp → GatewaySession → agente → respuesta
  - Módulo: `apps/gateway/src/_tests_/e2e/whatsapp/`
  - Labels: `phase:F5`, `priority:required`, `area:testing`
  - Depende de: F5-01…F5-02

---

## FASE 6 — FRONTEND: CANVAS, OPERATIONS, CONFIG (continuo)
**Milestone:** `F6 — Frontend Canvas / Ops / Config`  
**Duración:** continuo desde F1a-09  
**Depende de:** F1a-09 (arranque), sub-dependencias indicadas por tarea.

### Builder Surface (Canvas)

- [ ] **F6-01** · Auditar estado real del canvas React Flow actual
  - Módulo: `apps/web/src/modules/studio/`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F1a-09
- [ ] **F6-02** · Implementar nodos mínimos (agent, tool, n8n_workflow, condition, input, output, approval, subflow)
  - Módulo: `apps/web/src/modules/studio/flows/nodes/`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F6-01
- [ ] **F6-03** · Panel de propiedades por tipo de nodo
  - Módulo: `apps/web/src/modules/studio/flows/panels/`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F6-02
- [ ] **F6-04** · Guardar `Flow.spec` en BD al modificar canvas
  - Módulo: `apps/web/src/modules/studio/flows/hooks/`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F0-05, F6-02
- [ ] **F6-05** · Sidebar de jerarquía (Agency→Dept→Workspace→Agent navegable)
  - Módulo: `apps/web/src/modules/studio/sidebar/`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F0-04

### Operations Surface (Runs tiempo real)

- [ ] **F6-06** · Timeline de runs activos con estado en tiempo real (`StatusChangeEvent`)
  - Módulo: `apps/web/src/modules/operations/RunTimeline.tsx`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F2a-10, F3a-09
- [ ] **F6-07** · Árbol de estado por run (Agency→Dept→Workspace→Agent con íconos)
  - Módulo: `apps/web/src/modules/operations/StatusTree.tsx`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F2a-08, F6-06
- [ ] **F6-08** · Panel de detalle de nodo (input, output parcial, tokens, tiempo)
  - Módulo: `apps/web/src/modules/operations/NodeDetail.tsx`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F6-07
- [ ] **F6-09** · Botón "Reintentar delegación" en nodos `blocked`
  - Módulo: `apps/web/src/modules/operations/BlockedNode.tsx`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F2a-07, F6-07
- [ ] **F6-10** · Panel de aprobaciones pendientes (`waiting_approval`)
  - Módulo: `apps/web/src/modules/operations/Approvals.tsx`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F2a-10

### Configuration Surface

- [ ] **F6-11** · Settings de modelo por scope (`ModelPolicy`)
  - Módulo: `apps/web/src/modules/configuration/ModelSettings.tsx`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F0-05
- [ ] **F6-12** · Budget policy por scope (`BudgetPolicy`)
  - Módulo: `apps/web/src/modules/configuration/BudgetSettings.tsx`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F0-05
- [ ] **F6-13** · Gestión de canales (`ChannelConfig` + `ChannelBinding`)
  - Módulo: `apps/web/src/modules/configuration/channels/`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F3a-01, F0-05
- [ ] **F6-14** · Gestión de conexiones n8n
  - Módulo: `apps/web/src/modules/configuration/N8nConnections.tsx`
  - Labels: `phase:F6`, `priority:normal`, `area:frontend`
  - Depende de: F4a-02
