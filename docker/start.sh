#!/bin/sh
set -eu

# ─── Variables de entorno con defaults ───────────────────────────────────────
export PORT="${PORT:-3000}"
export STUDIO_API_PORT="${STUDIO_API_PORT:-$PORT}"
export NODE_ENV="${NODE_ENV:-production}"

echo "[startup] Agent VisualStudio — NODE_ENV=${NODE_ENV}"

# ─── Validación de variables obligatorias ─────────────────────────────────
_require_env() {
  eval _val="\$$1"
  if [ -z "$_val" ]; then
    echo "[startup] ERROR: $1 is required but not set" >&2
    exit 1
  fi
}

_require_env DATABASE_URL
# Nombres alineados con .env.example (corregido 2026-05-07)
# Anterior: CHANNEL_ENC_KEY — no correspondía al nombre real
# Anterior: ENCRYPTION_KEY  — no correspondía al nombre real
_require_env CHANNEL_SECRET
_require_env SECRETS_ENCRYPTION_KEY

_enc_len=$(printf "%s" "$SECRETS_ENCRYPTION_KEY" | wc -c)
if [ "$_enc_len" -ne 64 ]; then
  echo "[startup] ERROR: SECRETS_ENCRYPTION_KEY must be exactly 64 hex chars (got ${_enc_len})" >&2
  exit 1
fi

# ─── Verificar que hay migraciones para aplicar ────────────────────────────
MIGRATIONS_DIR="packages/db/prisma/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "[startup] ERROR: $MIGRATIONS_DIR not found" >&2
  exit 1
fi

MIGRATION_COUNT=$(find "$MIGRATIONS_DIR" -name "migration.sql" | wc -l)

if [ "$MIGRATION_COUNT" -eq 0 ]; then
  echo "[startup] ERROR: No migration.sql files found in $MIGRATIONS_DIR" >&2
  echo "[startup] Run: pnpm --filter @lss/db run db:migrate:dev --name init" >&2
  exit 1
fi

echo "[startup] Found ${MIGRATION_COUNT} migration(s) to deploy"

# ─── Prisma validate ───────────────────────────────────────────────────
echo "[startup] Prisma validate"
./node_modules/.bin/prisma validate \
  --schema=packages/db/prisma/schema.prisma

# ─── Prisma generate ──────────────────────────────────────────────────
echo "[startup] Prisma generate"
./node_modules/.bin/prisma generate \
  --schema=packages/db/prisma/schema.prisma

# ─── Prisma migrate deploy ──────────────────────────────────────────────
echo "[startup] Prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy \
  --schema=packages/db/prisma/schema.prisma

echo "[startup] Database schema applied successfully"

# ─── Verificar frontend build (no bloqueante) ───────────────────────────
if [ ! -f apps/web/dist/index.html ]; then
  echo "[startup] WARNING: apps/web/dist/index.html not found — backend-only mode"
fi

# ─── Verificar build compilado (OBLIGATORIO en producción) ──────────────────────
if [ ! -f dist/apps/api/src/main.js ]; then
  echo "[startup] ERROR: Compiled API not found at dist/apps/api/src/main.js" >&2
  echo "[startup] Run the build step before deploying: pnpm run build" >&2
  echo "[startup] The ts-node fallback was removed — it does not resolve ESM import errors." >&2
  exit 1
fi

# ─── Arrancar API compilada ────────────────────────────────────────────────
echo "[startup] Starting API on port ${STUDIO_API_PORT}"
exec node dist/apps/api/src/main.js
