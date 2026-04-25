# Agent Visual Studio

> **Visual Studio de Agentes IA** — Plataforma SaaS para construir, orquestar y desplegar jerarquías de agentes IA con canales multicanal propios, flow builder visual, integración n8n y base de datos robusta. Sin archivos `.env` para el usuario. Ready to use desde el primer login.

**Live:** https://cost.socialstudies.cloud
**Branch:** `master`

---

## ¿Qué es esto?

Un **Visual Studio de agentes IA** — no un chatbot, no un wrapper de OpenAI. Es una plataforma completa para que equipos y empresas construyan, administren y escalen jerarquías de agentes IA que operan de forma autónoma en múltiples canales (Telegram, WhatsApp, Discord, WebChat, Microsoft Teams).

### El problema que resuelve

Configurar agentes IA hoy requiere editar archivos JSON/Markdown, hacer SSH al servidor, gestionar `.env` manualmente y reiniciar procesos. Este proyecto elimina todo eso: **la UI es el único punto de control**.

---

## Jerarquía de Orquestación

El sistema opera con 5 niveles jerárquicos. Cada nivel orquesta hacia abajo y consolida resultados hacia arriba:

```
Agency          ← Orquestador raíz. Recibe tareas globales y las distribuye.
  └── Department    ← Especialización por área (Marketing, RRHH, TI, Finanzas...)
        └── Workspace    ← Conjunto de agentes para una función específica
              └── Agent       ← Agente con modelo, canal, tools y skills propios
                    └── Subagent  ← Agente auxiliar especializado en subtareas
```

### Ejemplo real
Un mensaje a la **Agency** pidiendo "informe de gastos Q1, riesgos de seguridad y una presentación" desencadena:
- **Department Finanzas** → analiza gastos → devuelve informe
- **Department TI** → evalúa riesgos → devuelve análisis
- **Department Marketing** → crea presentación → devuelve slides
- **Agency** consolida los tres resultados y responde al usuario

### Propagación automática de roles (`ProfilePropagatorService`)
Cuando se agrega un nuevo agente a un nivel (ej: "Spotify Ads" al Department de Marketing), el sistema **recalcula automáticamente** el system prompt del Department y de la Agency para incluir esa nueva capacidad. Los orquestadores siempre saben qué pueden delegar.

---

## Definición de Agentes — Formato YAML (CrewAI-inspired)

Cada agente se define con tres campos semánticos que alimentan su system prompt automáticamente. La UI del Agent Editor mapea estos campos a formulario visual, y el backend serializa a DB:

```yaml
# Ejemplo: Agent Editor → agents.yaml interno → DB row
research_agent:
  role: >
    Senior Investigador de Mercados
  goal: >
    Descubrir tendencias emergentes en {sector} con datos verificables
  backstory: >
    Analista con 10 años de experiencia en inteligencia de mercado.
    Conocido por convertir datos complejos en insights accionables.
  model: gpt-4o
  channel: telegram
  tools: [web_search, file_reader]
```

- **`role`** — Título y especialización. Define el scope de lo que sabe hacer.
- **`goal`** — Objetivo principal. Guía cada decisión del agente.
- **`backstory`** — Contexto narrativo. Mejora la consistencia del comportamiento.

---

## Modos de Ejecución de Crews

Inspirado en `CrewAI Process`, el runtime soporta dos modos configurables desde el Agent Editor:

| Modo | Descripción | Cuándo usar |
|---|---|---|
| **Sequential** | Los agentes ejecutan en orden, pasando output como input del siguiente | Pipelines lineales predecibles |
| **Hierarchical** | Un agente Manager delega tareas, valida resultados y reintenta si es necesario | Tareas complejas que requieren coordinación |

El modo **Hierarchical** usa un `SupervisorNode` en el Flow Builder que actúa como manager automático: recibe el objetivo, descompone en subtareas, asigna a los agentes disponibles en el scope y valida la salida antes de consolidar.

---

## Stack Técnico

