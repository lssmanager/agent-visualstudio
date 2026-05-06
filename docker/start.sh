#!/bin/sh
# =============================================================
# docker/start.sh — Agent VisualStudio canonical entrypoint
#
# Orden de ejecución:
#   1. Validar variables de entorno obligatorias
#   2. prisma validate  (detecta errores de schema en runtime)
#   3. prisma generate  (regenera cliente si es necesario)
#   4. prisma migrate deploy  (aplica migraciones pendientes)
#   5. Verificar que el build de API existe
#   6. Verificar que el build del frontend existe (warning)
#   7. Arrancar API
#
# Start command en Coolify: sh docker/start.sh
# Schema canónico: packages/db/prisma/schema.prisma
# =============================================================
set -eu

export PORT="${PORT:-3000}"
export STUDIO_API_PORT="${STUDIO_API_PORT:-$PORT}"

SCHEMA="packages/db/prisma/schema.prisma"

echo "[startup] Agent VisualStudio starting..."
echo "[startup] Port: ${STUDIO_API_PORT}"

# ── Variables obligatorias ─────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[startup] ERROR: DATABASE_URL is required" >&2
  exit 1
fi

if [ -z "${CHANNEL_ENC_KEY:-}" ]; then
  echo "[startup] ERROR: CHANNEL_ENC_KEY is required" >&2
  exit 1
fi

if [ -z "${ENCRYPTION_KEY:-}" ]; then
  echo "[startup] ERROR: ENCRYPTION_KEY is required (64 hex chars for AES-256-GCM)" >&2
  echo "[startup] Genera una con: openssl rand -hex 32" >&2
  exit 1
fi

ENC_LEN=$(printf "%s" "$ENCRYPTION_KEY" | wc -c | tr -d ' ')
if [ "$ENC_LEN" -ne 64 ]; then
  echo "[startup] ERROR: ENCRYPTION_KEY debe tener exactamente 64 hex chars (tiene ${ENC_LEN})" >&2
  exit 1
fi

# ── Prisma ────────────────────────────────────────────────
echo "[startup] Prisma validate"
./node_modules/.bin/prisma validate --schema="$SCHEMA"

echo "[startup] Prisma generate"
./node_modules/.bin/prisma generate --schema="$SCHEMA"

echo "[startup] Prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy --schema="$SCHEMA"

# ── Verificar builds ──────────────────────────────────────
echo "[startup] Checking API build"
if [ ! -f dist/apps/api/src/main.js ]; then
  echo "[startup] ERROR: dist/apps/api/src/main.js no encontrado" >&2
  echo "[startup] El build de TypeScript no generó el entrypoint de la API" >&2
  exit 1
fi
echo "[startup] API build OK"

echo "[startup] Checking frontend build"
if [ ! -f apps/web/dist/index.html ]; then
  echo "[startup] WARN: apps/web/dist/index.html no existe — la GUI devolverá 404"
  echo "[startup] Para resolver: verificar script build en apps/web/package.json"
else
  echo "[startup] Frontend build OK"
fi

# ── Arrancar API ──────────────────────────────────────────
echo "[startup] Starting API on port ${STUDIO_API_PORT}"
exec node dist/apps/api/src/main.js
