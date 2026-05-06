-- Migration: 20260506000000_init
-- Generated from schema.prisma v12 (Agent Visual Studio)
-- Run with: prisma migrate deploy

BEGIN;

-- ── ENUMS ──────────────────────────────────────────────────────────────

CREATE TYPE "ChannelKind" AS ENUM ('telegram','whatsapp','discord','webchat','slack','teams','webhook');
CREATE TYPE "ChannelType" AS ENUM ('telegram','whatsapp','discord','webchat','slack','teams','webhook');
CREATE TYPE "ChannelStatus" AS ENUM ('provisioned','bound','error','offline');
CREATE TYPE "BotStatus" AS ENUM ('draft','configured','provisioning','needsauth','starting','online','degraded','offline','deprovisioned','initializing','running','stopped','error');
CREATE TYPE "RunStatus" AS ENUM ('pending','running','paused','completed','failed','cancelled');
CREATE TYPE "RunStepStatus" AS ENUM ('pending','running','completed','failed','skipped');
CREATE TYPE "MessageRole" AS ENUM ('user','assistant','system','tool');
CREATE TYPE "BudgetScope" AS ENUM ('workspace','agent','model');
CREATE TYPE "BudgetPeriod" AS ENUM ('daily','weekly','monthly','total');
CREATE TYPE "IncidentKind" AS ENUM ('alert','exceeded','reset');
CREATE TYPE "ModelPolicyScope" AS ENUM ('workspace','agent','flow_node');
CREATE TYPE "ApprovalStatus" AS ENUM ('pending','approved','rejected','expired');
CREATE TYPE "ActivityResource" AS ENUM ('workspace','agent','flow','skill','policy','channel','run','budget','model_policy','approval');
CREATE TYPE "ProviderAuthType" AS ENUM ('api_key','oauth','aws_credentials','azure_api_key','none');

-- ── TABLES ─────────────────────────────────────────────────────────────

CREATE TABLE "agencies" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "name"         TEXT NOT NULL,
  "slug"         TEXT NOT NULL,
  "plan"         TEXT NOT NULL DEFAULT 'free',
  "metadata"     JSONB DEFAULT '{}'::jsonb,
  "systemPrompt" TEXT,
  "deletedAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agencies_slug_key" ON "agencies"("slug");

CREATE TABLE "departments" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "agencyId"     TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "slug"         TEXT NOT NULL,
  "metadata"     JSONB DEFAULT '{}'::jsonb,
  "systemPrompt" TEXT,
  "deletedAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_agencyId_slug_key" ON "departments"("agencyId","slug");

CREATE TABLE "workspaces" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid(),
  "departmentId"        TEXT,
  "name"                TEXT NOT NULL,
  "slug"                TEXT NOT NULL DEFAULT '',
  "description"         TEXT,
  "config"              JSONB NOT NULL DEFAULT '{}'::jsonb,
  "modelPolicy"         JSONB DEFAULT '{}'::jsonb,
  "metadata"            JSONB DEFAULT '{}'::jsonb,
  "systemPrompt"        TEXT,
  "isLevelOrchestrator" BOOLEAN NOT NULL DEFAULT false,
  "deletedAt"           TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workspaces_departmentId_slug_key" ON "workspaces"("departmentId","slug");

CREATE TABLE "system_configs" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid(),
  "key"       TEXT NOT NULL,
  "value"     JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

CREATE TABLE "agents" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"         TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "role"                TEXT NOT NULL DEFAULT '',
  "description"         TEXT NOT NULL DEFAULT '',
  "instructions"        TEXT NOT NULL DEFAULT '',
  "goal"                TEXT DEFAULT '',
  "backstory"           TEXT DEFAULT '',
  "model"               TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "tools"               JSONB NOT NULL DEFAULT '[]'::jsonb,
  "tags"                TEXT[] DEFAULT ARRAY[]::TEXT[],
  "visibility"          TEXT NOT NULL DEFAULT 'private',
  "executionMode"       TEXT NOT NULL DEFAULT 'direct',
  "kind"                TEXT NOT NULL DEFAULT 'agent',
  "parentAgentId"       TEXT,
  "context"             TEXT[] DEFAULT ARRAY[]::TEXT[],
  "triggers"            JSONB DEFAULT '[]'::jsonb,
  "permissions"         JSONB DEFAULT '{}'::jsonb,
  "handoffRules"        JSONB DEFAULT '[]'::jsonb,
  "channelBindings"     JSONB DEFAULT '[]'::jsonb,
  "policyBindings"      JSONB DEFAULT '[]'::jsonb,
  "config"              JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isEnabled"           BOOLEAN NOT NULL DEFAULT true,
  "slug"                TEXT,
  "isLevelOrchestrator" BOOLEAN NOT NULL DEFAULT false,
  "systemPrompt"        TEXT,
  "deletedAt"           TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agents_workspaceId_idx" ON "agents"("workspaceId");
