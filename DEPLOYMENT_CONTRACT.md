# Deployment Contract — Agent VisualStudio

**Updated**: 2026-05-07  
**Status**: Production on Coolify (Nixpacks)

---

## Quick Reference

| Setting | Value |
|---------|-------|
| **Repo** | `lssmanager/agent-visualstudio` |
| **Branch** | `main` |
| **Package manager** | `pnpm@10` (corepack) |
| **Install** | `pnpm install --frozen-lockfile` |
| **Build** | `prisma generate && tsc -p tsconfig.json --skipLibCheck && vite build` |
| **Start** | `sh docker/start.sh` |
| **Port** | `3400` |
| **URL** | https://agents.socialstudies.cloud |
| **Health check** | `GET /api/studio/v1/studio/state` → 200 |

---

## nixpacks.toml (source of truth)

This file is the canonical build/start definition for Coolify.
The contract below must always match it exactly.

```toml
[phases.setup]
nixPkgs = ["nodejs_22", "openssl"]

[phases.install]
cmds = [
  "corepack enable && corepack prepare pnpm@10 --activate && pnpm install --frozen-lockfile"
]
cacheDirectories = ["/root/.local/share/pnpm/store/v3"]

[phases.build]
cmds = [
  "node_modules/.bin/prisma generate --schema=packages/db/prisma/schema.prisma && tsc -p tsconfig.json --skipLibCheck && node_modules/.bin/vite build --config apps/web/vite.config.ts"
]
cacheDirectories = ["node_modules/.cache"]

[start]
cmd = "sh docker/start.sh"
```

---

## Build pipeline (Nixpacks phases)

```
setup → install → build → start
```

| Phase | Command | Fails if |
|-------|---------|----------|
| `setup` | Install Node 22 + OpenSSL | nixpkgs unavailable |
| `install` | `pnpm install --frozen-lockfile` | `pnpm-lock.yaml` out of sync with any `package.json` |
| `build` | `prisma generate && tsc && vite build` | TypeScript errors, missing schema, Vite config error |
| `start` | `sh docker/start.sh` | Missing `dist/apps/api/src/main.js`, DB unreachable |

> **Rule**: Never modify `nixpacks.toml` without updating this document,
> and never update this document without verifying it matches `nixpacks.toml`.

---

## Start script — docker/start.sh

The script runs in order:

1. Validate required env vars (`DATABASE_URL`, `CHANNEL_ENC_KEY`, `ENCRYPTION_KEY`)
2. `prisma validate` — schema sanity check
3. `prisma generate` — regenerate client in container
4. `prisma migrate deploy` — apply pending migrations to the live DB
5. `node dist/apps/api/src/main.js` — start compiled API

---

## Environment variables

| Variable | Default | Required | Purpose |
|----------|---------|----------|---------|
| `PORT` | `3000` | No | Express listen port (overridden by Coolify to 3400) |
| `STUDIO_API_PORT` | `$PORT` | No | Explicit API port |
| `NODE_ENV` | `production` | No | Set by Coolify automatically |
| `DATABASE_URL` | — | **Yes** | Postgres connection string |
| `CHANNEL_ENC_KEY` | — | **Yes** | Channel encryption key |
| `ENCRYPTION_KEY` | — | **Yes** | 64-char hex master key |

---

## Lockfile rule

The repo uses **pnpm exclusively**. The only valid lockfile is `pnpm-lock.yaml`.
`package-lock.json` is listed in `.gitignore` and must never be committed.

When adding/updating a dependency:
```bash
# Always from repo root
pnpm add <package> --filter <workspace>
# Then verify and commit the updated lockfile
git add pnpm-lock.yaml
git commit -m "fix(lockfile): ..."
```

---

## TypeScript gate

`tsc` runs **without** `--noEmitOnError false`. A TypeScript error blocks the
build and prevents a broken deploy from reaching production. Fix errors before
merging to `main`.

---

## Verification

```bash
# Health check
curl https://agents.socialstudies.cloud/api/studio/v1/studio/state
# → 200, JSON with workspace/agents/skills/flows/profiles/compile/runtime

# Profiles
curl https://agents.socialstudies.cloud/api/studio/v1/profiles
# → 200, JSON array

# Frontend
curl -s https://agents.socialstudies.cloud/ | head -1
# → <!DOCTYPE html>
```

---

## What no longer exists

| Removed | Was |
|---------|-----|
| `npm install` / `npm run build` | Legacy build method — replaced by pnpm |
| `--noEmitOnError false` | Allowed TS errors to reach production — removed |
| `package-lock.json` | npm lockfile — gitignored, must not be committed |
| Branch `master` | Renamed to `main` |
| URL `cost.socialstudies.cloud` | Old deployment URL |
| `backend/`, `frontend/`, `agents/` | Legacy vanilla-JS stack |
