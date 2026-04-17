# OpenClaw Studio

Configuration-driven platform for managing AI agents, skills, workflows, and workspaces.

**Live:** https://cost.socialstudies.cloud
**Branch:** `master` (single branch, default)

---

## Architecture

```
Browser
  │
  │  HTTPS
  ▼
Cloudflare → Traefik → Express (port 3400)
                          │
                          ├── /api/studio/v1/*    API routes (Express)
                          ├── /*                  React SPA (Vite build)
                          │
                          └── reads templates/    Profile & routine markdown
```

**Monolith**: Single Express server serves both API and React frontend on port 3400.

### Stack

- **Backend**: Express.js + TypeScript (`apps/api/src/`)
- **Frontend**: React + Vite + Tailwind CSS (`apps/web/src/`)
- **Packages**: `core-types`, `schemas`, `profile-engine`, `workspace-engine`
- **Config**: Profiles and routines from markdown templates (`templates/`)

---

## Quick Start

```bash
# Install
npm install

# Build (backend TypeScript + frontend Vite)
npm run build

# Start production server
npm start
# → OpenClaw Studio API listening on 3400

# Development
npm run dev        # Backend with ts-node
npm run dev:web    # Frontend Vite dev server (proxies /api to :3400)
```

---

## API Endpoints

All at `/api/studio/v1/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/profiles` | GET | List profiles from markdown catalog |
| `/routines` | GET | List routines |
| `/workspaces/bootstrap` | POST | Create workspace from profile |
| `/compile` | POST | Generate 12 deployable artifacts |
| `/deploy/preview` | GET | Diff artifacts vs disk |
| `/deploy/apply` | POST | Write artifacts to workspace |
| `/studio/state` | GET | Full studio state (workspace + agents + skills + flows + profiles + runtime) |

---

## End-to-End Pipeline

```
1. GET /profiles               → Profiles loaded from templates/profiles/ (.md + .json)
2. POST /workspaces/bootstrap  → Workspace created (merge: request > profile > defaults)
3. POST /compile               → 12 DeployableArtifacts with sourceHash
4. GET /deploy/preview         → Diff showing added/updated/unchanged files
5. POST /deploy/apply          → Safe deployment with optional runtime reload
```

---

## Frontend

React SPA built with Vite + Tailwind CSS.

- **Entry**: `apps/web/src/main.tsx` → `App.tsx`
- **Single source of truth**: `GET /studio/state` loaded once, shared via `StudioStateContext`
- **Onboarding**: If no workspace exists, shows profile selector + workspace creation
- **Studio view**: Toolbar, sidebar (entity counts), canvas (agent editor, flow canvas), inspector (diagnostics, deploy diff)
- **No frontend merge logic**: Backend owns all merge decisions

---

## Deployment (Coolify)

| Setting | Value |
|---------|-------|
| **Branch** | `master` |
| **Build** | `npm install && npm run build` |
| **Start** | `npm start` |
| **Port** | 3400 |
| **Health Check** | `GET /api/studio/v1/studio/state` |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3400 | Server port |
| `STUDIO_API_PORT` | 3400 | Explicit API port |
| `STUDIO_API_PREFIX` | `/api/studio/v1` | API route prefix |
| `NODE_ENV` | development | Set `production` for optimized builds |

### nixpacks.toml

```toml
[variables]
NODE_ENV = "production"

[phases.build]
cmds = ["npm install", "npm run build"]

[start]
cmd = "npm start"
```

---

## File Structure

```
├── apps/
│   ├── api/src/
│   │   ├── main.ts                    ← Backend entry point
│   │   ├── server.ts                  ← Express app (API + static + SPA)
│   │   ├── config.ts
│   │   ├── routes.ts
│   │   └── modules/
│   │       ├── profiles/              (controller + service)
│   │       ├── routines/              (controller + service)
│   │       ├── workspaces/            (controller + service + repository)
│   │       ├── compile/               (controller + service)
│   │       ├── deploy/                (controller + service + diff)
│   │       ├── gateway/               (controller + service)
│   │       └── studio/                (controller + service)
│   └── web/
│       ├── vite.config.ts             ← Vite bundler config
│       ├── tsconfig.json              ← Frontend TypeScript config
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       └── src/
│           ├── index.html             ← HTML entry
│           ├── main.tsx               ← React mount
│           ├── App.tsx                ← Root component (onboarding gate)
│           ├── index.css              ← Tailwind directives
│           ├── lib/
│           │   ├── api.ts             ← API client (fetch)
│           │   ├── types.ts           ← TypeScript interfaces
│           │   └── StudioStateContext.ts ← Shared state context
│           └── features/
│               ├── studio/            (StudioPage, Canvas, Sidebar, Toolbar, Inspector)
│               ├── onboarding/        (OnboardingPage)
│               ├── workspaces/        (WorkspaceEditor, List, FileTree, DeployPanel)
│               ├── profiles/          (ProfileGallery, ProfileCard, ProfileEditor)
│               ├── agents/            (AgentEditorForm, ModelSelector, SkillSelector)
│               ├── flows/             (FlowCanvas with ReactFlow)
│               ├── skills/            (SkillList)
│               ├── diagnostics/       (GatewayHealth, ProtocolStatus, Logs)
│               ├── routing/           (ChannelBindings, RouteEditor)
│               └── sessions/          (SessionsPanel)
├── packages/
│   ├── core-types/                    ← Shared TypeScript types
│   ├── schemas/                       ← Zod validation schemas
│   ├── profile-engine/                ← Profile/routine loaders
│   └── workspace-engine/              ← Compiler + artifact generation
├── templates/
│   ├── profiles/                      ← .md + .json sidecar files
│   └── workspaces/                    ← Routine markdown templates
├── package.json
├── tsconfig.json                      ← Backend TypeScript config
├── nixpacks.toml                      ← Coolify deployment config
└── docs/adr/                          ← Architecture decision records
```

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `master` | Default. Single production branch. |
| `legacy-main-backup` | Archived snapshot of old `main` (pre-Studio). Read-only. |

---

## Verification

```bash
# Test API
curl https://cost.socialstudies.cloud/api/studio/v1/profiles
# → 200, JSON array of 7+ profiles

# Test UI
curl https://cost.socialstudies.cloud/
# → 200, HTML (React app)

# Test bootstrap
curl -X POST https://cost.socialstudies.cloud/api/studio/v1/workspaces/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"profileId":"chief-of-staff","workspaceSpec":{"name":"Test","agentIds":[],"flowIds":[]}}'
# → 201, { workspaceSpec: {...}, created: true }

# Test studio state
curl https://cost.socialstudies.cloud/api/studio/v1/studio/state
# → 200, { workspace, agents, skills, flows, policies, profiles, compile, runtime }
```