### Estado actual
```
Browser
  │  HTTPS
  ▼
Cloudflare → Traefik → Express (port 3400)
                          ├── /api/studio/v1/*   API routes
                          ├── /*                 React SPA
                          └── templates/         Config en archivos .md/.json
```

### Arquitectura objetivo
```
Browser
  │  HTTPS
  ▼
Cloudflare → Traefik → NestJS API (port 3400)
                          ├── /api/v1/*           REST API
                          ├── /channels/ws/*      WebSocket (WebChat)
                          ├── /channels/teams/*   Teams Webhook
                          ├── /*                  React SPA
                          │
                          ├── PostgreSQL (Prisma)  ← Config + sessions + runs + checkpoints
                          ├── Redis                ← WS sessions + BullMQ queues
                          └── n8n (integración)    ← Workflow automation
```

| Capa | Tecnología | Estado |
|---|---|---|
| Backend | Express.js → **NestJS** + TypeScript | 🔄 Migrando |
| Frontend | React + Vite + Tailwind CSS | 🔄 En desarrollo |
| Base de datos | Archivos `.md/.json` → **PostgreSQL + Prisma** | 📋 Planeado |
| Auth | Sin auth → **Logto OIDC** | 📋 Planeado |
| Task queues | Sin queues → **BullMQ + Redis** | 📋 Planeado |
| Run persistence | Sin checkpoints → **LangGraph PostgresSaver pattern** | 📋 Planeado |
| Config storage | `.env` / archivos → **GUI en DB cifrada** | 📋 Planeado |

---

## Canales Soportados (Gateway Propio)

El sistema **no depende de OpenClaw como gateway externo** — implementa sus propios adaptadores de canal. Cada canal se configura desde la UI con un wizard visual. Cero archivos `.env` para el usuario final.

| Canal | SDK | Auth en UI | Estado |
|---|---|---|---|
| **WebChat** | WebSocket nativo | Sin credenciales | 📋 Planeado |
| **Telegram** | grammY | Bot Token (1 campo) | 📋 Planeado |
| **Discord** | discord.js | Token + App ID + Guild ID | 📋 Planeado |
| **WhatsApp** | Baileys | QR scan en pantalla | 📋 Planeado |
| **Microsoft Teams** | botbuilder | Azure App ID + Secret | 📋 Planeado |

### Auto-bind scope ↔ canal
Cuando se configura un canal en cualquier nivel de la jerarquía, el sistema:
1. Cifra las credenciales (AES-256-GCM) antes de guardar en DB
2. Inicia el adaptador del canal en background
3. Crea el binding `scope ↔ channel` automáticamente
4. Emite el estado del bot en tiempo real via SSE a la UI

---

## Base de Datos — Modelo Principal

```
Agency ──< Department ──< Workspace ──< Agent ──< Subagent
                                                      │
ChannelConfig ──< ChannelBinding ──────────────────── ┘
LlmProvider ──────────────────────────────────────────┘
Flow ──< FlowNode ──< FlowEdge
Run ──< RunStep (checkpoint_data JSONB)   ← LangGraph PostgresSaver pattern
BudgetConfig
AuditEvent
PendingApproval                           ← Human-in-the-loop interrupts
```

Toda la configuración (credenciales de canales, API keys de proveedores LLM, configuración de agentes, historial de runs) vive en **PostgreSQL con Prisma**. Las credenciales sensibles se cifran con AES-256-GCM antes de persistir.

### `RunStep` — Checkpointing (LangGraph-inspired)

Cada paso de ejecución persiste su estado completo en `checkpoint_data` (JSONB). Si un run falla en el paso 15 de 20, el sistema **reanuda desde el paso 15** sin reejecutar los anteriores:

```prisma
model RunStep {
  id              String   @id @default(cuid())
  runId           String
  stepIndex       Int
  nodeId          String
  status          StepStatus  // pending | running | completed | failed | interrupted
  inputSnapshot   Json     // Estado de entrada del nodo
  outputSnapshot  Json?    // Estado de salida (null si aún no completó)
  checkpoint_data Json?    // Snapshot completo del grafo para reanudar (PostgresSaver pattern)
  interruptReason String?  // Razón de pausa si status = interrupted
  createdAt       DateTime @default(now())
  completedAt     DateTime?

  run             Run      @relation(fields: [runId], references: [id])
  pendingApproval PendingApproval?

  @@index([runId, stepIndex])
}
```

