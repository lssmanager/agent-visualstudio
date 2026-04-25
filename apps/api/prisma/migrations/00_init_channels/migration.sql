-- Migration: 00_init_channels
-- Crea las tablas Channel y LlmProvider.
-- Ejecutar con: npx prisma migrate deploy

CREATE TYPE IF NOT EXISTS "ChannelKind"   AS ENUM ('telegram', 'whatsapp', 'discord', 'webchat');
CREATE TYPE IF NOT EXISTS "ChannelStatus" AS ENUM ('provisioned', 'bound', 'error', 'offline');

CREATE TABLE IF NOT EXISTS "Workspace" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "config"      JSONB       NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP   NOT NULL
);

CREATE TABLE IF NOT EXISTS "Agent" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "workspaceId" TEXT        NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "role"        TEXT,
  "goal"        TEXT,
  "backstory"   TEXT,
  "model"       TEXT        NOT NULL DEFAULT 'gpt-4o-mini',
  "tools"       JSONB       NOT NULL DEFAULT '[]',
  "config"      JSONB       NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP   NOT NULL
);
CREATE INDEX IF NOT EXISTS "Agent_workspaceId_idx" ON "Agent"("workspaceId");

CREATE TABLE IF NOT EXISTS "Flow" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "workspaceId" TEXT        NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "nodes"       JSONB       NOT NULL DEFAULT '[]',
  "edges"       JSONB       NOT NULL DEFAULT '[]',
  "config"      JSONB       NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP   NOT NULL
);
CREATE INDEX IF NOT EXISTS "Flow_workspaceId_idx" ON "Flow"("workspaceId");

CREATE TABLE IF NOT EXISTS "Skill" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "workspaceId" TEXT        NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "type"        TEXT        NOT NULL DEFAULT 'function',
  "config"      JSONB       NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP   NOT NULL
);
CREATE INDEX IF NOT EXISTS "Skill_workspaceId_idx" ON "Skill"("workspaceId");

CREATE TABLE IF NOT EXISTS "Policy" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "workspaceId" TEXT        NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "rules"       JSONB       NOT NULL DEFAULT '[]',
  "config"      JSONB       NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP   NOT NULL
);
CREATE INDEX IF NOT EXISTS "Policy_workspaceId_idx" ON "Policy"("workspaceId");

CREATE TABLE IF NOT EXISTS "Hook" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "workspaceId" TEXT        NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "name"        TEXT        NOT NULL,
  "event"       TEXT        NOT NULL,
  "action"      JSONB       NOT NULL DEFAULT '{}',
  "enabled"     BOOLEAN     NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP   NOT NULL
);
CREATE INDEX IF NOT EXISTS "Hook_workspaceId_idx" ON "Hook"("workspaceId");

CREATE TABLE IF NOT EXISTS "Channel" (
  "id"           TEXT          NOT NULL PRIMARY KEY,
  "workspaceId"  TEXT          NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "kind"         "ChannelKind" NOT NULL,
  "status"       "ChannelStatus" NOT NULL DEFAULT 'provisioned',
  "tokenEnc"     TEXT          NOT NULL,
  "meta"         JSONB         NOT NULL DEFAULT '{}',
  "boundAgentId" TEXT          REFERENCES "Agent"("id"),
  "createdAt"    TIMESTAMP     NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP     NOT NULL
);
CREATE INDEX IF NOT EXISTS "Channel_workspaceId_idx"  ON "Channel"("workspaceId");
CREATE INDEX IF NOT EXISTS "Channel_boundAgentId_idx" ON "Channel"("boundAgentId");

CREATE TABLE IF NOT EXISTS "LlmProvider" (
  "id"          TEXT      NOT NULL PRIMARY KEY,
  "workspaceId" TEXT      NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "provider"    TEXT      NOT NULL,
  "apiKeyEnc"   TEXT      NOT NULL,
  "baseUrl"     TEXT,
  "isDefault"   BOOLEAN   NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP NOT NULL,
  UNIQUE ("workspaceId", "provider")
);
CREATE INDEX IF NOT EXISTS "LlmProvider_workspaceId_idx" ON "LlmProvider"("workspaceId");
