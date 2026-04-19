import { z } from 'zod';

// ── Skill ──────────────────────────────────────────────────────────────

export const skillFunctionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
});

export const skillSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1),
  category: z.string().min(1),
  permissions: z.array(z.string()).default([]),
  functions: z.array(skillFunctionSchema),
  plugin: z
    .object({
      provider: z.string().min(1),
      pluginId: z.string().min(1),
      displayName: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  files: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ── Flow ───────────────────────────────────────────────────────────────

export const flowNodeTypeEnum = z.enum([
  'trigger',
  'agent',
  'tool',
  'condition',
  'approval',
  'end',
]);

export const flowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().optional(),
  config: z.record(z.string(), z.unknown()),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const flowEdgeSchema = z.object({
  id: z.string().optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  condition: z.string().optional(),
});

export const flowSpecSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional(),
  trigger: z.string().min(1),
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
  isEnabled: z.boolean().default(true),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ── Policy ─────────────────────────────────────────────────────────────

export const policySpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  toolAllowlist: z.array(z.string()),
  toolDenylist: z.array(z.string()),
  channelRules: z.record(z.string(), z.unknown()),
  sandboxMode: z.enum(['strict', 'relaxed']).optional(),
  maxTokensPerTurn: z.number().int().positive().optional(),
  modelConstraint: z
    .object({
      allow: z.array(z.string()),
      deny: z.array(z.string()).optional(),
    })
    .optional(),
  enabled: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ── Workspace ──────────────────────────────────────────────────────────

export const workspaceSpecSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  owner: z.string().optional(),
  defaultModel: z.string().optional(),
  agentIds: z.array(z.string()),
  skillIds: z.array(z.string()),
  flowIds: z.array(z.string()),
  profileIds: z.array(z.string()),
  policyRefs: z.array(
    z.object({
      id: z.string().min(1),
      scope: z.enum(['workspace', 'agent', 'flow']),
      targetId: z.string().optional(),
    }),
  ),
  routingRules: z.array(
    z.object({
      id: z.string().min(1),
      from: z.string().min(1),
      to: z.string().min(1),
      when: z.string().min(1),
      priority: z.number().int(),
    }),
  ),
  routines: z.array(z.string()),
  tags: z.array(z.string()),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

// ── Agent ──────────────────────────────────────────────────────────────

export const agentSpecSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
  instructions: z.string().min(1),
  model: z.string().min(1),
  skillRefs: z.array(z.string()),
  tags: z.array(z.string()),
  visibility: z.enum(['private', 'workspace', 'public']),
  executionMode: z.enum(['direct', 'orchestrated', 'handoff']),
  kind: z.enum(['agent', 'subagent', 'orchestrator']).default('agent'),
  parentAgentId: z.string().optional(),
  context: z.array(z.string()).optional(),
  triggers: z
    .array(
      z.object({
        type: z.enum(['event', 'schedule', 'manual', 'webhook']),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  permissions: z
    .object({
      tools: z.array(z.string()).optional(),
      channels: z.array(z.string()).optional(),
      models: z.array(z.string()).optional(),
      maxTokensPerTurn: z.number().int().positive().optional(),
    })
    .optional(),
  handoffRules: z.array(
    z.object({
      id: z.string().min(1),
      targetAgentId: z.string().min(1),
      when: z.string().min(1),
      description: z.string().optional(),
      priority: z.number().int().optional(),
    }),
  ),
  channelBindings: z.array(
    z.object({
      id: z.string().min(1),
      channel: z.string().min(1),
      route: z.string().min(1),
      enabled: z.boolean(),
    }),
  ),
  policyBindings: z
    .array(
      z.object({
        policyId: z.string().min(1),
        mode: z.enum(['enforce', 'warn']),
      }),
    )
    .optional(),
  isEnabled: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ── Profile ────────────────────────────────────────────────────────────

export const profileSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['operations', 'support', 'engineering', 'monitoring']).optional(),
  defaultModel: z.string().optional(),
  defaultSkills: z.array(z.string()),
  defaultPolicies: z.array(z.string()).optional(),
  defaultRoutingRules: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        when: z.string().min(1),
        priority: z.number().int(),
      }),
    )
    .optional(),
  routines: z.array(z.string()),
  tags: z.array(z.string()).optional(),
});

// ── Routine ────────────────────────────────────────────────────────────

export const routineSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  schedule: z.string().optional(),
  promptTemplate: z.string().optional(),
  steps: z.array(z.string()).default([]),
});

// ── Hook ───────────────────────────────────────────────────────────────

