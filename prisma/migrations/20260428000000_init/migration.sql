-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260428000000_init
-- Agent Visual Studio — Base platform schema
--
-- Tablas creadas en este script:
--   Agency, Department, Workspace, Agent, Subagent
--   Skill, AgentSkill, SubagentSkill
--   Flow, Run, RunStep
--   ChannelConfig, ChannelBinding, GatewaySession, ConversationMessage
--   N8nConnection, N8nWorkflow
--   BudgetPolicy, ModelPolicy
--   AuditEvent
--
-- C-20: Partial unique indexes para isLevelOrchestrator (exactamente UN
--   orquestador por scope Agency/Department/Workspace). Prisma no puede
--   expresar "@@unique WHERE value = true" — se aplican como raw SQL aquí.
--
-- D-10: Índices de performance en Run, RunStep, ConversationMessage, AuditEvent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Agency ──────────────────────────────────────────────────────────────────

CREATE TABLE "Agency" (
  "id"           TEXT         NOT NULL,
  "name"         TEXT         NOT NULL,
  "slug"         TEXT         NOT NULL,
  "systemPrompt" TEXT,
  "model"        TEXT         NOT NULL DEFAULT 'openai/gpt-4o',
  "profileJson"  JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");

-- ─── Department ──────────────────────────────────────────────────────────────

CREATE TABLE "Department" (
  "id"                  TEXT         NOT NULL,
  "agencyId"            TEXT         NOT NULL,
  "name"                TEXT         NOT NULL,
  "slug"                TEXT         NOT NULL,
  "systemPrompt"        TEXT,
  "model"               TEXT         NOT NULL DEFAULT 'openai/gpt-4o',
  "profileJson"         JSONB,
  "isLevelOrchestrator" BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Department_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Department_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "Department_agencyId_slug_key"
  ON "Department"("agencyId", "slug");

-- ─── Workspace ───────────────────────────────────────────────────────────────

CREATE TABLE "Workspace" (
  "id"                  TEXT         NOT NULL,
  "departmentId"        TEXT         NOT NULL,
  "name"                TEXT         NOT NULL,
  "slug"                TEXT         NOT NULL,
  "systemPrompt"        TEXT,
  "model"               TEXT         NOT NULL DEFAULT 'openai/gpt-4o',
  "profileJson"         JSONB,
  "isLevelOrchestrator" BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Workspace_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "Workspace_departmentId_slug_key"
  ON "Workspace"("departmentId", "slug");

-- ─── Agent ───────────────────────────────────────────────────────────────────

CREATE TABLE "Agent" (
  "id"                  TEXT         NOT NULL,
  "workspaceId"         TEXT         NOT NULL,
  "name"                TEXT         NOT NULL,
  "slug"                TEXT         NOT NULL,
  "role"                TEXT         NOT NULL DEFAULT 'specialist',
  "isLevelOrchestrator" BOOLEAN      NOT NULL DEFAULT FALSE,
  "systemPrompt"        TEXT,
  "model"               TEXT         NOT NULL DEFAULT 'openai/gpt-4o',
  "profileJson"         JSONB,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Agent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Agent_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "Agent_workspaceId_slug_key"
  ON "Agent"("workspaceId", "slug");

-- ─── Subagent ────────────────────────────────────────────────────────────────

CREATE TABLE "Subagent" (
  "id"           TEXT         NOT NULL,
  "agentId"      TEXT         NOT NULL,
  "name"         TEXT         NOT NULL,
  "slug"         TEXT         NOT NULL,
  "systemPrompt" TEXT,
  "model"        TEXT         NOT NULL DEFAULT 'openai/gpt-4o',
  "profileJson"  JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Subagent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subagent_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "Subagent_agentId_slug_key"
  ON "Subagent"("agentId", "slug");

-- ─── Skill ───────────────────────────────────────────────────────────────────

CREATE TABLE "Skill" (
  "id"          TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "type"        TEXT         NOT NULL,
  "config"      JSONB        NOT NULL,
  "schema"      JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- ─── AgentSkill ──────────────────────────────────────────────────────────────

CREATE TABLE "AgentSkill" (
  "agentId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,

  CONSTRAINT "AgentSkill_pkey" PRIMARY KEY ("agentId", "skillId"),
  CONSTRAINT "AgentSkill_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE,
  CONSTRAINT "AgentSkill_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE
);

-- ─── SubagentSkill ───────────────────────────────────────────────────────────

CREATE TABLE "SubagentSkill" (
  "subagentId" TEXT NOT NULL,
  "skillId"    TEXT NOT NULL,

  CONSTRAINT "SubagentSkill_pkey" PRIMARY KEY ("subagentId", "skillId"),
  CONSTRAINT "SubagentSkill_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE CASCADE,
  CONSTRAINT "SubagentSkill_skillId_fkey"
    FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE
);

-- ─── Flow ────────────────────────────────────────────────────────────────────

CREATE TABLE "Flow" (
  "id"          TEXT         NOT NULL,
  "agentId"     TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "spec"        JSONB        NOT NULL,
  "version"     INTEGER      NOT NULL DEFAULT 1,
  "isActive"    BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Flow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Flow_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE
);

-- ─── Run ─────────────────────────────────────────────────────────────────────

CREATE TABLE "Run" (
  "id"           TEXT             NOT NULL,
  "flowId"       TEXT             NOT NULL,
  "agencyId"     TEXT,
  "status"       TEXT             NOT NULL DEFAULT 'queued',
  "trigger"      JSONB            NOT NULL,
  "error"        TEXT,
  "startedAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"  TIMESTAMP(3),
  "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "metadata"     JSONB,
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Run_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Run_flowId_fkey"
    FOREIGN KEY ("flowId") REFERENCES "Flow"("id"),
  CONSTRAINT "Run_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
);

-- D-10: índices de performance para Run
CREATE INDEX "Run_flowId_status_idx"
  ON "Run"("flowId", "status");

CREATE INDEX "Run_agencyId_status_createdAt_idx"
  ON "Run"("agencyId", "status", "createdAt");

-- ─── RunStep ─────────────────────────────────────────────────────────────────

CREATE TABLE "RunStep" (
  "id"          TEXT             NOT NULL,
  "runId"       TEXT             NOT NULL,
  "nodeId"      TEXT             NOT NULL,
  "nodeType"    TEXT             NOT NULL,
  "agentId"     TEXT,
  "status"      TEXT             NOT NULL DEFAULT 'queued',
  "input"       JSONB,
  "output"      JSONB,
  "error"       TEXT,
  "tokenUsage"  JSONB,
  "costUsd"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "retryCount"  INTEGER          NOT NULL DEFAULT 0,
  "startedAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "RunStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RunStep_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE,
  CONSTRAINT "RunStep_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
);

-- D-10: índices de performance para RunStep
CREATE INDEX "RunStep_runId_status_idx"
  ON "RunStep"("runId", "status");

CREATE INDEX "RunStep_agentId_startedAt_idx"
  ON "RunStep"("agentId", "startedAt");

-- ─── ChannelConfig ───────────────────────────────────────────────────────────

CREATE TABLE "ChannelConfig" (
  "id"               TEXT         NOT NULL,
  "type"             TEXT         NOT NULL,
  "name"             TEXT         NOT NULL,
  "secretsEncrypted" TEXT         NOT NULL,
  "config"           JSONB        NOT NULL,
  "isActive"         BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChannelConfig_pkey" PRIMARY KEY ("id")
);

-- ─── ChannelBinding ──────────────────────────────────────────────────────────

CREATE TABLE "ChannelBinding" (
  "id"              TEXT         NOT NULL,
  "channelConfigId" TEXT         NOT NULL,
  "agentId"         TEXT         NOT NULL,
  "scopeLevel"      TEXT         NOT NULL DEFAULT 'agent',
  "scopeId"         TEXT         NOT NULL,
  "isDefault"       BOOLEAN      NOT NULL DEFAULT FALSE,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChannelBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChannelBinding_channelConfigId_fkey"
    FOREIGN KEY ("channelConfigId") REFERENCES "ChannelConfig"("id") ON DELETE CASCADE,
  CONSTRAINT "ChannelBinding_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ChannelBinding_channelConfigId_agentId_key"
  ON "ChannelBinding"("channelConfigId", "agentId");

-- ─── GatewaySession ──────────────────────────────────────────────────────────

CREATE TABLE "GatewaySession" (
  "id"                TEXT         NOT NULL,
  "channelConfigId"   TEXT         NOT NULL,
  "externalUserId"    TEXT         NOT NULL,
  "agentId"           TEXT         NOT NULL,
  "activeContextJson" JSONB,
  "state"             TEXT         NOT NULL DEFAULT 'active',
  "metadata"          JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GatewaySession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GatewaySession_channelConfigId_fkey"
    FOREIGN KEY ("channelConfigId") REFERENCES "ChannelConfig"("id")
);

CREATE UNIQUE INDEX "GatewaySession_channelConfigId_externalUserId_key"
  ON "GatewaySession"("channelConfigId", "externalUserId");

CREATE INDEX "GatewaySession_agentId_state_idx"
  ON "GatewaySession"("agentId", "state");

-- ─── ConversationMessage ─────────────────────────────────────────────────────
-- D-15: historial append-only, reemplaza messageHistory en GatewaySession.

CREATE TABLE "ConversationMessage" (
  "id"               TEXT         NOT NULL,
  "sessionId"        TEXT         NOT NULL,
  "role"             TEXT         NOT NULL,
  "contentText"      TEXT,
  "contentJson"      JSONB        NOT NULL,
  "channelMessageId" TEXT,
  "toolCallId"       TEXT,
  "toolName"         TEXT,
  "scopeType"        TEXT,
  "scopeId"          TEXT,
  "tokenCount"       INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationMessage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "GatewaySession"("id") ON DELETE CASCADE
);

CREATE INDEX "ConversationMessage_sessionId_createdAt_idx"
  ON "ConversationMessage"("sessionId", "createdAt");

CREATE INDEX "ConversationMessage_sessionId_role_idx"
  ON "ConversationMessage"("sessionId", "role");

CREATE INDEX "ConversationMessage_scopeId_createdAt_idx"
  ON "ConversationMessage"("scopeId", "createdAt");

-- ─── N8nConnection ───────────────────────────────────────────────────────────

CREATE TABLE "N8nConnection" (
  "id"              TEXT         NOT NULL,
  "name"            TEXT         NOT NULL DEFAULT 'default',
  "baseUrl"         TEXT         NOT NULL,
  "apiKeyEncrypted" TEXT         NOT NULL,
  "isActive"        BOOLEAN      NOT NULL DEFAULT TRUE,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "N8nConnection_pkey" PRIMARY KEY ("id")
);

-- ─── N8nWorkflow ─────────────────────────────────────────────────────────────

CREATE TABLE "N8nWorkflow" (
  "id"            TEXT         NOT NULL,
  "connectionId"  TEXT         NOT NULL,
  "n8nWorkflowId" TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "description"   TEXT,
  "inputSchema"   JSONB,
  "webhookUrl"    TEXT,
  "isActive"      BOOLEAN      NOT NULL DEFAULT TRUE,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "N8nWorkflow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "N8nWorkflow_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "N8nConnection"("id")
);

CREATE UNIQUE INDEX "N8nWorkflow_connectionId_n8nWorkflowId_key"
  ON "N8nWorkflow"("connectionId", "n8nWorkflowId");

-- ─── BudgetPolicy ────────────────────────────────────────────────────────────
-- INVARIANT: exactly one FK is non-null (enforced by CHECK in 20260429_provider_catalog).
-- Resolution order: agent → workspace → department → agency

CREATE TABLE "BudgetPolicy" (
  "id"           TEXT             NOT NULL,
  "limitUsd"     DOUBLE PRECISION NOT NULL,
  "periodDays"   INTEGER          NOT NULL DEFAULT 30,
  "alertAt"      DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)     NOT NULL,
  "agencyId"     TEXT             UNIQUE,
  "departmentId" TEXT             UNIQUE,
  "workspaceId"  TEXT             UNIQUE,
  "agentId"      TEXT             UNIQUE,

  CONSTRAINT "BudgetPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetPolicy_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE,
  CONSTRAINT "BudgetPolicy_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE,
  CONSTRAINT "BudgetPolicy_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "BudgetPolicy_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE
);

-- ─── ModelPolicy ─────────────────────────────────────────────────────────────
-- INVARIANT: exactly one FK is non-null (enforced by CHECK in 20260429_provider_catalog).
-- Resolution order: agent → workspace → department → agency

CREATE TABLE "ModelPolicy" (
  "id"            TEXT             NOT NULL,
  "primaryModel"  TEXT             NOT NULL,
  "fallbackChain" TEXT[]           NOT NULL DEFAULT '{}',
  "temperature"   DOUBLE PRECISION          DEFAULT 0.7,
  "maxTokens"     INTEGER                   DEFAULT 4096,
  "createdAt"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)     NOT NULL,
  "agencyId"      TEXT             UNIQUE,
  "departmentId"  TEXT             UNIQUE,
  "workspaceId"   TEXT             UNIQUE,
  "agentId"       TEXT             UNIQUE,

  CONSTRAINT "ModelPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ModelPolicy_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE,
  CONSTRAINT "ModelPolicy_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE,
  CONSTRAINT "ModelPolicy_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "ModelPolicy_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE
);

-- ─── AuditEvent ──────────────────────────────────────────────────────────────

CREATE TABLE "AuditEvent" (
  "id"        TEXT         NOT NULL,
  "eventType" TEXT         NOT NULL,
  "scopeType" TEXT,
  "scopeId"   TEXT,
  "userId"    TEXT,
  "payload"   JSONB        NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_eventType_createdAt_idx"
  ON "AuditEvent"("eventType", "createdAt");

CREATE INDEX "AuditEvent_scopeType_scopeId_createdAt_idx"
  ON "AuditEvent"("scopeType", "scopeId", "createdAt");

CREATE INDEX "AuditEvent_userId_createdAt_idx"
  ON "AuditEvent"("userId", "createdAt");

-- ─── C-20: Partial Unique Indexes for isLevelOrchestrator ────────────────────
--
-- Prisma no puede expresar "@@unique WHERE value = true", por lo que estos
-- indexes se crean manualmente (nota C-20 del Plan Maestro).
-- Garantizan que exactamente UN nodo sea el orquestador de nivel en su scope.

-- Solo UN Department puede ser orquestador de nivel 2 por Agency
CREATE UNIQUE INDEX "dept_one_orchestrator_per_agency"
  ON "Department"("agencyId")
  WHERE "isLevelOrchestrator" = TRUE;

-- Solo UN Workspace puede ser orquestador de nivel 3 por Department
CREATE UNIQUE INDEX "workspace_one_orchestrator_per_department"
  ON "Workspace"("departmentId")
  WHERE "isLevelOrchestrator" = TRUE;

-- Solo UN Agent puede ser orquestador de nivel 4 por Workspace
CREATE UNIQUE INDEX "agent_one_orchestrator_per_workspace"
  ON "Agent"("workspaceId")
  WHERE "isLevelOrchestrator" = TRUE;
