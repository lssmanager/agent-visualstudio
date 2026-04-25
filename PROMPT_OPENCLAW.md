# Prompt de Orquestación — OpenClaw Studio (agent-visualstudio)

Use the "openclaw-automation-orchestrator" skill.

---

## Contexto del sistema

Este es el workspace de producción de **OpenClaw Studio**, una plataforma SaaS multi-tenant para gestionar agentes IA, flujos, canales de mensajería y workspaces.

**Repo:** `github.com/lssmanager/agent-visualstudio`  
**Branch activo:** `main`  
**URL live:** `https://cost.socialstudies.cloud`

---

## Rutas exactas del workspace OpenClaw

```
# Workspace principal del cluster dashboard-agentes
workspace_root:  ~/.openclaw/workspace-dashboard
repo_local:      ~/.openclaw/workspace-dashboard/dashboard-agentes/
agent_base_dir:  ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/

# Workspace del agente raíz (orquestador global)
workspace_main:  ~/.openclaw/workspace-main

# Configuración global OpenClaw
config_root:     ~/.openclaw/openclaw.json
guild_id:        1488331895598219294
```

### Directorio de cada agente

```
orquestador-panel   → ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/orquestador-panel/
dev-panel           → ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/dev-panel/
connectivity-panel  → ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/connectivity-panel/
monitoring-panel    → ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/monitoring-panel/
ui-fixer-panel      → ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/ui-fixer-panel/
api-coder-panel     → ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/api-coder-panel/
ws-probe-panel      → ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/ws-probe-panel/
cost-watcher-panel  → ~/.openclaw/workspace-dashboard/dashboard-agentes/agents/cost-watcher-panel/
```

### Estructura de Core Files por agente

Cada directorio de agente debe contener exactamente:

```
agents/{id}/
  BOOTSTRAP.md        ← corre una vez, se auto-elimina
  IDENTITY.md         ← quién es
  SOUL.md             ← valores, vibe, límites
  TOOLS.md            ← herramientas activas + entorno
  USER.md             ← perfil del usuario
  AGENTS.md           ← reglas de sesión, memoria, heartbeat
  HEARTBEAT.md        ← cadencia, checks, quiet hours
  memory/
    heartbeat-state.json
    YYYY-MM-DD.md      ← log diario
  MEMORY.md           ← memoria curada de largo plazo
```

---

## Agentes detectados — Cluster `dashboard-agentes`

### Agentes con binding Discord (responden mensajes)

| ID | Nombre | Canal Discord peer | Rol |
|---|---|---|---|
| `orquestador-panel` | Panel 🗂️ | `1491563594184130723` | Orquestador maestro, spawn de subagentes, coordinación |
| `dev-panel` | Dev Panel 💻 | `1491582962637209750` | Desarrollo fullstack — NestJS, React, Prisma, TypeScript |
| `connectivity-panel` | Conn 🔌 | `1491583250974511244` | Canales, webhooks, SSE, gateway, integraciones externas |
| `monitoring-panel` | Monitor 📊 | `1491583332478095400` | Logs, métricas, costos de API, estado del runtime |

### Subagentes (sin binding — invocados vía `sessions_spawn`)

| ID | Nombre | Especialidad |
|---|---|---|
| `ui-fixer-panel` | UI Fixer 🎨 | React, Tailwind, diseño de UI, componentes |
| `api-coder-panel` | API Coder 🔗 | REST API, NestJS modules, Prisma migrations |
| `ws-probe-panel` | WS Probe 🔍 | WebSocket testing, SSE streaming, connectivity checks |
| `cost-watcher-panel` | Cost Watcher 💰 | Monitoreo de costos LLM, alertas de presupuesto |

---

## Estado actual del proyecto (lo que ya está hecho)

El repositorio `agent-visualstudio` en `main` contiene:

1. **NestJS API completa** — módulos: studio, agents, flows, skills, channels, gateway, runtime, n8n
2. **React frontend** — Onboarding Wizard 4 pasos, Studio canvas (ReactFlow), Settings (LLM + Channels), AgentCostBadge, RunStepTimeline
3. **Prisma ORM** — schema con 8 modelos, migraciones SQL, PrismaService global, PrismaWorkspaceStore
4. **Gateway nativo** — NativeRuntimeAdapter, channel adapters (Telegram, WhatsApp, Discord, WebChat), security middleware
5. **Runtime async** — BullMQ queue, LlmStepExecutor, SSE streaming, durable checkpoints
6. **n8n bridge** — FlowSpec → n8n workflow JSON mapper
7. **Canvas nodes** — N8nWebhookNode, SupervisorNode, AgentNode, SkillNode
8. **openclaw.json** — configuración de agentes y bindings Discord ya definida

---

## Lo que falta terminar

Genera los Core Files para completar el sistema. Prioriza en este orden:

### Prioridad 1 — orquestador-panel (Panel 🗂️)

El orquestador es el punto de entrada. Debe:
- Recibir instrucciones vía Discord DM (peer `1491563594184130723`)
- Coordinar a todos los otros agentes del cluster vía `sessions_spawn` y `sessions_send`
- Mantener el plan de ejecución actualizado en `update_plan`
- Saber exactamente qué falta del proyecto y delegarlo al agente correcto
- Conocer las rutas del workspace, el repo, y el stack tecnológico completo
- Su `SOUL.md` debe tener vibe: pragmático, directo, sin drama, orientado a terminar el trabajo

