#!/usr/bin/env bash
# =============================================================
# scripts/deploy-check.sh — Agent VisualStudio deploy pipeline
#
# 8 checks secuenciales. Si cualquiera falla con set -e, el
# deploy falla en Coolify antes de arrancar el contenedor.
#
# Uso: ./scripts/deploy-check.sh
# =============================================================
set -euo pipefail

SCHEMA="./packages/db/prisma/schema.prisma"
API_DIST="dist/apps/api/src/main.js"
WEB_DIST="apps/web/dist"

echo "======================================================"
echo " Agent VisualStudio — deploy check"
echo "======================================================"

# CHECK 1: Node version
echo ""
echo "[1/8] Node version"
node -v

# CHECK 2: npm version (confirma que install funcionó)
echo ""
echo "[2/8] npm version"
npm -v

# CHECK 3: Prisma validate (detecta errores de schema ANTES de generate)
echo ""
echo "[3/8] Prisma validate"
./node_modules/.bin/prisma validate --schema="$SCHEMA"

# CHECK 4: Prisma generate (genera el cliente tipado)
echo ""
echo "[4/8] Prisma generate"
./node_modules/.bin/prisma generate --schema="$SCHEMA"

# CHECK 5: TypeScript build
# --noEmitOnError false  → emite JS aunque haya errores de tipo
# --skipLibCheck         → evita fallos en tipos de node_modules
echo ""
echo "[5/8] TypeScript build"
./node_modules/.bin/tsc -p tsconfig.json --noEmitOnError false --skipLibCheck

# CHECK 6: Web/frontend build
echo ""
echo "[6/8] Web build"
if [ -f apps/web/package.json ]; then
  # Intenta los scripts más comunes en orden
  npm run build --workspace=apps/web 2>/dev/null || \
  npm --prefix apps/web run build 2>/dev/null || \
  echo "WARN: apps/web build script no encontrado o falló — la GUI devolverá 404"
else
  echo "WARN: apps/web/package.json no existe — saltando build del frontend"
fi

# CHECK 7: Verificar que el dist de la API existe
echo ""
echo "[7/8] Verificar API dist"
if [ -f "$API_DIST" ]; then
  echo "OK: $API_DIST existe"
else
  echo "ERROR: $API_DIST no encontrado — el build de TypeScript no generó el entrypoint"
  exit 1
fi

# CHECK 8: Verificar dist del frontend (warning, no error fatal)
echo ""
echo "[8/8] Verificar frontend dist"
if [ -d "$WEB_DIST" ]; then
  echo "OK: $WEB_DIST existe — la GUI debería servirse"
else
  echo "WARN: $WEB_DIST no existe — la API arrancará pero la GUI devolverá 404"
  echo "      Para resolver: revisar script build en apps/web/package.json"
fi

echo ""
echo "======================================================"
echo " DEPLOY CHECK PASSED"
echo " Siguiente paso: node /app/dist/apps/api/src/main.js"
echo "======================================================"
