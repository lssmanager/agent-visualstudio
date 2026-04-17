import crypto from 'node:crypto';
import { compileOpenClawWorkspace } from '../src/compile-openclaw-artifacts';
import { AgentSpec, SkillSpec, FlowSpec, WorkspaceSpec, ProfileSpec } from '../../core-types/src';

describe('Workspace Compiler', () => {
  const createMockWorkspace = (): WorkspaceSpec => ({
    name: 'Test Workspace',
    defaultModel: 'openai/gpt-5.4-mini',
    agentIds: ['test-agent'],
    skillIds: ['test-skill'],
    flowIds: ['test-flow'],
    policyIds: ['test-policy'],
  });

  const createMockAgent = (): AgentSpec => ({
    id: 'test-agent',
    name: 'Test Agent',
    model: 'openai/gpt-5.4-mini',
    role: 'worker',
    instructions: 'Test instructions',
  });

  const createMockSkill = (): SkillSpec => ({
    id: 'test-skill',
    name: 'Test Skill',
    description: 'A test skill',
    action: 'test-action',
    enabled: true,
  });

  const createMockFlow = (): FlowSpec => ({
    id: 'test-flow',
    name: 'Test Flow',
    description: 'A test flow',
    steps: [{ id: 'step-1', agent: 'test-agent', skill: 'test-skill' }],
  });

  const createMockProfile = (): ProfileSpec => ({
    id: 'test-profile',
    name: 'Test Profile',
    description: 'A test profile',
    defaultModel: 'openai/gpt-5.4-mini',
    defaultSkills: ['test-skill'],
    routines: [],
  });

  describe('compileOpenClawWorkspace', () => {
    it('should generate artifacts without errors', () => {
      const result = compileOpenClawWorkspace({
        workspace: createMockWorkspace(),
        agents: [createMockAgent()],
        skills: [createMockSkill()],
        flows: [createMockFlow()],
        profiles: [createMockProfile()],
        policies: [],
      });

      expect(result.artifacts).toBeDefined();
      expect(Array.isArray(result.artifacts)).toBe(true);
      expect(result.diagnostics).toEqual([]);
    });

    it('should generate 12 artifacts', () => {
      const result = compileOpenClawWorkspace({
        workspace: createMockWorkspace(),
        agents: [createMockAgent()],
        skills: [createMockSkill()],
        flows: [createMockFlow()],
        profiles: [createMockProfile()],
        policies: [],
      });

      expect(result.artifacts.length).toBe(12);
    });

    it('should include sourceHash for each artifact', () => {
      const result = compileOpenClawWorkspace({
        workspace: createMockWorkspace(),
        agents: [createMockAgent()],
        skills: [createMockSkill()],
        flows: [createMockFlow()],
        profiles: [createMockProfile()],
        policies: [],
      });

      for (const artifact of result.artifacts) {
        expect(artifact.sourceHash).toBeDefined();
        expect(typeof artifact.sourceHash).toBe('string');
        expect(artifact.sourceHash.length).toBe(64); // SHA256 hex = 64 chars
      }
    });

    it('should generate valid SHA256 hashes', () => {
      const result = compileOpenClawWorkspace({
        workspace: createMockWorkspace(),
        agents: [createMockAgent()],
        skills: [createMockSkill()],
        flows: [createMockFlow()],
        profiles: [createMockProfile()],
        policies: [],
      });

      for (const artifact of result.artifacts) {
        // Verify hash by recalculating
        const calculatedHash = crypto
          .createHash('sha256')
          .update(artifact.content)
          .digest('hex');
        expect(artifact.sourceHash).toBe(calculatedHash);
      }
    });

    it('should include all required artifact types', () => {
      const result = compileOpenClawWorkspace({
        workspace: createMockWorkspace(),
        agents: [createMockAgent()],
        skills: [createMockSkill()],
        flows: [createMockFlow()],
        profiles: [createMockProfile()],
        policies: [],
      });

      const types = result.artifacts.map((a) => a.type);
      // Check for key artifact types
      expect(types).toContain('prompt');
      expect(types).toContain('config');
      expect(types).toContain('manifest');
    });

    it('should have proper artifact structure', () => {
      const result = compileOpenClawWorkspace({
        workspace: createMockWorkspace(),
        agents: [createMockAgent()],
        skills: [createMockSkill()],
        flows: [createMockFlow()],
        profiles: [createMockProfile()],
        policies: [],
      });

      for (const artifact of result.artifacts) {
        expect(artifact.id).toBeDefined();
        expect(artifact.type).toBeDefined();
        expect(artifact.name).toBeDefined();
        expect(artifact.path).toBeDefined();
        expect(artifact.mediaType).toBeDefined();
        expect(artifact.content).toBeDefined();
        expect(artifact.sourceHash).toBeDefined();
      }
    });

    it('should report diagnostics for missing referenced agents', () => {
      const workspace = createMockWorkspace();
      workspace.agentIds = ['missing-agent']; // Reference non-existent agent

      const result = compileOpenClawWorkspace({
        workspace,
        agents: [createMockAgent()],
        skills: [createMockSkill()],
        flows: [createMockFlow()],
        profiles: [createMockProfile()],
        policies: [],
      });

      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]).toContain('missing agent');
    });

    it('should handle empty collections gracefully', () => {
      const result = compileOpenClawWorkspace({
        workspace: createMockWorkspace(),
        agents: [],
        skills: [],
        flows: [],
        profiles: [],
        policies: [],
      });

      // Should generate diagnostics for missing referenced items
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.artifacts).toBeDefined();
    });

    it('sourceHash should be deterministic', () => {
      const input = {
        workspace: createMockWorkspace(),
        agents: [createMockAgent()],
        skills: [createMockSkill()],
        flows: [createMockFlow()],
        profiles: [createMockProfile()],
        policies: [],
      };

      const result1 = compileOpenClawWorkspace(input);
      const result2 = compileOpenClawWorkspace(input);

      // Same input should produce same artifact hashes
      for (let i = 0; i < result1.artifacts.length; i++) {
        expect(result1.artifacts[i].sourceHash).toBe(result2.artifacts[i].sourceHash);
        expect(result1.artifacts[i].content).toBe(result2.artifacts[i].content);
      }
    });
  });
});
