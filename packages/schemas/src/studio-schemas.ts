import { z } from 'zod';

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

export const routineSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  schedule: z.string().optional(),
  promptTemplate: z.string().optional(),
  steps: z.array(z.string()).default([]),
});

export const studioEntitySchemas = {
  workspace: workspaceSpecSchema,
  agent: agentSpecSchema,
  skill: skillSpecSchema,
  flow: flowSpecSchema,
  profile: profileSpecSchema,
  policy: policySpecSchema,
  routine: routineSpecSchema,
} as const;

export type WorkspaceSpecInput = z.infer<typeof workspaceSpecSchema>;
export type AgentSpecInput = z.infer<typeof agentSpecSchema>;
export type SkillSpecInput = z.infer<typeof skillSpecSchema>;
export type FlowSpecInput = z.infer<typeof flowSpecSchema>;
export type ProfileSpecInput = z.infer<typeof profileSpecSchema>;
export type PolicySpecInput = z.infer<typeof policySpecSchema>;
export type RoutineSpecInput = z.infer<typeof routineSpecSchema>;
