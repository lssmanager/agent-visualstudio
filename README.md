# Agents VisualStudio

Plataforma de gestión de agentes IA, flujos, canales de mensajería y workspaces. Lista para usar **sin editar `.env` manualmente** gracias al Onboarding Wizard y al almacenamiento de API keys cifradas en base de datos.

**Live:** https://cost.socialstudies.cloud  
**Repo:** https://github.com/lssmanager/agent-visualstudio  
**Branch:** `main`

---

## Clonado con Submódulos

Este repositorio usa **git submodules**. Si clonas sin inicializarlos, `vendor/agency-agents/` quedará vacía.

### Clonar desde cero (recomendado)

```bash
git clone --recurse-submodules https://github.com/lssmanager/agent-visualstudio
```

### Si ya clonaste sin submódulos

```bash
git submodule update --init --recursive
```

### Qué contiene `vendor/agency-agents/`

Repositorio externo [`msitarzewski/agency-agents`](https://github.com/msitarzewski/agency-agents) con templates de agentes por departamento:

```
vendor/agency-agents/
  engineering/           ← departamento de ingeniería
    engineering-code-reviewer.md
    ...
  marketing/
  ...
```

- Cada **carpeta** = un departamento
- Cada **archivo `.md`** = un template de agente
- Estos templates se usarán como presets del canvas en fases posteriores (F6b)

---

## Arquitectura

```
Browser
  │
  │  HTTPS
  ▼
Cloudflare → Traefik → NestJS API (port 3400)
                          │
                          ├── /api/*                 REST endpoints (NestJS)
                          ├── /*                     React SPA (Vite build)
                          │
                          ├── PostgreSQL (Prisma)    Workspace, Agents, Flows,
                          │                          Skills, Policies, Hooks,
                          │                          Channels, LlmProviders
                          └── .openclaw-studio/      Fallback JSON/YAML (legacy)
```

### Stack completo

| Capa | Tecnología |
|---|---|
| **Backend** | NestJS + TypeScript (`apps/api/src/`) |
| **Frontend** | React + Vite + Tailwind CSS (`apps/web/src/`) |
| **Base de datos** | PostgreSQL via Prisma ORM |
| **Cifrado** | AES-256-GCM para tokens de canales y API keys LLM |
| **Tiempo real** | SSE (Server-Sent Events) para estado de canales |
| **Mensajería** | Telegram, WhatsApp, Discord, WebChat |
| **Packages** | `core-types`, `workspace-store`, `flow-engine`, `run-engine`, `gateway-sdk` |

---

## Arquitectura Gateway

El sistema gateway tiene dos componentes con nombres similares pero roles distintos:

### `apps/gateway/` - Runtime del Gateway

Proceso separado que recibe mensajes entrantes de Telegram, WebChat y otros canales.

```text
apps/gateway/src/
  SessionManager        Ciclo de vida de sesiones
  MessageDispatcher     Orquestación de mensajes entrantes
  ChannelRouter         Routing por tipo de canal
  status-stream         WebSocket push para estado en tiempo real
```

### `apps/api/src/modules/gateway/` - Proxy HTTP dentro de la API

Cliente del proceso gateway. La API usa este módulo para consultar el estado del gateway y controlar canales desde el panel de administración.

```text
apps/api/src/modules/gateway/
  GatewayService        Proxy REST hacia studioConfig.gatewayBaseUrl
  AgentResolverService  Resolver ChannelBinding -> agentId con cache TTL
```

### Regla de oro

> Si buscas lógica de sesiones, routing o despacho, ve a `apps/gateway/src/`.
> Si buscas control del gateway desde la API, ve a `apps/api/src/modules/gateway/`.

---

## Quick Start

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno (ver sección Variables)
cp .env.example .env
# Editar solo DATABASE_URL y CHANNEL_ENC_KEY

# 3. Generar cliente Prisma y correr migraciones
npx prisma generate
npx prisma migrate deploy

# 4. Build y arranque
npm run build
npm start
# → API escuchando en :3400
```

### Desarrollo

```bash
npm run dev        # Backend con ts-node (watch)
npm run dev:web    # Frontend Vite dev server (proxia /api → :3400)
```

### Deploy con Docker / Coolify

Este repo ya puede desplegarse con `Dockerfile` explícito en Coolify.

Arquitectura recomendada en Coolify:
- **App container:** este repo (`Dockerfile`)
- **PostgreSQL:** servicio separado
- **Redis/cache:** servicio separado si el runtime/colas lo requieren

Variables mínimas en Coolify:
- `DATABASE_URL`
- `CHANNEL_ENC_KEY`
- `PORT=3400`
- `STUDIO_API_PORT=3400`
- opcional: `GATEWAY_ADAPTER_URL`

Comportamiento del contenedor:
- genera Prisma Client al arrancar
- ejecuta `prisma migrate deploy`
- levanta el API en `:3400`
- sirve la SPA ya compilada desde `apps/web/dist`

---

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CHANNEL_ENC_KEY` | ✅ | Exactamente 32 caracteres — clave AES-256-GCM |
| `PORT` | No (def. 3400) | Puerto del servidor |
| `NODE_ENV` | No (def. development) | `production` para builds optimizados |
| `STUDIO_API_PREFIX` | No (def. `/api/studio/v1`) | Prefijo de rutas API |

> ⚠️ **Las API keys de LLM y tokens de canales NO van en `.env`.**  
> Se configuran desde el Onboarding Wizard o Settings → LLM Keys / Channels,  
> se cifran con AES-256-GCM y se almacenan en `LlmProvider` y `Channel` de Postgres.

---

## Onboarding Wizard (4 pasos)

Al acceder por primera vez sin workspace configurado, el Wizard guía al usuario:

```
Paso 1 — Agency        Nombre y descripción del workspace
Paso 2 — LLM Keys      API keys de OpenAI / Anthropic / Qwen / DeepSeek / OpenRouter
                        (cifradas y guardadas en DB)
Paso 3 — Channels      Configurar Telegram / WhatsApp / Discord / WebChat
                        con auto-provisión y auto-bind al agente
Paso 4 — Primer Agente Nombre, modelo, rol y backstory
```

**Sin tocar `.env`.** Todo queda persistido en Postgres.

---

## API Endpoints

### Workspace & Studio

| Endpoint | Método | Propósito |
|---|---|---|
| `/api/studio/v1/studio/state` | GET | Estado completo (workspace + agentes + skills + flujos + runtime) |
| `/api/studio/v1/workspaces/bootstrap` | POST | Crear workspace desde perfil |
| `/api/studio/v1/compile` | POST | Generar 12 artefactos desplegables |
| `/api/studio/v1/deploy/preview` | GET | Diff artefactos vs disco |
| `/api/studio/v1/deploy/apply` | POST | Aplicar despliegue |
| `/api/studio/v1/profiles` | GET | Listar perfiles desde templates |

### Canales

| Endpoint | Método | Propósito |
|---|---|---|
| `/workspaces/:wid/channels` | GET | Listar canales del workspace |
| `/workspaces/:wid/channels/provision` | POST | Provisionar canal (token cifrado en DB) |
| `/workspaces/:wid/channels/:id/bind` | POST | Vincular canal a agente |
| `/workspaces/:wid/channels/:id/status` | GET | Estado del canal |
| `/workspaces/:wid/channels/:id/status/stream` | GET | SSE — estado en vivo |
| `/workspaces/:wid/channels/:id` | DELETE | Eliminar canal |

### LLM Providers

| Endpoint | Método | Propósito |
|---|---|---|
| `/workspaces/:wid/llm-providers` | GET | Listar providers (key enmascarada) |
| `/workspaces/:wid/llm-providers` | POST | Crear/actualizar provider |
| `/workspaces/:wid/llm-providers/:id` | DELETE | Eliminar provider |

---

## Prisma — Modelos de base de datos

```
Workspace
  ├── Agent[]           → boundChannels Channel[]
  ├── Flow[]
  ├── Skill[]
  ├── Policy[]
  ├── Hook[]
  ├── Channel[]         kind: telegram|whatsapp|discord|webchat
  └── LlmProvider[]     provider: openai|anthropic|qwen|deepseek|openrouter
```

### Migraciones

```bash
# Correr migraciones pendientes
npx prisma migrate deploy

# Ver estado de migraciones
npx prisma migrate status

# Abrir Prisma Studio (UI de DB)
npx prisma studio
```

El schema vive en `apps/api/prisma/schema.prisma`.  
Las migraciones SQL en `apps/api/prisma/migrations/`.

---

## Persistencia — Estrategia dual

El proyecto soporta **dos backends de persistencia** simultáneamente vía el patrón `WorkspaceStore`:

| Implementación | Archivo | Cuándo usar |
|---|---|---|
| `JsonWorkspaceStore` | `packages/workspace-store/src/json-workspace-store.ts` | Desarrollo local sin Postgres |
| `YamlWorkspaceStore` | `packages/workspace-store/src/yaml-workspace-store.ts` | CI / export legible |
| `PrismaWorkspaceStore` | `packages/workspace-store/src/prisma-workspace-store.ts` | **Producción** — PostgreSQL |

La selección del backend se hace en el módulo de bootstrap del API. Para producción, usar `PrismaWorkspaceStore` con `preload()` al iniciar el módulo.

---

## Estructura de archivos

```
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma              ← Modelos Prisma
│   │   │   └── migrations/                ← SQL de migraciones
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── prisma.service.ts      ← PrismaClient singleton (NestJS)
│   │       │   └── prisma.module.ts       ← @Global() — disponible en todo
│   │       └── modules/
│   │           ├── channels/              ← ChannelsService (Prisma) + Controller
│   │           ├── agents/
│   │           ├── flows/
│   │           ├── skills/
│   │           ├── studio/
│   │           ├── gateway/
│   │           └── runtime/
│   └── web/src/
│       ├── features/
│       │   ├── onboarding/
│       │   │   └── components/
│       │   │       └── OnboardingWizard.tsx   ← Wizard 4 pasos
│       │   └── settings/
│       │       ├── components/
│       │       │   ├── ChannelsSettingsTab.tsx ← CRUD canales + SSE
│       │       │   └── LlmProvidersTab.tsx     ← CRUD API keys
│       │       └── pages/
│       │           └── SettingsPage.tsx        ← Tabs: General/Budgets/Channels/LLM
│       └── lib/
│           ├── channels-api.ts            ← Client HTTP tipado para canales
│           └── types.ts                   ← ChannelRecord, LlmProviderRecord, etc.
├── packages/
│   ├── core-types/                        ← AgentSpec, FlowSpec, WorkspaceSpec…
│   ├── workspace-store/                   ← WorkspaceStore + Prisma/JSON/YAML impls
│   ├── flow-engine/
│   ├── run-engine/
│   ├── gateway-sdk/
│   └── schemas/                           ← JSON schemas (agentes, flujos, skills…)
├── templates/
│   ├── profiles/                          ← .md + .json sidecar files
│   └── workspaces/                        ← Plantillas de rutinas
├── vendor/
│   └── agency-agents/                     ← git submodule (msitarzewski/agency-agents)
├── .env.example
├── .gitmodules
├── package.json
├── tsconfig.json
└── nixpacks.toml
```

---

## Despliegue (Coolify)

| Setting | Valor |
|---|---|
| **Branch** | `main` |
| **Build** | `npm install && npx prisma generate && npm run build` |
| **Start** | `npx prisma migrate deploy && npm start` |
| **Port** | 3400 |
| **Health Check** | `GET /api/studio/v1/studio/state` |

### nixpacks.toml

```toml
[variables]
NODE_ENV = "production"

[phases.build]
cmds = ["npm install", "npx prisma generate", "npm run build"]

[start]
cmd = "npx prisma migrate deploy && npm start"
```

---

## Verificación rápida

```bash
# Estado del studio
curl https://cost.socialstudies.cloud/api/studio/v1/studio/state

# Listar canales
curl https://cost.socialstudies.cloud/workspaces/MY_WS_ID/channels

# Provisionar canal Telegram
curl -X POST https://cost.socialstudies.cloud/workspaces/MY_WS_ID/channels/provision \
  -H "Content-Type: application/json" \
  -d '{"kind":"telegram","token":"BOT_TOKEN_AQUI"}'

# SSE — estado en vivo de un canal
curl -N https://cost.socialstudies.cloud/workspaces/MY_WS_ID/channels/CHANNEL_ID/status/stream
```

---

## Branch strategy

| Branch | Propósito |
|---|---|
| `main` | Producción |
| `legacy-main-backup` | Snapshot histórico pre-Studio. Solo lectura. |
