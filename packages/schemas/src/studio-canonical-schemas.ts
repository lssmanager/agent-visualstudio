import { z } from 'zod';

import {
  agencySpecSchema,
  agentSpecSchema,
  canonicalStudioStateSchema,
  connectionSpecSchema,
  coreFileDiffSchema,
  departmentSpecSchema,
  runSpecSchema,
  runStepSchema,
  skillSpecSchema,
  toolSpecSchema,
  versionSnapshotSchema,
} from './studio-schemas';

export const workspaceSpecCanonicalSchema = z.object({
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
  departmentId: z.string().min(1),
});

export const subagentSpecSchema = agentSpecSchema.extend({
  kind: z.literal('subagent').optional(),
  parentAgentId: z.string().min(1),
});

export const handoffPolicySchema = z.object({
  id: z.string().min(1),
  targetAgentId: z.string().min(1),
  when: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().optional(),
});

export const traceEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  timestamp: z.string().min(1),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  level: z.enum(['agency', 'department', 'workspace', 'agent', 'subagent']).optional(),
  sourceId: z.string().optional(),
  targetId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const rollbackSnapshotSchema = versionSnapshotSchema;

export {
  agencySpecSchema,
  departmentSpecSchema,
  agentSpecSchema,
  skillSpecSchema,
  toolSpecSchema,
  connectionSpecSchema,
  runSpecSchema,
  runStepSchema,
  coreFileDiffSchema,
  canonicalStudioStateSchema,
};
