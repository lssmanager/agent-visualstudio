-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260429_provider_catalog
-- Agent Visual Studio
--
-- Cambios:
--   1. CREATE TABLE "ProviderCredential"
--   2. CREATE TABLE "ModelCatalogEntry"
--   3. ALTER TABLE "ModelPolicy": DROP COLUMN fallbackModel,
--      ADD COLUMN fallbackChain TEXT[] NOT NULL DEFAULT '{}'
--   4. CHECK constraints exactly-one-scope en BudgetPolicy y ModelPolicy
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. ProviderCredential ────────────────────────────────────────────────────

CREATE TABLE "ProviderCredential" (
  "id"               TEXT         NOT NULL,
  "agencyId"         TEXT         NOT NULL,
  "name"             TEXT         NOT NULL,
  "type"             TEXT         NOT NULL,
  "baseUrl"          TEXT,
  "apiKeyEncrypted"  TEXT         NOT NULL,
  "extraHeaders"     JSONB,
  "isActive"         BOOLEAN      NOT NULL DEFAULT TRUE,
  "syncedAt"         TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderCredential_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ProviderCredential_agencyId_name_key"
  ON "ProviderCredential"("agencyId", "name");

CREATE INDEX "ProviderCredential_agencyId_type_isActive_idx"
  ON "ProviderCredential"("agencyId", "type", "isActive");

-- ─── 2. ModelCatalogEntry ─────────────────────────────────────────────────────

CREATE TABLE "ModelCatalogEntry" (
  "id"          TEXT         NOT NULL,
  "providerId"  TEXT         NOT NULL,
  "modelId"     TEXT         NOT NULL,
  "displayName" TEXT         NOT NULL,
  "families"    TEXT[]       NOT NULL DEFAULT '{}',
  "contextK"    INTEGER      NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN      NOT NULL DEFAULT TRUE,
  "raw"         JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ModelCatalogEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelCatalogEntry_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "ProviderCredential"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ModelCatalogEntry_providerId_modelId_key"
  ON "ModelCatalogEntry"("providerId", "modelId");

CREATE INDEX "ModelCatalogEntry_providerId_isActive_idx"
  ON "ModelCatalogEntry"("providerId", "isActive");

CREATE INDEX "ModelCatalogEntry_modelId_idx"
  ON "ModelCatalogEntry"("modelId");

-- ─── 3. ModelPolicy: fallbackModel → fallbackChain ───────────────────────────

-- Solo ejecutar si la columna aún no fue migrada (idempotente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ModelPolicy' AND column_name = 'fallbackModel'
  ) THEN
    -- Migrar valor existente a la nueva columna
    ALTER TABLE "ModelPolicy" ADD COLUMN IF NOT EXISTS "fallbackChain" TEXT[] NOT NULL DEFAULT '{}';

    UPDATE "ModelPolicy"
    SET "fallbackChain" = ARRAY["fallbackModel"]
    WHERE "fallbackModel" IS NOT NULL;

    ALTER TABLE "ModelPolicy" DROP COLUMN "fallbackModel";
  END IF;
END;
$$;

-- Asegurar que la columna existe en todo caso (nuevo schema sin fallbackModel)
ALTER TABLE "ModelPolicy" ADD COLUMN IF NOT EXISTS "fallbackChain" TEXT[] NOT NULL DEFAULT '{}';

-- ─── 4. CHECK constraints exactly-one-scope ───────────────────────────────────

-- BudgetPolicy
ALTER TABLE "BudgetPolicy" DROP CONSTRAINT IF EXISTS "budget_policy_exactly_one_scope";
ALTER TABLE "BudgetPolicy" ADD CONSTRAINT "budget_policy_exactly_one_scope"
  CHECK (
    (
      CASE WHEN "agencyId"     IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN "departmentId" IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN "workspaceId"  IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN "agentId"      IS NOT NULL THEN 1 ELSE 0 END
    ) = 1
  );

-- ModelPolicy
ALTER TABLE "ModelPolicy" DROP CONSTRAINT IF EXISTS "model_policy_exactly_one_scope";
ALTER TABLE "ModelPolicy" ADD CONSTRAINT "model_policy_exactly_one_scope"
  CHECK (
    (
      CASE WHEN "agencyId"     IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN "departmentId" IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN "workspaceId"  IS NOT NULL THEN 1 ELSE 0 END +
      CASE WHEN "agentId"      IS NOT NULL THEN 1 ELSE 0 END
    ) = 1
  );