---

## Durable Execution — Runs que sobreviven fallos

Inspirado en el patrón **LangGraph StateGraph + PostgresSaver**, el runtime implementa ejecución duradera:

```
Run creado
    │
    ▼
RunStep 1 → checkpoint guardado en DB ✓
    │
    ▼
RunStep 2 → checkpoint guardado en DB ✓
    │
    ▼
RunStep 3 → fallo de red / crash del servidor
    │
    ▼ (reinicio del sistema)
    │
    ├── BullMQ detecta job sin ACK
    ▼
RunStep 3 → reanuda desde checkpoint_data del paso anterior ✓
    │
    ▼
RunStep 4... continúa normalmente
```

**Beneficio clave:** Un run de análisis de 30 minutos que falla al minuto 28 no se reinicia desde cero — continúa desde el último checkpoint guardado.

---

## Human-in-the-Loop — Interrupts y Aprobaciones

El nodo `HumanApprovalNode` en el Flow Builder implementa el patrón `interrupt()` de LangGraph. Cuando un agente llega a ese nodo:

1. El `RunStep` cambia a `status: "interrupted"` con `interruptReason`
2. Se crea un registro en `PendingApproval` con el contexto completo
3. SSE notifica al frontend → aparece en el panel **Operations → Pending Actions**
4. El usuario revisa, aprueba o rechaza con comentario desde la UI
5. El run **reanuda exactamente desde ese punto** con la decisión incorporada al estado

```
Flow en ejecución:
  [AgentNode] → [ToolNode] → [HumanApprovalNode] → PAUSA
                                                        │
                                  UI muestra: "¿Aprobar envío de email masivo?"
                                  Context: {draft: "...", recipients: 1240}
                                                        │
                                    Usuario: [ Aprobar ] o [ Rechazar + nota ]
                                                        │
                                              [EmailSenderNode] → continúa
```

---

## Flow Builder Visual

Canvas React Flow para construir lógicas de automatización visual:

| Tipo de nodo | Función |
|---|---|
| `LLMCallNode` | Llamada a modelo con prompt configurable |
| `ToolCallNode` | Ejecución de tool/skill del agente |
| `ConditionNode` | Bifurcación por condición (`@router` pattern — CrewAI inspired) |
| `LoopNode` | Iteración sobre colecciones |
| `SubagentNode` | Delegación a subagente |
| `SupervisorNode` | Manager jerárquico que delega y valida (`Process.hierarchical` — CrewAI inspired) |
| `N8nWorkflowNode` | Trigger de workflow n8n |
| `HumanApprovalNode` | Pausa para aprobación humana (`interrupt()` — LangGraph inspired) |
| `StateNode` | Nodo que lee/escribe variables del StateGraph global del run |

### `ConditionNode` — Router condicional

Inspirado en el decorador `@router` de CrewAI Flows. Evalúa el estado actual del run y emite a una de N ramas:

```
[AnálisisNode] → [ConditionNode: confianza del resultado]
                      │
            ┌─────────┼──────────┐
            ▼         ▼          ▼
       alta (>0.8)  media    baja (<0.4)
            │         │          │
    [EjecutarNode] [RevisarNode] [ReintentarNode]
```

---

## Integración n8n

Los agentes pueden crear y ejecutar workflows de n8n directamente desde el Studio:

- **`N8nService`** — sync de workflows, trigger y creación via API
- **`N8nStudioHelper`** — crear flows n8n desde lenguaje natural dentro del Agent Builder
- **Nodo `N8nWorkflowNode`** en el canvas — conectar un agente a cualquier workflow existente
- Los workflows de n8n quedan disponibles como **Skills registrables** en cualquier agente

---

