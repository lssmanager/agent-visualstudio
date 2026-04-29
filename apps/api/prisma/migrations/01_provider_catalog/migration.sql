-- Migration: 01_provider_catalog
-- Agrega ProviderCredential y ModelCatalogEntry al schema.
-- ProviderCredential: credenciales de proveedores LLM por agencia (workspace),
--   con API key cifrada AES-256-GCM y metadata de sync.
-- ModelCatalogEntry: catálogo de modelos sincronizado desde las APIs de los
--   proveedores, con families, contextK y campos de pricing (OpenRouter).
--
-- Ejecutar con: npx prisma migrate deploy

-- ── ProviderCredential ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProviderCredential" (
  "id"               TEXT        NOT NULL PRIMARY KEY,
  -- agencyId = workspaceId (el servicio usa el término "agency" internamente)
  "agencyId"         TEXT        NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name"             TEXT        NOT NULL,
  -- type: openai | anthropic | openrouter | openai_compat
  "type"             TEXT        NOT NULL,
  "baseUrl"          TEXT,
  -- AES-256-GCM cifrado: iv:authTag:ciphertext
  "apiKeyEncrypted"  TEXT        NOT NULL,
  -- JSON de headers extra (e.g. HTTP-Referer para OpenRouter)
  "extraHeaders"     JSONB,
  "isActive"         BOOLEAN     NOT NULL DEFAULT true,
  -- Última ejecución exitosa de syncProvider()
  "syncedAt"         TIMESTAMP,
  "createdAt"        TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "ProviderCredential_agencyId_idx"
  ON "ProviderCredential"("agencyId");

CREATE INDEX IF NOT EXISTS "ProviderCredential_agencyId_isActive_idx"
  ON "ProviderCredential"("agencyId", "isActive");

-- ── ModelCatalogEntry ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ModelCatalogEntry" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "providerId"  TEXT        NOT NULL REFERENCES "ProviderCredential"("id") ON DELETE CASCADE,
  -- ID canónico del modelo: 'openai/gpt-4o', 'meta-llama/llama-3.3-70b-instruct'
  "modelId"     TEXT        NOT NULL,
  "displayName" TEXT        NOT NULL,
  -- Array de ModelFamily strings: 'reasoning','fast','vision','coding', etc.
  "families"    TEXT[]      NOT NULL DEFAULT '{}',
  -- Contexto máximo en K tokens (0 = desconocido)
  "contextK"    INTEGER     NOT NULL DEFAULT 0,
  -- Pricing en USD por 1000 tokens — NULL si el proveedor no lo devuelve
  -- OpenAI y Anthropic no devuelven pricing en /v1/models
  -- OpenRouter sí: pricing.prompt y pricing.completion (string, USD/token)
  "promptCostPer1kUsd"     DECIMAL(12,8),
  "completionCostPer1kUsd" DECIMAL(12,8),
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  -- Respuesta raw del proveedor (útil para debug y campos futuros)
  "raw"         JSONB       NOT NULL DEFAULT '{}',
  "updatedAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
  -- Un modelo es único por proveedor
  UNIQUE ("providerId", "modelId")
);

CREATE INDEX IF NOT EXISTS "ModelCatalogEntry_providerId_idx"
  ON "ModelCatalogEntry"("providerId");

CREATE INDEX IF NOT EXISTS "ModelCatalogEntry_providerId_isActive_idx"
  ON "ModelCatalogEntry"("providerId", "isActive");

CREATE INDEX IF NOT EXISTS "ModelCatalogEntry_modelId_idx"
  ON "ModelCatalogEntry"("modelId");
