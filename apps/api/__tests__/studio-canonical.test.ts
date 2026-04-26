import { canonicalStudioStateSchema } from '../../../packages/schemas/src/studio-canonical-schemas';
import { adaptLegacyStudioStateToCanonical } from '../src/modules/studio/studio-canonical.adapter';
import type { LegacyStudioStateDto } from '../src/modules/studio/dto/studio-state.dto';
import { TopologyService } from '../src/modules/topology/topology.service';

const LEGACY_STATE_FIXTURE: LegacyStudioStateDto = {
  workspace: {
    id: 'workspace-1',
    slug: 'workspace-1',
    name: 'Workspace One',
    description: 'Fixture workspace',
    owner: 'Engineering',
    defaultModel: 'gpt-5.4',
    agentIds: ['agent-1', 'subagent-1'],
    skillIds: ['skill-1'],
    flowIds: ['flow-1'],
    profileIds: ['profile-1'],
    policyRefs: [],
    routingRules: [],
    routines: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  agents: [
    {
      id: 'agent-1',
      workspaceId: 'workspace-1',
      name: 'Main Agent',
      role: 'orchestrator',
      description: 'Main worker',
      instructions: 'Do the work',
      model: 'gpt-5.4',
      skillRefs: ['skill-1'],
      tags: [],
      visibility: 'workspace',
      executionMode: 'orchestrated',
      kind: 'agent',
      handoffRules: [],
      channelBindings: [],
      isEnabled: true,
    },
    {
      id: 'subagent-1',
      workspaceId: 'workspace-1',
      name: 'Specialist',
      role: 'specialist',
      description: 'Sub worker',
      instructions: 'Assist',
      model: 'gpt-5.4-mini',
      skillRefs: ['skill-1'],
      tags: [],
      visibility: 'workspace',
      executionMode: 'handoff',
      kind: 'subagent',
      parentAgentId: 'agent-1',
      handoffRules: [],
      channelBindings: [],
      isEnabled: true,
    },
  ],
  skills: [
    {
      id: 'skill-1',
      name: 'Planner',
      description: 'Planning skill',
      version: '1.0.0',
      category: 'operations',
      permissions: [],
      functions: [],
    },
  ],
  flows: [
    {
      id: 'flow-1',
      name: 'Main Flow',
      trigger: 'manual',
      isEnabled: true,
      nodes: [],
      edges: [],
    },
  ],
  policies: [{ id: 'policy-1', name: 'Default Policy' }],
  profiles: [
    {
      id: 'profile-1',
      name: 'Default',
      description: 'Default profile',
      defaultSkills: [],
      routines: [],
    },
  ],
  compile: { artifacts: [], diagnostics: [] },
  runtime: {
    health: { ok: true },
    diagnostics: {},
    sessions: { ok: true, payload: [] },
  },
  generatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Canonical Studio adapter', () => {
  it('maps legacy studio state to canonical hierarchy', () => {
    const canonical = adaptLegacyStudioStateToCanonical(LEGACY_STATE_FIXTURE);

    expect(canonical.agency.id).toBe('agency-default');
    expect(canonical.departments.length).toBeGreaterThan(0);
    expect(canonical.workspaces[0].departmentId).toBe(canonical.departments[0].id);
    expect(canonical.agents.length).toBe(1);
    expect(canonical.subagents.length).toBe(1);
    expect(canonical.catalog.skills).toHaveLength(1);
    expect(canonical.topology.failClosed).toBe(true);
  });

  it('produces schema-valid canonical payload', () => {
    const canonical = adaptLegacyStudioStateToCanonical(LEGACY_STATE_FIXTURE);
    const parsed = canonicalStudioStateSchema.parse(canonical);

    expect(parsed.agency.name).toBeTruthy();
    expect(parsed.coreFiles.supportedLifecycle).toContain('preview');
  });
});

describe('Topology fail-closed behavior', () => {
  it('returns unsupported_by_runtime when runtime has no topology methods', async () => {
    const service = new TopologyService();
    const result = await service.executeAction('connect', {
      from: { level: 'workspace', id: 'workspace-1' },
      to: { level: 'agent', id: 'agent-1' },
    });

    expect(result.status).toBe('unsupported_by_runtime');
    expect(result.runtimeSupported).toBe(false);
  });
});