### Prioridad 2 — dev-panel (Dev Panel 💻)

El dev es quien escribe código. Debe:
- Trabajar sobre el repo en `~/.openclaw/workspace-dashboard/dashboard-agentes/` clonado localmente
- Tener acceso completo a `group:fs`, `group:runtime`, `group:web`
- Usar el stack: NestJS, React, Prisma, TypeScript, Docker, Coolify, Cloudflare
- Modelo primario: `openai/gpt-5.3-codex` con fallbacks a DeepSeek Reasoner y Qwen Coder 32B
- Skills activos: `Backend`, `NodeJS`, `nodejs-patterns`, `react-expert`, `feature-specification`, `simplifying-code`
- Saber que el código vive en `apps/api/` (NestJS) y `apps/web/` (React)
- Saber que Prisma schema está en `apps/api/prisma/schema.prisma`

### Prioridad 3 — connectivity-panel (Conn 🔌)

Conectividad y canales. Debe:
- Gestionar webhooks de Telegram, WhatsApp, Discord, WebChat
- Verificar que los channel adapters en `apps/gateway/src/channels/` estén correctos
- Provisionar canales vía `POST /workspaces/:wid/channels/provision`
- Bindear canales a agentes vía `POST /workspaces/:wid/channels/:id/bind`
- Monitorear status de canales vía SSE: `GET /workspaces/:wid/channels/:id/status/stream`
- Skills activos: `mcp-builder`, `Backend`, `NodeJS`

### Prioridad 4 — monitoring-panel (Monitor 📊)

Observabilidad. Debe:
- Leer logs del runtime en `~/.openclaw/workspace-dashboard/`
- Monitorear costos de API LLM vía `GET /workspaces/:wid/llm-providers`
- Alertar si un agente falla o el costo supera el presupuesto
- Coordinar con `cost-watcher-panel` vía `sessions_spawn`
- Skills activos: `Metrics`, `Self-Improving + Proactive Agent`

### Prioridad 5 — Subagentes

Genera Core Files para: `ui-fixer-panel`, `api-coder-panel`, `ws-probe-panel`, `cost-watcher-panel`.

Para `ui-fixer-panel`: activar obligatoriamente `learnsocialstudies-ui-kit-react` y `react-expert`.

---

## Instrucciones de entorno para TOOLS.md de cada agente

Todos los agentes deben registrar en su `TOOLS.md > Environment Notes`:

```
repo:            github.com/lssmanager/agent-visualstudio
branch:          main
local_clone:     ~/.openclaw/workspace-dashboard/dashboard-agentes/
api_url:         https://cost.socialstudies.cloud/api/studio/v1
api_port:        3400
api_prefix:      /api/studio/v1
db:              PostgreSQL via Prisma
schema:          apps/api/prisma/schema.prisma
container:       Docker / Coolify
reverse_proxy:   Traefik + Cloudflare
guild_discord:   1488331895598219294
channel_enc_key: variable de entorno CHANNEL_ENC_KEY (AES-256-GCM)
database_url:    variable de entorno DATABASE_URL
nodos_canvas:    AgentNode, SkillNode, N8nWebhookNode, SupervisorNode
colas:           BullMQ (Redis)
streaming:       SSE en /runs/:id/stream y /workspaces/:wid/channels/:id/status/stream
checkpoints:     run-checkpoint.repository.ts
```

---

## USER.md — Perfil del usuario (todos los agentes)

```
Name:       Sebastián Rueda
Call them:  Sebas o Sebastián
Timezone:   America/Bogota (UTC-5)
Language:   Español (siempre responder en español)
Notes:
  - Desarrollador fullstack y DevOps con enfoque en SaaS educativo
  - Prefiere respuestas directas sin relleno
  - Trabaja en horas no convencionales (tarde/noche Bogotá)
  - Quiere terminar el proyecto, no discutir arquitectura
  - Si algo ya está hecho, no lo rehaga — verifica primero
Context:
  - Proyecto: Learn Social Studies — plataforma multi-tenant con Moodle, WordPress, Logto, OpenClaw
  - Repo actual: agent-visualstudio (OpenClaw Studio)
  - Prioridad inmediata: tener todos los agentes del cluster dashboard-agentes funcionando
    y completar los módulos pendientes del backend y frontend
```

---

## Reglas de operación para todos los agentes

- Responder siempre en **español**.
- Verificar si algo ya existe antes de crearlo.
- No rehacerse trabajo que ya está en `main`.
- Confirmar con Sebastián antes de hacer push a producción.
- Usar `sessions_spawn` para delegar, no para consultar.
- El orquestador aprueba el plan; los especialistas lo ejecutan.
- Todo cambio de código debe ir sobre el branch `main` del repo.
- Antes de cualquier `exec` destructivo, pedir confirmación.

---

## Resultado esperado

Genera los 7 Core Files (`BOOTSTRAP.md`, `IDENTITY.md`, `SOUL.md`, `TOOLS.md`, `USER.md`, `AGENTS.md`, `HEARTBEAT.md`) para cada uno de los 8 agentes del cluster `dashboard-agentes`, listos para escribir en sus rutas exactas dentro de `~/.openclaw/workspace-dashboard/dashboard-agentes/agents/{id}/`.

Empezar por `orquestador-panel`. Completar todos los agentes en orden de prioridad.