## Onboarding Wizard (Zero .env)

Al primer login, wizard de 4 pasos obligatorios antes de acceder al dashboard:

```
Step 1: Crear Agency         → Nombre, descripción, logo
Step 2: Proveedores LLM      → Cards: OpenAI / Anthropic / OpenRouter / ModelStudio
                               Cada card: campo API Key + botón "Probar conexión"
Step 3: Canales iniciales    → Wizard de canal (opcional, puede omitir)
Step 4: Primer agente        → Nombre + prompt + asignar provider y canal
                                        ↓
                              [ Ir al Dashboard ] — sistema funcionando
```

**El único `.env` del servidor** es `MASTER_ENCRYPTION_KEY` (generado 1 vez en el deploy). Todo lo demás es configuración visual en base de datos.

---

## Roadmap de Implementación

### S0 — Build Gate (3 días)
- [ ] Resolver compile error en `dashboard.service.ts` (campo `priority` faltante)
- [ ] Prisma schema completo + primera migración PostgreSQL
- [ ] Incluir tabla `RunStep` con campo `checkpoint_data` (JSONB) desde el inicio

### S1 — Runtime Real (1 semana)
- [ ] `LLMStepExecutor.executeAgent()` — agentes que hablan con LLMs de verdad
- [ ] `RunRepository` migrado de JSON a PostgreSQL
- [ ] `CheckpointService` — guardar/restaurar `checkpoint_data` en cada step

### S2 — Jerarquía + Supervisor (1 semana)
- [ ] `HierarchyOrchestrator` — GroupChat pattern (AutoGen-inspired)
- [ ] `ProfilePropagatorService` — auto-recálculo de prompts al agregar agentes
- [ ] `SupervisorNode` — Process.hierarchical con manager agent (CrewAI-inspired)
- [ ] Definición de agentes con campos `role`, `goal`, `backstory` en Agent Editor

### S3 — Gateway Propio (1 semana)
- [ ] WebChat WebSocket + auto-bind
- [ ] Telegram adapter (grammY)
- [ ] Channel settings GUI + SSE status en tiempo real
- [ ] Logto auth en todos los endpoints

### S4 — Discord + n8n (1 semana)
- [ ] Discord adapter (discord.js) + slash commands
- [ ] `N8nService` + nodo n8n en canvas

### S5 — WhatsApp + Teams (2 semanas)
- [ ] WhatsApp Baileys + QR flow en UI
- [ ] Microsoft Teams (botbuilder + Azure) + Adaptive Cards

### S6 — Flow Builder funcional (2 semanas)
- [ ] Nodos funcionales en React Flow canvas
- [ ] `ConditionNode` con router condicional (CrewAI @router inspired)
- [ ] `HumanApprovalNode` con interrupt/resume (LangGraph inspired)
- [ ] `StateNode` para variables del run graph
- [ ] Serialización a DB + ejecución real con checkpointing

### S7 — Control Plane completo (2 semanas)
- [ ] Settings/Connections/Editor/Operations completamente funcionales
- [ ] Panel **Pending Actions** en Operations — aprobaciones en tiempo real
- [ ] Onboarding wizard completo
- [ ] Dashboard con métricas consolidadas
- [ ] Durable execution: BullMQ + checkpoint resume en fallos

---

## Inspiración Arquitectónica

