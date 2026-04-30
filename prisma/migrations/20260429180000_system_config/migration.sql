-- Migration: 20260429180000_system_config
-- Adds SystemConfig table for single-tenant admin settings (API keys, URLs).
-- No encryption — same trust level as process.env / .env on disk.
-- Priority in llm-client.ts: SystemConfig > process.env > MissingApiKeyError

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key"       TEXT        NOT NULL,
    "value"     TEXT        NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);
