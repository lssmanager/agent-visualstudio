#!/usr/bin/env bash
# scripts/init-submodules.sh
#
# Inicializa el submodule vendor/agency-agents y verifica que
# el loader puede leer los ~130 agentes correctamente.
#
# Uso: bash scripts/init-submodules.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.."; pwd)"
cd "$ROOT"

echo "📦 Inicializando submodules..."
git submodule update --init --recursive

VENDOR_PATH="$ROOT/vendor/agency-agents"
if [ ! -d "$VENDOR_PATH" ]; then
  echo "❌ vendor/agency-agents no existe tras submodule init. Revisa .gitmodules."
  exit 1
fi

DEPT_COUNT=$(find "$VENDOR_PATH" -mindepth 1 -maxdepth 1 -type d | wc -l)
AGENT_COUNT=$(find "$VENDOR_PATH" -name '*.md' | wc -l)

echo "✅ vendor/agency-agents inicializado correctamente."
echo "   Departments encontrados : $DEPT_COUNT"
echo "   Archivos .md encontrados : $AGENT_COUNT"

if [ "$AGENT_COUNT" -lt 50 ]; then
  echo "⚠️  Advertencia: se esperan >= 100 agentes. Verifica que el submodule no esté vacío."
  exit 1
fi

echo ""
echo "🚀 Setup completo. Ya puedes iniciar la API:"
echo "   pnpm --filter @agent-visualstudio/api dev"