| Proyecto | Patrón tomado |
|---|---|
| [microsoft/autogen](https://github.com/microsoft/autogen) | GroupChat, ConversableAgent, termination conditions |
| [microsoft/semantic-kernel](https://github.com/microsoft/semantic-kernel) | SequentialPlanner, Skills pattern |
| [flowiseai/flowise](https://github.com/flowiseai/flowise) | Node types con `inputParameters` + `init()`, ChatFlow storage |
| [TheCraigHewitt/hermes-chief-of-staff](https://github.com/TheCraigHewitt/hermes-chief-of-staff) | Chief-of-staff pattern, human approval flow |
| [microsoft/agent-framework](https://github.com/microsoft/agent-framework) | AgentCapability interface contract |
| [n8n-io/n8n](https://github.com/n8n-io/n8n) | Node structure, workflow serialization |
| [openclaw.ai](https://docs.openclaw.ai) | Channel adapters, providers, tools/skills patterns |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | **StateGraph** para runs tipados, **PostgresSaver** para durable execution, **`interrupt()`** para Human-in-the-loop |
| [crewaiinc/crewai](https://github.com/crewaiinc/crewai) | **`role+goal+backstory`** YAML para definición de agentes, **`Process.hierarchical`** para SupervisorNode, **`@router`** para ConditionNode |

---

## Estructura del Proyecto

```
├── apps/
│   ├── api/src/
│   │   ├── main.ts
│   │   ├── server.ts
│   │   └── modules/
│   │       ├── channels/          ← Gateway propio (Telegram, WhatsApp, Discord, Teams, WebChat)
│   │       │   └── adapters/      ← Un adapter por canal
│   │       ├── hierarchy/         ← HierarchyOrchestrator + ProfilePropagator
│   │       ├── runtime/           ← BullMQ executor, LLMStepExecutor, CheckpointService
│   │       ├── flows/             ← Flow engine + StateGraph runtime
│   │       ├── approvals/         ← PendingApproval + interrupt/resume logic
│   │       ├── n8n/               ← N8nService + N8nStudioHelper
│   │       ├── config/            ← EffectiveConfigService (lee de DB, no de .env)
│   │       ├── crypto/            ← CredentialsCryptoService (AES-256-GCM)
│   │       ├── profiles/
│   │       ├── workspaces/
│   │       ├── compile/
│   │       ├── deploy/
│   │       ├── gateway/
│   │       ├── audit/
│   │       ├── budgets/
│   │       └── studio/
│   └── web/src/
│       └── features/
│           ├── studio/            ← StudioPage, Canvas, Sidebar, Toolbar
│           ├── onboarding/        ← Wizard 4 pasos (ready to use)
│           ├── settings/          ← ChannelSettingsTab, LLM providers GUI
│           ├── agents/            ← AgentEditor con jerarquía + role/goal/backstory
│           ├── flows/             ← FlowCanvas (React Flow) con todos los nodos
│           ├── operations/        ← Runs, Pending Actions, replay, tokens, costos
│           ├── analytics/         ← Dashboard métricas consolidadas
│           ├── canvas/
│           ├── sessions/
│           ├── skills/
│           └── workspaces/
├── packages/
│   ├── core-types/
│   ├── schemas/
│   ├── profile-engine/
│   └── workspace-engine/
├── prisma/
│   └── schema.prisma              ← Modelo de datos completo
├── templates/                     ← Plantillas de agentes en Markdown
├── package.json
├── tsconfig.json
├── nixpacks.toml
└── docs/
    └── adr/                       ← Architecture Decision Records
```

---

## Deployment (Coolify)

| Setting | Value |
|---|---|
| **Branch** | `master` |
| **Build** | `npm install && npm run build` |
| **Start** | `npm start` |
| **Port** | 3400 |
| **Health Check** | `GET /api/studio/v1/studio/state` |

### Variables de Entorno del Servidor

| Variable | Propósito |
|---|---|
| `PORT` | Puerto del servidor (default: 3400) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (BullMQ + sessions) |
| `MASTER_ENCRYPTION_KEY` | Clave AES-256 para cifrar credenciales en DB (hex, 64 chars) |
| `LOGTO_ENDPOINT` | URL de tu instancia Logto |
| `LOGTO_APP_ID` | App ID de Logto |
| `NODE_ENV` | `production` en deploy |

> **Nota:** Las API keys de LLM providers, tokens de bots de canales y demás credenciales de usuario se configuran desde la UI y se guardan cifradas en la base de datos. No van en variables de entorno.

---

## Branch Strategy

| Branch | Propósito |
|---|---|
| `master` | Producción. Branch único principal. |
| `legacy-main-backup` | Snapshot archivado del código pre-Studio. Solo lectura. |