CREATE INDEX "agents_workspaceId_slug_idx" ON "agents"("workspaceId","slug");

CREATE TABLE "agent_profiles" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "agentId"        TEXT NOT NULL,
  "systemPrompt"   TEXT,
  "persona"        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "knowledgeBase"  JSONB NOT NULL DEFAULT '[]'::jsonb,
  "responseFormat" TEXT,
  "contextWindow"  INTEGER NOT NULL DEFAULT 8192,
  "memoryEnabled"  BOOLEAN NOT NULL DEFAULT false,
  "memoryConfig"   JSONB NOT NULL DEFAULT '{}'::jsonb,
  "version"        INTEGER NOT NULL DEFAULT 1,
  "propagatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_profiles_agentId_key" ON "agent_profiles"("agentId");
CREATE INDEX "agent_profiles_agentId_idx" ON "agent_profiles"("agentId");

CREATE TABLE "skills" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"  TEXT,
  "name"         TEXT NOT NULL,
  "description"  TEXT NOT NULL DEFAULT '',
  "version"      TEXT NOT NULL DEFAULT '1.0.0',
  "type"         TEXT NOT NULL DEFAULT 'builtin',
  "category"     TEXT NOT NULL DEFAULT 'general',
  "permissions"  TEXT[] DEFAULT ARRAY[]::TEXT[],
  "functions"    JSONB DEFAULT '[]'::jsonb,
  "plugin"       JSONB,
  "openapiSpec"  JSONB,
  "mcpConfig"    JSONB,
  "n8nConfig"    JSONB,
  "config"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "files"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "deletedAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "skills_workspaceId_idx" ON "skills"("workspaceId");

CREATE TABLE "agent_skills" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "agentId"        TEXT NOT NULL,
  "skillId"        TEXT NOT NULL,
  "configOverride" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "addedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_skills_agentId_skillId_key" ON "agent_skills"("agentId","skillId");
CREATE INDEX "agent_skills_agentId_idx" ON "agent_skills"("agentId");
CREATE INDEX "agent_skills_skillId_idx" ON "agent_skills"("skillId");

CREATE TABLE "policies" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "rules"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "policies_workspaceId_idx" ON "policies"("workspaceId");

CREATE TABLE "hooks" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "event"       TEXT NOT NULL,
  "action"      JSONB NOT NULL DEFAULT '{}'::jsonb,
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hooks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hooks_workspaceId_idx" ON "hooks"("workspaceId");

CREATE TABLE "n8n_connections" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
  "name"            TEXT NOT NULL DEFAULT 'default',
  "baseUrl"         TEXT NOT NULL,
  "apiKeyEncrypted" TEXT NOT NULL,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "n8n_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "n8n_workflows" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "connectionId"  TEXT NOT NULL,
  "n8nWorkflowId" TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT DEFAULT '',
  "webhookUrl"    TEXT,
  "webhookMethod" TEXT NOT NULL DEFAULT 'POST',
  "inputSchema"   JSONB DEFAULT '{}'::jsonb,
  "outputSchema"  JSONB DEFAULT '{}'::jsonb,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "n8n_workflows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "n8n_workflows_connectionId_n8nWorkflowId_key" ON "n8n_workflows"("connectionId","n8nWorkflowId");
CREATE INDEX "n8n_workflows_connectionId_idx" ON "n8n_workflows"("connectionId");

