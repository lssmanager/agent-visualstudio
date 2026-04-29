/**
 * Test fixtures — typed factory helpers.
 *
 * All factories accept a PrismaClient and optional overrides.
 * They insert minimal valid rows and return the created entity.
 * Every factory is idempotent-safe: unique fields are generated with
 * a unique suffix to avoid collisions between tests.
 */

import type { PrismaClient } from '@prisma/client';
import { randomUUID }        from 'crypto';

// ─── Tiny helpers ────────────────────────────────────────────────────────────────

/** Generates a short unique suffix safe for slug/name fields. */
export const uid = () => randomUUID().slice(0, 8);

// ─── Agency ─────────────────────────────────────────────────────────────────────

export interface AgencyOverrides {
  name?:         string;
  slug?:         string;
  systemPrompt?: string;
  model?:        string;
}

export async function createAgency(
  prisma: PrismaClient,
  overrides: AgencyOverrides = {}
) {
  const id = uid();
  return prisma.agency.create({
    data: {
      name:         overrides.name         ?? `Test Agency ${id}`,
      slug:         overrides.slug         ?? `test-agency-${id}`,
      systemPrompt: overrides.systemPrompt ?? 'You are a test agency.',
      model:        overrides.model        ?? 'openai/gpt-4o',
    },
  });
}

// ─── Department ───────────────────────────────────────────────────────────────────

export interface DeptOverrides {
  name?:               string;
  slug?:               string;
  isLevelOrchestrator?: boolean;
}

export async function createDepartment(
  prisma: PrismaClient,
  agencyId: string,
  overrides: DeptOverrides = {}
) {
  const id = uid();
  return prisma.department.create({
    data: {
      agencyId,
      name:                overrides.name                ?? `Dept ${id}`,
      slug:                overrides.slug                ?? `dept-${id}`,
      isLevelOrchestrator: overrides.isLevelOrchestrator ?? false,
      model:               'openai/gpt-4o',
    },
  });
}

// ─── Workspace ───────────────────────────────────────────────────────────────────

export interface WsOverrides {
  name?:               string;
  slug?:               string;
  isLevelOrchestrator?: boolean;
}

export async function createWorkspace(
  prisma: PrismaClient,
  departmentId: string,
  overrides: WsOverrides = {}
) {
  const id = uid();
  return prisma.workspace.create({
    data: {
      departmentId,
      name:                overrides.name                ?? `Workspace ${id}`,
      slug:                overrides.slug                ?? `workspace-${id}`,
      isLevelOrchestrator: overrides.isLevelOrchestrator ?? false,
      model:               'openai/gpt-4o',
    },
  });
}

// ─── Agent ─────────────────────────────────────────────────────────────────────────

export interface AgentOverrides {
  name?:               string;
  slug?:               string;
  role?:               string;
  isLevelOrchestrator?: boolean;
  systemPrompt?:       string;
  model?:              string;
}

export async function createAgent(
  prisma: PrismaClient,
  workspaceId: string,
  overrides: AgentOverrides = {}
) {
  const id = uid();
  return prisma.agent.create({
    data: {
      workspaceId,
      name:                overrides.name                ?? `Agent ${id}`,
      slug:                overrides.slug                ?? `agent-${id}`,
      role:                overrides.role                ?? 'specialist',
      isLevelOrchestrator: overrides.isLevelOrchestrator ?? false,
      systemPrompt:        overrides.systemPrompt        ?? 'You are a test agent.',
      model:               overrides.model               ?? 'openai/gpt-4o',
    },
  });
}

// ─── Flow + Run ───────────────────────────────────────────────────────────────────

export async function createFlow(
  prisma: PrismaClient,
  agentId: string,
  overrides: { name?: string; isActive?: boolean } = {}
) {
  const id = uid();
  return prisma.flow.create({
    data: {
      agentId,
      name:     overrides.name     ?? `Flow ${id}`,
      isActive: overrides.isActive ?? true,
      spec: {
        nodes: [{ id: 'start', type: 'input' }, { id: 'end', type: 'output' }],
        edges: [{ from: 'start', to: 'end' }],
      },
    },
  });
}

export async function createRun(
  prisma: PrismaClient,
  flowId: string,
  agencyId?: string,
  overrides: { status?: string } = {}
) {
  return prisma.run.create({
    data: {
      flowId,
      agencyId: agencyId,
      status:   overrides.status ?? 'queued',
      trigger:  { type: 'manual' },
    },
  });
}

export async function createRunStep(
  prisma: PrismaClient,
  runId: string,
  agentId: string,
  overrides: { nodeId?: string; nodeType?: string; status?: string } = {}
) {
  const id = uid();
  return prisma.runStep.create({
    data: {
      runId,
      agentId,
      nodeId:   overrides.nodeId   ?? `node-${id}`,
      nodeType: overrides.nodeType ?? 'agent',
      status:   overrides.status   ?? 'queued',
      input:    { prompt: 'test input' },
    },
  });
}

// ─── Gateway / ConversationMessage ───────────────────────────────────────────────

export async function createChannelConfig(
  prisma: PrismaClient,
  overrides: { name?: string; type?: string } = {}
) {
  const id = uid();
  return prisma.channelConfig.create({
    data: {
      name:             overrides.name ?? `Channel ${id}`,
      type:             overrides.type ?? 'webchat',
      secretsEncrypted: 'PLACEHOLDER',
      config:           { allowedOrigins: ['http://localhost:3000'] },
      isActive:         true,
    },
  });
}

export async function createGatewaySession(
  prisma: PrismaClient,
  channelConfigId: string,
  agentId: string,
  overrides: { externalUserId?: string } = {}
) {
  return prisma.gatewaySession.create({
    data: {
      channelConfigId,
      agentId,
      externalUserId: overrides.externalUserId ?? `user-${uid()}`,
      state:          'active',
    },
  });
}

/**
 * Full hierarchy factory — creates Agency → Dept → Workspace → Agent
 * in one call. Returns all created entities.
 */
export async function createFullHierarchy(
  prisma: PrismaClient,
  opts: { orchestrator?: boolean } = {}
) {
  const agency    = await createAgency(prisma);
  const dept      = await createDepartment(prisma, agency.id,
    { isLevelOrchestrator: opts.orchestrator ?? false });
  const workspace = await createWorkspace(prisma, dept.id,
    { isLevelOrchestrator: opts.orchestrator ?? false });
  const agent     = await createAgent(prisma, workspace.id,
    { isLevelOrchestrator: opts.orchestrator ?? false,
      role: opts.orchestrator ? 'orchestrator' : 'specialist' });
  return { agency, dept, workspace, agent };
}