export const hookEventEnum = z.enum([
  'before:run',
  'after:run',
  'before:step',
  'after:step',
  'on:error',
  'on:approval',
  'before:deploy',
  'after:deploy',
]);

export const hookActionEnum = z.enum([
  'log',
  'approval',
  'webhook',
  'notify',
  'block',
]);

export const hookSpecSchema = z.object({
  id: z.string().min(1),
  event: hookEventEnum,
  action: hookActionEnum,
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  priority: z.number().int().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ── Run ────────────────────────────────────────────────────────────────

export const runStatusEnum = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

export const stepStatusEnum = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'skipped',
]);

export const runStepSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  nodeId: z.string().min(1),
  nodeType: z.string().min(1),
  status: stepStatusEnum,
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  agentId: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  tokenUsage: z
    .object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
    })
    .optional(),
  costUsd: z.number().nonnegative().optional(),
  retryCount: z.number().int().nonnegative().optional(),
});

export const runSpecSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  flowId: z.string().min(1),
  status: runStatusEnum,
  trigger: z.object({
    type: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  steps: z.array(runStepSchema),
  startedAt: z.string().min(1),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── Command ────────────────────────────────────────────────────────────

export const commandSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(z.string()),
  tags: z.array(z.string()).optional(),
});

// ── Workspace Config (.openclaw/) ──────────────────────────────────────

export const modelConfigSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().nonnegative().optional(),
  costPer1kInput: z.number().nonnegative().optional(),
  costPer1kOutput: z.number().nonnegative().optional(),
});

export const workspaceConfigSchema = z.object({
  version: z.literal('1'),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  owner: z.string().optional(),
  defaultModel: z.string().min(1),
  models: z.array(modelConfigSchema).optional(),
  agents: z.array(z.string()),
  flows: z.array(z.string()),
  skills: z.array(z.string()),
  policies: z.array(z.string()),
  hooks: z.string().optional(),
  commands: z.array(z.string()).optional(),
  tags: z.array(z.string()),
});

// ── Version Snapshot ───────────────────────────────────────────────────

export const versionSnapshotSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  label: z.string().optional(),
  createdAt: z.string().min(1),
  parentId: z.string().optional(),
  hash: z.string().min(1),
  specs: z.object({
    workspace: z.unknown(),
    agents: z.array(z.unknown()),
    flows: z.array(z.unknown()),
    skills: z.array(z.unknown()),
    policies: z.array(z.unknown()),
  }),
});

// ── Effective Config ───────────────────────────────────────────────────

export const effectiveConfigSchema = z.object({
  workspaceId: z.string().min(1),
  agentId: z.string().optional(),
  resolvedModel: z.string().min(1),
  resolvedSkills: z.array(z.string()),
  resolvedPolicies: z.array(z.string()),
  resolvedRoutingRules: z.array(z.unknown()),
  source: z.object({
    model: z.enum(['workspace', 'profile', 'agent']),
    skills: z.enum(['workspace', 'profile', 'agent']),
    policies: z.enum(['workspace', 'profile', 'agent']),
  }),
});

// ── Schema registry ────────────────────────────────────────────────────

export const studioEntitySchemas = {
  workspace: workspaceSpecSchema,
  agent: agentSpecSchema,
  skill: skillSpecSchema,
  flow: flowSpecSchema,
  profile: profileSpecSchema,
  policy: policySpecSchema,
  routine: routineSpecSchema,
  hook: hookSpecSchema,
  run: runSpecSchema,
  command: commandSpecSchema,
} as const;

// ── Inferred types ─────────────────────────────────────────────────────

export type WorkspaceSpecInput = z.infer<typeof workspaceSpecSchema>;
export type AgentSpecInput = z.infer<typeof agentSpecSchema>;
export type SkillSpecInput = z.infer<typeof skillSpecSchema>;
export type FlowSpecInput = z.infer<typeof flowSpecSchema>;
export type ProfileSpecInput = z.infer<typeof profileSpecSchema>;
export type PolicySpecInput = z.infer<typeof policySpecSchema>;
export type RoutineSpecInput = z.infer<typeof routineSpecSchema>;
export type HookSpecInput = z.infer<typeof hookSpecSchema>;
export type RunSpecInput = z.infer<typeof runSpecSchema>;
export type RunStepInput = z.infer<typeof runStepSchema>;
export type CommandSpecInput = z.infer<typeof commandSpecSchema>;
export type WorkspaceConfigInput = z.infer<typeof workspaceConfigSchema>;
export type VersionSnapshotInput = z.infer<typeof versionSnapshotSchema>;
export type EffectiveConfigInput = z.infer<typeof effectiveConfigSchema>;
