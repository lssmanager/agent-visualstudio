#!/bin/sh
set -eu

export PORT="${PORT:-3400}"
export STUDIO_API_PORT="${STUDIO_API_PORT:-$PORT}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[startup] DATABASE_URL is required" >&2
  exit 1
fi

if [ -z "${CHANNEL_ENC_KEY:-}" ]; then
  echo "[startup] CHANNEL_ENC_KEY is required" >&2
  exit 1
fi

echo "[startup] Generating Prisma client"
./node_modules/.bin/prisma generate --schema apps/api/prisma/schema.prisma

echo "[startup] Running Prisma migrations"
./node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "[startup] Starting API on port ${STUDIO_API_PORT}"
exec node dist/apps/api/src/main.js
