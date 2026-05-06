#!/bin/sh
set -eu

export PORT="${PORT:-3000}"
export STUDIO_API_PORT="${STUDIO_API_PORT:-$PORT}"

echo "[startup] Agent VisualStudio starting..."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[startup] ERROR: DATABASE_URL is required" >&2
  exit 1
fi

if [ -z "${CHANNEL_ENC_KEY:-}" ]; then
  echo "[startup] ERROR: CHANNEL_ENC_KEY is required" >&2
  exit 1
fi

if [ -z "${ENCRYPTION_KEY:-}" ]; then
  echo "[startup] ERROR: ENCRYPTION_KEY is required. Must be 64 hex chars." >&2
  exit 1
fi

if [ "$(printf "%s" "$ENCRYPTION_KEY" | wc -c)" -ne 64 ]; then
  echo "[startup] ERROR: ENCRYPTION_KEY must be exactly 64 hex chars." >&2
  exit 1
fi

echo "[startup] Prisma validate"
./node_modules/.bin/prisma validate --schema=packages/db/prisma/schema.prisma

echo "[startup] Prisma generate"
./node_modules/.bin/prisma generate --schema=packages/db/prisma/schema.prisma

echo "[startup] Prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy --schema=packages/db/prisma/schema.prisma

echo "[startup] Checking frontend build"
if [ ! -f apps/web/dist/index.html ]; then
  echo "[startup] ERROR: apps/web/dist/index.html not found. GUI cannot render." >&2
  exit 1
fi

if [ -f dist/apps/api/src/main.js ]; then
  echo "[startup] Starting compiled API on port ${STUDIO_API_PORT}"
  exec node dist/apps/api/src/main.js
fi

echo "[startup] Compiled API not found; starting TS API with transpile-only for GUI evaluation"
exec ./node_modules/.bin/ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.deploy.json apps/api/src/main.ts
