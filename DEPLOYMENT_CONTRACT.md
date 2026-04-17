# Deployment Contract - OpenClaw Studio

**Updated**: 2026-04-17
**Status**: Production on Coolify

---

## Summary

| Setting | Value |
|---------|-------|
| **Branch** | `master` (default) |
| **Build** | `npm install && npm run build` |
| **Start** | `npm start` → `node dist/apps/api/src/main.js` |
| **Port** | 3400 |
| **URL** | https://cost.socialstudies.cloud |
| **Health** | `GET /api/studio/v1/studio/state` |

---

## Build

```bash
npm install && npm run build
```

This runs two steps:
1. `tsc` — compiles backend TypeScript (`apps/api/`, `packages/`) → `dist/`
2. `vite build` — bundles React frontend (`apps/web/src/`) → `apps/web/dist/`

---

## Start

```bash
npm start
# → node dist/apps/api/src/main.js
# → OpenClaw Studio API listening on 3400
```

Express serves:
1. API routes at `/api/studio/v1/*`
2. Static frontend assets from `apps/web/dist/`
3. SPA fallback (index.html) for all other routes

---

## nixpacks.toml

```toml
[variables]
NODE_ENV = "production"

[phases.build]
cmds = ["npm install", "npm run build"]

[start]
cmd = "npm start"
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | 3400 | Server port |
| `STUDIO_API_PORT` | 3400 | Explicit API port |
| `STUDIO_API_PREFIX` | `/api/studio/v1` | API route prefix |
| `NODE_ENV` | `development` | Set `production` in Coolify |

---

## Coolify Configuration

1. **Source**: `https://github.com/lssmanager/dashboard-agentes`
2. **Branch**: `master`
3. **Build Command**: `npm install && npm run build`
4. **Start Command**: `npm start`
5. **Port**: 3400
6. **Health Check**: `GET /api/studio/v1/studio/state` → 200

---

## Verification

```bash
# API responds
curl https://cost.socialstudies.cloud/api/studio/v1/profiles
# → 200, JSON array of profiles

# Frontend loads
curl -s https://cost.socialstudies.cloud/ | head -1
# → <!DOCTYPE html>

# Studio state
curl https://cost.socialstudies.cloud/api/studio/v1/studio/state
# → 200, { workspace, agents, skills, flows, profiles, compile, runtime }
```

---

## What No Longer Exists

The following legacy items have been removed from the tree:

| Removed | Was |
|---------|-----|
| `backend/` | Legacy vanilla JS Express server |
| `frontend/` | Legacy vanilla JS dashboard (D3.js) |
| `agents/` | Agent panel markdown configs |
| `dev:legacy` script | `node backend/server.js` |
| 30+ status/plan `.md` files | Build progress documentation |

Legacy code is preserved in the `legacy-main-backup` branch (read-only archive).