CREATE TABLE "provider_catalog" (
  "id"             TEXT NOT NULL,
  "displayName"    TEXT NOT NULL,
  "description"    TEXT,
  "authType"       "ProviderAuthType" NOT NULL DEFAULT 'api_key',
  "capabilities"   JSONB NOT NULL DEFAULT '{}'::jsonb,
  "defaultModels"  JSONB NOT NULL DEFAULT '{}'::jsonb,
  "defaultBaseUrl" TEXT,
  "isLocalOnly"    BOOLEAN NOT NULL DEFAULT false,
  "isOpenAiCompat" BOOLEAN NOT NULL DEFAULT false,
  "isEnabled"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "provider_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "llm_providers" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "baseUrl"     TEXT,
  "apiKeyEnc"   TEXT,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "llm_providers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "llm_providers_workspaceId_provider_key" ON "llm_providers"("workspaceId","provider");
CREATE INDEX "llm_providers_workspaceId_idx" ON "llm_providers"("workspaceId");
CREATE INDEX "llm_providers_provider_idx" ON "llm_providers"("provider");

CREATE TABLE "oauth_tokens" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
  "llmProviderId"   TEXT NOT NULL,
  "accessTokenEnc"  TEXT NOT NULL,
  "refreshTokenEnc" TEXT,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "accountId"       TEXT,
  "scopes"          TEXT,
  "meta"            JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "oauth_tokens_llmProviderId_key" ON "oauth_tokens"("llmProviderId");
CREATE INDEX "oauth_tokens_expiresAt_idx" ON "oauth_tokens"("expiresAt");

CREATE TABLE "provider_credentials" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
  "agencyId"        TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "baseUrl"         TEXT,
  "apiKeyEncrypted" TEXT NOT NULL,
  "extraHeaders"    JSONB,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "syncedAt"        TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "provider_credentials_agencyId_idx" ON "provider_credentials"("agencyId");
CREATE INDEX "provider_credentials_agencyId_isActive_idx" ON "provider_credentials"("agencyId","isActive");

CREATE TABLE "model_catalog_entries" (
  "id"                     TEXT NOT NULL DEFAULT gen_random_uuid(),
  "providerId"             TEXT NOT NULL,
  "modelId"                TEXT NOT NULL,
  "displayName"            TEXT NOT NULL,
  "families"               TEXT[] DEFAULT ARRAY[]::TEXT[],
  "contextK"               INTEGER NOT NULL DEFAULT 0,
  "promptCostPer1kUsd"     DECIMAL(12,8),
  "completionCostPer1kUsd" DECIMAL(12,8),
  "isActive"               BOOLEAN NOT NULL DEFAULT true,
  "raw"                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "model_catalog_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "model_catalog_entries_providerId_modelId_key" ON "model_catalog_entries"("providerId","modelId");
CREATE INDEX "model_catalog_entries_providerId_idx" ON "model_catalog_entries"("providerId");
CREATE INDEX "model_catalog_entries_providerId_isActive_idx" ON "model_catalog_entries"("providerId","isActive");
CREATE INDEX "model_catalog_entries_modelId_idx" ON "model_catalog_entries"("modelId");

CREATE TABLE "flows" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT DEFAULT '',
  "version"     TEXT DEFAULT '1.0.0',
  "trigger"     TEXT NOT NULL DEFAULT 'manual',
  "nodes"       JSONB DEFAULT '[]'::jsonb,
  "edges"       JSONB DEFAULT '[]'::jsonb,
  "spec"        JSONB DEFAULT '{}'::jsonb,
  "config"      JSONB NOT NULL DEFAULT '{}'::jsonb,
  "tags"        TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "flows_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "flows_workspaceId_idx" ON "flows"("workspaceId");

CREATE TABLE "runs" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"  TEXT NOT NULL,
  "flowId"       TEXT,
  "agentId"      TEXT,
  "sessionId"    TEXT,
  "channelKind"  "ChannelKind",
  "totalCostUsd" DECIMAL(10,4),
  "status"       "RunStatus" NOT NULL DEFAULT 'pending',
  "trigger"      JSONB NOT NULL DEFAULT '{}'::jsonb,
  "inputData"    JSONB NOT NULL DEFAULT '{}'::jsonb,
  "outputData"   JSONB,
  "error"        TEXT,
  "metadata"     JSONB DEFAULT '{}'::jsonb,
  "startedAt"    TIMESTAMP(3),
  "completedAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "runs_workspaceId_status_idx" ON "runs"("workspaceId","status");
CREATE INDEX "runs_flowId_idx" ON "runs"("flowId");
CREATE INDEX "runs_agentId_idx" ON "runs"("agentId");
CREATE INDEX "runs_status_idx" ON "runs"("status");
CREATE INDEX "runs_createdAt_idx" ON "runs"("createdAt");

CREATE TABLE "run_steps" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
  "runId"            TEXT NOT NULL,
  "nodeId"           TEXT NOT NULL,
  "nodeType"         TEXT NOT NULL,
  "index"            INTEGER NOT NULL DEFAULT 0,
  "status"           "RunStepStatus" NOT NULL DEFAULT 'pending',
  "agentId"          TEXT,
  "input"            JSONB DEFAULT '{}'::jsonb,
  "output"           JSONB,
  "error"            TEXT,
  "retryCount"       INTEGER NOT NULL DEFAULT 0,
  "model"            TEXT,
  "provider"         TEXT,
  "tokenInput"       INTEGER NOT NULL DEFAULT 0,
  "tokenOutput"      INTEGER NOT NULL DEFAULT 0,
  "promptTokens"     INTEGER,
  "completionTokens" INTEGER,
  "totalTokens"      INTEGER,
  "tokenUsage"       INTEGER NOT NULL DEFAULT 0,
  "costUsd"          DECIMAL(12,8),
  "startedAt"        TIMESTAMP(3),
  "completedAt"      TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "checkpointData"   JSONB,
  "checkpointSeq"    INTEGER NOT NULL DEFAULT 0,
  "interruptReason"  TEXT,
  "resumePayload"    JSONB,
  "durableState"     TEXT NOT NULL DEFAULT 'none',
  CONSTRAINT "run_steps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "run_steps_runId_idx" ON "run_steps"("runId");
CREATE INDEX "run_steps_runId_index_idx" ON "run_steps"("runId","index");
CREATE INDEX "run_steps_agentId_idx" ON "run_steps"("agentId");

CREATE TABLE "channels" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"  TEXT NOT NULL,
  "kind"         "ChannelKind" NOT NULL,
  "status"       "ChannelStatus" NOT NULL DEFAULT 'provisioned',
  "botStatus"    "BotStatus" NOT NULL DEFAULT 'draft',
  "tokenEnc"     TEXT NOT NULL,
  "meta"         JSONB NOT NULL DEFAULT '{}'::jsonb,
  "boundAgentId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "channels_workspaceId_idx" ON "channels"("workspaceId");
CREATE INDEX "channels_boundAgentId_idx" ON "channels"("boundAgentId");

CREATE TABLE "channel_configs" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"     TEXT NOT NULL,
  "channel"         TEXT NOT NULL,
  "displayName"     TEXT NOT NULL,
  "credentials"     JSONB NOT NULL DEFAULT '{}'::jsonb,
  "settings"        JSONB DEFAULT '{}'::jsonb,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "statusDetail"    TEXT,
  "statusUpdatedAt" TIMESTAMP(3),
  "type"            TEXT DEFAULT '',
  "name"            TEXT DEFAULT '',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_configs_workspaceId_channel_key" ON "channel_configs"("workspaceId","channel");

CREATE TABLE "channel_bindings" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid(),
  "channelConfigId"   TEXT NOT NULL,
  "agentId"           TEXT NOT NULL,
  "route"             TEXT NOT NULL,
  "isEnabled"         BOOLEAN NOT NULL DEFAULT true,
  "externalChannelId" TEXT,
  "externalGuildId"   TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channel_bindings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_bindings_channelConfigId_route_key" ON "channel_bindings"("channelConfigId","route");

CREATE TABLE "gateway_sessions" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid(),
  "channelConfigId"   TEXT NOT NULL,
  "externalId"        TEXT NOT NULL,
  "agentId"           TEXT NOT NULL,
  "activeContextJson" JSONB DEFAULT '[]'::jsonb,
  "state"             TEXT NOT NULL DEFAULT 'active',
  "lastActivityAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata"          JSONB DEFAULT '{}'::jsonb,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gateway_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gateway_sessions_channelConfigId_externalId_key" ON "gateway_sessions"("channelConfigId","externalId");
CREATE INDEX "gateway_sessions_agentId_idx" ON "gateway_sessions"("agentId");

CREATE TABLE "conversation_messages" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
  "sessionId"        TEXT,
  "channelId"        TEXT,
  "role"             "MessageRole" NOT NULL,
  "content"          TEXT,
  "contentText"      TEXT,
  "contentJson"      JSONB,
  "channelMessageId" TEXT,
  "toolCallId"       TEXT,
  "toolName"         TEXT,
  "scopeType"        TEXT,
  "scopeId"          TEXT,
  "tokenCount"       INTEGER,
  "metadata"         JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conversation_messages_sessionId_createdAt_idx" ON "conversation_messages"("sessionId","createdAt");
CREATE INDEX "conversation_messages_channelId_createdAt_idx" ON "conversation_messages"("channelId","createdAt");
CREATE INDEX "conversation_messages_scopeId_createdAt_idx" ON "conversation_messages"("scopeId","createdAt");

CREATE TABLE "budget_policies" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid(),
  "scopeType"           TEXT NOT NULL DEFAULT 'workspace',
  "scopeId"             TEXT NOT NULL DEFAULT '',
  "agencyId"            TEXT,
  "departmentId"        TEXT,
  "agentId"             TEXT,
  "workspaceId"         TEXT,
  "name"                TEXT NOT NULL DEFAULT '',
  "scope"               "BudgetScope" NOT NULL DEFAULT 'workspace',
  "targetId"            TEXT,
  "limitUsd"            DECIMAL(10,4),
  "period"              "BudgetPeriod" NOT NULL DEFAULT 'monthly',
  "periodDays"          INTEGER,
  "alertPct"            INTEGER NOT NULL DEFAULT 80,
  "alertAt"             TIMESTAMP(3),
  "enabled"             BOOLEAN NOT NULL DEFAULT true,
  "window"              TEXT NOT NULL DEFAULT 'monthly',
  "softCapUsd"          DOUBLE PRECISION,
  "hardCapUsd"          DOUBLE PRECISION,
  "requireApproval"     BOOLEAN NOT NULL DEFAULT false,
  "approvalThreshold"   DOUBLE PRECISION,
  "replayBudgetUsd"     DOUBLE PRECISION,
  "escalationThreshold" DOUBLE PRECISION,
  "perModelCaps"        JSONB DEFAULT '{}'::jsonb,
  "inheritedFrom"       TEXT,
  "effectiveValue"      JSONB,
  "isOverride"          BOOLEAN NOT NULL DEFAULT false,
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "budget_policies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "budget_policies_scopeId_idx" ON "budget_policies"("scopeId");
CREATE INDEX "budget_policies_workspaceId_idx" ON "budget_policies"("workspaceId");
CREATE INDEX "budget_policies_agencyId_idx" ON "budget_policies"("agencyId");
CREATE INDEX "budget_policies_departmentId_idx" ON "budget_policies"("departmentId");
CREATE INDEX "budget_policies_agentId_idx" ON "budget_policies"("agentId");

CREATE TABLE "budget_incidents" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
  "budgetPolicyId" TEXT,
  "kind"           "IncidentKind" NOT NULL DEFAULT 'alert',
  "usageUsd"       DECIMAL(10,4),
  "policyId"       TEXT NOT NULL DEFAULT '',
  "scopeType"      TEXT NOT NULL DEFAULT '',
  "scopeId"        TEXT NOT NULL DEFAULT '',
  "incidentType"   TEXT NOT NULL DEFAULT '',
  "triggeredAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"     TIMESTAMP(3),
  "runId"          TEXT,
  "runStepId"      TEXT,
  "amountUsd"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pct"            INTEGER NOT NULL DEFAULT 0,
  "detail"         JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadata"       JSONB DEFAULT '{}'::jsonb,
  "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_incidents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "budget_incidents_budgetPolicyId_idx" ON "budget_incidents"("budgetPolicyId");
CREATE INDEX "budget_incidents_scopeId_triggeredAt_idx" ON "budget_incidents"("scopeId","triggeredAt");
CREATE INDEX "budget_incidents_occurredAt_idx" ON "budget_incidents"("occurredAt");

CREATE TABLE "cost_events" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid(),
  "runStepId"        TEXT,
  "runId"            TEXT,
  "agentId"          TEXT,
  "budgetPolicyId"   TEXT,
  "scopeType"        TEXT NOT NULL DEFAULT '',
  "scopeId"          TEXT NOT NULL DEFAULT '',
  "workspaceId"      TEXT,
  "model"            TEXT NOT NULL,
  "provider"         TEXT NOT NULL DEFAULT 'openai',
  "promptTokens"     INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "totalTokens"      INTEGER NOT NULL DEFAULT 0,
  "costUsd"          DECIMAL(12,8),
  "latencyMs"        INTEGER,
  "role"             TEXT,
  "metadata"         JSONB NOT NULL DEFAULT '{}'::jsonb,
  "timestamp"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cost_events_scopeId_timestamp_idx" ON "cost_events"("scopeId","timestamp");
CREATE INDEX "cost_events_model_timestamp_idx" ON "cost_events"("model","timestamp");
CREATE INDEX "cost_events_runId_idx" ON "cost_events"("runId");
CREATE INDEX "cost_events_agentId_timestamp_idx" ON "cost_events"("agentId","timestamp");
CREATE INDEX "cost_events_workspaceId_createdAt_idx" ON "cost_events"("workspaceId","createdAt");

CREATE TABLE "model_policies" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
  "scopeType"     TEXT NOT NULL DEFAULT 'workspace',
  "scopeId"       TEXT NOT NULL DEFAULT '',
  "workspaceId"   TEXT,
  "agencyId"      TEXT,
  "departmentId"  TEXT,
  "agentId"       TEXT,
  "scope"         "ModelPolicyScope" NOT NULL DEFAULT 'workspace',
  "targetId"      TEXT,
  "provider"      TEXT NOT NULL DEFAULT 'openai',
  "model"         TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "primaryModel"  TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "fallbackModel" TEXT,
  "fallbackChain" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "temperature"   DECIMAL(3,2) NOT NULL DEFAULT 0.7,
  "maxTokens"     INTEGER NOT NULL DEFAULT 4096,
  "topP"          DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  "config"        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "isOverride"    BOOLEAN NOT NULL DEFAULT false,
  "inheritedFrom" TEXT,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "enabled"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "model_policies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "model_policies_scopeId_idx" ON "model_policies"("scopeId");
CREATE INDEX "model_policies_workspaceId_idx" ON "model_policies"("workspaceId");
CREATE INDEX "model_policies_agencyId_idx" ON "model_policies"("agencyId");
CREATE INDEX "model_policies_departmentId_idx" ON "model_policies"("departmentId");
CREATE INDEX "model_policies_agentId_idx" ON "model_policies"("agentId");

CREATE TABLE "approvals" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT,
  "agentId"     TEXT,
  "runId"       TEXT,
  "runStepId"   TEXT,
  "stepId"      TEXT,
  "status"      "ApprovalStatus" NOT NULL DEFAULT 'pending',
  "title"       TEXT NOT NULL DEFAULT '',
  "description" TEXT,
  "payload"     JSONB NOT NULL DEFAULT '{}'::jsonb,
  "reviewedBy"  TEXT,
  "reviewNote"  TEXT,
  "expiresAt"   TIMESTAMP(3),
  "decidedAt"   TIMESTAMP(3),
  "scopeType"   TEXT NOT NULL DEFAULT '',
  "scopeId"     TEXT NOT NULL DEFAULT '',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt"  TIMESTAMP(3),
  "resolvedBy"  TEXT,
  "reason"      TEXT,
  "context"     JSONB DEFAULT '{}'::jsonb,
  "metadata"    JSONB DEFAULT '{}'::jsonb,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approvals_workspaceId_status_idx" ON "approvals"("workspaceId","status");
CREATE INDEX "approvals_scopeId_status_idx" ON "approvals"("scopeId","status");
CREATE INDEX "approvals_runId_idx" ON "approvals"("runId");

CREATE TABLE "approval_comments" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid(),
  "approvalId" TEXT NOT NULL,
  "authorId"   TEXT NOT NULL,
  "authorType" TEXT NOT NULL DEFAULT 'user',
  "content"    TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_comments_approvalId_idx" ON "approval_comments"("approvalId");

CREATE TABLE "routines" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" TEXT NOT NULL,
  "agentId"     TEXT,
  "flowId"      TEXT,
  "name"        TEXT NOT NULL,
  "description" TEXT DEFAULT '',
  "schedule"    TEXT NOT NULL,
  "payload"     JSONB DEFAULT '{}'::jsonb,
  "isEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt"   TIMESTAMP(3),
  "nextRunAt"   TIMESTAMP(3),
  "lastRunId"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "routines_workspaceId_idx" ON "routines"("workspaceId");
CREATE INDEX "routines_nextRunAt_idx" ON "routines"("nextRunAt");

CREATE TABLE "agent_wakeup_requests" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid(),
  "agentId"     TEXT NOT NULL,
  "runId"       TEXT,
  "runStepId"   TEXT,
  "reason"      TEXT NOT NULL,
  "payload"     JSONB DEFAULT '{}'::jsonb,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "scheduledAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_wakeup_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_wakeup_requests_agentId_status_idx" ON "agent_wakeup_requests"("agentId","status");
CREATE INDEX "agent_wakeup_requests_runId_idx" ON "agent_wakeup_requests"("runId");
CREATE INDEX "agent_wakeup_requests_scheduledAt_idx" ON "agent_wakeup_requests"("scheduledAt");

CREATE TABLE "activity_logs" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "scopeType"    TEXT NOT NULL DEFAULT '',
  "scopeId"      TEXT NOT NULL DEFAULT '',
  "workspaceId"  TEXT,
  "resource"     "ActivityResource" NOT NULL DEFAULT 'workspace',
  "resourceType" TEXT,
  "resourceId"   TEXT,
  "actorType"    TEXT NOT NULL DEFAULT 'user',
  "actorId"      TEXT,
  "action"       TEXT NOT NULL,
  "payload"      JSONB DEFAULT '{}'::jsonb,
  "detail"       TEXT NOT NULL DEFAULT '',
  "userId"       TEXT,
  "diff"         JSONB,
  "ipAddress"    TEXT,
  "metadata"     JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activity_logs_scopeId_createdAt_idx" ON "activity_logs"("scopeId","createdAt");
CREATE INDEX "activity_logs_workspaceId_createdAt_idx" ON "activity_logs"("workspaceId","createdAt");
CREATE INDEX "activity_logs_action_createdAt_idx" ON "activity_logs"("action","createdAt");
CREATE INDEX "activity_logs_actorId_createdAt_idx" ON "activity_logs"("actorId","createdAt");
CREATE INDEX "activity_logs_resourceId_createdAt_idx" ON "activity_logs"("resourceId","createdAt");

CREATE TABLE "users" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
  "email"        TEXT NOT NULL,
  "name"         TEXT,
  "passwordHash" TEXT,
  "role"         TEXT NOT NULL DEFAULT 'member',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- ── FOREIGN KEYS ────────────────────────────────────────────────────────

ALTER TABLE "departments" ADD CONSTRAINT "departments_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE CASCADE;

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL;

ALTER TABLE "agents" ADD CONSTRAINT "agents_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "agents" ADD CONSTRAINT "agents_parentAgentId_fkey"
  FOREIGN KEY ("parentAgentId") REFERENCES "agents"("id");

ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE;

ALTER TABLE "skills" ADD CONSTRAINT "skills_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE;

ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skillId_fkey"
  FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE;

ALTER TABLE "policies" ADD CONSTRAINT "policies_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "hooks" ADD CONSTRAINT "hooks_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "n8n_workflows" ADD CONSTRAINT "n8n_workflows_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "n8n_connections"("id") ON DELETE CASCADE;

ALTER TABLE "llm_providers" ADD CONSTRAINT "llm_providers_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "llm_providers" ADD CONSTRAINT "llm_providers_provider_fkey"
  FOREIGN KEY ("provider") REFERENCES "provider_catalog"("id");

ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_llmProviderId_fkey"
  FOREIGN KEY ("llmProviderId") REFERENCES "llm_providers"("id") ON DELETE CASCADE;

ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_agencyId_fkey"
  FOREIGN KEY ("agencyId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "model_catalog_entries" ADD CONSTRAINT "model_catalog_entries_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "provider_credentials"("id") ON DELETE CASCADE;

ALTER TABLE "flows" ADD CONSTRAINT "flows_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "runs" ADD CONSTRAINT "runs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "runs" ADD CONSTRAINT "runs_flowId_fkey"
  FOREIGN KEY ("flowId") REFERENCES "flows"("id");

ALTER TABLE "runs" ADD CONSTRAINT "runs_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id");

ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id") ON DELETE CASCADE;

ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id");

ALTER TABLE "channels" ADD CONSTRAINT "channels_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "channels" ADD CONSTRAINT "channels_boundAgentId_fkey"
  FOREIGN KEY ("boundAgentId") REFERENCES "agents"("id");

ALTER TABLE "channel_configs" ADD CONSTRAINT "channel_configs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "channel_bindings" ADD CONSTRAINT "channel_bindings_channelConfigId_fkey"
  FOREIGN KEY ("channelConfigId") REFERENCES "channel_configs"("id") ON DELETE CASCADE;

ALTER TABLE "channel_bindings" ADD CONSTRAINT "channel_bindings_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE;

ALTER TABLE "gateway_sessions" ADD CONSTRAINT "gateway_sessions_channelConfigId_fkey"
  FOREIGN KEY ("channelConfigId") REFERENCES "channel_configs"("id") ON DELETE CASCADE;

ALTER TABLE "gateway_sessions" ADD CONSTRAINT "gateway_sessions_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id");

ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "gateway_sessions"("id") ON DELETE CASCADE;

ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE;

ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_scope_workspace_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "workspaces"("id");

ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_scope_agency_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "agencies"("id");

ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_scope_department_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "departments"("id");

ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_scope_agent_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "agents"("id");

ALTER TABLE "budget_incidents" ADD CONSTRAINT "budget_incidents_budgetPolicyId_fkey"
  FOREIGN KEY ("budgetPolicyId") REFERENCES "budget_policies"("id") ON DELETE CASCADE;

ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id");

ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_runStepId_fkey"
  FOREIGN KEY ("runStepId") REFERENCES "run_steps"("id");

ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_budgetPolicyId_fkey"
  FOREIGN KEY ("budgetPolicyId") REFERENCES "budget_policies"("id");

ALTER TABLE "model_policies" ADD CONSTRAINT "model_policies_scope_agency_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "agencies"("id");

ALTER TABLE "model_policies" ADD CONSTRAINT "model_policies_scope_department_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "departments"("id");

ALTER TABLE "model_policies" ADD CONSTRAINT "model_policies_scope_workspace_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "workspaces"("id");

ALTER TABLE "model_policies" ADD CONSTRAINT "model_policies_scope_agent_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "agents"("id");

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id");

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id");

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id");

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_runStepId_fkey"
  FOREIGN KEY ("runStepId") REFERENCES "run_steps"("id");

ALTER TABLE "approval_comments" ADD CONSTRAINT "approval_comments_approvalId_fkey"
  FOREIGN KEY ("approvalId") REFERENCES "approvals"("id") ON DELETE CASCADE;

ALTER TABLE "routines" ADD CONSTRAINT "routines_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;

ALTER TABLE "agent_wakeup_requests" ADD CONSTRAINT "agent_wakeup_requests_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id");

ALTER TABLE "agent_wakeup_requests" ADD CONSTRAINT "agent_wakeup_requests_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "runs"("id");

ALTER TABLE "agent_wakeup_requests" ADD CONSTRAINT "agent_wakeup_requests_runStepId_fkey"
  FOREIGN KEY ("runStepId") REFERENCES "run_steps"("id");

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_scope_agency_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "agencies"("id");

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_scope_department_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "departments"("id");

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_scope_workspace_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "workspaces"("id");

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_scope_agent_fkey"
  FOREIGN KEY ("scopeId") REFERENCES "agents"("id");

COMMIT;
