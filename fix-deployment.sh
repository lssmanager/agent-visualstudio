#!/usr/bin/env bash
# fix-deployment.sh — Correción de contratos de despliegue (audit 2026-05-07)
# Ejecutar desde la raíz del repo: bash fix-deployment.sh
set -euo pipefail

BOLD='\033[1m'; RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

step() { echo -e "\n${BOLD}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

# ──────────────────────────────────────────────────────────────────────────────
step "PASO 1 — Verificar package manager (solo pnpm)"

if [ -f "package-lock.json" ]; then
  warn "package-lock.json detectado — eliminando"
  git rm --cached package-lock.json 2>/dev/null || rm -f package-lock.json
  ok "package-lock.json eliminado"
else
  ok "package-lock.json no existe — correcto"
fi

if ! grep -qx "package-lock.json" .gitignore 2>/dev/null; then
  echo "package-lock.json" >> .gitignore
  ok "package-lock.json añadido a .gitignore"
else
  ok "package-lock.json ya está en .gitignore"
fi

if [ ! -f "pnpm-lock.yaml" ]; then
  warn "pnpm-lock.yaml no existe — ejecutar: pnpm install"
else
  ok "pnpm-lock.yaml presente"
fi

# ──────────────────────────────────────────────────────────────────────────────
step "PASO 2 — Verificar nixpacks.toml"

if grep -q "\-\-noEmitOnError false" nixpacks.toml 2>/dev/null; then
  fail "nixpacks.toml todavía tiene --noEmitOnError false — debe haberse eliminado en el PR anterior"
else
  ok "nixpacks.toml no tiene --noEmitOnError false — correcto"
fi

if grep -q "frozen-lockfile" nixpacks.toml 2>/dev/null; then
  ok "nixpacks.toml usa --frozen-lockfile"
else
  warn "nixpacks.toml no usa --frozen-lockfile — verificar manualmente"
fi

# ──────────────────────────────────────────────────────────────────────────────
step "PASO 3 — Verificar nombres de variables de entorno"
echo ""

# Verificar que docker/start.sh use los nombres de .env.example
START_SH="docker/start.sh"

if grep -q "CHANNEL_ENC_KEY" "$START_SH"; then
  warn "$START_SH usa CHANNEL_ENC_KEY pero .env.example define CHANNEL_SECRET"
  warn "Bug silencioso: el contenedor arrancaría con CHANNEL_ENC_KEY vacío"
  warn "Corrije manualmente o verifica que ya esté corregido"
else
  ok "$START_SH usa CHANNEL_SECRET (alineado con .env.example)"
fi

if grep -q "ENCRYPTION_KEY" "$START_SH" && ! grep -q "SECRETS_ENCRYPTION_KEY" "$START_SH"; then
  warn "$START_SH usa ENCRYPTION_KEY pero .env.example define SECRETS_ENCRYPTION_KEY"
  warn "Corrije manualmente o verifica que ya esté corregido"
else
  ok "$START_SH usa SECRETS_ENCRYPTION_KEY (alineado con .env.example)"
fi

# ──────────────────────────────────────────────────────────────────────────────
step "PASO 4 — Verificar jest.config.js vs vitest"

if [ -f "jest.config.js" ]; then
  VITEST_COUNT=$(grep -rl "vitest" packages/*/package.json 2>/dev/null | wc -l || echo 0)
  JEST_COUNT=$(grep -rl '"jest"' packages/*/package.json apps/*/package.json 2>/dev/null | wc -l || echo 0)
  echo ""
  echo "  packages con vitest en devDeps : $VITEST_COUNT"
  echo "  packages con jest en devDeps   : $JEST_COUNT"
  echo ""
  if [ "$VITEST_COUNT" -gt 0 ] && [ "$JEST_COUNT" -eq 0 ]; then
    warn "Todos los packages usan vitest pero existe jest.config.js en raíz"
    warn "Considerar eliminar jest.config.js si no se usa activamente"
  else
    ok "Framework de test consistente"
  fi
else
  ok "No existe jest.config.js — framework único"
fi

# ──────────────────────────────────────────────────────────────────────────────
step "PASO 5 — Ejecutar tsc --noEmit (errores antes silenciados)"
echo ""
echo "  Corriendo: tsc -p tsconfig.json --noEmit --skipLibCheck"
echo "  Los errores listados son los que ahora bloquearán el build en Coolify."
echo ""

if command -v tsc &>/dev/null || [ -f node_modules/.bin/tsc ]; then
  TSC="$([ -f node_modules/.bin/tsc ] && echo node_modules/.bin/tsc || echo tsc)"
  if $TSC -p tsconfig.json --noEmit --skipLibCheck 2>&1; then
    ok "tsc --noEmit pasó sin errores — el repo está listo para deploy"
  else
    echo ""
    warn "tsc reportó errores — ver lista arriba"
    warn "Estos errores estaban silenciados por --noEmitOnError false"
    warn "Ver COMPILATION_FIXES_DETAILED.md para el plan de corrección"
  fi
else
  warn "tsc no disponible — ejecutar primero: pnpm install"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}════════════════════════════════════════════${NC}"
echo -e "${BOLD}  fix-deployment.sh completado${NC}"
echo -e "${BOLD}════════════════════════════════════════════${NC}"
echo ""
echo "  Próximos pasos:"
echo "  1. Resolver errores TypeScript del PASO 5"
echo "     Ver: COMPILATION_FIXES_DETAILED.md"
echo "  2. Resolver el desajuste de env vars (PASO 3)"
echo "     docker/start.sh debe usar CHANNEL_SECRET y SECRETS_ENCRYPTION_KEY"
echo "  3. Configurar variables en Coolify — ver README_DEPLOY.md"
echo ""
